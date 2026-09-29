// Image metrics for regress:photo (a port of spikes/photo/web/lib/metrics.js plus a blockiness index).
// SSIM and luma live in src/lib/image/ssim.ts (the worker's re-search score uses the same code).
// Pure functions on {data, width, height} (RGBA); they run in the harness page and in Node (unit tests).

import { luma, ssim } from '../../src/lib/image/ssim.ts';

export { luma, ssim };

/** RGB PSNR in dB; 99 for identical images. */
export function psnr(a, b) {
  const d1 = a.data;
  const d2 = b.data;
  let se = 0;
  let c = 0;
  for (let i = 0; i < d1.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const e = d1[i + k] - d2[i + k];
      se += e * e;
      c++;
    }
  }
  const mse = se / c;
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse);
}

/**
 * Blockiness index: mean |Δluma| across 8-px block boundaries ÷ mean |Δluma| elsewhere, over horizontal and
 * vertical neighbours, at the image's own resolution. ≈ 1 for natural images; JPEG blocking raises it.
 */
export function blockiness(id) {
  const w = id.width;
  const h = id.height;
  const y = luma(id);
  let edge = 0;
  let edgeN = 0;
  let inner = 0;
  let innerN = 0;
  for (let r = 0; r < h; r++) {
    for (let c = 1; c < w; c++) {
      const d = Math.abs(y[r * w + c] - y[r * w + c - 1]);
      if (c % 8 === 0) {
        edge += d;
        edgeN++;
      } else {
        inner += d;
        innerN++;
      }
    }
  }
  for (let r = 1; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const d = Math.abs(y[r * w + c] - y[(r - 1) * w + c]);
      if (r % 8 === 0) {
        edge += d;
        edgeN++;
      } else {
        inner += d;
        innerN++;
      }
    }
  }
  const e = edgeN ? edge / edgeN : 0;
  const i = innerN ? inner / innerN : 0;
  if (i === 0) return e === 0 ? 1 : Infinity;
  return e / i;
}

/** Evaluation size (spike evalDims): long edge capped at `cap`. */
export function evalDims(w, h, cap = 2048) {
  const s = Math.min(1, cap / Math.max(w, h));
  return [Math.round(w * s), Math.round(h * s)];
}
