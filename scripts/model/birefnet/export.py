"""C2.0 export: BiRefNet_lite (pinned HF revision) -> ONNX 512 fp32 -> wide-op fix -> fp16 -> byte parts + manifest.

Usage (from this folder, inside the venv named in requirements.lock):
  python export.py --deform exporter        # path (a): deform_conv2d_onnx_exporter (fails on torch 2.0.1/2.1.2/2.4.1)
  python export.py --deform gridsample      # path (b): pure-torch grid_sample deform conv (shipped, C2.0)
  python export.py --resplit <out dir>      # only re-cut <out dir>/model_fp16.onnx into parts + manifest
Outputs go to out/<tag>/ (git-ignored): model_fp32.onnx, model_fp16.onnx, parts/model.part0..N, manifest.json.
The shipped parts + manifest are copied by hand to vendor-assets/birefnet-lite-512/<exportId>/ (README.md).
"""
import argparse, hashlib, json, os, sys, time

import numpy as np
import onnx
import torch
import torch.nn.functional as F

REPO = 'ZhengPeng7/BiRefNet_lite'
REV = 'aa62cd87eafb9cc43056d08ef3615a14628b831d'  # HF commit, 2026-08-29, card license: mit
SIZE = 512
# 23 MiB, not 24 (C2 build): scripts/lib/capacity.mjs fails any dist file >= 24 MiB, and a 24 MiB part is exactly that.
PART = 23 * 1024 * 1024
HERE = os.path.dirname(os.path.abspath(__file__))


def load_net():
    from transformers import AutoModelForImageSegmentation
    net = AutoModelForImageSegmentation.from_pretrained(REPO, revision=REV, trust_remote_code=True)
    return net.eval().float()


class Wrap(torch.nn.Module):
    def __init__(self, net):
        super().__init__(); self.net = net

    def forward(self, x):
        return torch.sigmoid(self.net(x)[-1])


# ---------- path (b): pure-torch modulated deformable conv (torchvision semantics) ----------
def deform_conv2d_gs(input, offset, weight, bias=None, stride=(1, 1), padding=(0, 0), dilation=(1, 1), mask=None):
    """Bilinear sampling with F.grid_sample(align_corners=False, zeros) == torchvision.ops.deform_conv2d
    for offset_groups=1. Offset channel layout: [2*k]=dy, [2*k+1]=dx with k=i*kw+j."""
    def pair(v): return v if isinstance(v, (tuple, list)) else (v, v)
    sh, sw = pair(stride); ph, pw = pair(padding); dh, dw = pair(dilation)
    B, C, H, W = input.shape
    Cout, Cin, kh, kw = weight.shape
    Ho, Wo = offset.shape[-2], offset.shape[-1]
    K = kh * kw
    # kernel tap base offsets (k = i*kw + j), shape [1, K, 1, 1]
    ki = torch.tensor([float(i * dh) for i in range(kh) for j in range(kw)], dtype=input.dtype).view(1, K, 1, 1)
    kj = torch.tensor([float(j * dw) for i in range(kh) for j in range(kw)], dtype=input.dtype).view(1, K, 1, 1)
    ys = (torch.arange(Ho, dtype=input.dtype) * sh - ph).view(1, 1, Ho, 1)
    xs = (torch.arange(Wo, dtype=input.dtype) * sw - pw).view(1, 1, 1, Wo)
    off = offset.reshape(B, K, 2, Ho, Wo)
    py = ys + ki + off[:, :, 0]  # [B, K, Ho, Wo]
    px = xs + kj + off[:, :, 1]
    gx = (px + 0.5) * (2.0 / W) - 1.0
    gy = (py + 0.5) * (2.0 / H) - 1.0
    grid = torch.stack([gx, gy], dim=-1).reshape(B, K * Ho, Wo, 2)  # one GridSample per deform conv
    s = F.grid_sample(input, grid, mode='bilinear', padding_mode='zeros', align_corners=False)  # [B,C,K*Ho,Wo]
    s = s.reshape(B, C, K, Ho, Wo)
    if mask is not None:
        s = s * mask.reshape(B, 1, K, Ho, Wo)
    col = s.reshape(B, C * K, Ho, Wo)
    return F.conv2d(col, weight.reshape(Cout, Cin * K, 1, 1), bias)


def prove_gridsample(tol=1e-4):
    from torchvision.ops import deform_conv2d
    torch.manual_seed(0); worst = 0.0
    for (C, H, W, stride, pad) in [(8, 17, 23, 1, 1), (16, 32, 32, 1, 1), (4, 20, 20, 2, 1), (8, 16, 16, 1, 0)]:
        x = torch.randn(1, C, H, W)
        w = torch.randn(C * 2, C, 3, 3) * 0.1; b = torch.randn(C * 2)
        Ho = (H + 2 * pad - 3) // stride + 1; Wo = (W + 2 * pad - 3) // stride + 1
        off = torch.randn(1, 18, Ho, Wo) * 3.0  # large offsets incl. out-of-bounds samples
        m = torch.sigmoid(torch.randn(1, 9, Ho, Wo)) * 2
        r = deform_conv2d(x, off, w, b, stride=(stride, stride), padding=(pad, pad), mask=m)
        o = deform_conv2d_gs(x, off, w, b, stride=(stride, stride), padding=(pad, pad), mask=m)
        worst = max(worst, float((r - o).abs().max()))
    print('gridsample vs torchvision max abs', worst, flush=True)
    if worst > tol:
        raise SystemExit(f'path (b) not equal to torchvision: {worst} > {tol}')
    return worst


def patch_gridsample():
    import torchvision.ops
    torchvision.ops.deform_conv2d = deform_conv2d_gs
    n = 0
    for mod in list(sys.modules.values()):  # remote code did `from torchvision.ops import deform_conv2d`
        if mod is not None and getattr(mod, 'deform_conv2d', None) is not None and hasattr(mod, 'DeformableConv2d'):
            mod.deform_conv2d = deform_conv2d_gs; n += 1
    if n == 0:
        raise SystemExit('could not find remote module holding deform_conv2d')
    return n


def sha256(b): return hashlib.sha256(b).hexdigest()


def write_parts(data, od, meta):
    """Byte-splits the fp16 model into PART-sized parts with SHA-256 each; the exportId depends on the model bytes only."""
    export_id = f"{REV[:8]}-{sha256(data)[:8]}"
    pd = os.path.join(od, 'parts'); os.makedirs(pd, exist_ok=True)
    for fn in os.listdir(pd): os.remove(os.path.join(pd, fn))
    parts = []
    for n, i in enumerate(range(0, len(data), PART)):
        chunk = data[i:i + PART]; name = f'model.part{n}'
        open(os.path.join(pd, name), 'wb').write(chunk)
        parts.append(dict(name=name, bytes=len(chunk), sha256=sha256(chunk)))
    manifest = dict(exportId=export_id, hfRevision=REV, **meta, bytes=len(data), parts=parts, sha256Total=sha256(data))
    json.dump(manifest, open(os.path.join(pd, 'manifest.json'), 'w'), indent=1)
    return manifest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--deform', choices=['exporter', 'gridsample'], default='exporter')
    ap.add_argument('--opset', type=int, default=17)
    ap.add_argument('--maxn', type=int, default=6)
    ap.add_argument('--resplit', metavar='OUT_DIR')
    a = ap.parse_args()
    if a.resplit:
        info = json.load(open(os.path.join(a.resplit, 'export_info.json')))
        data = open(os.path.join(a.resplit, 'model_fp16.onnx'), 'rb').read()
        m = write_parts(data, a.resplit, dict(torch=info['torch'], opset=info['opset'], deformPath=info['deformPath']))
        print(json.dumps(m, indent=1))
        return

    info = dict(hfRepo=REPO, hfRevision=REV, torch=torch.__version__, opset=a.opset, deformPath=a.deform, size=SIZE)
    import torchvision, transformers, onnxruntime, onnxconverter_common, timm
    info['env'] = dict(python=sys.version.split()[0], torchvision=torchvision.__version__, transformers=transformers.__version__,
                       onnx=onnx.__version__, onnxruntime=onnxruntime.__version__, timm=timm.__version__,
                       onnxconverter_common=onnxconverter_common.__version__)
    if a.deform == 'exporter':
        import deform_conv2d_onnx_exporter
        deform_conv2d_onnx_exporter.register_deform_conv2d_onnx_op()
    else:
        info['gridsampleMaxAbs'] = prove_gridsample()

    t0 = time.time(); net = load_net(); print('loaded', round(time.time() - t0, 1), 's', flush=True)
    if a.deform == 'gridsample':
        print('patched modules', patch_gridsample(), flush=True)
    model = Wrap(net).eval()
    tag = f"birefnet-lite-512-{REV[:8]}-t{torch.__version__.split('+')[0]}-{a.deform}"
    od = os.path.join(HERE, 'out', tag); os.makedirs(od, exist_ok=True)
    raw = os.path.join(od, 'model_fp32_raw.onnx')
    x = torch.randn(1, 3, SIZE, SIZE)
    t0 = time.time()
    with torch.no_grad():
        kw = dict(opset_version=a.opset, input_names=['input_image'], output_names=['output_image'],
                  do_constant_folding=True)
        if 'dynamo' in torch.onnx.export.__code__.co_varnames:
            kw['dynamo'] = False
        torch.onnx.export(model, x, raw, **kw)
    print('exported', round(time.time() - t0, 1), 's', os.path.getsize(raw) / 2**20, 'MiB', flush=True)

    from fix_wide_ops import fix_wide_ops
    m = onnx.load(raw)
    ns, nc = fix_wide_ops(m, a.maxn); info['wideOpFix'] = dict(maxn=a.maxn, splits=ns, concats=nc)
    print('wide ops rewritten: splits', ns, 'concats', nc, flush=True)
    onnx.checker.check_model(m)
    f32 = os.path.join(od, 'model_fp32.onnx'); onnx.save(m, f32)

    from onnxconverter_common import float16
    m16 = float16.convert_float_to_float16(m, keep_io_types=True)
    f16 = os.path.join(od, 'model_fp16.onnx'); onnx.save(m16, f16)
    data = open(f16, 'rb').read()
    print('fp16', len(data) / 2**20, 'MiB', flush=True)

    manifest = write_parts(data, od, dict(torch=torch.__version__, opset=a.opset, deformPath=a.deform))
    export_id = manifest['exportId']
    json.dump(dict(info, exportId=export_id, outDir=od), open(os.path.join(od, 'export_info.json'), 'w'), indent=1)
    print(json.dumps(manifest, indent=1))


if __name__ == '__main__':
    main()
