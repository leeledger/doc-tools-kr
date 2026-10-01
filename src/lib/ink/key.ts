// Ink key for 전자서명·도장 이미지 (Sprint C, C1). Port of the spike's pp.ink_key: the paper level is estimated
// locally (closing + Gaussian), so shadows, uneven light and paper tone fall away and ink is keyed by its
// darkness relative to the paper around it. Pure functions on typed-array planes (0..1); no DOM, no model.
// The brief's numbers (ARCHITECT-BRIEF-C.md "Ink-key algorithm") are pinned; the additions of C1-core rounds 1-2
// (closing, hysteresis, solid fill, ink colour) are logged in handoff/BUILD-LOG.md. Change none without Arch.

export type InkMode = 'auto' | 'red' | 'sign';
/** `original` = the photo's own ink colour (default); the others are fixed colours (색 맞추기, opt-in). */
export type InkColor = 'original' | 'red' | 'black' | 'blue';
export type InkStatus = 'ok' | 'noink' | 'allpaper';
export type InkPlane = 'mn' | 'lum';

export const INK = {
  /** Alpha ramp at the default 진하기 (middle of 5 steps). */
  lo: 0.1,
  hi: 0.6,
  /** Ramp shift per 진하기 step; steps are -2..2, higher = darker (more ink). */
  strengthStep: 0.03,
  strengthMin: -2,
  strengthMax: 2,
  /** Auto colour guess: weighted redness above this = 도장 빨강. */
  redGuess: 0.15,
  /** Hysteresis: strong ink is a > 0.5; weak alpha must lie within max(2, round(longEdge / 600)) px of it. */
  strongAlpha: 0.5,
  hystMinPx: 2,
  hystPerPx: 600,
  /** Paper for the paper colour: a = 0 and min(R,G,B) at least 45 % of its 90th percentile. */
  paperDarkShare: 0.45,
  /** Solid fill acts where the closing's paper level is more than 10 % below the paper around the ink. */
  fillSink: 0.1,
  /** Ink colour: coverage reference = 95th percentile of darkness on solid ink (a >= 0.99). */
  refPercentile: 0.95,
  /** Despeckle: components of a > 0.25 smaller than max(12, 0.00002 * W * H) px are removed. */
  speckAlpha: 0.25,
  speckMinPx: 12,
  speckShare: 0.00002,
  /** Area check on a > 0.5. */
  areaAlpha: 0.5,
  minInk: 0.0005,
  maxInk: 0.6,
  /** Auto-crop: bbox of a > 0.1, padding max(8 px, 4 % of the bbox long edge); 여백 없음 = 2 px. */
  cropAlpha: 0.1,
  padMin: 8,
  padShare: 0.04,
  padNone: 2,
} as const;

/** Fixed ink colours of 색 맞추기 (our design choices, not standards). */
export const INK_COLORS = {
  red: [0xc8, 0x10, 0x2e],
  black: [0x11, 0x11, 0x11],
  blue: [0x1f, 0x3a, 0x93],
} as const satisfies Record<string, readonly [number, number, number]>;

/** Output sizes (긴 변 px); `null` = 원본 크기 (the cropped work resolution). */
export const INK_SIZES = [null, 1000, 600, 300] as const;
export type InkSize = (typeof INK_SIZES)[number];

export interface Rgba {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface KeyOptions {
  mode: InkMode;
  /** 진하기 step, -2..2 (0 = default). */
  strength?: number;
}

/** Paper planes reused across re-runs of the same photo (the controls change; the photo does not). */
export interface InkCache {
  mn?: Float32Array;
  lum?: Float32Array;
  red?: Float32Array;
  paperMn?: Float32Array;
  paperLum?: Float32Array;
}

export interface KeyResult {
  alpha: Float32Array;
  /** The plane that was keyed: min(R,G,B) (자동, 빨간 도장) or luma (검정·파란 서명). */
  plane: InkPlane;
  /** Paper colour from the paper pixels around the ink (paperColor); the ink colour uses it. */
  paper: PaperGrid;
  /** Colour guess of the 자동 mode: weighted redness > 0.15. */
  guess: 'red' | 'black';
  /** Share of pixels with a > 0.5. */
  inkShare: number;
  status: InkStatus;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Planes in 0..1: min(R,G,B), Rec.601 luma, redness R - max(G,B). */
export function planes(img: Rgba): { mn: Float32Array; lum: Float32Array; red: Float32Array } {
  const n = img.width * img.height;
  const d = img.data;
  const mn = new Float32Array(n);
  const lum = new Float32Array(n);
  const red = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const r = d[j] / 255;
    const g = d[j + 1] / 255;
    const b = d[j + 2] / 255;
    mn[i] = Math.min(r, g, b);
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    red[i] = r - Math.max(g, b);
  }
  return { mn, lum, red };
}

/** Blocked transpose of a w x h plane into an h x w plane (keeps the column passes cache-friendly). */
export function transpose(src: Float32Array, w: number, h: number, out = new Float32Array(w * h)): Float32Array {
  const B = 32;
  for (let y0 = 0; y0 < h; y0 += B) {
    const y1 = Math.min(h, y0 + B);
    for (let x0 = 0; x0 < w; x0 += B) {
      const x1 = Math.min(w, x0 + B);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out[x * h + y] = src[y * w + x];
    }
  }
  return out;
}

/**
 * 1-D running max (or min, sign = -1) over a centred window of k (odd) samples, van Herk / Gil-Werman (O(n),
 * 3 compares per sample). Samples outside the line do not count (as cv2.dilate's default border).
 */
function extremumLine(src: Float32Array, off: number, n: number, k: number, sign: 1 | -1, pad: Float32Array, g: Float32Array, hb: Float32Array): void {
  const r = (k - 1) >> 1;
  const len = n + 2 * r;
  // Padded line pad[t] = sign * src[t - r] inside, -Infinity outside; g = prefix max per block, hb = suffix max.
  pad.fill(-Infinity, 0, r);
  for (let i = 0; i < n; i++) pad[r + i] = sign * src[off + i];
  pad.fill(-Infinity, r + n, len);
  for (let t0 = 0; t0 < len; t0 += k) {
    const t1 = t0 + k < len ? t0 + k : len;
    let m = pad[t0];
    g[t0] = m;
    for (let t = t0 + 1; t < t1; t++) {
      const v = pad[t];
      if (v > m) m = v;
      g[t] = m;
    }
    m = pad[t1 - 1];
    hb[t1 - 1] = m;
    for (let t = t1 - 2; t >= t0; t--) {
      const v = pad[t];
      if (v > m) m = v;
      hb[t] = m;
    }
  }
  // Window over padded [i, i + k - 1] = source [i - r, i + r]; written back in place.
  for (let i = 0; i < n; i++) {
    const x = hb[i];
    const y = g[i + k - 1];
    src[off + i] = sign * (x > y ? x : y);
  }
}

/** Row passes of a running max / min, in place. */
function extremumRows(p: Float32Array, w: number, h: number, k: number, sign: 1 | -1): void {
  const pad = new Float32Array(w + k);
  const g = new Float32Array(w + k);
  const hb = new Float32Array(w + k);
  for (let y = 0; y < h; y++) extremumLine(p, y * w, w, k, sign, pad, g, hb);
}

/** 2-D max filter with a k x k square window (separable), returns a new plane. */
export function maxFilter(src: Float32Array, w: number, h: number, k: number): Float32Array {
  const p = src.slice();
  extremumRows(p, w, h, k, 1);
  const t = transpose(p, w, h);
  extremumRows(t, h, w, k, 1);
  return transpose(t, h, w, p);
}

/** 2-D min filter with a k x k square window (separable), returns a new plane. */
export function minFilter(src: Float32Array, w: number, h: number, k: number): Float32Array {
  const p = src.slice();
  extremumRows(p, w, h, k, -1);
  const t = transpose(p, w, h);
  extremumRows(t, h, w, k, -1);
  return transpose(t, h, w, p);
}

/** Box widths (odd) of 3 box blurs that approximate a Gaussian of `sigma` (Kovesi 2010). */
export function gaussBoxes(sigma: number, n = 3): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(ideal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => (i < m ? wl : wu));
}

/** Row passes of a box mean of radius r (prefix sums; the window is cut at the line ends), in place. */
function boxRows(p: Float32Array, w: number, h: number, r: number, cum: Float64Array): void {
  if (r <= 0) return;
  for (let y = 0; y < h; y++) {
    const off = y * w;
    cum[0] = 0;
    for (let i = 0; i < w; i++) cum[i + 1] = cum[i] + p[off + i];
    const inv = 1 / (2 * r + 1);
    for (let i = 0; i < w; i++) {
      const a = i - r > 0 ? i - r : 0;
      const b = i + r < w - 1 ? i + r + 1 : w;
      p[off + i] = b - a === 2 * r + 1 ? (cum[b] - cum[a]) * inv : (cum[b] - cum[a]) / (b - a);
    }
  }
}

/** Gaussian blur (3 box passes per axis; box passes along the two axes commute), returns a new plane. */
export function gaussBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  let p = src.slice();
  const cum = new Float64Array(w + 1);
  const boxes = gaussBoxes(sigma);
  for (const bw of boxes) boxRows(p, w, h, (bw - 1) >> 1, cum);
  let q = new Float32Array(w * h);
  for (const bw of boxes) {
    boxCols(p, q, w, h, (bw - 1) >> 1);
    [p, q] = [q, p];
  }
  return p;
}

/**
 * Column box mean of radius r from `src` into `dst` (window cut at the ends), walking whole rows: a running
 * column sum adds the row entering the window and drops the row leaving it (sequential memory, no transpose).
 */
function boxCols(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  if (r <= 0) {
    dst.set(src);
    return;
  }
  const sum = new Float64Array(w);
  for (let y = 0; y < Math.min(r, h); y++) for (let x = 0, o = y * w; x < w; x++) sum[x] += src[o + x];
  for (let y = 0; y < h; y++) {
    const add = y + r;
    const drop = y - r - 1;
    if (add < h) for (let x = 0, o = add * w; x < w; x++) sum[x] += src[o + x];
    if (drop >= 0) for (let x = 0, o = drop * w; x < w; x++) sum[x] -= src[o + x];
    const inv = 1 / (Math.min(h - 1, y + r) - Math.max(0, y - r) + 1);
    for (let x = 0, o = y * w; x < w; x++) dst[o + x] = sum[x] * inv;
  }
}

/** Paper estimate window: k = max(31, round(longEdge / 8)) | 1 (always odd). */
export function paperWindow(w: number, h: number): number {
  return Math.max(31, Math.round(Math.max(w, h) / 8)) | 1;
}

/**
 * Local paper level of a plane: gauss(closing(x, k), sigma = k / 3), closing = minFilter(maxFilter(x, k), k).
 * Deviation from the brief's gauss(maxFilter(x, k)) (Bob, C1-core, BUILD-LOG): the max filter alone carries
 * bright paper k/2 px into a shadow and biases the level up on grain and light gradients (shadow fixtures IoU
 * 0.21-0.75); the closing returns to the paper envelope and keeps k and sigma as pinned.
 */
export function paperLevel(x: Float32Array, w: number, h: number): Float32Array {
  const k = paperWindow(w, h);
  return gaussBlur(minFilter(maxFilter(x, w, h, k), w, h, k), w, h, k / 3);
}

/** Ramp edges for a 진하기 step (-2..2): darker = lower thresholds. */
export function rampFor(strength = 0): { lo: number; hi: number } {
  const s = Math.max(INK.strengthMin, Math.min(INK.strengthMax, Math.round(strength)));
  return { lo: INK.lo - s * INK.strengthStep, hi: INK.hi - s * INK.strengthStep };
}

/** Darkness relative to the local paper: d = clamp((paper - x) / max(paper, 1e-3)). */
export function darkness(x: Float32Array, paper: Float32Array): Float32Array {
  const d = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const p = paper[i];
    d[i] = clamp01((p - x[i]) / Math.max(p, 1e-3));
  }
  return d;
}

/** a = clamp((d - lo) / (hi - lo)). */
export function rampFromDark(d: Float32Array, lo: number, hi: number): Float32Array {
  const a = new Float32Array(d.length);
  const span = hi - lo;
  for (let i = 0; i < d.length; i++) a[i] = clamp01((d[i] - lo) / span);
  return a;
}

/** a = clamp((d - lo) / (hi - lo)) with d = clamp((paper - x) / max(paper, 1e-3)). */
export function rampAlpha(x: Float32Array, paper: Float32Array, lo: number, hi: number): Float32Array {
  return rampFromDark(darkness(x, paper), lo, hi);
}

/** Mode filters on redness: 빨간 도장 keeps red ink only; 검정·파란 서명 drops red ink. 자동 = no filter. */
export function applyModeFilter(a: Float32Array, red: Float32Array, mode: InkMode): void {
  if (mode === 'auto') return;
  for (let i = 0; i < a.length; i++) a[i] *= modeFactor(red[i], mode);
}

/** The mode filter's factor for one pixel's redness. */
export function modeFactor(red: number, mode: InkMode): number {
  if (mode === 'red') return clamp01((red - 0.08) / 0.12);
  if (mode === 'sign') return 1 - clamp01((red - 0.15) / 0.15);
  return 1;
}

/** 3x3 Gaussian, sigma 0.6, normalised. */
const G0 = 1;
const G1 = Math.exp(-1 / (2 * 0.36));
const G2 = Math.exp(-2 / (2 * 0.36));
const GSUM = G0 + 4 * G1 + 4 * G2;

/**
 * Anti-aliasing: the ramp itself is the AA (alpha stays continuous); on top, a 3x3 Gaussian (sigma 0.6) at edge
 * pixels only, i.e. where the 3x3 neighbourhood holds a partial alpha (0 < a < 1). Reads the input, returns new.
 */
export function smoothEdges(a: Float32Array, w: number, h: number): Float32Array {
  const out = a.slice();
  // Edge mask = 3x3 dilation of "partial" (0 < a < 1): a row OR, then a column OR. Borders clamp.
  const rowOr = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      const l = a[o + (x > 0 ? x - 1 : 0)];
      const c = a[o + x];
      const r = a[o + (x < w - 1 ? x + 1 : x)];
      rowOr[o + x] = (l > 0 && l < 1) || (c > 0 && c < 1) || (r > 0 && r < 1) ? 1 : 0;
    }
  }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    const up = (y > 0 ? y - 1 : 0) * w;
    const dn = (y < h - 1 ? y + 1 : y) * w;
    for (let x = 0; x < w; x++) {
      if (!(rowOr[up + x] | rowOr[o + x] | rowOr[dn + x])) continue;
      const xl = x > 0 ? x - 1 : 0;
      const xr = x < w - 1 ? x + 1 : x;
      const s =
        G0 * a[o + x] +
        G1 * (a[o + xl] + a[o + xr] + a[up + x] + a[dn + x]) +
        G2 * (a[up + xl] + a[up + xr] + a[dn + xl] + a[dn + xr]);
      out[o + x] = s / GSUM;
    }
  }
  return out;
}

/** Hysteresis radius: r = max(2, round(longEdge / 600)) px. */
export function hysteresisRadius(w: number, h: number): number {
  return Math.max(INK.hystMinPx, Math.round(Math.max(w, h) / INK.hystPerPx));
}

/**
 * Hysteresis (Bob, C1-core round 2, BUILD-LOG): weak alpha (a <= 0.5) survives only within r px (square window)
 * of strong ink (a > 0.5); elsewhere it becomes 0. A shadow-edge ghost is a smooth band of weak alpha away from
 * any stroke; the anti-aliased rim of real ink always touches its strong core. In place.
 */
export function hysteresis(a: Float32Array, w: number, h: number, r: number): void {
  // Strong pixels per (2r+1)^2 window: running counts along rows, then along columns.
  const rows = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let c = 0;
    for (let x = 0; x < r && x < w; x++) if (a[o + x] > INK.strongAlpha) c++;
    for (let x = 0; x < w; x++) {
      if (x + r < w && a[o + x + r] > INK.strongAlpha) c++;
      if (x - r - 1 >= 0 && a[o + x - r - 1] > INK.strongAlpha) c--;
      rows[o + x] = c;
    }
  }
  const col = new Int32Array(w);
  for (let y = 0; y < r && y < h; y++) for (let x = 0; x < w; x++) col[x] += rows[y * w + x];
  for (let y = 0; y < h; y++) {
    if (y + r < h) for (let x = 0; x < w; x++) col[x] += rows[(y + r) * w + x];
    if (y - r - 1 >= 0) for (let x = 0; x < w; x++) col[x] -= rows[(y - r - 1) * w + x];
    const o = y * w;
    for (let x = 0; x < w; x++) if (col[x] === 0 && a[o + x] <= INK.strongAlpha) a[o + x] = 0;
  }
}

/** Despeckle threshold in px for a w x h image. */
export function speckMin(w: number, h: number): number {
  return Math.max(INK.speckMinPx, INK.speckShare * w * h);
}

/**
 * Despeckle: 8-connected components of a > 0.25 smaller than speckMin px get a = 0 (paper grain, JPEG dots).
 * Area is the only rule. In place.
 */
export function despeckle(a: Float32Array, w: number, h: number): void {
  const n = w * h;
  const min = speckMin(w, h);
  const label = new Int32Array(n); // 0 = unvisited, -1 = visited
  const stack = new Int32Array(n);
  const members = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (label[s] !== 0 || !(a[s] > INK.speckAlpha)) continue;
    let sp = 0;
    let count = 0;
    stack[sp++] = s;
    label[s] = -1;
    while (sp > 0) {
      const p = stack[--sp];
      members[count++] = p;
      const px = p % w;
      const py = (p - px) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = py + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = px + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (label[q] === 0 && a[q] > INK.speckAlpha) {
            label[q] = -1;
            stack[sp++] = q;
          }
        }
      }
    }
    if (count < min) for (let i = 0; i < count; i++) a[members[i]] = 0;
  }
}

/** Share of pixels with a > 0.5 and the area status. */
export function areaCheck(a: Float32Array): { inkShare: number; status: InkStatus } {
  let c = 0;
  for (let i = 0; i < a.length; i++) if (a[i] > INK.areaAlpha) c++;
  const inkShare = a.length ? c / a.length : 0;
  const status: InkStatus = inkShare < INK.minInk ? 'noink' : inkShare > INK.maxInk ? 'allpaper' : 'ok';
  return { inkShare, status };
}

/** 자동 colour guess: sum(a * red) / sum(a) > 0.15 -> red. */
export function colorGuess(a: Float32Array, red: Float32Array): 'red' | 'black' {
  let sa = 0;
  let sr = 0;
  for (let i = 0; i < a.length; i++) {
    sa += a[i];
    sr += a[i] * red[i];
  }
  return sa > 0 && sr / sa > INK.redGuess ? 'red' : 'black';
}

/**
 * Ink key, steps 1-7 of the brief: planes -> paper estimate -> ramp -> mode filter -> edge AA -> hysteresis
 * -> despeckle -> solid fill -> area check. `cache` keeps the planes and paper levels of one photo between re-runs.
 */
export function keyInk(img: Rgba, opts: KeyOptions, cache: InkCache = {}): KeyResult {
  const { width: w, height: h } = img;
  if (!cache.mn || !cache.lum || !cache.red) Object.assign(cache, planes(img));
  const sign = opts.mode === 'sign';
  // Paper level of the plane being keyed: min(R,G,B) for 자동/빨간 도장, luma for 검정·파란 서명.
  const x = (sign ? cache.lum : cache.mn) as Float32Array;
  let paper = sign ? cache.paperLum : cache.paperMn;
  if (!paper) {
    paper = paperLevel(x, w, h);
    if (sign) cache.paperLum = paper;
    else cache.paperMn = paper;
  }
  const { lo, hi } = rampFor(opts.strength);
  const dark = darkness(x, paper);
  const ramp = rampFromDark(dark, lo, hi);
  applyModeFilter(ramp, cache.red as Float32Array, opts.mode);
  const alpha = smoothEdges(ramp, w, h);
  hysteresis(alpha, w, h, hysteresisRadius(w, h));
  despeckle(alpha, w, h);
  const plane: InkPlane = sign ? 'lum' : 'mn';
  const pg = paperColor(img, alpha);
  fillSolid(alpha, x, paper, cache.red as Float32Array, pg, plane, opts.mode, lo, hi, w, h);
  const { inkShare, status } = areaCheck(alpha);
  return { alpha, plane, paper: pg, guess: colorGuess(alpha, cache.red as Float32Array), inkShare, status };
}

/** The fixed colour of a 색 choice, or null for 원래 색. */
export function resolveColor(color: InkColor): readonly [number, number, number] | null {
  return color === 'original' ? null : INK_COLORS[color];
}

/** Paper colour on a coarse grid: `cell` px per sample, gw x gh samples, R, G, B in 0..1. */
export interface PaperGrid {
  cell: number;
  gw: number;
  gh: number;
  v: [Float32Array, Float32Array, Float32Array];
}

/**
 * Paper colour per channel from the paper pixels only (Bob, C1-core round 2): normalised convolution of the
 * pixels with a = 0 that are not far darker than the paper (INK.paperDarkShare), on a coarse grid (cell f =
 * max(1, round(longEdge / 320)) px) at two scales, sigma k / 12 and k / 3 (in cells). Where at least 20 % of the
 * small window is paper the small scale is used (it follows a shadow edge), where under 5 % the large one (the
 * inside of a large solid logo or stamp), blended between. The paper under ink is thus interpolated from the
 * paper around it. Cells neither scale reaches take the image-wide mean paper colour.
 */
export function paperColor(img: Rgba, alpha: Float32Array): PaperGrid {
  const { width: w, height: h, data } = img;
  const cell = Math.max(1, Math.round(Math.max(w, h) / 320));
  const gw = Math.ceil(w / cell);
  const gh = Math.ceil(h / cell);
  const sums = [new Float32Array(gw * gh), new Float32Array(gw * gh), new Float32Array(gw * gh)];
  const cnt = new Float32Array(gw * gh);
  const area = new Float32Array(gw * gh);
  const gx = new Int32Array(w);
  for (let x = 0; x < w; x++) gx[x] = Math.floor(x / cell);
  const tot = [0, 0, 0];
  let totN = 0;
  // A pixel far darker than the paper (min(R,G,B) under 45 % of its 90th percentile) is never paper, even with
  // a = 0: the unkeyed middle of a solid area wider than the closing window would otherwise pose as paper.
  const hist = new Int32Array(256);
  for (let j = 0; j < data.length; j += 4) hist[Math.min(data[j], data[j + 1], data[j + 2])]++;
  let ref = 255;
  for (let v = 255, acc = 0; v >= 0; v--) {
    acc += hist[v];
    if (acc >= 0.1 * w * h) {
      ref = v;
      break;
    }
  }
  const darkMax = INK.paperDarkShare * ref;
  for (let y = 0; y < h; y++) {
    const gy = Math.floor(y / cell) * gw;
    for (let x = 0, i = y * w, j = i * 4; x < w; x++, i++, j += 4) {
      const g = gy + gx[x];
      area[g]++;
      if (alpha[i] > 0 || Math.min(data[j], data[j + 1], data[j + 2]) < darkMax) continue;
      sums[0][g] += data[j];
      sums[1][g] += data[j + 1];
      sums[2][g] += data[j + 2];
      cnt[g]++;
    }
  }
  for (let g = 0; g < cnt.length; g++) {
    for (let c = 0; c < 3; c++) tot[c] += sums[c][g];
    totN += cnt[g];
  }
  const mean = tot.map((t) => (totN > 0 ? t / totN / 255 : 1));
  const k = paperWindow(w, h);
  const sL = k / 3 / cell;
  const sS = k / 12 / cell;
  const cL = gaussBlur(cnt, gw, gh, sL);
  const cS = gaussBlur(cnt, gw, gh, sS);
  const aS = gaussBlur(area, gw, gh, sS);
  const v = sums.map((s, c) => {
    const bL = gaussBlur(s, gw, gh, sL);
    const bS = gaussBlur(s, gw, gh, sS);
    for (let g = 0; g < bL.length; g++) {
      const large = cL[g] > 1e-3 ? bL[g] / cL[g] / 255 : mean[c];
      const share = aS[g] > 0 ? cS[g] / aS[g] : 0;
      const t = clamp01((share - 0.05) / 0.15);
      bL[g] = t > 0 ? t * (bS[g] / cS[g] / 255) + (1 - t) * large : large;
    }
    return bL;
  }) as [Float32Array, Float32Array, Float32Array];
  return { cell, gw, gh, v };
}

/**
 * Solid fill (Bob, C1-core round 2): the closing cannot fill an ink area wider than its window (a 220 px logo
 * square at k = 161), so the alpha paper level sinks inside it and the middle turns semi-transparent or empty.
 * From strong ink (a > 0.5) a region grows over 4-neighbours whose darkness against the paper around the ink
 * (paperColor) keys strong too, only where the closing's level sank more than 10 % below that paper; every
 * pixel of that region keeps the larger of its two alphas. Paper and shadows
 * do not grow (paperColor follows them); thin strokes are unchanged. In place.
 */
export function fillSolid(a: Float32Array, x: Float32Array, paper: Float32Array, red: Float32Array, pg: PaperGrid, plane: InkPlane, mode: InkMode, lo: number, hi: number, w: number, h: number): void {
  const S = INK.strongAlpha;
  const pr = new Float32Array(3);
  const span = hi - lo;
  const alpha2 = (i: number): number => {
    const xx = i % w;
    readGrid3(pg, xx, (i - xx) / w, pr, 0);
    const p = plane === 'mn' ? Math.min(pr[0], pr[1], pr[2]) : 0.299 * pr[0] + 0.587 * pr[1] + 0.114 * pr[2];
    // Only where the closing's level sank well below the paper around the ink; elsewhere the key stands.
    if (p - paper[i] <= INK.fillSink * p) return a[i];
    return clamp01((clamp01((p - x[i]) / p) - lo) / span) * modeFactor(red[i], mode);
  };
  const n = w * h;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] > S) {
      seen[i] = 1;
      stack[sp++] = i;
    }
  }
  while (sp > 0) {
    const i = stack[--sp];
    const a2 = alpha2(i);
    if (a2 > a[i]) a[i] = a2;
    const xx = i % w;
    for (let t = 0; t < 4; t++) {
      const q = t === 0 ? (xx > 0 ? i - 1 : -1) : t === 1 ? (xx < w - 1 ? i + 1 : -1) : t === 2 ? i - w : i + w;
      if (q < 0 || q >= n || seen[q]) continue;
      seen[q] = 1;
      if (alpha2(q) > S) stack[sp++] = q;
    }
  }
}

/** Bilinear read of the 3 paper planes at full-res pixel (x, y) into out[o..o+2], at least 1e-3. */
function readGrid3(P: { cell: number; gw: number; gh: number; v: Float32Array[] }, x: number, y: number, out: Float32Array, o: number): void {
  const { cell, gw, gh } = P;
  const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / cell - 0.5));
  const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / cell - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(gw - 1, x0 + 1);
  const y1 = Math.min(gh - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = (1 - ty) * (1 - tx);
  const b = (1 - ty) * tx;
  const c = ty * (1 - tx);
  const d = ty * tx;
  const i00 = y0 * gw + x0;
  const i01 = y0 * gw + x1;
  const i10 = y1 * gw + x0;
  const i11 = y1 * gw + x1;
  for (let ch = 0; ch < 3; ch++) {
    const v = P.v[ch];
    out[o + ch] = Math.max(1e-3, a * v[i00] + b * v[i01] + c * v[i10] + d * v[i11]);
  }
}

/**
 * The photo's own ink colour (원래 색), step 8 (Bob, C1-core round 2, BUILD-LOG).
 * 1. Coverage: the paper mixes linearly into the keyed plane, so c = d / dSolid, with d the darkness of the
 *    plane against the paper colour below (not the alpha's paper level, which a large solid area pulls down)
 *    and dSolid the darkness of solid ink.
 * 2. Where c >= 0.5 the ink colour is un-mixed against the local paper colour P (paperColor):
 *    F = (I - (1 - c) P) / c.
 * 3. Light: ink and paper share the light, so F is divided by P and multiplied by the brightest paper level in
 *    the photo (per channel): a shadow or uneven light does not darken the ink; the paper tone is kept.
 * 4. Those estimates (weight c^2) are averaged into a smooth local colour field on a coarse grid (cell =
 *    max(1, round(longEdge / 400)) px, Gaussian sigma 5 cells) and read back bilinearly: every ink pixel,
 *    partial ones included, gets its local ink colour and no paper tint.
 * Writes the colour (0..255) into the RGB channels of `out` (straight RGBA) at every pixel with a > 0.
 */
export function inkColorField(img: Rgba, key: Pick<KeyResult, 'alpha' | 'plane' | 'paper'>, out: Uint8ClampedArray): void {
  const { width: w, height: h, data } = img;
  const { alpha, plane, paper: P } = key;
  const n = w * h;
  let m = 0;
  for (let i = 0; i < n; i++) if (alpha[i] > 0) m++;
  if (m === 0) return;
  const idx = new Int32Array(m);
  for (let i = 0, t = 0; i < n; i++) if (alpha[i] > 0) idx[t++] = i;
  const white = P.v.map((p) => p.reduce((mx, v) => (v > mx ? v : mx), 1e-3));
  const ofPlane = (r: number, g: number, b: number): number => (plane === 'mn' ? Math.min(r, g, b) : 0.299 * r + 0.587 * g + 0.114 * b);
  // Per ink pixel: paper colour (bilinear) and darkness against it.
  const pr = new Float32Array(m * 3);
  const dark = new Float32Array(m);
  const solidBuf = new Float32Array(m);
  let ns = 0;
  let dMax = 0;
  for (let t = 0; t < m; t++) {
    const i = idx[t];
    const x = i % w;
    const y = (i - x) / w;
    readGrid3(P, x, y, pr, t * 3);
    const px = ofPlane(pr[t * 3], pr[t * 3 + 1], pr[t * 3 + 2]);
    const j = i * 4;
    const d = clamp01((px - ofPlane(data[j] / 255, data[j + 1] / 255, data[j + 2] / 255)) / px);
    dark[t] = d;
    if (d > dMax) dMax = d;
    if (alpha[i] >= 0.99) solidBuf[ns++] = d;
  }
  // dSolid: the 95th percentile of the darkness of solid ink (a >= 0.99); max darkness when there is none.
  const solid = solidBuf.subarray(0, ns).sort();
  const dSolid = Math.max(0.05, ns ? solid[Math.min(ns - 1, Math.floor(INK.refPercentile * ns))] : dMax);
  const cell = Math.max(1, Math.round(Math.max(w, h) / 400));
  const gw = Math.ceil(w / cell);
  const gh = Math.ceil(h / cell);
  const acc = [new Float32Array(gw * gh), new Float32Array(gw * gh), new Float32Array(gw * gh)];
  const wt = new Float32Array(gw * gh);
  const glob = [0, 0, 0];
  let globW = 0;
  for (let t = 0; t < m; t++) {
    const c = Math.min(1, dark[t] / dSolid);
    if (c < 0.5) continue;
    const i = idx[t];
    const x = i % w;
    const y = (i - x) / w;
    const k = c * c;
    const g = Math.floor(y / cell) * gw + Math.floor(x / cell);
    for (let ch = 0; ch < 3; ch++) {
      const p = pr[t * 3 + ch];
      const F = clamp01((data[i * 4 + ch] / 255 - (1 - c) * p) / c);
      const lit = clamp01((F / p) * white[ch]);
      acc[ch][g] += k * lit;
      glob[ch] += k * lit;
    }
    wt[g] += k;
    globW += k;
  }
  const fallback = globW > 0 ? glob.map((v) => v / globW) : [0, 0, 0];
  const bw = gaussBlur(wt, gw, gh, 5);
  // Field value per cell, or -1 where no ink weight reached it (read back as the image-wide ink colour).
  const field = acc.map((p) => {
    const b = gaussBlur(p, gw, gh, 5);
    for (let i = 0; i < b.length; i++) b[i] = bw[i] > 1e-6 ? b[i] / bw[i] : -1;
    return b;
  });
  for (let t = 0; t < m; t++) {
    const i = idx[t];
    const x = i % w;
    const y = (i - x) / w;
    const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / cell - 0.5));
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / cell - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(gw - 1, x0 + 1);
    const y1 = Math.min(gh - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    for (let ch = 0; ch < 3; ch++) {
      const f = field[ch];
      const v00 = f[y0 * gw + x0];
      const v01 = f[y0 * gw + x1];
      const v10 = f[y1 * gw + x0];
      const v11 = f[y1 * gw + x1];
      const v = v00 < 0 || v01 < 0 || v10 < 0 || v11 < 0 ? fallback[ch] : (1 - ty) * ((1 - tx) * v00 + tx * v01) + ty * ((1 - tx) * v10 + tx * v11);
      out[i * 4 + ch] = Math.round(v * 255);
    }
  }
}

/** Ink colour, step 8: the photo's own ink colour (default) or a fixed colour; alpha kept. Straight RGBA. */
export function renderInk(img: Rgba, key: Pick<KeyResult, 'alpha' | 'plane' | 'paper'>, color: InkColor): Uint8ClampedArray {
  const n = img.width * img.height;
  const { alpha } = key;
  const out = new Uint8ClampedArray(n * 4);
  const fixed = resolveColor(color);
  if (fixed) {
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      out[j] = fixed[0];
      out[j + 1] = fixed[1];
      out[j + 2] = fixed[2];
      out[j + 3] = Math.round(alpha[i] * 255);
    }
    return out;
  }
  inkColorField(img, key, out);
  for (let i = 0; i < n; i++) out[i * 4 + 3] = Math.round(alpha[i] * 255);
  return out;
}

/**
 * Auto-crop, step 9: bbox of a > 0.1 plus padding max(8 px, 4 % of the bbox long edge), or 2 px for 여백 없음.
 * The rect may reach past the photo; that margin is transparent. Null when nothing is above 0.1.
 */
export function cropRect(alpha: Float32Array, w: number, h: number, noPad = false): Rect | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alpha[row + x] > INK.cropAlpha) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const pad = noPad ? INK.padNone : Math.max(INK.padMin, Math.round(INK.padShare * Math.max(bw, bh)));
  return { x: x0 - pad, y: y0 - pad, w: bw + 2 * pad, h: bh + 2 * pad };
}

/** The 크기 choices for a crop: an option bigger than the crop is disabled (downscale only). */
export function sizeOptions(rect: Rect): { size: InkSize; enabled: boolean }[] {
  const long = Math.max(rect.w, rect.h);
  return INK_SIZES.map((size) => ({ size, enabled: size === null || size <= long }));
}

/** Output dimensions for a crop and a long edge (null = crop size; downscale only, aspect kept, at least 1 px). */
export function outputSize(rect: Rect, size: number | null): { w: number; h: number } {
  const long = Math.max(rect.w, rect.h);
  if (size === null || size >= long) return { w: rect.w, h: rect.h };
  const s = size / long;
  return { w: Math.max(1, Math.round(rect.w * s)), h: Math.max(1, Math.round(rect.h * s)) };
}

/** Area weights of a 1-D downscale from n to m samples: for each output, [start index, weights...]. */
function areaWeights(n: number, m: number): { start: Int32Array; len: Int32Array; wts: Float32Array; stride: number } {
  const scale = n / m;
  const stride = Math.ceil(scale) + 2;
  const start = new Int32Array(m);
  const len = new Int32Array(m);
  const wts = new Float32Array(m * stride);
  for (let o = 0; o < m; o++) {
    const a = o * scale;
    const b = a + scale;
    const i0 = Math.floor(a);
    const i1 = Math.min(n, Math.ceil(b));
    start[o] = i0;
    len[o] = i1 - i0;
    for (let i = i0; i < i1; i++) wts[o * stride + i - i0] = (Math.min(b, i + 1) - Math.max(a, i)) / scale;
  }
  return { start, len, wts, stride };
}

/**
 * Crop + resize, step 10: cuts `rect` out of straight RGBA (outside the photo = transparent) and downscales by
 * area averaging in premultiplied alpha, so edges get no dark fringe. Returns straight RGBA.
 */
export function cropAndResize(rgba: Uint8ClampedArray, w: number, h: number, rect: Rect, size: number | null): Rgba {
  const { w: ow, h: oh } = outputSize(rect, size);
  const cw = rect.w;
  const ch = rect.h;
  // Premultiplied crop, 4 float channels.
  const pm = new Float32Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const sy = rect.y + y;
    if (sy < 0 || sy >= h) continue;
    for (let x = 0; x < cw; x++) {
      const sx = rect.x + x;
      if (sx < 0 || sx >= w) continue;
      const s = (sy * w + sx) * 4;
      const d = (y * cw + x) * 4;
      const a = rgba[s + 3] / 255;
      pm[d] = rgba[s] * a;
      pm[d + 1] = rgba[s + 1] * a;
      pm[d + 2] = rgba[s + 2] * a;
      pm[d + 3] = rgba[s + 3];
    }
  }
  let cur = pm;
  if (ow !== cw) {
    const hw = areaWeights(cw, ow);
    const next = new Float32Array(ow * ch * 4);
    for (let y = 0; y < ch; y++) {
      for (let o = 0; o < ow; o++) {
        const d = (y * ow + o) * 4;
        for (let t = 0; t < hw.len[o]; t++) {
          const wt = hw.wts[o * hw.stride + t];
          const s = (y * cw + hw.start[o] + t) * 4;
          next[d] += cur[s] * wt;
          next[d + 1] += cur[s + 1] * wt;
          next[d + 2] += cur[s + 2] * wt;
          next[d + 3] += cur[s + 3] * wt;
        }
      }
    }
    cur = next;
  }
  if (oh !== ch) {
    const vw = areaWeights(ch, oh);
    const next = new Float32Array(ow * oh * 4);
    for (let o = 0; o < oh; o++) {
      for (let t = 0; t < vw.len[o]; t++) {
        const wt = vw.wts[o * vw.stride + t];
        const srow = (vw.start[o] + t) * ow * 4;
        const drow = o * ow * 4;
        for (let k = 0; k < ow * 4; k++) next[drow + k] += cur[srow + k] * wt;
      }
    }
    cur = next;
  }
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let i = 0; i < ow * oh; i++) {
    const a = cur[i * 4 + 3];
    const j = i * 4;
    if (a <= 0) continue;
    // Colour channels hold c * (alpha / 255); alpha holds 0..255.
    const un = 255 / a;
    out[j] = Math.round(cur[j] * un);
    out[j + 1] = Math.round(cur[j + 1] * un);
    out[j + 2] = Math.round(cur[j + 2] * un);
    out[j + 3] = Math.round(a);
  }
  return { data: out, width: ow, height: oh };
}

export interface ProcessOptions extends KeyOptions {
  color?: InkColor;
  size?: InkSize;
  noPad?: boolean;
}

export interface ProcessResult {
  status: InkStatus;
  guess: 'red' | 'black';
  inkShare: number;
  /** Crop in work-copy pixels (null when status is not ok). */
  rect: Rect | null;
  /** Cropped, coloured, resized straight RGBA (null when status is not ok: no download). */
  out: Rgba | null;
  /** File name: 도장.png when the ink is red, else 서명.png. */
  fileName: string;
}

/** The whole photo-tab pipeline on a work copy: key -> colour -> crop -> size. */
export function processInk(img: Rgba, opts: ProcessOptions, cache: InkCache = {}): ProcessResult & { alpha: Float32Array } {
  const key = keyInk(img, opts, cache);
  const color = opts.color ?? 'original';
  const isRed = color === 'red' || (color === 'original' && key.guess === 'red');
  const fileName = isRed ? '도장.png' : '서명.png';
  const base = { status: key.status, guess: key.guess, inkShare: key.inkShare, fileName, alpha: key.alpha };
  const rect = key.status === 'ok' ? cropRect(key.alpha, img.width, img.height, opts.noPad) : null;
  if (!rect) return { ...base, status: key.status === 'ok' ? 'noink' : key.status, rect: null, out: null };
  const rgba = renderInk(img, key, color);
  return { ...base, rect, out: cropAndResize(rgba, img.width, img.height, rect, opts.size ?? null) };
}
