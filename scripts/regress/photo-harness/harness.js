// regress:photo harness page (served by Vite from scripts/regress/photo.mjs; never part of dist/).
// Runs the production photo worker on one file at a time and measures in the page, like the spike's
// bench.html: both images are drawn (high-quality smoothing) at the original's evaluation size (long edge
// ≤ 2048) for SSIM/PSNR; blockiness is measured on the output at its own resolution.
import { blockiness, evalDims, psnr, ssim } from '../photo-metrics.mjs';

let current = null;

function draw(src, w, h) {
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  c.width = 0;
  c.height = 0;
  return img;
}

async function score(blob) {
  const bm = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const t = draw(bm, current.ew, current.eh);
  const own = draw(bm, bm.width, bm.height);
  const out = { ssim: ssim(current.ref, t), psnr: psnr(current.ref, t), bi: blockiness(own), w: bm.width, h: bm.height };
  bm.close();
  return out;
}

function runWorker(file, options) {
  return new Promise((resolve) => {
    const w = new Worker(new URL('../../../src/lib/image/photo.worker.ts', import.meta.url), { type: 'module' });
    const t0 = performance.now();
    let result = null;
    w.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'item-done') result = { bytes: m.bytes, mime: m.mime, report: m.report, ms: Math.round(performance.now() - t0) };
      else if (m.type === 'item-error') result = { error: m.code };
      else if (m.type === 'run-done') {
        w.terminate();
        resolve(result);
      }
    };
    w.onerror = (ev) => {
      ev.preventDefault();
      w.terminate();
      resolve({ error: `worker: ${ev.message}` });
    };
    w.postMessage({ type: 'run', items: [{ id: 1, file }], options, device: 'desktop' });
  });
}

window.harness = {
  /** Loads one input and its evaluation reference. Returns size and oriented dims, or a decode error. */
  async prepare(url) {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], url.split('/').pop());
    current = { url, file, size: blob.size };
    try {
      const bm = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const [ew, eh] = evalDims(bm.width, bm.height);
      Object.assign(current, { ew, eh, ref: draw(bm, ew, eh), w: bm.width, h: bm.height, bitmap: bm });
      return { size: blob.size, w: bm.width, h: bm.height };
    } catch (err) {
      return { size: blob.size, decodeError: String(err) };
    }
  },

  /** The production worker on the current file; metrics against the original. */
  async compress(options) {
    const r = await runWorker(current.file, options);
    if (!r || r.error) return { error: r?.error ?? 'no result' };
    if (!r.bytes) return { kept: true, report: r.report, ms: r.ms };
    const m = await score(new Blob([r.bytes], { type: r.mime }));
    return { bytes: r.bytes.length, report: r.report, ms: r.ms, ...m, sof: sofMarker(r.bytes) };
  },

  /** Naive baseline (spike naiveQuality): full resolution, canvas JPEG, q search 0.02–0.98 (step 0.01). */
  async naive(target) {
    const c = new OffscreenCanvas(current.w, current.h);
    const g = c.getContext('2d');
    g.drawImage(current.bitmap, 0, 0);
    const enc = (q) => c.convertToBlob({ type: 'image/jpeg', quality: q });
    const t0 = performance.now();
    let lo = 0.02;
    let hi = 0.98;
    let best = null;
    let b = await enc(hi);
    if (b.size <= target) best = { blob: b, q: hi };
    else {
      b = await enc(lo);
      if (b.size <= target) {
        best = { blob: b, q: lo };
        while (hi - lo > 0.01 + 1e-9) {
          const mid = Math.round(((lo + hi) / 2) * 100) / 100;
          if (mid <= lo || mid >= hi) break;
          const m = await enc(mid);
          if (m.size <= target) {
            lo = mid;
            best = { blob: m, q: mid };
          } else hi = mid;
        }
      }
    }
    c.width = 0;
    c.height = 0;
    if (!best) return { fits: false, ms: Math.round(performance.now() - t0) };
    return { fits: true, q: best.q, bytes: best.blob.size, ms: Math.round(performance.now() - t0), ...(await score(best.blob)) };
  },

  release() {
    current?.bitmap?.close();
    current = null;
  },
};

/** The first SOF marker of a JPEG (0xC0 = baseline). */
function sofMarker(b) {
  let i = 2;
  while (i + 3 < b.length && b[i] === 0xff) {
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return m;
    if (m === 0xda) return -1;
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return -1;
}

window.harnessReady = true;
