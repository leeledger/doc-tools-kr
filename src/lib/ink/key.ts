// Ink key for 전자서명·도장 이미지 (Sprint C, C1). Port of the spike's pp.ink_key: the paper level is estimated
// locally (max filter + Gaussian), so shadows, uneven light and paper tone fall away and ink is keyed by its
// darkness relative to the paper around it. Pure functions on typed-array planes (0..1); no DOM, no model.
// Every number below is pinned by the brief (ARCHITECT-BRIEF-C.md "Ink-key algorithm"); change none of them
// without Arch.

export type InkMode = 'auto' | 'red' | 'sign';
/** `auto` = the colour guess (빨강 or 검정); `original` = un-mixed ink colour (원래 색). */
export type InkColor = 'auto' | 'red' | 'black' | 'blue' | 'original';
export type InkStatus = 'ok' | 'noink' | 'allpaper';

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
  paperRgb?: [Float32Array, Float32Array, Float32Array];
}

export interface KeyResult {
  alpha: Float32Array;
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
  const p = src.slice();
  const cum = new Float64Array(Math.max(w, h) + 1);
  const boxes = gaussBoxes(sigma);
  for (const bw of boxes) boxRows(p, w, h, (bw - 1) >> 1, cum);
  const t = transpose(p, w, h);
  for (const bw of boxes) boxRows(t, h, w, (bw - 1) >> 1, cum);
  return transpose(t, h, w, p);
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

/** a = clamp((d - lo) / (hi - lo)) with d = clamp((paper - x) / max(paper, 1e-3)). */
export function rampAlpha(x: Float32Array, paper: Float32Array, lo: number, hi: number): Float32Array {
  const a = new Float32Array(x.length);
  const span = hi - lo;
  for (let i = 0; i < x.length; i++) {
    const p = paper[i];
    const d = clamp01((p - x[i]) / Math.max(p, 1e-3));
    a[i] = clamp01((d - lo) / span);
  }
  return a;
}

/** Mode filters on redness: 빨간 도장 keeps red ink only; 검정·파란 서명 drops red ink. 자동 = no filter. */
export function applyModeFilter(a: Float32Array, red: Float32Array, mode: InkMode): void {
  if (mode === 'red') for (let i = 0; i < a.length; i++) a[i] *= clamp01((red[i] - 0.08) / 0.12);
  else if (mode === 'sign') for (let i = 0; i < a.length; i++) a[i] *= 1 - clamp01((red[i] - 0.15) / 0.15);
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
 * Ink key, steps 1-7 of the brief: planes -> paper estimate -> ramp -> mode filter -> edge AA -> despeckle
 * -> area check. `cache` keeps the planes and paper levels of one photo between re-runs.
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
  const ramp = rampAlpha(x, paper, lo, hi);
  applyModeFilter(ramp, cache.red as Float32Array, opts.mode);
  const alpha = smoothEdges(ramp, w, h);
  despeckle(alpha, w, h);
  const { inkShare, status } = areaCheck(alpha);
  return { alpha, guess: colorGuess(alpha, cache.red as Float32Array), inkShare, status };
}

/** The fixed colour a 색 choice resolves to, or null for 원래 색. */
export function resolveColor(color: InkColor, guess: 'red' | 'black'): readonly [number, number, number] | null {
  if (color === 'original') return null;
  return INK_COLORS[color === 'auto' ? guess : color];
}

/**
 * Ink colour, step 8: fixed colour (alpha kept) or the un-mixed ink colour F = (I - (1 - a) P) / max(a, 0.05),
 * clamped, with P the per-channel paper colour (spike). Returns straight (not premultiplied) RGBA.
 */
export function renderInk(img: Rgba, alpha: Float32Array, color: InkColor, guess: 'red' | 'black', cache: InkCache = {}): Uint8ClampedArray {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const out = new Uint8ClampedArray(n * 4);
  const fixed = resolveColor(color, guess);
  if (fixed) {
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      out[j] = fixed[0];
      out[j + 1] = fixed[1];
      out[j + 2] = fixed[2];
      out[j + 3] = Math.round(alpha[i] * 255);
    }
    return out;
  }
  if (!cache.paperRgb) {
    const ch = (c: number): Float32Array => {
      const p = new Float32Array(n);
      for (let i = 0; i < n; i++) p[i] = data[i * 4 + c] / 255;
      return paperLevel(p, w, h);
    };
    cache.paperRgb = [ch(0), ch(1), ch(2)];
  }
  const P = cache.paperRgb;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = alpha[i];
    for (let c = 0; c < 3; c++) {
      const I = data[j + c] / 255;
      const F = a > 0.05 ? (I - (1 - a) * P[c][i]) / Math.max(a, 0.05) : I;
      out[j + c] = Math.round(clamp01(F) * 255);
    }
    out[j + 3] = Math.round(a * 255);
  }
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
  const color = opts.color ?? 'auto';
  const isRed = color === 'red' || (color === 'auto' && key.guess === 'red') || (color === 'original' && key.guess === 'red');
  const fileName = isRed ? '도장.png' : '서명.png';
  const base = { status: key.status, guess: key.guess, inkShare: key.inkShare, fileName, alpha: key.alpha };
  const rect = key.status === 'ok' ? cropRect(key.alpha, img.width, img.height, opts.noPad) : null;
  if (!rect) return { ...base, status: key.status === 'ok' ? 'noink' : key.status, rect: null, out: null };
  const rgba = renderInk(img, key.alpha, color, key.guess, cache);
  return { ...base, rect, out: cropAndResize(rgba, img.width, img.height, rect, opts.size ?? null) };
}
