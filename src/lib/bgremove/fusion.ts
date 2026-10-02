// Foreground colour estimation for 배경 지우기 (Sprint C, C2; brief build order 5): our own implementation of
// blur-fusion ×2 from Forte & Pitié, "Approximate Fast Foreground Colour Estimation" (ICIP 2021). No code copied;
// the spike's Python `pp.fg_blur` (numpy + cv2) is the numeric reference (unit test: mean diff <= 0.002).
//
//   pass(I, F, B, a, r):  bF = box(F·a) / (box(a) + ε)      bB = box(B·(1−a)) / (box(1−a) + ε)
//                         F' = clip(bF + a·(I − a·bF − (1−a)·bB), 0, 1)        returns F', bB
//   F1, B1 = pass(I, I, I, a, r1);   F = pass(I, F1, B1, a, r2).F'
//
// box() is a normalised (2r+1)² mean with reflected borders (cv2 BORDER_REFLECT: …cba|abc…|cba…), done as running
// sums (O(1) per pixel whatever the radius) streamed row by row through a ring of 2r+1 rows. box(1−a) = 1 − box(a),
// since the box of 1 is 1. Memory: 2 float planes + small rings; the result is written into the input. Pure; runs in
// fusion.worker.ts.

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

/** Fills `row` (length w) with source row `y`. */
export type RowFill = (y: number, row: Float32Array) => void;

/**
 * Normalised (2r+1)² box filters of several sources at once, streamed row by row (C2 round 2: no full-size scratch
 * planes). Each source is given as a row filler; its horizontal running sums go into a ring of 2r+1 rows, and column
 * sums over the ring give the output row, which `onRow(y, rows)` receives (rows[i] = box of source i at row y; the
 * arrays are reused for the next row). Borders reflect as cv2 BORDER_REFLECT, for any radius.
 */
export function boxRows(fills: readonly RowFill[], w: number, h: number, r: number, onRow: (y: number, rows: readonly Float32Array[]) => void): void {
  const k = 2 * r + 1;
  const addX = new Int32Array(w);
  const subX = new Int32Array(w);
  for (let x = 1; x < w; x++) {
    addX[x] = reflect(x + r, w);
    subX[x] = reflect(x - r - 1, w);
  }
  const startX = new Int32Array(k);
  for (let j = 0; j < k; j++) startX[j] = reflect(j - r, w);
  const src = new Float32Array(w);
  const rings = fills.map(() => new Float32Array(k * w));
  const cols = fills.map(() => new Float64Array(w));
  const outs = fills.map(() => new Float32Array(w));
  const slot = (v: number): number => (((v % k) + k) % k) * w;
  /** Horizontal box of source row `sy` of source `f` into ring offset `o`. */
  const hrow = (f: number, sy: number, o: number): void => {
    fills[f]!(sy, src);
    const ring = rings[f]!;
    let s = 0;
    for (let j = 0; j < k; j++) s += src[startX[j]!]!;
    ring[o] = s / k;
    for (let x = 1; x < w; x++) {
      s += src[addX[x]!]! - src[subX[x]!]!;
      ring[o + x] = s / k;
    }
  };
  for (let f = 0; f < fills.length; f++) {
    const ring = rings[f]!;
    const col = cols[f]!;
    for (let v = -r; v <= r; v++) {
      const o = slot(v);
      hrow(f, reflect(v, h), o);
      for (let x = 0; x < w; x++) col[x] = col[x]! + ring[o + x]!;
    }
  }
  for (let y = 0; y < h; y++) {
    if (y > 0) {
      // The row leaving the window (virtual index y − r − 1) shares its ring slot with the one entering (y + r).
      const o = slot(y + r);
      for (let f = 0; f < fills.length; f++) {
        const ring = rings[f]!;
        const col = cols[f]!;
        for (let x = 0; x < w; x++) col[x] = col[x]! - ring[o + x]!;
        hrow(f, reflect(y + r, h), o);
        for (let x = 0; x < w; x++) col[x] = col[x]! + ring[o + x]!;
      }
    }
    for (let f = 0; f < fills.length; f++) {
      const col = cols[f]!;
      const out = outs[f]!;
      for (let x = 0; x < w; x++) out[x] = col[x]! / k;
    }
    onRow(y, outs);
  }
}

/** Normalised box filter of a whole plane `src` (w×h) with radius `r` into `out` (boxRows on one source). */
export function boxFilter(src: Float32Array, w: number, h: number, r: number, out: Float32Array): void {
  boxRows([(y, row) => row.set(src.subarray(y * w, (y + 1) * w))], w, h, r, (y, rows) => out.set(rows[0]!, y * w));
}

const clip01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Blur-fusion ×2. `rgba`: the work copy (straight RGBA bytes); `alpha`: the mask at the same size (0..255).
 * Writes the estimated foreground colour into `rgba` itself, with `alpha` as its alpha channel, and returns it.
 * Memory (C2 round 2): per channel, pass 1 streams box(a), box(I·a), box(I·(1−a)) at r1 into F1 and B1 (the only
 * two float planes), pass 2 streams box(a), box(F1·a), box(B1·(1−a)) at r2 and writes the result straight into
 * `rgba`: about 100 MB at 4,096×3,072 besides the photo and the mask.
 */
export function blurFusion(rgba: Uint8ClampedArray, alpha: Uint8ClampedArray | Uint8Array, w: number, h: number, r1: number, r2: number): Uint8ClampedArray {
  const n = w * h;
  if (rgba.length !== n * 4 || alpha.length !== n) throw new Error('blurFusion: size mismatch');
  const k = 1 / 255;
  const F1 = new Float32Array(n);
  const B1 = new Float32Array(n);
  const aRow: RowFill = (y, row) => {
    const o = y * w;
    for (let x = 0; x < w; x++) row[x] = alpha[o + x]! * k;
  };
  for (let c = 0; c < 3; c++) {
    // Pass 1 (r1): F = B = I.
    boxRows(
      [
        aRow,
        (y, row) => {
          const o = y * w;
          for (let x = 0; x < w; x++) row[x] = rgba[(o + x) * 4 + c]! * k * alpha[o + x]! * k;
        },
        (y, row) => {
          const o = y * w;
          for (let x = 0; x < w; x++) row[x] = rgba[(o + x) * 4 + c]! * k * (1 - alpha[o + x]! * k);
        },
      ],
      w,
      h,
      r1,
      (y, [bA, bIA, bIB]) => {
        const o = y * w;
        for (let x = 0; x < w; x++) {
          const i = o + x;
          const ba = bA![x]!;
          const fb = bIA![x]! / (ba + EPS);
          const bb = bIB![x]! / (1 - ba + EPS);
          const ai = alpha[i]! * k;
          F1[i] = clip01(fb + ai * (rgba[i * 4 + c]! * k - ai * fb - (1 - ai) * bb));
          B1[i] = bb;
        }
      },
    );
    // Pass 2 (r2): F = F1, B = B1; the result goes straight into channel c (read as I before it is overwritten).
    boxRows(
      [
        aRow,
        (y, row) => {
          const o = y * w;
          for (let x = 0; x < w; x++) row[x] = F1[o + x]! * alpha[o + x]! * k;
        },
        (y, row) => {
          const o = y * w;
          for (let x = 0; x < w; x++) row[x] = B1[o + x]! * (1 - alpha[o + x]! * k);
        },
      ],
      w,
      h,
      r2,
      (y, [bA, bFA, bBB]) => {
        const o = y * w;
        for (let x = 0; x < w; x++) {
          const i = o + x;
          const ba = bA![x]!;
          const fb = bFA![x]! / (ba + EPS);
          const bb = bBB![x]! / (1 - ba + EPS);
          const ai = alpha[i]! * k;
          rgba[i * 4 + c] = Math.round(clip01(fb + ai * (rgba[i * 4 + c]! * k - ai * fb - (1 - ai) * bb)) * 255);
        }
      },
    );
  }
  for (let i = 0; i < n; i++) rgba[i * 4 + 3] = alpha[i]!;
  return rgba;
}

/** The fallback when fusion cannot run (worker out of memory): the photo's own colours with the mask as alpha. */
export function plainCutout(rgba: Uint8ClampedArray | Uint8Array, alpha: Uint8ClampedArray | Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < alpha.length; i++) out[i * 4 + 3] = alpha[i]!;
  return out;
}
