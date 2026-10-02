"""배경 지우기 fixtures (Sprint C, C2). Dev only, never shipped. Run with the export venv (scripts/model/birefnet/
requirements.lock: numpy, Pillow, opencv-python, onnxruntime 1.20.1):

    python tests/fixtures/build-bgremove.py

Needs the spike sources (BGREMOVE_SPIKE, default C:/dev/doc-tools-kr/spikes/bg-remove: data/gt/src/*, data/gt/sources.json)
and the committed model parts (vendor-assets/birefnet-lite-512/<exportId>/). Writes tests/fixtures/bgremove/:
  <k>.jpg            CC0 composites (foreground and background both CC0 on Wikimedia Commons; SOURCES.md)
  <k>.alpha.png      their ground-truth alpha
  <k>.mask.u16.gz    the Python reference mask: our fp16 ONNX on ORT CPU, 512x512, uint16 LE (value * 65535)
  fusion-<x>.png / fusion-<x>.alpha.png / fusion-<x>.fg.u16.gz   blur-fusion inputs and the spike pp.fg_blur output
  pil-down.png / pil-up.png   Pillow BILINEAR resizes of fusion-a.png (down; a 20x15 crop up), the input-resize reference
  meta.json          sizes, sources, the Python GT metrics and mask area per fixture
"""
import gzip, json, math, os, sys

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SPIKE = os.environ.get('BGREMOVE_SPIKE', 'C:/dev/doc-tools-kr/spikes/bg-remove')
G = os.path.join(SPIKE, 'data', 'gt')
OUT = os.path.join(ROOT, 'tests', 'fixtures', 'bgremove')
EXPORT = 'aa62cd87-ce158794'
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'model', 'birefnet'))
from metrics import all_metrics  # noqa: E402

# (fixture, foreground, background, size): both sides CC0 (data/gt/sources.json).
FIXTURES = [('cc0-person', 'fg10', 'bg03', (480, 640)), ('cc0-dog', 'fg02', 'bg01', (640, 480)), ('cc0-pet', 'fg13', 'bg04', (640, 480))]


def compose(fg_key, bg_key, W, H, rng):
    """The spike's compose_gt.py at a smaller size: premultiplied LANCZOS resize, centred with a seeded jitter."""
    fg = Image.open(f'{G}/src/{fg_key}.png').convert('RGBA')
    a = np.array(fg)[..., 3]
    if fg_key == 'fg02':
        a = np.where(a < 8, 0, a)
    fg = np.array(fg).astype(np.float32) / 255
    fg[..., 3] = a / 255.
    ys, xs = np.where(fg[..., 3] > 0.02)
    fg = fg[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = fg.shape[:2]
    s = 0.78 * min(W / w, H / h)
    pm = fg.copy()
    pm[..., :3] *= pm[..., 3:4]
    pm = np.stack([np.array(Image.fromarray(pm[..., c]).resize((int(w * s), int(h * s)), Image.LANCZOS)) for c in range(4)], -1).clip(0, 1)
    al = pm[..., 3]
    col = np.where(al[..., None] > 1e-3, pm[..., :3] / np.maximum(al[..., None], 1e-3), 0).clip(0, 1)
    bg = Image.open(f'{G}/src/{bg_key}.jpg').convert('RGB')
    bw, bh = bg.size
    sc = max(W / bw, H / bh)
    bg = np.array(bg.resize((math.ceil(bw * sc), math.ceil(bh * sc)), Image.LANCZOS)).astype(np.float32)[:H, :W] / 255
    A = np.zeros((H, W), np.float32)
    F = np.zeros((H, W, 3), np.float32)
    hh, ww = al.shape
    y0 = (H - hh) // 2 + int(rng.integers(-10, 10))
    x0 = (W - ww) // 2 + int(rng.integers(-20, 20))
    A[y0:y0 + hh, x0:x0 + ww] = al
    F[y0:y0 + hh, x0:x0 + ww] = col
    return A[..., None] * F + (1 - A[..., None]) * bg, A


def box(x, r):
    return cv2.boxFilter(x, -1, (2 * r + 1, 2 * r + 1), normalize=True, borderType=cv2.BORDER_REFLECT)


def fg_blur(I, a, r1, r2):
    """The spike's tools/pp.py fg_blur, verbatim (the numeric reference of src/lib/bgremove/fusion.ts)."""
    def bf(I, F, B, a, r):
        A = a[..., None]
        bA = box(a, r)[..., None]
        bF = box(F * A, r) / (bA + 1e-5)
        bB = box(B * (1 - A), r) / (box(1 - a, r)[..., None] + 1e-5)
        F2 = bF + A * (I - A * bF - (1 - A) * bB)
        return np.clip(F2, 0, 1), bB
    F, B = bf(I, I, I, a, r1)
    F, _ = bf(I, F, B, a, r2)
    return F


def u16gz(path, x):
    data = (np.clip(x, 0, 1) * 65535 + 0.5).astype('<u2').tobytes()
    with open(path, 'wb') as f:
        f.write(gzip.compress(data, compresslevel=9, mtime=0))


def main():
    os.makedirs(OUT, exist_ok=True)
    md = os.path.join(ROOT, 'vendor-assets', 'birefnet-lite-512', EXPORT)
    man = json.load(open(os.path.join(md, 'manifest.json')))
    model = b''.join(open(os.path.join(md, p['name']), 'rb').read() for p in man['parts'])
    so = ort.SessionOptions()
    so.log_severity_level = 3
    sess = ort.InferenceSession(model, so, providers=['CPUExecutionProvider'])
    src = json.load(open(f'{G}/sources.json', encoding='utf8'))
    rng = np.random.default_rng(11)
    meta = {}
    for k, fgk, bgk, (W, H) in FIXTURES:
        assert src[fgk]['lic'] == 'CC0' and src[bgk]['lic'] == 'CC0', (k, src[fgk]['lic'], src[bgk]['lic'])
        I, A = compose(fgk, bgk, W, H, rng)
        Image.fromarray((I * 255 + .5).clip(0, 255).astype(np.uint8)).save(f'{OUT}/{k}.jpg', quality=90)
        Image.fromarray((A * 255 + .5).astype(np.uint8)).save(f'{OUT}/{k}.alpha.png', optimize=True)
        # The reference reads the JPEG back, as the browser does.
        im = Image.open(f'{OUT}/{k}.jpg').convert('RGB')
        x = ((np.asarray(im.resize((512, 512), Image.BILINEAR), np.float32) / 255 - MEAN) / STD).transpose(2, 0, 1)[None]
        y = sess.run(None, {'input_image': x})[0][0, 0].astype(np.float32)
        u16gz(f'{OUT}/{k}.mask.u16.gz', y)
        gt = np.asarray(Image.open(f'{OUT}/{k}.alpha.png'), np.float32) / 255
        up = np.clip(cv2.resize(y, (W, H), interpolation=cv2.INTER_LINEAR), 0, 1)
        m = all_metrics(up, gt)
        meta[k] = dict(width=W, height=H, fg=src[fgk]['title'], fgPage=src[fgk]['page'], bg=src[bgk]['title'], bgPage=src[bgk]['page'],
                       license='CC0', pythonArea=float((y > 0.5).mean()), pythonGt={'mae': m['mae'], 'iou': m['iou']})
        print(k, meta[k]['pythonArea'], meta[k]['pythonGt'], flush=True)
    # Blur-fusion references: a 128x96 crop of cc0-dog with its GT alpha, and a synthetic soft disc on a gradient.
    I = np.asarray(Image.open(f'{OUT}/cc0-dog.jpg').convert('RGB').resize((128, 96), Image.LANCZOS), np.float32) / 255
    A = np.asarray(Image.open(f'{OUT}/cc0-dog.alpha.png').resize((128, 96), Image.LANCZOS), np.float32) / 255
    yy, xx = np.mgrid[0:60, 0:80].astype(np.float32)
    d = np.sqrt((xx - 38) ** 2 + (yy - 31) ** 2)
    A2 = np.clip((20 - d) / 4, 0, 1).astype(np.float32)
    bg = np.stack([xx / 80, yy / 60, 0.3 + 0 * xx], -1)
    I2 = (A2[..., None] * np.array([0.9, 0.2, 0.1], np.float32) + (1 - A2[..., None]) * bg).astype(np.float32)
    for name, Ii, Ai, r1, r2 in (('a', I, A, 12, 2), ('b', I2, A2, 5, 1)):
        # Inputs as 8-bit PNGs; the reference runs on exactly those bytes.
        Image.fromarray((Ii * 255 + .5).astype(np.uint8)).save(f'{OUT}/fusion-{name}.png', optimize=True)
        Image.fromarray((Ai * 255 + .5).astype(np.uint8)).save(f'{OUT}/fusion-{name}.alpha.png', optimize=True)
        I8 = np.asarray(Image.open(f'{OUT}/fusion-{name}.png'), np.float32) / 255
        A8 = np.asarray(Image.open(f'{OUT}/fusion-{name}.alpha.png'), np.float32) / 255
        F = fg_blur(I8, A8, r1, r2)
        u16gz(f'{OUT}/fusion-{name}.fg.u16.gz', F)
        meta[f'fusion-{name}'] = dict(width=Ii.shape[1], height=Ii.shape[0], r1=r1, r2=r2)
    # Pillow's bilinear resize, the reference of src/lib/bgremove/infer.ts pilResizeRgba (down and up).
    src = Image.open(f'{OUT}/fusion-a.png').convert('RGB')
    src.resize((51, 37), Image.BILINEAR).save(f'{OUT}/pil-down.png')
    src.crop((0, 0, 20, 15)).resize((47, 33), Image.BILINEAR).save(f'{OUT}/pil-up.png')
    json.dump(dict(exportId=EXPORT, fixtures=meta), open(f'{OUT}/meta.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
