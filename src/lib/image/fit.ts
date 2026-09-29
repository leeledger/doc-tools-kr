// Target-size search (brief Step 3 §2), pure with injected encoders. A port of the spike's fitToTarget +
// searchQuality (spikes/photo/web/lib/imaging.js): keep the resolution and binary-search the quality down
// to a floor; below the floor, downscale (bytes scale roughly with the pixel count) and search again.

/** One probe size: an encoder bound to a canvas of (w, h). `release` frees the canvas. */
export interface ProbeSession {
  encode(q: number): Promise<Uint8Array>;
  release(): void;
}

export interface FitOptions {
  /** Creates the probe canvas at (w, h). */
  probe(w: number, h: number): Promise<ProbeSession>;
  qMax?: number;
  qFloor?: number;
  minLongEdge?: number;
  /** false: never scale (Step 4, a fixed pixel size); returns null when the floor does not fit. */
  allowDownscale?: boolean;
}

export interface FitResult {
  bytes: Uint8Array;
  /** Canvas quality, 0–1. */
  q: number;
  w: number;
  h: number;
  scale: number;
  rounds: number;
  tries: number;
}

export const Q_MAX = 0.92;
export const Q_FLOOR = 0.5;
export const MIN_LONG_EDGE = 64;
/** Quality range searched at the minimum edge when even the floor does not fit. */
export const Q_LOWEST = 0.05;

const round2 = (v: number): number => Math.round(v * 100) / 100;

interface Search {
  bytes: Uint8Array | null;
  q: number;
  tries: number;
  /** Size at `lo` when even `lo` does not fit. */
  lowSize: number;
}

/** Largest q in [lo, hi] (step 0.01) whose output is ≤ target: hi first, then lo, then binary search. */
export async function searchQuality(encode: (q: number) => Promise<Uint8Array>, target: number, lo: number, hi: number): Promise<Search> {
  let tries = 1;
  let b = await encode(hi);
  if (b.length <= target) return { bytes: b, q: hi, tries, lowSize: 0 };
  tries++;
  b = await encode(lo);
  if (b.length > target) return { bytes: null, q: lo, tries, lowSize: b.length };
  let best = { bytes: b, q: lo };
  while (hi - lo > 0.01 + 1e-9) {
    const mid = round2((lo + hi) / 2);
    if (mid <= lo || mid >= hi) break;
    const m = await encode(mid);
    tries++;
    if (m.length <= target) {
      lo = mid;
      best = { bytes: m, q: mid };
    } else hi = mid;
  }
  return { ...best, tries, lowSize: 0 };
}

export async function fitToTarget(src: { width: number; height: number }, target: number, opts: FitOptions): Promise<FitResult | null> {
  const qMax = opts.qMax ?? Q_MAX;
  const qFloor = opts.qFloor ?? Q_FLOOR;
  const minEdge = opts.minLongEdge ?? MIN_LONG_EDGE;
  const allowDownscale = opts.allowDownscale ?? true;
  const long = Math.max(src.width, src.height);
  // Never scale below the minimum long edge (unless the source is already smaller).
  const minScale = Math.min(1, minEdge / long);
  let scale = 1;
  let rounds = 0;
  let tries = 0;
  for (;;) {
    rounds++;
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    const session = await opts.probe(w, h);
    try {
      const r = await searchQuality((q) => session.encode(q), target, qFloor, qMax);
      tries += r.tries;
      if (r.bytes) return { bytes: r.bytes, q: r.q, w, h, scale, rounds, tries };
      if (!allowDownscale) return null;
      if (scale <= minScale + 1e-9) {
        const r2 = await searchQuality((q) => session.encode(q), target, Q_LOWEST, qFloor);
        tries += r2.tries;
        return r2.bytes ? { bytes: r2.bytes, q: r2.q, w, h, scale, rounds, tries } : null;
      }
      scale = Math.max(minScale, scale * downscaleFactor(target, r.lowSize));
    } finally {
      session.release();
    }
  }
}

/** Next scale multiplier: bytes are roughly proportional to the pixel count at a fixed quality. */
export function downscaleFactor(target: number, lowSize: number): number {
  return Math.min(0.9, Math.sqrt(target / lowSize) * 0.97);
}

export interface FinalResult {
  bytes: Uint8Array;
  /** Integer quality. */
  q: number;
  tries: number;
}

/** Largest integer q in [lo, hi] whose output is ≤ target, or null when even lo is too big. */
export async function finalSearch<P>(
  pixels: P,
  target: number,
  opts: {
    encode(pixels: P, q: number): Promise<Uint8Array>;
    lo: number;
    hi: number;
    /** Try lo first (one encode decides when nothing fits; used where a miss is likely). */
    lowFirst?: boolean;
  },
): Promise<FinalResult | null> {
  let lo = Math.round(opts.lo);
  let hi = Math.round(opts.hi);
  if (lo > hi) return null;
  let tries = 0;
  let best: { bytes: Uint8Array; q: number } | null = null;
  if (opts.lowFirst) {
    tries++;
    const bottom = await opts.encode(pixels, lo);
    if (bottom.length > target) return null;
    best = { bytes: bottom, q: lo };
    if (lo === hi) return { ...best, tries };
  }
  tries++;
  const top = await opts.encode(pixels, hi);
  if (top.length <= target) return { bytes: top, q: hi, tries };
  if (!best) {
    if (lo === hi) return null;
    tries++;
    const bottom = await opts.encode(pixels, lo);
    if (bottom.length > target) return null;
    best = { bytes: bottom, q: lo };
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const m = await opts.encode(pixels, mid);
    tries++;
    if (m.length <= target) {
      lo = mid;
      best = { bytes: m, q: mid };
    } else hi = mid;
  }
  return { ...best, tries };
}
