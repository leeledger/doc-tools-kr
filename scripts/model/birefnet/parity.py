"""C2.0 parity gate (exits 1 on any miss). Brief C2.0 step 8, with the Arch C2.0 ruling on the real set.
python parity.py --out <export out dir>   (the folder export.py wrote: model_fp32.onnx; model_fp16.onnx must equal the parts)
  The fp16 model under test is the COMMITTED one: vendor-assets/birefnet-lite-512/<exportId>/model.part* joined, each
  part and the whole checked against manifest.json.
  Images: BGREMOVE_SPIKE (default C:/dev/doc-tools-kr/spikes/bg-remove): data/gt (16 GT) and data/raw (50 real).
  ours fp32 (ORT CPU) vs torch (real torchvision deform_conv2d): mean <= 1e-4, max <= 1e-3 per image
  ours fp16 vs ours fp32: mean <= 1e-4 (mean over the set, per image reported)
  GT (16): MAE <= 0.0050, IoU >= 0.940 (fp16, bilinear upsample, spike metrics)
  real 49: empty masks (area(a>0.5) < 1%) <= 3. The real set is the 50 spike photos minus OFF_TOPIC (Arch, C2.0
    ruling, 2026-10-02): l04 is a paper letterhead, which /stamp-signature/ handles; it is still run and reported.
  vs spike community 512 fp16 masks: mean <= 0.003 (diagnostic only)
Also writes out/parity-<exportId>/masks_fp16/<key>.npy and parity.json (512x512 float32) for the browser comparison.
"""
import argparse, glob, hashlib, json, os, sys, time
import cv2, numpy as np, onnxruntime as ort, torch
from PIL import Image
from metrics import all_metrics

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SP = os.environ.get('BGREMOVE_SPIKE', 'C:/dev/doc-tools-kr/spikes/bg-remove')
EXPORT = 'aa62cd87-ce158794'
# Not part of the real set (Arch C2.0 ruling): paper documents belong to /stamp-signature/.
OFF_TOPIC = {'l04': 'paper letterhead (logo-sign); /stamp-signature/ handles paper stamps, signatures and logos'}
MEAN = np.array([0.485, 0.456, 0.406], np.float32); STD = np.array([0.229, 0.224, 0.225], np.float32)


def prep(path):
    im = Image.open(path).convert('RGB')
    x = (np.asarray(im.resize((512, 512), Image.BILINEAR), np.float32) / 255 - MEAN) / STD
    return x.transpose(2, 0, 1)[None].astype(np.float32), im.size


def committed_fp16():
    md = os.path.join(ROOT, 'vendor-assets', 'birefnet-lite-512', EXPORT)
    man = json.load(open(os.path.join(md, 'manifest.json')))
    data = b''
    for p in man['parts']:
        b = open(os.path.join(md, p['name']), 'rb').read()
        assert len(b) == p['bytes'] and hashlib.sha256(b).hexdigest() == p['sha256'], p['name']
        data += b
    assert hashlib.sha256(data).hexdigest() == man['sha256Total'], 'sha256Total'
    return data, man


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); od = ap.parse_args().out
    fp16, man = committed_fp16()
    assert open(f'{od}/model_fp16.onnx', 'rb').read() == fp16, 'out/model_fp16.onnx is not the committed model'
    res = os.path.join(HERE, 'out', f'parity-{EXPORT}')  # git-ignored
    imgs = sorted(glob.glob(f'{SP}/data/gt/img/*.jpg')) + sorted(glob.glob(f'{SP}/data/raw/*.jpg'))
    from export import load_net, Wrap
    net = Wrap(load_net()).eval()  # unpatched: torchvision deform_conv2d is the truth
    so = ort.SessionOptions(); so.log_severity_level = 3
    s32 = ort.InferenceSession(f'{od}/model_fp32.onnx', so, providers=['CPUExecutionProvider'])
    s16 = ort.InferenceSession(fp16, so, providers=['CPUExecutionProvider'])
    md = os.path.join(res, 'masks_fp16'); os.makedirs(md, exist_ok=True)
    rows = []; t0 = time.time()
    for p in imgs:
        k = os.path.splitext(os.path.basename(p))[0]; x, (W, H) = prep(p)
        with torch.no_grad():
            yt = net(torch.from_numpy(x)).numpy()[0, 0]
        y32 = s32.run(None, {'input_image': x})[0][0, 0]
        y16 = s16.run(None, {'input_image': x})[0][0, 0].astype(np.float32)
        np.save(f'{md}/{k}.npy', y16)
        r = dict(img=k, set='gt' if k.startswith('gt') else 'off' if k in OFF_TOPIC else 'raw',
                 t32_mean=float(np.abs(y32 - yt).mean()), t32_max=float(np.abs(y32 - yt).max()),
                 f16_mean=float(np.abs(y16 - y32).mean()), f16_max=float(np.abs(y16 - y32).max()),
                 area16=float((y16 > 0.5).mean()), area_t=float((yt > 0.5).mean()))
        cm = f'{SP}/results/masks/bir_lite512_fp16/{k}.png'
        if os.path.exists(cm):
            c = np.asarray(Image.open(cm), np.float32) / 255
            if c.shape != y16.shape: c = cv2.resize(c, (512, 512), interpolation=cv2.INTER_LINEAR)
            r['comm_mean'] = float(np.abs(y16 - c).mean())
        if r['set'] == 'gt':
            A = np.asarray(Image.open(f'{SP}/data/gt/alpha/{k}.png'), np.float32) / 255
            for name, y in (('fp16', y16), ('torch', yt)):
                up = np.clip(cv2.resize(y, (A.shape[1], A.shape[0]), interpolation=cv2.INTER_LINEAR), 0, 1)
                r.update({f'{name}_{m}': v for m, v in all_metrics(up, A).items()})
        rows.append(r); print(k, {a: round(b, 6) for a, b in r.items() if isinstance(b, float)}, flush=True)
    gt = [r for r in rows if r['set'] == 'gt']; raw = [r for r in rows if r['set'] == 'raw']
    S = dict(
        exportId=man['exportId'], n_gt=len(gt), n_raw=len(raw), seconds=round(time.time() - t0, 1),
        off_topic={r['img']: dict(area16=r['area16'], why=OFF_TOPIC[r['img']]) for r in rows if r['set'] == 'off'},
        t32_mean_max_over_images=max(r['t32_mean'] for r in rows), t32_max_max=max(r['t32_max'] for r in rows),
        f16_mean_avg=float(np.mean([r['f16_mean'] for r in rows])), f16_mean_worst=max(r['f16_mean'] for r in rows),
        f16_max_worst=max(r['f16_max'] for r in rows),
        gt_mae=float(np.mean([r['fp16_mae'] for r in gt])), gt_iou=float(np.mean([r['fp16_iou'] for r in gt])),
        gt_bf=float(np.mean([r['fp16_bf'] for r in gt])), gt_edge_mae=float(np.mean([r['fp16_edge_mae'] for r in gt])),
        gt_mae_torch=float(np.mean([r['torch_mae'] for r in gt])), gt_iou_torch=float(np.mean([r['torch_iou'] for r in gt])),
        empty_raw=[r['img'] for r in raw if r['area16'] < 0.01], empty_raw_torch=[r['img'] for r in raw if r['area_t'] < 0.01],
        comm_mean_avg=float(np.mean([r['comm_mean'] for r in rows if 'comm_mean' in r])),
    )
    G = dict(
        torch_vs_fp32_mean=all(r['t32_mean'] <= 1e-4 for r in rows), torch_vs_fp32_max=all(r['t32_max'] <= 1e-3 for r in rows),
        fp16_vs_fp32_mean=S['f16_mean_avg'] <= 1e-4, gt_mae=S['gt_mae'] <= 0.0050, gt_iou=S['gt_iou'] >= 0.940,
        empty=len(S['empty_raw']) <= 3)
    S['diag_comm_ok'] = S['comm_mean_avg'] <= 0.003
    G['real_set_is_49'] = len(raw) == 49
    json.dump(dict(summary=S, gates=G, rows=rows), open(os.path.join(res, 'parity.json'), 'w'), indent=1)
    print(json.dumps(dict(summary=S, gates=G), indent=1))
    sys.exit(0 if all(G.values()) else 1)


if __name__ == '__main__':
    main()
