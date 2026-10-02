// Foreground colour estimation for 배경 지우기 (Sprint C, C2; brief build order 5): our own implementation of
// blur-fusion ×2 from Forte & Pitié, "Approximate Fast Foreground Colour Estimation" (ICIP 2021). No code copied;
// the spike's Python `pp.fg_blur` (numpy + cv2) is the numeric reference (unit test: mean diff <= 0.002).
//
//   pass(I, F, B, a, r):  bF = box(F·a) / (box(a) + ε)      bB = box(B·(1−a)) / (box(1−a) + ε)
//                         F' = clip(bF + a·(I − a·bF − (1−a)·bB), 0, 1)        returns F', bB
//   F1, B1 = pass(I, I, I, a, r1);   F = pass(I, F1, B1, a, r2).F'
//
// box() is a normalised (2r+1)² mean with reflected borders (cv2 BORDER_REFLECT: …cba|abc…|cba…), done as two
// running-sum passes (O(1) per pixel whatever the radius). box(1−a) = 1 − box(a), since the box of 1 is 1.
// Memory: the channels are done one after another, so at most 8 float planes are alive (about 400 MB at 4,096×3,072,
// 100 MB at the phone cap of 2,048 px). Pure; runs in fusion.worker.ts.

export const EPS = 1e-5;

/** Index `i` reflected into 0..n-1 the way cv2 BORDER_REFLECT does (edge pixel repeated), for any `i`. */
export function reflect(i: number, n: number): number {
  if (n === 1) return 0;
  for (;;) {
    if (i < 0) i = -i - 1;
    else if (i >= n) i = 2 * n - i - 1;
    else return i;
  }
}

/** Normalised box filter of `src` (w×h) with radius `r` into `out`; `tmp` is a scratch plane of the same size. */
export function boxFilter(src: Float32Array, w: number, h: number, r: number, out: Float32Array, tmp: Float32Array): void {
  const k = 2 * r + 1;
  // Horizontal running sums, row by row.
  const addX = new Int32Array(w);
  const subX = new Int32Array(w);
  for (let x = 1; x < w; x++) {
    addX[x] = reflect(x + r, w);
    subX[x] = reflect(x - r - 1, w);
  }
  const startX = new Int32Array(k);
  for (let j = 0; j < k; j++) startX[j] = reflect(j - r, w);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let s = 0;
    for (let j = 0; j < k; j++) s += src[o + startX[j]!]!;
    tmp[o] = s / k;
    for (let x = 1; x < w; x++) {
      s += src[o + addX[x]!]! - src[o + subX[x]!]!;
      tmp[o + x] = s / k;
    }
  }
  // Vertical running sums over whole rows (row-major, cache friendly).
  const col = new Float64Array(w);
  for (let j = 0; j < k; j++) {
    const o = reflect(j - r, h) * w;
    for (let x = 0; x < w; x++) col[x] = col[x]! + tmp[o + x]!;
  }
  for (let x = 0; x < w; x++) out[x] = col[x]! / k;
  for (let y = 1; y < h; y++) {
    const add = reflect(y + r, h) * w;
    const sub = reflect(y - r - 1, h) * w;
    const o = y * w;
    for (let x = 0; x < w; x++) {
      const v = col[x]! + tmp[add + x]! - tmp[sub + x]!;
      col[x] = v;
      out[o + x] = v / k;
    }
  }
}

const clip01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Blur-fusion ×2. `rgba`: the work copy (straight RGBA bytes); `alpha`: the mask at the same size (0..255).
 * Returns straight RGBA bytes: the estimated foreground colour with `alpha` as its alpha channel.
 */
export function blurFusion(rgba: Uint8ClampedArray | Uint8Array, alpha: Uint8ClampedArray | Uint8Array, w: number, h: number, r1: number, r2: number): Uint8ClampedArray {
  const n = w * h;
  if (rgba.length !== n * 4 || alpha.length !== n) throw new Error('blurFusion: size mismatch');
  const out = new Uint8ClampedArray(n * 4);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = alpha[i]! / 255;
  const tmp = new Float32Array(n);
  // box(a) at both radii, shared by the three channels.
  const bA1 = new Float32Array(n);
  boxFilter(a, w, h, r1, bA1, tmp);
  const bA2 = new Float32Array(n);
  boxFilter(a, w, h, r2, bA2, tmp);
  const I = new Float32Array(n);
  const prod = new Float32Array(n);
  const bF = new Float32Array(n);
  const bB = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) I[i] = rgba[i * 4 + c]! / 255;
    // Pass 1 (r1): F = B = I.
    for (let i = 0; i < n; i++) prod[i] = I[i]! * a[i]!;
    boxFilter(prod, w, h, r1, bF, tmp);
    for (let i = 0; i < n; i++) prod[i] = I[i]! * (1 - a[i]!);
    boxFilter(prod, w, h, r1, bB, tmp);
    for (let i = 0; i < n; i++) {
      const fb = bF[i]! / (bA1[i]! + EPS);
      const bb = bB[i]! / (1 - bA1[i]! + EPS);
      const ai = a[i]!;
      bF[i] = clip01(fb + ai * (I[i]! - ai * fb - (1 - ai) * bb)); // F1
      bB[i] = bb; // B1
    }
    // Pass 2 (r2): F = F1, B = B1.
    for (let i = 0; i < n; i++) prod[i] = bF[i]! * a[i]!;
    const bF2 = bF; // F1 is no longer needed after this product
    boxFilter(prod, w, h, r2, bF2, tmp);
    for (let i = 0; i < n; i++) prod[i] = bB[i]! * (1 - a[i]!);
    boxFilter(prod, w, h, r2, bB, tmp);
    for (let i = 0; i < n; i++) {
      const fb = bF2[i]! / (bA2[i]! + EPS);
      const bb = bB[i]! / (1 - bA2[i]! + EPS);
      const ai = a[i]!;
      out[i * 4 + c] = Math.round(clip01(fb + ai * (I[i]! - ai * fb - (1 - ai) * bb)) * 255);
    }
  }
  for (let i = 0; i < n; i++) out[i * 4 + 3] = alpha[i]!;
  return out;
}

/** The fallback when fusion cannot run (worker out of memory): the photo's own colours with the mask as alpha. */
export function plainCutout(rgba: Uint8ClampedArray | Uint8Array, alpha: Uint8ClampedArray | Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < alpha.length; i++) out[i * 4 + 3] = alpha[i]!;
  return out;
}
