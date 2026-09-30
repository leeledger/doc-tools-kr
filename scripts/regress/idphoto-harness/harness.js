// regress:idphoto harness page (served by Vite from scripts/regress/idphoto.mjs; never part of dist/).
// Runs the production modules of /id-photo/: decode (Step 3 decode.ts), the MediaPipe landmarker
// (src/lib/face), frame, warnings, background, render and the encode worker. Every number the runner judges
// is computed here from those modules; the runner only compares.
import { loadFaceAssets } from '../../../src/lib/face/assets.ts';
import { createLandmarker, measure } from '../../../src/lib/face/landmarker.ts';
import { PRESETS, customPreset, getPreset } from '../../../src/data/id-photo-presets.ts';
import { decodeImage } from '../../../src/lib/image/decode.ts';
import { sniffImage } from '../../../src/lib/image/sniff.ts';
import { checkBackground } from '../../../src/lib/idphoto/background.ts';
import { autoFrame, estimateHead, manualFrame } from '../../../src/lib/idphoto/frame.ts';
import { renderOutput, renderPreview } from '../../../src/lib/idphoto/render.ts';
import { checklist } from '../../../src/lib/idphoto/warnings.ts';
import { loadResize } from '../../../src/lib/codecs/wasm-browser.ts';

let lm = null;
let cur = null;
let natural = null;

/** OffscreenCanvas where it exists (Playwright WebKit on Windows has none). */
function mk(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const presetOf = (id) => (id === 'custom' ? customPreset(200, 250, 50) : getPreset(id));

function encode(pixels, p) {
  return new Promise((resolve) => {
    const w = new Worker(new URL('../../../src/lib/idphoto/encode.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev) => {
      w.terminate();
      resolve(ev.data);
    };
    w.onerror = (ev) => {
      ev.preventDefault();
      w.terminate();
      resolve({ type: 'error', code: 'engine', detail: ev.message });
    };
    const spec = { outW: p.outW, outH: p.outH, dpi: p.dpi, ...(p.limitBytes !== undefined ? { limitBytes: p.limitBytes } : {}) };
    w.postMessage({ type: 'encode', pixels, spec }, [pixels.data.buffer]);
  });
}

function psnr(a, b) {
  let se = 0;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = a.data[i + c] - b.data[i + c];
      se += d * d;
      n++;
    }
  }
  return se === 0 ? 99 : 10 * Math.log10((255 * 255) / (se / n));
}

async function load(blob, maxLongEdge = 4096) {
  const head = new Uint8Array(await blob.arrayBuffer());
  const sniff = sniffImage(head);
  const d = await decodeImage(blob, sniff, { maxLongEdge });
  natural = { w: d.sourceWidth, h: d.sourceHeight };
  return d.src;
}

window.harness = {
  async init() {
    const t0 = performance.now();
    const assets = await loadFaceAssets(() => undefined, new AbortController().signal);
    lm = await createLandmarker(assets);
    return { initMs: Math.round(performance.now() - t0) };
  },

  async prepare(url, opts = {}) {
    cur?.bitmap.close();
    const blob = await (await fetch(url)).blob();
    let bitmap = await load(blob);
    if (opts.width) {
      const h = Math.round((bitmap.height * opts.width) / bitmap.width);
      const small = await createImageBitmap(bitmap, { resizeWidth: opts.width, resizeHeight: h, resizeQuality: 'high' });
      bitmap.close();
      bitmap = small;
    }
    cur = { bitmap, face: null };
    return { w: bitmap.width, h: bitmap.height, sourceW: natural.w, sourceH: natural.h };
  },

  /** Two portraits side by side (the multi-face case). */
  async prepareTwo(urlA, urlB) {
    cur?.bitmap.close();
    const a = await load(await (await fetch(urlA)).blob(), 1200);
    const b = await load(await (await fetch(urlB)).blob(), 1200);
    const h = Math.min(a.height, b.height);
    const wa = Math.round((a.width * h) / a.height);
    const wb = Math.round((b.width * h) / b.height);
    const c = mk(wa + wb, h);
    const g = c.getContext('2d');
    g.drawImage(a, 0, 0, wa, h);
    g.drawImage(b, wa, 0, wb, h);
    a.close();
    b.close();
    cur = { bitmap: await createImageBitmap(c), face: null };
    return { w: c.width, h };
  },

  detect() {
    const t0 = performance.now();
    const r = measure(lm, cur.bitmap);
    const ms = performance.now() - t0;
    cur.face = r.faces > 0 ? r : null;
    if (!cur.face) return { faces: 0, ms };
    const head = estimateHead(r);
    return { faces: r.faces, ms, eyeY: r.eye.y, chinY: r.chin.y, crownY: head.crown.y, headPx: head.px, roll: r.roll, pose: r.pose, blend: r.blend };
  },

  /** Auto frame (or manual without a face) for a preset: the scale, the checklist and the encoded file. */
  async run(presetId, { encodeFile = true } = {}) {
    const p = presetOf(presetId);
    const out = { w: p.outW, h: p.outH };
    const W = cur.bitmap.width;
    const H = cur.bitmap.height;
    const f = cur.face ? autoFrame(cur.face, out, W, H) : manualFrame(out, W, H);
    const lowres = f.lowres || manualFrame(out, W, H).lowres;
    const bg = checkBackground(renderPreview(cur.bitmap, f.state, p.outW, p.outH, 160));
    const c = checklist({ face: cur.face, state: f.state, preset: p, srcW: W, srcH: H, lowres, bg, manualReason: cur.face ? null : 'noface' });
    const res = { s: f.state.s, lowres, outside: f.outside, blocks: c.blocks.map((b) => b.id), warns: c.warns.map((w) => w.id) };
    if (!encodeFile || c.blocks.length) return res;
    const pixels = await renderOutput(cur.bitmap, f.state, p.outW, p.outH);
    const e = await encode(pixels, p);
    if (e.type !== 'done') return { ...res, error: e.code, detail: e.detail };
    return { ...res, bytes: Array.from(e.bytes), q: e.q, fallback: e.fallback };
  },

  /** render.ts at rot 0 against a lanczos3 crop-scale of the same integer source rectangle (PSNR, dB). */
  async resample(presetId) {
    const p = presetOf(presetId);
    const W = cur.bitmap.width;
    const H = cur.bitmap.height;
    const f = cur.face ? autoFrame(cur.face, { w: p.outW, h: p.outH }, W, H) : manualFrame({ w: p.outW, h: p.outH }, W, H);
    // An integer rectangle of the output aspect around the frame centre, inside the photo.
    const cw = Math.min(W, Math.round(p.outW / f.state.s));
    const ch = Math.min(H, Math.round((cw * p.outH) / p.outW));
    const x0 = Math.max(0, Math.min(W - cw, Math.round(f.state.cx - cw / 2)));
    const y0 = Math.max(0, Math.min(H - ch, Math.round(f.state.cy - ch / 2)));
    const state = { cx: x0 + cw / 2, cy: y0 + ch / 2, s: p.outW / cw, rotDeg: 0 };
    const ours = await renderOutput(cur.bitmap, state, p.outW, p.outH);
    const c = mk(cw, ch);
    const g = c.getContext('2d');
    g.drawImage(cur.bitmap, x0, y0, cw, ch, 0, 0, cw, ch);
    const src = g.getImageData(0, 0, cw, ch);
    const resize = await loadResize();
    const o = resize(new Uint8Array(src.data.buffer), cw, ch, p.outW, p.outH, 3, false, false);
    const ref = new ImageData(new Uint8ClampedArray(o.buffer, o.byteOffset, o.byteLength), p.outW, p.outH);
    return { psnr: psnr(ours, ref), s: state.s };
  },

  presets: () => PRESETS.map((p) => p.id).concat('custom'),
};
window.harnessReady = true;
