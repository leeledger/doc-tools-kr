// Photo compression engine (brief Step 3 §2, Flow steps 2–6). Framework-free: the browser worker injects
// createImageBitmap/OffscreenCanvas and the jSquash codecs; Node tests inject real or fake encoders.
import { finalSearch, fitToTarget } from './fit';
import { stripJpegMetadata } from './jpeg-strip';
import { PhotoError } from './messages';
import { hasTransparency } from './raster';
import type { PhotoPhase, PhotoReport } from './report';
import { orientedSize, type Sniff } from './sniff';

export type PhotoMode = 'target' | 'percent' | 'quality';
export type PhotoFormat = 'jpeg' | 'webp';

export interface PhotoOptions {
  mode: PhotoMode;
  /** target mode: the byte limit (KB × 1000). */
  targetBytes?: number;
  /** percent mode: 10–90. */
  percent?: number;
  /** quality mode: 10–95. */
  quality?: number;
  /** Max long edge in px (never upscales); null or undefined = keep. */
  maxLongEdge?: number | null;
  format: PhotoFormat;
  /** 빠른 모드: the canvas probe result is final (JPEG only). */
  fast: boolean;
  /** Mobile working cap on the decoded long edge. */
  workingLongEdge?: number | null;
}

export interface Decoded<Src> {
  src: Src;
  /** Oriented size of the decoded source (after the working cap). */
  width: number;
  height: number;
  /** Oriented size before the working cap. */
  sourceWidth: number;
  sourceHeight: number;
  /** The working cap reduced the size on decode. */
  capped: boolean;
  close(): void;
}

export interface PhotoDeps<Src, Canvas> {
  decode(bytes: Uint8Array, sniff: Sniff, opts: { maxLongEdge: number | null }): Promise<Decoded<Src>>;
  toCanvas(src: Src, w: number, h: number, opts: { flatten: boolean }): Canvas;
  pixels(canvas: Canvas): ImageData;
  release(canvas: Canvas): void;
  /** Browser canvas JPEG at q 0–1. */
  canvasJpeg(canvas: Canvas, q: number): Promise<Uint8Array>;
  /** Decodes the output and returns its size (the post-encode check). */
  measure(bytes: Uint8Array, mime: string): Promise<{ width: number; height: number }>;
  /** Baseline MozJPEG at integer q. Throws when the codec cannot load. */
  mozjpeg?(img: ImageData, q: number): Promise<Uint8Array>;
  /** Lanczos3. */
  resize?(img: ImageData, w: number, h: number, opts: { premultiply: boolean }): Promise<ImageData>;
  /** jSquash WebP at integer q. */
  webp?(img: ImageData, q: number): Promise<Uint8Array>;
  /**
   * Luma SSIM of an encoded candidate against the working source, both at long edge ≤ 1024 (the spike's
   * quickScore). Used to choose between the full-size and the downscaled MozJPEG result.
   */
  quickScore?(src: Src, bytes: Uint8Array): Promise<number>;
}

export interface PhotoResult {
  /** Null when the row is kept (nothing to download). */
  bytes: Uint8Array | null;
  mime: 'image/jpeg' | 'image/webp';
  report: PhotoReport;
}

export interface EngineHooks<Src> {
  onPhase?(phase: PhotoPhase): void;
  /** Called once with the working source when the mobile cap applied (the page's compare view needs it). */
  onCapped?(src: Src, width: number, height: number): Promise<void>;
}

/** A result at least this fraction of the input is not smaller (percent and quality modes). */
export const KEEP_RATIO = 0.99;
/** MozJPEG final search window around the canvas probe's q (×100). */
export const FINAL_Q_BELOW = 5;
export const FINAL_Q_ABOVE = 20;
export const FINAL_Q_MIN = 50;
export const FINAL_Q_MAX = 95;
export const WEBP_Q_MIN = 50;
export const WEBP_Q_MAX = 95;
export const WEBP_SCALE_ROUNDS = 5;
/** Scale re-search: the full size wins unless the downscaled score is higher by more than this. */
export const RESEARCH_TIE = 0.002;
/** Long edge of the re-search score. */
export const QUICK_SCORE_EDGE = 1024;

/** Size of the re-search score images: long edge ≤ QUICK_SCORE_EDGE. */
export function quickScoreSize(w: number, h: number): { width: number; height: number } {
  const s = Math.min(1, QUICK_SCORE_EDGE / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

/** EXIF, XMP or GPS, or an orientation that has to be baked in: the original must not be recommended as is. */
export function hasPrivateData(s: Sniff): boolean {
  return s.hasExif || s.hasXmp || s.hasGps || (s.orientation ?? 1) > 1;
}

/** The byte target of a run, or null in quality mode. */
export function targetBytes(o: PhotoOptions, inBytes: number): number | null {
  if (o.mode === 'target') return o.targetBytes ?? null;
  if (o.mode === 'percent') return Math.floor((inBytes * (o.percent ?? 50)) / 100);
  return null;
}

/** Long-edge scale to fit `max` (never above 1). */
export function edgeScale(w: number, h: number, max: number | null | undefined): number {
  return max ? Math.min(1, max / Math.max(w, h)) : 1;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export async function compressPhoto<Src, Canvas>(
  input: { bytes: Uint8Array; sniff: Sniff },
  o: PhotoOptions,
  deps: PhotoDeps<Src, Canvas>,
  hooks: EngineHooks<Src> = {},
): Promise<PhotoResult> {
  const { bytes, sniff } = input;
  const inBytes = bytes.length;
  const target = targetBytes(o, inBytes);
  const mime = o.format === 'webp' ? ('image/webp' as const) : ('image/jpeg' as const);
  const oriented = orientedSize(sniff);
  const ms = { decode: 0, search: 0, final: 0 };
  const base = {
    inBytes,
    format: o.format,
    cmykConverted: false,
    flattened: false,
    scaled: false,
    mobileCapped: false,
    mozjpegFallback: false,
    gpsRemoved: sniff.hasGps,
    exifRemoved: sniff.hasExif || sniff.hasXmp,
    kept: false,
    resaved: false,
  };

  // The lossless path: an upright, non-CMYK JPEG within the max long edge, when JPG output was asked for.
  const strippable =
    o.format === 'jpeg' &&
    sniff.format === 'jpeg' &&
    (sniff.orientation === undefined || sniff.orientation === 1) &&
    !sniff.cmyk &&
    oriented !== null &&
    edgeScale(oriented.width, oriented.height, o.maxLongEdge) === 1;
  const stripped = (): PhotoResult | null => {
    if (!strippable) return null;
    try {
      const out = stripJpegMetadata(bytes);
      const report: PhotoReport = {
        ...base,
        outBytes: out.length,
        inW: oriented!.width,
        inH: oriented!.height,
        outW: oriented!.width,
        outH: oriented!.height,
        format: 'jpeg',
        q: null,
        encoder: 'stripped',
        ms,
      };
      return { bytes: out, mime: 'image/jpeg', report };
    } catch {
      return null;
    }
  };

  // Flow step 2: already within the target (Arch, Step 3 round 1b).
  // - Nothing to remove (the lossless strip changes no byte): keep the original.
  // - An upright JPEG with metadata: the lossless strip.
  // - Otherwise re-encode (orientation, EXIF/GPS in another format, CMYK, PNG…); never above the target.
  let resaved = false;
  if (o.mode === 'target' && target !== null && inBytes <= target) {
    const r = stripped();
    if (r && r.bytes!.length === inBytes) {
      return { bytes: null, mime: 'image/jpeg', report: { ...r.report, outBytes: inBytes, encoder: 'original', kept: true } };
    }
    if (r) return r;
    resaved = hasPrivateData(sniff);
  }

  // Flow step 1 (decode) and 3 (raster).
  hooks.onPhase?.('decode');
  let t = now();
  const d = await deps.decode(bytes, sniff, { maxLongEdge: o.workingLongEdge ?? null });
  const canvases: Canvas[] = [];
  const hold = (c: Canvas): Canvas => {
    canvases.push(c);
    return c;
  };
  try {
    const W = d.width;
    const H = d.height;
    if (d.capped) await hooks.onCapped?.(d.src, W, H);
    const s0 = edgeScale(W, H, o.maxLongEdge);
    const w0 = Math.max(1, Math.round(W * s0));
    const h0 = Math.max(1, Math.round(H * s0));

    // Full-resolution pixels (lanczos source), made once and only when needed.
    let full: ImageData | null = null;
    let flatten = false;
    const fullPixels = (): ImageData => {
      if (!full) {
        const c = deps.toCanvas(d.src, W, H, { flatten });
        full = deps.pixels(c);
        deps.release(c);
      }
      return full;
    };
    if (o.format === 'jpeg' && sniff.alphaPossible) {
      // Flatten only when the pixels really are transparent (an opaque RGBA PNG gets no note).
      flatten = hasTransparency(fullPixels());
      if (flatten) full = null;
    }
    const alpha = o.format === 'webp' && sniff.alphaPossible;
    const pixelsAt = async (w: number, h: number): Promise<ImageData> => {
      if (w === W && h === H) return fullPixels();
      if (deps.resize) return deps.resize(fullPixels(), w, h, { premultiply: alpha });
      const c = deps.toCanvas(d.src, w, h, { flatten });
      const img = deps.pixels(c);
      deps.release(c);
      return img;
    };
    ms.decode = Math.round(now() - t);

    let out: Uint8Array;
    let q: number;
    let encoder: PhotoReport['encoder'];
    let outW = w0;
    let outH = h0;
    let mozjpegFallback = false;
    let scaled = false;

    if (target === null) {
      // Quality mode: one encode at the max-long-edge size, no size guarantee.
      hooks.onPhase?.('final');
      t = now();
      const qq = Math.round(o.quality ?? 80);
      if (o.format === 'webp') {
        if (!deps.webp) throw new PhotoError('unknown', 'webp codec missing');
        out = await deps.webp(await pixelsAt(w0, h0), qq);
        q = qq;
        encoder = 'webp';
      } else {
        const moz = o.fast ? null : await tryMozjpeg(deps, () => pixelsAt(w0, h0), qq);
        if (moz) {
          out = moz;
          q = qq;
          encoder = 'mozjpeg';
        } else {
          mozjpegFallback = !o.fast;
          const c = hold(deps.toCanvas(d.src, w0, h0, { flatten }));
          q = qq / 100;
          out = await deps.canvasJpeg(c, q);
          encoder = 'canvas';
        }
      }
      ms.final = Math.round(now() - t);
    } else {
      // Target and percent modes: the canvas-JPEG probe picks the size, then the final encoder.
      hooks.onPhase?.('search');
      t = now();
      const fit = await fitToTarget({ width: w0, height: h0 }, target, {
        probe: async (w, h) => {
          const c = deps.toCanvas(d.src, w, h, { flatten });
          return { encode: (qq) => deps.canvasJpeg(c, qq), release: () => deps.release(c) };
        },
      });
      ms.search = Math.round(now() - t);
      if (!fit) throw new PhotoError('target-unreachable');
      hooks.onPhase?.('final');
      t = now();
      outW = fit.w;
      outH = fit.h;
      scaled = fit.scale < 1;
      if (o.format === 'webp') {
        if (!deps.webp) throw new PhotoError('unknown', 'webp codec missing');
        const webp = deps.webp;
        let found: { bytes: Uint8Array; q: number } | null = null;
        for (let round = 0; round <= WEBP_SCALE_ROUNDS && !found; round++) {
          if (round > 0) {
            outW = Math.max(1, Math.round(outW * 0.9));
            outH = Math.max(1, Math.round(outH * 0.9));
            scaled = true;
          }
          found = await finalSearch(await pixelsAt(outW, outH), target, { encode: webp, lo: WEBP_Q_MIN, hi: WEBP_Q_MAX });
        }
        if (!found) throw new PhotoError('target-unreachable');
        out = found.bytes;
        q = found.q;
        encoder = 'webp';
      } else if (o.fast) {
        out = fit.bytes;
        q = fit.q;
        encoder = 'canvas';
      } else {
        const qc = Math.round(fit.q * 100);
        const lo = Math.max(FINAL_Q_MIN, qc - FINAL_Q_BELOW);
        const hi = Math.min(FINAL_Q_MAX, qc + FINAL_Q_ABOVE);
        let final: { bytes: Uint8Array; q: number } | null = null;
        try {
          if (!deps.mozjpeg) throw new Error('mozjpeg missing');
          const moz = deps.mozjpeg;
          const down = async () => finalSearch(await pixelsAt(fit.w, fit.h), target, { encode: moz, lo, hi });
          // MozJPEG-driven scale re-search: when the canvas probe downscaled, MozJPEG may still fit the
          // full size at q ≥ the floor. If both candidates exist, the higher 1024-px SSIM wins (a tie within
          // RESEARCH_TIE goes to the full size); without a scorer the full size wins.
          if (fit.scale < 1) {
            const whole = await finalSearch(await pixelsAt(w0, h0), target, { encode: moz, lo: FINAL_Q_MIN, hi: FINAL_Q_MAX, lowFirst: true });
            if (whole) {
              const score = deps.quickScore;
              const small = score ? await down() : null;
              let pickSmall = false;
              if (score && small) {
                // A scorer failure keeps the full-size MozJPEG result (the no-scorer behaviour); it must not
                // fall through to the canvas fallback and its note.
                try {
                  const wholeScore = await score(d.src, whole.bytes);
                  const smallScore = await score(d.src, small.bytes);
                  pickSmall = smallScore > wholeScore + RESEARCH_TIE;
                } catch (err) {
                  if (err instanceof RangeError) throw err;
                  pickSmall = false;
                }
              }
              if (pickSmall) final = small;
              else {
                final = whole;
                outW = w0;
                outH = h0;
                scaled = false;
              }
            }
          }
          final ??= await down();
        } catch (err) {
          if (err instanceof RangeError) throw err;
          mozjpegFallback = true;
        }
        if (final) {
          out = final.bytes;
          q = final.q;
          encoder = 'mozjpeg';
        } else {
          // MozJPEG cannot fit at q ≥ the lower bound (or failed): the canvas probe result is final.
          outW = fit.w;
          outH = fit.h;
          scaled = fit.scale < 1;
          out = fit.bytes;
          q = fit.q;
          encoder = 'canvas';
        }
      }
      ms.final = Math.round(now() - t);
    }

    // Flow step 6: never hand out an over-target or mis-sized file.
    if (target !== null && out.length > target) throw new PhotoError('unknown', 'encoder exceeded the target');
    const dims = await deps.measure(out, mime);
    if (dims.width !== outW || dims.height !== outH) throw new PhotoError('verify');

    const inW = oriented ? oriented.width : d.sourceWidth;
    const inH = oriented ? oriented.height : d.sourceHeight;
    // Kept rule (percent and quality modes). A result the max long edge resized is always offered: the
    // pixel size is what was asked for. Privacy first (Arch, round 2): never tell the user to keep an
    // original that still carries EXIF/XMP/GPS or an orientation to bake in. Such a file gets the lossless
    // strip when possible, otherwise the re-encoded result with the re-saved note.
    if (target === null || o.mode === 'percent') {
      if (out.length >= KEEP_RATIO * inBytes && s0 === 1 && !d.capped) {
        const r = stripped();
        if (r && r.bytes!.length < inBytes) return r;
        if (!hasPrivateData(sniff)) {
          return {
            bytes: null,
            mime,
            report: { ...base, outBytes: inBytes, inW, inH, outW: inW, outH: inH, q: null, encoder, kept: true, ms },
          };
        }
        resaved = true;
      }
    }
    const report: PhotoReport = {
      ...base,
      outBytes: out.length,
      inW,
      inH,
      outW,
      outH,
      q,
      encoder,
      scaled,
      flattened: flatten,
      cmykConverted: sniff.cmyk,
      mobileCapped: d.capped,
      mozjpegFallback,
      resaved,
      ms,
    };
    return { bytes: out, mime, report };
  } finally {
    for (const c of canvases) deps.release(c);
    d.close();
  }
}

/** One MozJPEG encode; null when the codec is missing or fails (the caller falls back to the canvas). */
async function tryMozjpeg<Src, Canvas>(deps: PhotoDeps<Src, Canvas>, pixels: () => Promise<ImageData>, q: number): Promise<Uint8Array | null> {
  if (!deps.mozjpeg) return null;
  try {
    return await deps.mozjpeg(await pixels(), q);
  } catch (err) {
    if (err instanceof RangeError) throw err;
    return null;
  }
}
