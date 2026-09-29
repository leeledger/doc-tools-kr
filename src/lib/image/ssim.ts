// Luma SSIM (Wang et al. 2004): 11×11 Gaussian window, σ 1.5, BT.601 luma. A port of the spike's
// metrics.js. The photo worker uses it for the scale re-search score (at 1024 px, as the spike's quickScore);
// regress:photo re-exports it (scripts/regress/photo-metrics.mjs), so both measure with the same code.

export interface Pixels {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/** Luma, BT.601. */
export function luma(id: Pixels): Float32Array {
  const n = id.width * id.height;
  const d = id.data;
  const y = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) y[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  return y;
}

const K = (() => {
  const k = new Float32Array(11);
  let s = 0;
  for (let i = 0; i < 11; i++) {
    k[i] = Math.exp(-((i - 5) ** 2) / (2 * 1.5 * 1.5));
    s += k[i];
  }
  for (let i = 0; i < 11; i++) k[i] /= s;
  return k;
})();

function blur(src: Float32Array, w: number, h: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -5; k <= 5; k++) s += K[k + 5] * src[y * w + Math.min(w - 1, Math.max(0, x + k))];
      tmp[y * w + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -5; k <= 5; k++) s += K[k + 5] * tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
      out[y * w + x] = s;
    }
  }
  return out;
}

/** SSIM (Wang et al. 2004): 11×11 Gaussian window, σ 1.5, on luma. Images of equal size. */
export function ssim(a: Pixels, b: Pixels): number {
  const w = a.width;
  const h = a.height;
  const n = w * h;
  const x = luma(a);
  const y = luma(b);
  const xx = new Float32Array(n);
  const yy = new Float32Array(n);
  const xy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xx[i] = x[i] * x[i];
    yy[i] = y[i] * y[i];
    xy[i] = x[i] * y[i];
  }
  const mx = blur(x, w, h);
  const my = blur(y, w, h);
  const sxx = blur(xx, w, h);
  const syy = blur(yy, w, h);
  const sxy = blur(xy, w, h);
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const vx = sxx[i] - mx[i] * mx[i];
    const vy = syy[i] - my[i] * my[i];
    const cv = sxy[i] - mx[i] * my[i];
    s += ((2 * mx[i] * my[i] + C1) * (2 * cv + C2)) / ((mx[i] ** 2 + my[i] ** 2 + C1) * (vx + vy + C2));
  }
  return s / n;
}
