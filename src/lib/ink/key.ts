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
  /**
   * 자동 classification: a colour counts when it holds at least this share of the strong ink (a > 0.5), a pixel
   * being red by its redness ratio (ratioGuess). C1 review measured red sets 0.28-1.0 and black/blue sets 0-0.05;
   * C1 r3 lowered it from 0.15 to 0.1 so the faint seals of a 고슈인 (o08, 0.11) are not dropped silently.
   */
  redShare: 0.1,
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
  /** Faint specks (dropFaintSpecks, C1 r3): under 4 x the despeckle size and never darker than a = 0.85. */
  faintSpeckShare: 4,
  faintPeak: 0.85,
  /** Area check on a > 0.5; a tiny 도장 on a large page counts from minInkPx strong pixels (C1 r3, o06). */
  areaAlpha: 0.5,
  minInk: 0.0005,
  minInkPx: 200,
  maxInk: 0.6,
  /**
   * Redness ratio (C1 r3, redRatio): (R - max(G,B)) of the pixel minus that of the paper around it, per unit of
   * paper luma, divided by the pixel's min(R,G,B) darkness against that paper (at least 0.05). About 0.4-1.0 for
   * red or orange ink at any coverage and in shade, about 0 for black, negative for blue; a shadow on yellowed
   * paper is negative. 빨간 도장 keeps ratio 0.25 -> 0..0.45 -> 1; 서명 drops 0.35 -> 0..0.55 -> 1; 자동 counts a
   * pixel red above 0.35. Each 진하기 step widens what the mode keeps by ratioStep.
   */
  ratioRed: [0.25, 0.45],
  ratioSign: [0.35, 0.55],
  ratioGuess: 0.35,
  /** 자동: dark ink under this share of the strong ink, all in small pieces, is no 서명 (C1 r3, m04). */
  bothShare: 0.2,
  ratioStep: 0.05,
  /**
   * Page (C1 r3, findPage): on a copy of about 400 px, neighbours off an edge (relative luma gradient > 0.2 or
   * tint gradient > 0.12) whose closed luma differs by at most 12 %, and by at most 35 % from the region's mean,
   * belong to one smooth region. Outside the
   * convex hull of the largest bright one, a region touching the frame over 8 % of its perimeter, of at least
   * 0.5 % of it, at most 80 % as bright as the page and either dark (< 40 %), textured or of another tint, is desk.
   */
  pageEdge: 400,
  pageTau: 0.12,
  pageDrift: 0.35,
  pageGrad: 0.2,
  pageTintGrad: 0.12,
  deskBorder: 0.08,
  deskMinShare: 0.005,
  deskMaxRatio: 0.8,
  deskDarkRatio: 0.4,
  /**
   * Lines (C1 r3): straight thin runs of a > 0.1 within 25 degrees of the page axes, over at least 75 % of the
   * page, gaps under 4 % of it, inked over 60 % of the run.
   */
  lineAlpha: 0.1,
  lineSpan: 0.75,
  lineMaxDeg: 25,
  /** Crop (C1 r3, inkClusters): strong ink clustered at 0.8 % of the long edge; joins by share and gap. */
  clusterGap: 0.008,
  joinShare: 0.15,
  joinFar: 1,
  joinNear: 0.15,
  joinMin: 0.005,
  joinRedder: 0.2,
  /** Auto-crop: bbox of a > 0.1 in the main cluster, padding max(8 px, 4 % of its long edge); 여백 없음 = 2 px. */
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
  /** Set on the automatic one-step-stronger retry after noink (keyInk). */
  retried?: boolean;
}

/** Paper planes reused across re-runs of the same photo (the controls change; the photo does not). */
export interface InkCache {
  mn?: Float32Array;
  lum?: Float32Array;
  red?: Float32Array;
  paperMn?: Float32Array;
  paperLum?: Float32Array;
  /** 자동 classification per 진하기 step. */
  guess?: Record<string, 'red' | 'black' | 'both'>;
  /** Redness ratio plane (redRatio) against the coarse paper colour, and its 5 x 5 maximum (서명 filter). */
  ratio?: Float32Array;
  ratioMax?: Float32Array;
  /** Desk found around the page (null: none, the whole frame is keyed). */
  page?: PageMask | null;
  /** The photo with the desk painted over (or the photo itself). */
  src?: Rgba;
}

export interface KeyResult {
  alpha: Float32Array;
  /** The plane that was keyed: min(R,G,B) (자동, 빨간 도장) or luma (검정·파란 서명). */
  plane: InkPlane;
  /** Paper colour from the paper pixels around the ink (paperColor); the ink colour uses it. */
  paper: PaperGrid;
  /** 자동: the classification; other modes: weighted redness > 0.15. */
  guess: 'red' | 'black' | 'both';
  /** Share of pixels with a > 0.5. */
  inkShare: number;
  status: InkStatus;
  /** 자동 with both inks: the 빨간 도장 and 서명 keys that were joined (each coloured from its own ink). */
  parts?: { alpha: Float32Array; plane: InkPlane; paper: PaperGrid }[];
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
export function transpose(src: Float32Array, w: number, h: number, out: Float32Array = new Float32Array(w * h)): Float32Array {
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

/**
 * Mode filters on the paper-relative redness ratio (redRatio): 빨간 도장 keeps red ink only; 검정·파란 서명 drops
 * red ink. 자동 = no filter. In place.
 */
export function applyModeFilter(a: Float32Array, ratio: Float32Array, mode: InkMode, shift = 0): void {
  if (mode === 'auto') return;
  for (let i = 0; i < a.length; i++) a[i] *= modeFactor(ratio[i], mode, shift);
}

/**
 * The mode filter's factor for one pixel's redness ratio. `shift` (INK.ratioStep per 진하기 step) widens what the
 * mode keeps: a stronger 진하기 also keeps a duller red in 빨간 도장 and a redder ink in 서명.
 */
export function modeFactor(ratio: number, mode: InkMode, shift = 0): number {
  if (mode === 'red') return clamp01((ratio - INK.ratioRed[0] + shift) / (INK.ratioRed[1] - INK.ratioRed[0]));
  if (mode === 'sign') return 1 - clamp01((ratio - INK.ratioSign[0] - shift) / (INK.ratioSign[1] - INK.ratioSign[0]));
  return 1;
}

/** Redness ratio of one pixel (INK.ratioRed): pixel redness and min(R,G,B) against the paper colour pr, pg, pb. */
export function redRatio(red: number, mn: number, pr: number, pg: number, pb: number): number {
  const pmn = Math.max(1e-3, Math.min(pr, pg, pb));
  const d = Math.max(0.05, (pmn - mn) / pmn);
  return (red - (pr - Math.max(pg, pb))) / Math.max(0.05, 0.299 * pr + 0.587 * pg + 0.114 * pb) / d;
}

/**
 * Redness ratio plane of an image against a paper colour grid: the paper-relative redness and the darkness are
 * each blurred (twice 3 x 3 [1 2 1], about sigma 1 px) before the ratio, so both are compared at the same resolution: a phone JPEG
 * keeps colour at half resolution, which leaves the fine grain of a speckled 도장 with too little redness for its
 * darkness when they are compared pixel by pixel.
 */
export function ratioPlane(mn: Float32Array, red: Float32Array, grid: PaperGrid, w: number, h: number): Float32Array {
  // Per grid cell (the paper colour is smooth, so the nearest cell will do): paper redness, paper luma, paper
  // min(R,G,B). Redness is taken per unit of paper luma, as the darkness is per unit of paper: a shadow dims both.
  const { cell, gw, gh, v } = grid;
  const pr = new Float32Array(gw * gh);
  const pl = new Float32Array(gw * gh);
  const pm = new Float32Array(gw * gh);
  for (let g = 0; g < pr.length; g++) {
    const r = v[0][g];
    const gg = v[1][g];
    const b = v[2][g];
    pr[g] = r - Math.max(gg, b);
    pl[g] = 1 / Math.max(0.05, 0.299 * r + 0.587 * gg + 0.114 * b);
    pm[g] = Math.max(1e-3, Math.min(r, gg, b));
  }
  const gx = new Int32Array(w);
  for (let x = 0; x < w; x++) gx[x] = Math.min(gw - 1, Math.floor(x / cell));
  const rel = new Float32Array(w * h);
  const dk = new Float32Array(w * h);
  for (let y = 0, i = 0; y < h; y++) {
    const row = Math.min(gh - 1, Math.floor(y / cell)) * gw;
    for (let x = 0; x < w; x++, i++) {
      const g = row + gx[x];
      rel[i] = (red[i] - pr[g]) * pl[g];
      const d = (pm[g] - mn[i]) / pm[g];
      dk[i] = d > 0 ? d : 0;
    }
  }
  for (let k = 0; k < 2; k++) {
    blur121(rel, w, h);
    blur121(dk, w, h);
  }
  for (let i = 0; i < rel.length; i++) rel[i] /= Math.max(0.05, dk[i]);
  return rel;
}

/** In-place [1 2 1] / 4 blur along both axes (edges repeat). */
function blur121(p: Float32Array, w: number, h: number): void {
  const row = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    row.set(p.subarray(o, o + w));
    for (let x = 0; x < w; x++) p[o + x] = (row[x > 0 ? x - 1 : x] + 2 * row[x] + row[x < w - 1 ? x + 1 : x]) / 4;
  }
  let prev = p.slice(0, w);
  const cur = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    cur.set(p.subarray(o, o + w));
    const dn = y < h - 1 ? o + w : o;
    for (let x = 0; x < w; x++) p[o + x] = (prev[x] + 2 * cur[x] + p[dn + x]) / 4;
    prev.set(cur);
  }
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

/**
 * Despeckle again, and faint specks (C1 r3; m12 stains on old paper): components of a > 0.25 under speckMin px,
 * or under INK.faintSpeckShare x speckMin px whose peak alpha stays under INK.faintPeak. A dot of real ink (the dot of an i, a full stop) is solid at its
 * centre; a stain or a grain of dirt is not. In place.
 */
export function dropFaintSpecks(a: Float32Array, w: number, h: number): void {
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < a.length; i++) mask[i] = a[i] > INK.speckAlpha ? 1 : 0;
  const { label, n } = components(mask, w, h);
  const size = new Int32Array(n + 1);
  const peak = new Float32Array(n + 1);
  for (let i = 0; i < a.length; i++) {
    const l = label[i];
    if (!l) continue;
    size[l]++;
    if (a[i] > peak[l]) peak[l] = a[i];
  }
  const min = speckMin(w, h);
  const max = INK.faintSpeckShare * min;
  for (let i = 0; i < a.length; i++) {
    const l = label[i];
    if (l && (size[l] < min || (size[l] < max && peak[l] < INK.faintPeak))) a[i] = 0;
  }
}

/** Share of pixels with a > 0.5 and the area status. */
export function areaCheck(a: Float32Array): { inkShare: number; status: InkStatus } {
  let c = 0;
  for (let i = 0; i < a.length; i++) if (a[i] > INK.areaAlpha) c++;
  const inkShare = a.length ? c / a.length : 0;
  const status: InkStatus = inkShare < INK.minInk && c < INK.minInkPx ? 'noink' : inkShare > INK.maxInk ? 'allpaper' : 'ok';
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

/** Paper level of a plane, from the cache or computed once into it. */
function cachedPaper(cache: InkCache, plane: InkPlane, w: number, h: number): Float32Array {
  if (plane === 'lum') return (cache.paperLum ??= paperLevel(cache.lum as Float32Array, w, h));
  return (cache.paperMn ??= paperLevel(cache.mn as Float32Array, w, h));
}

/** Box-averaged copy of an image, `f` x `f` pixels per sample (f = 1: the image itself). */
export function boxDown(img: Rgba, f: number): Rgba {
  if (f <= 1) return img;
  const { width: w, height: h, data } = img;
  const ow = Math.max(1, Math.floor(w / f));
  const oh = Math.max(1, Math.floor(h / f));
  const out = new Uint8ClampedArray(ow * oh * 4);
  const n = f * f;
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0, j = ((y * f + dy) * w + x * f) * 4; dx < f; dx++, j += 4) {
          r += data[j];
          g += data[j + 1];
          b += data[j + 2];
        }
      }
      const o = (y * ow + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: ow, height: oh };
}

/** 8-connected components of a 0/1 mask: label per pixel (0 = none, 1..n) and n. */
export function components(mask: Uint8Array, w: number, h: number): { label: Int32Array; n: number } {
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let n = 0;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s]) continue;
    n++;
    let sp = 0;
    stack[sp++] = s;
    label[s] = n;
    while (sp > 0) {
      const p = stack[--sp];
      const px = p % w;
      const py = (p - px) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = py + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xx = px + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (mask[q] && !label[q]) {
            label[q] = n;
            stack[sp++] = q;
          }
        }
      }
    }
  }
  return { label, n };
}

/** Desk or background around the page, on a coarse grid (`f` px per cell); `fill` = paper colour for those cells. */
export interface PageMask {
  f: number;
  sw: number;
  sh: number;
  /** 1 = desk or background (not the page). */
  desk: Uint8Array;
  /** RGB (0..255) per cell: the nearest page cell's paper colour, used in place of the desk. */
  fill: Uint8ClampedArray;
}

/**
 * Page finding (C1 r3; s08, m11, m12): the desk or background around a sheet is darker than the paper, so the
 * paper-level estimate read it as ink. On a copy of about INK.pageEdge px, closed (3 x 3, so thin ink and ruled
 * lines do not cut the paper), 4-neighbours whose luma differs by at most INK.pageTau join one smooth region: a soft
 * shadow on the paper joins it, the sharp edge of a sheet does not. The largest bright region is the page. A region
 * outside it that touches the frame is desk when it is at least INK.deskMinShare of the frame, at most
 * INK.deskMaxRatio as bright as the page, and dark (INK.deskDarkRatio), textured or of another tint; a shadow on the
 * paper is none of the three. Null when there is no clear desk (the whole frame is keyed, as before).
 */
export function findPage(img: Rgba): PageMask | null {
  const f = Math.max(1, Math.floor(Math.max(img.width, img.height) / INK.pageEdge));
  const s = boxDown(img, f);
  const { width: sw, height: sh, data } = s;
  const n = sw * sh;
  if (sw < 16 || sh < 16) return null;
  const ch = [0, 1, 2].map((c) => {
    const p = new Float32Array(n);
    for (let i = 0; i < n; i++) p[i] = data[i * 4 + c] / 255;
    return minFilter(maxFilter(p, sw, sh, 3), sw, sh, 3);
  });
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = 0.299 * ch[0][i] + 0.587 * ch[1][i] + 0.114 * ch[2][i];
  // Edges: relative gradient (central differences) above pageGrad. An oblique sheet edge on the coarse grid is a
  // staircase of mixed cells whose steps along the edge are small; they all have a strong gradient across it.
  // A change of tint ((R - B) / L) is an edge too: yellowed paper on a brown desk differs more in tint than in luma.
  const T = new Float32Array(n);
  for (let i = 0; i < n; i++) T[i] = (ch[0][i] - ch[2][i]) / Math.max(L[i], 0.05);
  const grad = (P: Float32Array, i: number, x: number, y: number): number =>
    Math.hypot((P[x < sw - 1 ? i + 1 : i] - P[x > 0 ? i - 1 : i]) / 2, (P[y < sh - 1 ? i + sw : i] - P[y > 0 ? i - sw : i]) / 2);
  const edge = new Uint8Array(n);
  for (let y = 0, i = 0; y < sh; y++) for (let x = 0; x < sw; x++, i++) {
    edge[i] = grad(L, i, x, y) > INK.pageGrad * Math.max(L[i], 0.05) || grad(T, i, x, y) > INK.pageTintGrad ? 1 : 0;
  }
  // Smooth regions: flood over 4-neighbours off the edges with a relative luma step of at most pageTau, and within
  // pageDrift of the region's mean so far: where a sheet edge runs into the frame at a shallow angle, the mixed
  // cells grade from paper to desk in steps too small to be edges; the drift bound stops the flood there.
  const lab = new Int32Array(n);
  const stack = new Int32Array(n);
  const area: number[] = [0];
  const sumL: number[] = [0];
  let nl = 0;
  for (let s0 = 0; s0 < n; s0++) {
    if (lab[s0]) continue;
    nl++;
    let sp = 0;
    let cnt = 1;
    let sl = L[s0];
    stack[sp++] = s0;
    lab[s0] = nl;
    while (sp > 0) {
      const p = stack[--sp];
      const px = p % sw;
      for (let t = 0; t < 4; t++) {
        const q = t === 0 ? (px > 0 ? p - 1 : -1) : t === 1 ? (px < sw - 1 ? p + 1 : -1) : t === 2 ? p - sw : p + sw;
        if (q < 0 || q >= n || lab[q]) continue;
        const mean = sl / cnt;
        if (!edge[p] && !edge[q] && Math.abs(L[p] - L[q]) <= INK.pageTau * Math.max(L[p], L[q], 1e-3) && Math.abs(L[q] - mean) <= INK.pageDrift * mean) {
          lab[q] = nl;
          stack[sp++] = q;
          cnt++;
          sl += L[q];
        }
      }
    }
    area.push(cnt);
    sumL.push(sl);
  }
  const p95 = L.slice().sort()[Math.floor(0.95 * (n - 1))];
  let page = 0;
  for (let l = 1; l <= nl; l++) if (sumL[l] / area[l] >= 0.6 * p95 && (page === 0 || area[l] > area[page])) page = l;
  if (page === 0) return null;
  // Texture (mean |L - its 3 x 3 mean|) and tint ((R - B) / L) per region outside the page.
  const tex = new Float32Array(n);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    let m = 0;
    let c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy;
      const xx = x + dx;
      if (yy < 0 || yy >= sh || xx < 0 || xx >= sw) continue;
      m += L[yy * sw + xx];
      c++;
    }
    tex[y * sw + x] = Math.abs(L[y * sw + x] - m / c);
  }
  const notPage = new Uint8Array(n);
  for (let i = 0; i < n; i++) notPage[i] = lab[i] === page ? 0 : 1;
  const out = components(notPage, sw, sh);
  // Per region (0 = the page): cells grouped by label, contact with the frame. Medians, not means: the ink in a
  // region (a stroke crossing a shadow) must not lend it a tint or a texture.
  const nr = out.n + 1;
  const rArea = new Int32Array(nr);
  const rEdge = new Int32Array(nr);
  for (let y = 0, i = 0; y < sh; y++) for (let x = 0; x < sw; x++, i++) {
    rArea[out.label[i]]++;
    if (out.label[i] && (x === 0 || y === 0 || x === sw - 1 || y === sh - 1)) rEdge[out.label[i]]++;
  }
  const start = new Int32Array(nr + 1);
  for (let l = 0; l < nr; l++) start[l + 1] = start[l] + rArea[l];
  const order = new Int32Array(n);
  const fillAt = start.slice(0, nr);
  for (let i = 0; i < n; i++) order[fillAt[out.label[i]]++] = i;
  const median = (l: number, f: (i: number) => number): number => {
    const v = new Float32Array(rArea[l]);
    for (let k = 0; k < v.length; k++) v[k] = f(order[start[l] + k]);
    v.sort();
    return v[v.length >> 1];
  };
  const relTex = (i: number): number => tex[i] / Math.max(L[i], 0.05);
  const pageL = median(0, (i) => L[i]);
  const pageTex = median(0, relTex);
  const pageTint = median(0, (i) => T[i]);
  const isDesk = Array.from({ length: nr }, (_, l) => {
    if (l === 0 || rEdge[l] < INK.deskBorder * 2 * (sw + sh) || rArea[l] < INK.deskMinShare * n) return false;
    const ratio = median(l, (i) => L[i]) / pageL;
    if (ratio > INK.deskMaxRatio) return false;
    const textured = median(l, relTex) > Math.max(0.02, 2.5 * pageTex);
    return ratio < INK.deskDarkRatio || textured || Math.abs(median(l, (i) => T[i]) - pageTint) > 0.12;
  });
  const desk0 = new Uint8Array(n);
  let deskArea = 0;
  // Only outside the convex hull of the page: ink at the sheet's edge joins the desk region, never the desk.
  const hull = convexHullRows(lab, page, sw, sh);
  for (let y = 0, i = 0; y < sh; y++) for (let x = 0; x < sw; x++, i++) if (isDesk[out.label[i]] && (x < hull[2 * y] || x > hull[2 * y + 1])) desk0[i] = 1;
  // One cell more: the paper edge, its thickness and its shadow line go with the desk.
  const desk = new Uint8Array(n);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    let d = 0;
    for (let dy = -1; dy <= 1 && !d; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy;
      const xx = x + dx;
      if (yy >= 0 && yy < sh && xx >= 0 && xx < sw && desk0[yy * sw + xx]) {
        d = 1;
        break;
      }
    }
    desk[y * sw + x] = d;
    deskArea += d;
  }
  if (deskArea < 0.01 * n || deskArea > 0.85 * n) return null;
  // Desk cells take the closed colour of the nearest page cell (multi-source breadth-first search).
  const fill = new Uint8ClampedArray(n * 3);
  const src = new Int32Array(n).fill(-1);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) if (!desk[i]) {
    src[i] = i;
    stack[tail++] = i;
  }
  while (head < tail) {
    const p = stack[head++];
    const px = p % sw;
    for (let t = 0; t < 4; t++) {
      const q = t === 0 ? (px > 0 ? p - 1 : -1) : t === 1 ? (px < sw - 1 ? p + 1 : -1) : t === 2 ? p - sw : p + sw;
      if (q < 0 || q >= n || src[q] >= 0) continue;
      src[q] = src[p];
      stack[tail++] = q;
    }
  }
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) fill[i * 3 + c] = Math.round(ch[c][src[i]] * 255);
  return { f, sw, sh, desk, fill };
}

/** Convex hull of the cells labelled `l`: per row, its [first, last] column (first > last: the row is outside). */
function convexHullRows(lab: Int32Array, l: number, w: number, h: number): Int32Array {
  // Row extremes, then Andrew's monotone chain on them.
  const pts: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    let x0 = -1;
    let x1 = -1;
    for (let x = 0; x < w; x++) if (lab[y * w + x] === l) {
      if (x0 < 0) x0 = x;
      x1 = x;
    }
    if (x0 >= 0) pts.push([x0, y], [x1, y]);
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let k = pts.length - 1; k >= 0; k--) {
    const p = pts[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const poly = lower.slice(0, -1).concat(upper.slice(0, -1));
  const rows = new Int32Array(2 * h);
  for (let y = 0; y < h; y++) {
    rows[2 * y] = w;
    rows[2 * y + 1] = -1;
  }
  // Each hull edge, walked row by row, widens the rows it spans.
  for (let k = 0; k < poly.length; k++) {
    const [ax, ay] = poly[k];
    const [bx, by] = poly[(k + 1) % poly.length];
    const y0 = Math.min(ay, by);
    const y1 = Math.max(ay, by);
    for (let y = y0; y <= y1; y++) {
      const x = ay === by ? Math.min(ax, bx) : ax + ((bx - ax) * (y - ay)) / (by - ay);
      const xe = ay === by ? Math.max(ax, bx) : x;
      rows[2 * y] = Math.min(rows[2 * y], Math.floor(x));
      rows[2 * y + 1] = Math.max(rows[2 * y + 1], Math.ceil(xe));
    }
  }
  return rows;
}

/** Cell index of full-res pixel (x, y) in a page mask. */
function pageCell(p: PageMask, x: number, y: number): number {
  return Math.min(p.sh - 1, Math.floor(y / p.f)) * p.sw + Math.min(p.sw - 1, Math.floor(x / p.f));
}

/** A copy of the photo with the desk painted over in the paper colour next to it (keying sees only the page). */
export function maskDesk(img: Rgba, p: PageMask): Rgba {
  const { width: w, height: h } = img;
  const data = img.data.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = pageCell(p, x, y);
    if (!p.desk[c]) continue;
    const j = (y * w + x) * 4;
    data[j] = p.fill[c * 3];
    data[j + 1] = p.fill[c * 3 + 1];
    data[j + 2] = p.fill[c * 3 + 2];
  }
  return { data, width: w, height: h };
}

/** Bounding box (full-res px) of the page: the cells that are not desk. */
function pageBox(p: PageMask | null, w: number, h: number): { w: number; h: number } {
  if (!p) return { w, h };
  let x0 = p.sw;
  let y0 = p.sh;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < p.sh; y++) for (let x = 0; x < p.sw; x++) {
    if (p.desk[y * p.sw + x]) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    y1 = y;
  }
  return { w: Math.min(w, (x1 - x0 + 1) * p.f), h: Math.min(h, (y1 - y0 + 1) * p.f) };
}

/** What 자동 sees in a photo (classifyInk); the counts are strong-ink pixels on the ~600 px copy. */
export interface InkScene {
  guess: 'red' | 'black' | 'both';
  red: number;
  black: number;
  /** Components per colour (majority), at least 3 px: many = printed text. */
  redParts: number;
  blackParts: number;
  /** A red cluster is stamp-shaped: at least 40 px and a fifth of the red, aspect within 2.5, 3 % of its box inked. */
  stamp: boolean;
}

/** The ~600 px copies already made, per image (coarsePaper and every 진하기 of sceneInk share one). */
const coarseCopies = new WeakMap<Rgba, Rgba>();

/** Copy of about 600 px for the colour decision and the coarse paper colour: factor and image. */
function coarseCopy(img: Rgba): { f: number; small: Rgba } {
  const f = Math.max(1, Math.floor(Math.max(img.width, img.height) / 600));
  let small = coarseCopies.get(img);
  if (!small) {
    small = boxDown(img, f);
    coarseCopies.set(img, small);
  }
  return { f, small };
}

/**
 * Paper colour before keying (C1 r3, for the redness ratio of the mode filters): paperColor of the ~600 px copy
 * against a first key on min(R,G,B) at the default 진하기, its cells scaled back to full-res pixels.
 */
export function coarsePaper(img: Rgba): PaperGrid {
  const { f, small } = coarseCopy(img);
  const { mn } = planes(small);
  const a = rampFromDark(darkness(mn, paperLevel(mn, small.width, small.height)), INK.lo, INK.hi);
  const pg = paperColor(small, a);
  return { ...pg, cell: pg.cell * f };
}

/** Text-like: at least this many components of one colour (printed lines of text, not a 서명 or a 도장). */
const TEXT_PARTS = 40;

/**
 * 자동 classification (Arch rulings, C1 review and C1 r3): red 도장, black/blue 서명, or both. On a copy of about
 * 600 px a first key on min(R,G,B) finds the strong ink (a > 0.5); a pixel is red when its redness ratio
 * (redRatio, against the paper colour around it) exceeds INK.ratioGuess. Components that touch the frame (shadow
 * and paper-edge bands) or are long thin lines are left out of the decision unless nothing else is left.
 * A colour counts when it holds INK.redShare of the strong ink, or for red, when one of its clusters is a compact
 * 도장 (a small 직인 on a printed page). When both count: black that is printed text (many small parts) gives way
 * to red (a 직인 on a form), as do small pieces of black (left-over lines beside a 도장); else red that is
 * printed text gives way to black (a 서명 on a page with red print); else both are kept (a 도장 over a 서명 comes
 * out whole).
 */
export function sceneInk(img: Rgba, strength = 0): InkScene {
  const { small } = coarseCopy(img);
  const { width: w, height: h } = small;
  const { mn, red } = planes(small);
  const { lo, hi } = rampFor(strength);
  const a = rampFromDark(darkness(mn, paperLevel(mn, w, h)), lo, hi);
  const pg = paperColor(small, a);
  const ratio = ratioPlane(mn, red, pg, w, h);
  removeLines(a, w, h);
  const strong = new Uint8Array(w * h);
  for (let i = 0; i < a.length; i++) strong[i] = a[i] > INK.strongAlpha ? 1 : 0;
  const { label, n } = components(strong, w, h);
  const cs = Array.from({ length: n + 1 }, () => ({ size: 0, reds: 0, edge: false, x0: w, y0: h, x1: -1, y1: -1 }));
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const l = label[i];
    if (!l) continue;
    const c = cs[l];
    c.size++;
    if (ratio[i] > INK.ratioGuess) c.reds++;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c.edge = true;
    if (x < c.x0) c.x0 = x;
    if (x > c.x1) c.x1 = x;
    if (y < c.y0) c.y0 = y;
    if (y > c.y1) c.y1 = y;
  }
  const lineLike = (c: (typeof cs)[number]): boolean => {
    const bw = c.x1 - c.x0 + 1;
    const bh = c.y1 - c.y0 + 1;
    return (bw >= 0.5 * w || bh >= 0.5 * h) && c.size / Math.max(bw, bh) < 3;
  };
  let use = cs.map((c, l) => l > 0 && !c.edge && !lineLike(c));
  if (!use.some(Boolean)) use = cs.map((_, l) => l > 0);
  let R = 0;
  let B = 0;
  let redParts = 0;
  let blackParts = 0;
  let blackMax = 0;
  const redMask = new Uint8Array(w * h);
  for (let l = 1; l <= n; l++) {
    if (!use[l]) continue;
    const c = cs[l];
    R += c.reds;
    B += c.size - c.reds;
    if (c.size >= 3) {
      if (2 * c.reds > c.size) redParts++;
      else blackParts++;
    }
    if (c.size - c.reds > blackMax) blackMax = c.size - c.reds;
  }
  for (let i = 0; i < a.length; i++) if (label[i] && use[label[i]] && ratio[i] > INK.ratioGuess) redMask[i] = 1;
  const T = R + B;
  // The largest red cluster (red ink dilated by 1 % of the long edge): a 도장 is compact.
  let stamp = false;
  if (R > 0) {
    const r = Math.max(1, Math.round(0.01 * Math.max(w, h)));
    const dm = maxFilter(Float32Array.from(redMask), w, h, 2 * r + 1);
    const dmask = new Uint8Array(w * h);
    for (let i = 0; i < dm.length; i++) dmask[i] = dm[i] > 0 ? 1 : 0;
    const cl = components(dmask, w, h);
    const k = Array.from({ length: cl.n + 1 }, () => ({ m: 0, x0: w, y0: h, x1: -1, y1: -1 }));
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
      if (!redMask[i]) continue;
      const c = k[cl.label[i]];
      c.m++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
    }
    stamp = k.slice(1).some((c) => {
      const bw = c.x1 - c.x0 + 1;
      const bh = c.y1 - c.y0 + 1;
      return c.m >= Math.max(40, 0.2 * R) && Math.max(bw, bh) <= 2.5 * Math.min(bw, bh) && c.m >= 0.03 * bw * bh;
    });
  }
  const redSig = T > 0 && (R / T >= INK.redShare || stamp);
  const blackSig = T > 0 && B / T >= INK.redShare;
  let guess: InkScene['guess'] = redSig ? 'red' : 'black';
  if (redSig && blackSig) {
    const redText = redParts >= TEXT_PARTS && !stamp;
    const blackText = blackParts >= TEXT_PARTS;
    // A little dark ink in pieces beside a 도장 (left-over ruled lines, smudges: under bothShare of the ink, none
    // of it a third of the dark ink) is not a 서명; a thin 서명 under a bulky 도장 is one long stroke.
    const weakBlack = B / T < INK.bothShare && blackMax < B / 3;
    guess = blackText || weakBlack ? 'red' : redText ? 'black' : 'both';
  }
  return { guess, red: R, black: B, redParts, blackParts, stamp };
}

/** 자동 classification (sceneInk): red 도장, black/blue 서명, or both. */
export function classifyInk(img: Rgba, strength = 0): 'red' | 'black' | 'both' {
  return sceneInk(img, strength).guess;
}

type LineCand = { c: number; s: number; rho: number; v: number };

/**
 * Hough candidates of removeLinesH. `t` = the transposed frame (vertical lines), read from `d` in place:
 * transposed (X, Y) is the pixel (x = Y, y = X) of the w x h plane, so no copy is made unless a line is found.
 */
function lineCands(d: Float32Array, w: number, h: number, ex: number, t: boolean): LineCand[] {
  const S = INK.lineAlpha;
  const W = t ? h : w;
  const H = t ? w : h;
  const q = Math.max(1, Math.round(Math.max(w, h) / 800));
  const need = (INK.lineSpan * ex) / q;
  const at = (X: number, Y: number): number => (t ? d[X * w + Y] : d[Y * w + X]);
  // Votes come from thin ink only: paper (or nothing) at 7 px across the line on both sides. A solid area votes
  // for nothing, so a large 도장 or a block of print raises no candidates.
  const T = 7;
  const thin = (X: number, Y: number): boolean => at(X, Y) > S && (Y < T || at(X, Y - T) <= S) && (Y >= H - T || at(X, Y + T) <= S);
  let m = 0;
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X += q) if (thin(X, Y)) m++;
  if (m < need) return [];
  const px = new Int32Array(m);
  const py = new Int32Array(m);
  for (let Y = 0, j = 0; Y < H; Y++) for (let X = 0; X < W; X += q) if (thin(X, Y)) {
    px[j] = X;
    py[j++] = Y;
  }
  const BIN = 4;
  const maxRad = (INK.lineMaxDeg * Math.PI) / 180;
  const off = Math.ceil(W * Math.sin(maxRad)) + 2 * BIN;
  const nb = Math.ceil((H + 2 * off) / BIN) + 2;
  const acc = new Int32Array(nb);
  const cands: LineCand[] = [];
  const steps = Math.round((2 * INK.lineMaxDeg) / 0.25);
  for (let k = 0; k <= steps; k++) {
    const th = -maxRad + (k * 2 * maxRad) / steps;
    const c = Math.cos(th);
    const s = Math.sin(th);
    acc.fill(0);
    for (let j = 0; j < m; j++) acc[((py[j] * c - px[j] * s + off) / BIN) | 0]++;
    for (let b = 1; b < nb - 2; b++) {
      const v = acc[b] + acc[b + 1];
      if (v >= need && v >= acc[b - 1] + acc[b] && v > acc[b + 1] + acc[b + 2]) cands.push({ c, s, rho: (b + 1) * BIN - off, v });
    }
  }
  return cands.sort((p, r) => r.v - p.v);
}

/**
 * Straight thin lines (C1 r3; ruled paper m06, form lines m02), within INK.lineMaxDeg of the horizontal: each
 * Hough candidate (lineCands: a > 0.1, 0.25 degree, 4 px bins) is tracked column by column, and kept when its band
 * is at most maxThick px thick and runs on (gaps under 4 % of the width, inked over 60 %) over INK.lineSpan of the
 * page width `ex`. Its pixels are cleared from `a` and `d`, except where ink lies just beyond the band (a stroke
 * crossing the line) or is clearly darker than the line itself (a stroke running along it). In place.
 */
function removeLinesH(d: Float32Array, a: Float32Array, w: number, h: number, ex: number, cands: LineCand[]): void {
  const S = INK.lineAlpha;
  // Thickness at a > 0.1 of a blurred phone photo's ruled line: up to 12 px at a long edge of 2400.
  const maxThick = Math.max(8, Math.round(Math.max(w, h) / 200));
  const gapMax = Math.max(8, Math.round(0.04 * w));
  const R = 8;
  const hist = new Int32Array(2 * R + 1);
  const yc = new Float32Array(w);
  for (const cd of cands.slice(0, 400)) {
    // Quick check on every 4th column: a line already cleared (a neighbour angle of one done) is skipped.
    let quick = 0;
    for (let x = 0; x < w; x += 4) {
      const y0 = Math.round((cd.rho + x * cd.s) / cd.c);
      for (let y = y0 - 3; y <= y0 + 3; y++) if (y >= 0 && y < h && d[y * w + x] > S) {
        quick++;
        break;
      }
    }
    if (quick * 4 < 0.5 * INK.lineSpan * ex) continue;
    // Fine profile across the line: offset of strong pixels from the candidate's centre line.
    hist.fill(0);
    for (let x = 0; x < w; x++) {
      yc[x] = (cd.rho + x * cd.s) / cd.c;
      const y0 = Math.round(yc[x]);
      for (let k = -R; k <= R; k++) {
        const y = y0 + k;
        if (y >= 0 && y < h && d[y * w + x] > S) hist[k + R]++;
      }
    }
    let pk = 0;
    for (let k = 1; k < hist.length; k++) if (hist[k] > hist[pk]) pk = k;
    let lo = pk;
    let hi = pk;
    while (lo > 0 && hist[lo - 1] >= 0.3 * hist[pk]) lo--;
    while (hi < hist.length - 1 && hist[hi + 1] >= 0.3 * hist[pk]) hi++;
    // The straight fit spreads a slightly bent line; it is measured again on the tracked centre.
    if (hi - lo + 1 > 3 * maxThick) continue;
    let half = Math.ceil((hi - lo + 1) / 2);
    // Track the centre column by column: a photographed line bends a little (lens, paper), so the straight fit
    // drifts off it. Locked on, the centre moves at most 1 px per column.
    let o = pk - R;
    for (let x = 0; x < w; x++) {
      const base = Math.round(yc[x] + o);
      let sy = 0;
      let sn = 0;
      for (let k = -half - 1; k <= half + 1; k++) {
        const y = base + k;
        if (y >= 0 && y < h && d[y * w + x] > S) {
          sy += k;
          sn++;
        }
      }
      if (sn > 0 && sn <= 2 * half + 3) o += Math.max(-1, Math.min(1, sy / sn));
      yc[x] += o;
    }
    hist.fill(0);
    for (let x = 0; x < w; x++) {
      const y0 = Math.round(yc[x]);
      for (let k = -R; k <= R; k++) {
        const y = y0 + k;
        if (y >= 0 && y < h && d[y * w + x] > S) hist[k + R]++;
      }
    }
    lo = R;
    hi = R;
    while (lo > 0 && hist[lo - 1] >= 0.3 * hist[R]) lo--;
    while (hi < hist.length - 1 && hist[hi + 1] >= 0.3 * hist[R]) hi++;
    if (hi - lo + 1 > maxThick) continue;
    half = Math.max(R - lo, hi - R);
    // The longest run of columns holding the band (gaps under gapMax).
    let best0 = 0;
    let best1 = -1;
    let bestOn = 0;
    let run0 = -1;
    let runOn = 0;
    let last = -1;
    for (let x = 0; x < w; x++) {
      const y0 = Math.round(yc[x]);
      let on = false;
      for (let y = y0 - half; y <= y0 + half && !on; y++) if (y >= 0 && y < h && d[y * w + x] > S) on = true;
      if (!on) continue;
      if (run0 < 0 || x - last > gapMax) {
        run0 = x;
        runOn = 0;
      }
      runOn++;
      last = x;
      if (last - run0 > best1 - best0) {
        best0 = run0;
        best1 = last;
        bestOn = runOn;
      }
    }
    if (best1 - best0 + 1 < INK.lineSpan * ex || bestOn < 0.6 * (best1 - best0 + 1)) continue;
    // The line's own level: the median of its strongest pixel per column. Ink clearly stronger than a faint
    // ruled line (a stroke running along it or crossing it at a shallow angle) is kept.
    const lv = new Int32Array(21);
    for (let x = best0; x <= best1; x++) {
      const y0 = Math.round(yc[x]);
      let m = 0;
      for (let y = Math.max(0, y0 - half); y <= Math.min(h - 1, y0 + half); y++) if (d[y * w + x] > m) m = d[y * w + x];
      if (m > S) lv[Math.min(20, Math.round(m * 20))]++;
    }
    let med = 0;
    for (let k = 0, acc = 0, tot = lv.reduce((p, v) => p + v, 0); k < 21; k++) {
      acc += lv[k];
      if (acc >= tot / 2) {
        med = k / 20;
        break;
      }
    }
    const keep = Math.max(INK.strongAlpha, 1.5 * med);
    for (let x = best0; x <= best1; x++) {
      const y0 = Math.round(yc[x]);
      const up = y0 - half - 3;
      const dn = y0 + half + 3;
      const crossing = (up >= 0 && d[up * w + x] > INK.strongAlpha) || (dn < h && d[dn * w + x] > INK.strongAlpha);
      if (crossing) continue;
      for (let y = Math.max(0, y0 - half - 1); y <= Math.min(h - 1, y0 + half + 1); y++) {
        if (d[y * w + x] > keep) continue;
        a[y * w + x] = 0;
        d[y * w + x] = 0;
      }
    }
  }
}

/**
 * Removes ruled and printed lines along both page axes (removeLinesH) from `a`, found in `d` (default `a`): the
 * ramp before hysteresis, where a faint ruled line is whole, not the dashes that hysteresis leaves of it. page =
 * the page's extent in px. In place (`d` too).
 */
export function removeLines(a: Float32Array, w: number, h: number, page: { w: number; h: number } = { w, h }, d: Float32Array = a): void {
  const ch = lineCands(d, w, h, page.w, false);
  if (ch.length) removeLinesH(d, a, w, h, page.w, ch);
  const cv = lineCands(d, w, h, page.h, true);
  if (!cv.length) return;
  const ta = transpose(a, w, h);
  const td = d === a ? ta : transpose(d, w, h);
  removeLinesH(td, ta, h, w, page.h, cv);
  transpose(ta, h, w, a);
  if (d !== a) transpose(td, h, w, d);
}

/** One keyed path (빨간 도장 or 서명) of a photo. */
interface PathKey {
  alpha: Float32Array;
  plane: InkPlane;
  paper: PaperGrid;
}

/** Photo-level state: the desk-free copy, its planes, the coarse paper colour and the redness ratio, once. */
function prepare(img: Rgba, cache: InkCache): Rgba {
  if (cache.src) return cache.src;
  if (cache.page === undefined) cache.page = findPage(img);
  const src = cache.page ? maskDesk(img, cache.page) : img;
  Object.assign(cache, planes(src));
  const grid = coarsePaper(src);
  cache.ratio = ratioPlane(cache.mn as Float32Array, cache.red as Float32Array, grid, src.width, src.height);
  cache.src = src;
  return src;
}

/**
 * One path, steps 2-7: paper estimate -> ramp -> mode filter -> edge AA -> hysteresis -> despeckle -> solid fill
 * -> line removal -> despeckle and hysteresis again (C1 r3: the faint rim of a removed speck goes with it).
 */
function keyPath(src: Rgba, mode: 'red' | 'sign', strength: number, cache: InkCache): PathKey {
  const { lo, hi } = rampFor(strength);
  const { width: w, height: h } = src;
  const sign = mode === 'sign';
  const x = (sign ? cache.lum : cache.mn) as Float32Array;
  const paper = cachedPaper(cache, sign ? 'lum' : 'mn', w, h);
  const ratio = cache.ratio as Float32Array;
  const ramp = rampFromDark(darkness(x, paper), lo, hi);
  // 서명 drops red ink by the largest ratio within 2 px: the soft rim of red print goes with its letters (s04).
  const shift = strength * INK.ratioStep;
  applyModeFilter(ramp, sign ? (cache.ratioMax ??= maxFilter(ratio, w, h, 5)) : ratio, mode, shift);
  const alpha = smoothEdges(ramp, w, h);
  const r = hysteresisRadius(w, h);
  hysteresis(alpha, w, h, r);
  despeckle(alpha, w, h);
  const plane: InkPlane = sign ? 'lum' : 'mn';
  const pg = paperColor(src, alpha);
  fillSolid(alpha, x, paper, ratio, pg, plane, mode, lo, hi, w, h, shift);
  removeLines(alpha, w, h, pageBox(cache.page ?? null, w, h), ramp);
  dropFaintSpecks(alpha, w, h);
  hysteresis(alpha, w, h, r);
  const page = cache.page;
  if (page) for (let y = 0, i = 0; y < h; y++) for (let xx = 0; xx < w; xx++, i++) if (page.desk[pageCell(page, xx, y)]) alpha[i] = 0;
  return { alpha, plane, paper: pg };
}

/**
 * Ink key, steps 1-7 of the brief plus the C1 r3 additions: page finding (the desk is painted over), the redness
 * ratio for the mode filters, line removal. `cache` keeps the photo-level work between re-runs. 자동 classifies
 * first (classifyInk) and keys exactly as the chosen path: 빨간 도장 for red, 검정·파란 서명 for black/blue, and
 * both paths joined (the larger alpha) when the photo holds both (C1 r3: a 도장 over a 서명).
 */
export function keyInk(img: Rgba, opts: KeyOptions, cache: InkCache = {}): KeyResult {
  const src = prepare(img, cache);
  const strength = Math.max(INK.strengthMin, Math.min(INK.strengthMax, Math.round(opts.strength ?? 0)));
  const key = String(strength);
  const guess = opts.mode === 'auto' ? (cache.guess?.[key] ?? classifyInk(src, strength)) : null;
  if (guess) (cache.guess ??= {})[key] = guess;
  let out: KeyResult;
  if (guess === 'both') {
    const r = keyPath(src, 'red', strength, cache);
    const s = keyPath(src, 'sign', strength, cache);
    const alpha = new Float32Array(r.alpha.length);
    for (let i = 0; i < alpha.length; i++) alpha[i] = r.alpha[i] > s.alpha[i] ? r.alpha[i] : s.alpha[i];
    out = { alpha, plane: 'mn', paper: r.paper, guess, inkShare: 0, status: 'ok', parts: [r, s] };
  } else {
    const k = keyPath(src, opts.mode === 'sign' || guess === 'black' ? 'sign' : 'red', strength, cache);
    out = { ...k, guess: guess ?? colorGuess(k.alpha, cache.red as Float32Array), inkShare: 0, status: 'ok' };
  }
  Object.assign(out, areaCheck(out.alpha));
  // Nothing found (C1 r3, o06: a small dull 직인): one 진하기 step stronger, once, as the noink message advises.
  if (out.status === 'noink' && !opts.retried && strength < INK.strengthMax) return keyInk(img, { ...opts, strength: strength + 1, retried: true }, cache);
  return out;
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
export function fillSolid(a: Float32Array, x: Float32Array, paper: Float32Array, ratio: Float32Array, pg: PaperGrid, plane: InkPlane, mode: InkMode, lo: number, hi: number, w: number, h: number, shift = 0): void {
  const S = INK.strongAlpha;
  const pr = new Float32Array(3);
  const span = hi - lo;
  const alpha2 = (i: number): number => {
    const xx = i % w;
    readGrid3(pg, xx, (i - xx) / w, pr, 0);
    const p = plane === 'mn' ? Math.min(pr[0], pr[1], pr[2]) : 0.299 * pr[0] + 0.587 * pr[1] + 0.114 * pr[2];
    // Only where the closing's level sank well below the paper around the ink; elsewhere the key stands.
    if (p - paper[i] <= INK.fillSink * p) return a[i];
    return clamp01((clamp01((p - x[i]) / p) - lo) / span) * modeFactor(ratio[i], mode, shift);
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

/**
 * Ink colour, step 8: the photo's own ink colour (default) or a fixed colour; alpha kept. Straight RGBA. A joined
 * key (자동 with both inks) takes each pixel's colour from the part with the larger alpha, each part coloured from
 * its own ink, so a 도장 over a 서명 keeps both colours.
 */
export function renderInk(img: Rgba, key: Pick<KeyResult, 'alpha' | 'plane' | 'paper' | 'parts'>, color: InkColor): Uint8ClampedArray {
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
  if (key.parts && key.parts.length > 1) {
    const [p, q] = key.parts;
    inkColorField(img, p, out);
    const other = new Uint8ClampedArray(n * 4);
    inkColorField(img, q, other);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      if (q.alpha[i] <= p.alpha[i]) continue;
      out[j] = other[j];
      out[j + 1] = other[j + 1];
      out[j + 2] = other[j + 2];
    }
  } else inkColorField(img, key, out);
  for (let i = 0; i < n; i++) out[i * 4 + 3] = Math.round(alpha[i] * 255);
  return out;
}

/**
 * The main ink cluster (C1 r3): strong ink (a > 0.5, weighted 2a - 1 so solid ink outweighs a faint stain; or
 * a > 0.1 when there is none) on a grid of about 600 cells, dilated by INK.clusterGap of the long edge, gives
 * clusters. A cluster lying along the frame or the page edge (touching it over a fifth of the short side: a book
 * edge, a shadow band, a dirty sheet edge) counts a tenth; over a tenth of it, it never joins. The main cluster is the largest by ink.
 * Repeatedly, a cluster of at least INK.joinShare of its ink within INK.joinFar of the joined box's long edge joins
 * (a sheet of seals), and one of at least INK.joinMin of it within INK.joinNear of the box's long edge (the dot of
 * an i, a date under a 서명; at the frame or page edge, of the main cluster's own box). On the 서명 path no cluster
 * redder than the main one by INK.joinRedder in redness ratio joins (a brown stain beside a pen 서명). A strip longer than the main cluster never joins (a column of print).
 * Returns the cell size, the cell labels and the joined labels, or null when there is no ink.
 */
type Clusters = { q: number; gw: number; label: Int32Array; take: Uint8Array };

function inkClusters(alpha: Float32Array, w: number, h: number, page: PageMask | null = null, ratio: Float32Array | null = null): Clusters | null {
  const q = Math.max(1, Math.round(Math.max(w, h) / 600));
  const gw = Math.ceil(w / q);
  const gh = Math.ceil(h / q);
  const strong = new Float32Array(gw * gh);
  const weak = new Float32Array(gw * gh);
  const redSum = new Float32Array(gw * gh);
  for (let y = 0; y < h; y++) for (let x = 0, g = Math.floor(y / q) * gw; x < w; x++) {
    const v = alpha[y * w + x];
    if (v > INK.cropAlpha) weak[g + Math.floor(x / q)]++;
    if (v > INK.strongAlpha) {
      strong[g + Math.floor(x / q)] += 2 * v - 1;
      if (ratio) redSum[g + Math.floor(x / q)] += (2 * v - 1) * ratio[y * w + x];
    }
  }
  const mass = strong.some((v) => v > 0) ? strong : weak;
  if (!mass.some((v) => v > 0)) return null;
  const r = Math.max(1, Math.round(INK.clusterGap * Math.max(gw, gh)));
  const dil = maxFilter(mass, gw, gh, 2 * r + 1);
  const dm = new Uint8Array(gw * gh);
  for (let i = 0; i < dm.length; i++) dm[i] = dil[i] > 0 ? 1 : 0;
  const { label, n } = components(dm, gw, gh);
  const cl = Array.from({ length: n + 1 }, () => ({ m: 0, x0: gw, y0: gh, x1: -1, y1: -1, contact: 0, red: 0 }));
  // The frame's border, and the page's edge when a desk was found (a dirty sheet edge, a shadow along it).
  let nearDesk: Float32Array | null = null;
  if (page) {
    const dk = new Float32Array(page.desk.length);
    for (let i = 0; i < dk.length; i++) dk[i] = page.desk[i];
    nearDesk = maxFilter(dk, page.sw, page.sh, 5);
  }
  const nearPageEdge = (x: number, y: number): boolean =>
    page !== null && nearDesk !== null && nearDesk[pageCell(page, Math.min(w - 1, x * q + (q >> 1)), Math.min(h - 1, y * q + (q >> 1)))] > 0;
  const border = (x: number, y: number): boolean => x === 0 || y === 0 || x === gw - 1 || y === gh - 1 || nearPageEdge(x, y);
  for (let y = 0, i = 0; y < gh; y++) for (let x = 0; x < gw; x++, i++) {
    if (!(mass[i] > 0)) continue;
    const c = cl[label[i]];
    c.m += mass[i];
    c.red += redSum[i];
    if (x < c.x0) c.x0 = x;
    if (x > c.x1) c.x1 = x;
    if (y < c.y0) c.y0 = y;
    if (y > c.y1) c.y1 = y;
    if (border(x, y)) c.contact++;
  }
  // Lying along the frame or page edge: over a fifth of the short side it barely counts for the main cluster; over
  // a tenth it never joins (edge dirt, a sliver of desk shadow next to the ink).
  const hug = (l: number): boolean => cl[l].contact >= 0.1 * Math.min(gw, gh);
  const weight = (l: number): number => cl[l].m * (cl[l].contact >= 0.2 * Math.min(gw, gh) ? 0.1 : 1);
  let main = 1;
  for (let l = 2; l <= n; l++) if (weight(l) > weight(main)) main = l;
  const take = new Uint8Array(n + 1);
  take[main] = 1;
  const box = { ...cl[main] };
  const mainLong = Math.max(box.x1 - box.x0 + 1, box.y1 - box.y0 + 1);
  const tooLong = (c: (typeof cl)[number]): boolean => {
    const a = Math.max(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1);
    return a > 1.2 * mainLong && a > 3 * Math.min(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1);
  };
  const gap = (c: (typeof cl)[number]): number => Math.max(0, c.x0 - box.x1, box.x0 - c.x1, c.y0 - box.y1, box.y0 - c.y1);
  const long = (): number => Math.max(box.x1 - box.x0 + 1, box.y1 - box.y0 + 1);
  const add = (l: number): void => {
    const c = cl[l];
    take[l] = 1;
    box.x0 = Math.min(box.x0, c.x0);
    box.y0 = Math.min(box.y0, c.y0);
    box.x1 = Math.max(box.x1, c.x1);
    box.y1 = Math.max(box.y1, c.y1);
  };
  const mainLong0 = long();
  const mainBox = { ...box };
  const gapMain = (c: (typeof cl)[number]): number => Math.max(0, c.x0 - mainBox.x1, mainBox.x0 - c.x1, c.y0 - mainBox.y1, mainBox.y0 - c.y1);
  for (let changed = true; changed; ) {
    changed = false;
    for (let l = 1; l <= n; l++) {
      const c = cl[l];
      if (take[l] || hug(l) || tooLong(c) || c.m < INK.joinMin * cl[main].m) continue;
      const far = c.m >= INK.joinShare * cl[main].m && gap(c) <= INK.joinFar * long();
      // Near: by the joined box (a seal broken in two beside the others), but by the main cluster alone for a
      // cluster at the frame or page edge, so edge dirt cannot creep in from one joined piece to the next.
      const near = c.contact > 0 ? gapMain(c) <= INK.joinNear * mainLong0 : gap(c) <= INK.joinNear * long();
      if (!far && !near) continue;
      // 서명 (ratio given): a cluster clearly redder than the main one is another ink (a brown stain, red print).
      if (ratio && c.red / c.m - cl[main].red / cl[main].m > INK.joinRedder) continue;
      add(l);
      changed = true;
    }
  }
  return { q, gw, label, take };
}

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Bbox (px) of a > 0.1 inside the main ink cluster (inkClusters; all of it without `c`), or null. */
function inkBox(alpha: Float32Array, w: number, h: number, c: Clusters | null = null): Box | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const g = c ? Math.floor(y / c.q) * c.gw : 0;
    for (let x = 0; x < w; x++) {
      if (!(alpha[y * w + x] > INK.cropAlpha) || (c && !c.take[c.label[g + Math.floor(x / c.q)]])) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * Clears the ink outside the main cluster (inkClusters): what the crop leaves out is not in the PNG either.
 * Returns the bbox of what is left, or null.
 */
export function keepMainInk(alpha: Float32Array, w: number, h: number, page: PageMask | null = null, ratio: Float32Array | null = null): Box | null {
  const c = inkClusters(alpha, w, h, page, ratio);
  if (!c) return null;
  for (let y = 0; y < h; y++) {
    const g = Math.floor(y / c.q) * c.gw;
    for (let x = 0; x < w; x++) if (!c.take[c.label[g + Math.floor(x / c.q)]]) alpha[y * w + x] = 0;
  }
  return inkBox(alpha, w, h, c);
}

/** A bbox plus padding max(8 px, 4 % of its long edge), or 2 px for 여백 없음, kept inside the photo. */
function padRect(b: Box, w: number, h: number, noPad: boolean): Rect {
  const pad = noPad ? INK.padNone : Math.max(INK.padMin, Math.round(INK.padShare * Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1)));
  const x0 = Math.max(0, b.x0 - pad);
  const y0 = Math.max(0, b.y0 - pad);
  return { x: x0, y: y0, w: Math.min(w, b.x1 + 1 + pad) - x0, h: Math.min(h, b.y1 + 1 + pad) - y0 };
}

/**
 * Auto-crop, step 9: the main ink cluster (inkClusters) plus padding max(8 px, 4 % of its long edge), or 2 px for
 * 여백 없음, kept inside the photo (C1 r3: no transparent margin). Null when nothing is above 0.1.
 */
export function cropRect(alpha: Float32Array, w: number, h: number, noPad = false): Rect | null {
  const c = inkClusters(alpha, w, h);
  const b = c && inkBox(alpha, w, h, c);
  return b ? padRect(b, w, h, noPad) : null;
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
  guess: 'red' | 'black' | 'both';
  inkShare: number;
  /** Crop in work-copy pixels (null when status is not ok). */
  rect: Rect | null;
  /** Cropped, coloured, resized straight RGBA (null when status is not ok: no download). */
  out: Rgba | null;
  /** File name: 빨간 도장 -> 도장.png, 검정·파란 서명 -> 서명.png; 자동: a fixed colour, else the guess (both: 도장·서명.png). */
  fileName: string;
}

/** The whole photo-tab pipeline on a work copy: key -> colour -> crop -> size. */
export function processInk(img: Rgba, opts: ProcessOptions, cache: InkCache = {}): ProcessResult & { alpha: Float32Array } {
  const key = keyInk(img, opts, cache);
  const color = opts.color ?? 'original';
  // The file name follows the chosen mode; in 자동 a fixed colour decides, else the guess (Arch ruling, C1 review).
  const isRed = opts.mode === 'red' || (opts.mode === 'auto' && (color === 'red' || (color === 'original' && key.guess === 'red')));
  const both = opts.mode === 'auto' && color === 'original' && key.guess === 'both';
  const fileName = both ? '도장·서명.png' : isRed ? '도장.png' : '서명.png';
  let box: Box | null = null;
  if (key.status === 'ok') {
    // The 서명 path joins no clearly redder cluster (its redness ratio decides).
    const sign = key.plane === 'lum' && !key.parts;
    box = keepMainInk(key.alpha, img.width, img.height, cache.page ?? null, sign ? (cache.ratio ?? null) : null);
    for (const p of key.parts ?? []) for (let i = 0; i < p.alpha.length; i++) if (key.alpha[i] === 0) p.alpha[i] = 0;
  }
  const base = { status: key.status, guess: key.guess, inkShare: key.inkShare, fileName, alpha: key.alpha };
  const rect = box ? padRect(box, img.width, img.height, !!opts.noPad) : null;
  if (!rect) return { ...base, status: key.status === 'ok' ? 'noink' : key.status, rect: null, out: null };
  const rgba = renderInk(img, key, color);
  return { ...base, rect, out: cropAndResize(rgba, img.width, img.height, rect, opts.size ?? null) };
}
