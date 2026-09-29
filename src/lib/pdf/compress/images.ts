// Image pass (spike lib.mjs lines 205–386): decode → Lanczos3 to the target ppi → MozJPEG → SSIM gate
// → replace only if clearly smaller. Anything the rules below do not understand is left untouched.
import { PDFArray, PDFDict, PDFName, PDFRawStream, PDFRef, PDFStream } from '@cantoo/pdf-lib';
import type { PDFContext, PDFDocument, PDFObject } from '@cantoo/pdf-lib';
import type { CompressDeps } from './deps';
import type { Level } from './levels';
import { imagePlacements, lookup, nameOf, numberOf, type Placements } from './placements';
import { ssimImages } from './ssim';

const N = (s: string): PDFName => PDFName.of(s);

/** Why an image was left as it is. Counted per reason in the report. */
export type SkipReason =
  | 'smask-target'
  | 'small'
  | 'imagemask'
  | 'decode-array'
  | 'mask'
  | 'jpx'
  | 'ccitt'
  | 'jbig2'
  | 'filter'
  | 'cmyk'
  | 'indexed'
  | 'separation'
  | 'devicen'
  | 'lab'
  | 'colorspace'
  | 'bpc'
  | 'tiff-predictor'
  | 'not-raw'
  | 'decode-failed'
  | 'dim-mismatch'
  | 'short-data'
  | 'lineart'
  | 'ssim-gate'
  | 'no-gain';

export interface ImageStats {
  seen: number;
  replaced: number;
  skipped: Partial<Record<SkipReason, number>>;
  /** Lowest gate SSIM among replaced images; null when none was replaced. */
  minSsim: number | null;
}

interface ColorInfo {
  /** Components: 1 (gray) or 3 (RGB). */
  n: 1 | 3;
}

/** Colour spaces we can re-encode as JPEG; anything else is a skip reason. */
export function colorInfo(ctx: PDFContext, csObj: PDFObject | undefined): ColorInfo | { skip: SkipReason } {
  const cs = lookup(ctx, csObj);
  const nm = nameOf(cs);
  if (nm === 'DeviceGray' || nm === 'CalGray' || nm === 'G') return { n: 1 };
  if (nm === 'DeviceRGB' || nm === 'CalRGB' || nm === 'RGB') return { n: 3 };
  if (nm === 'DeviceCMYK' || nm === 'CMYK') return { skip: 'cmyk' };
  if (cs instanceof PDFArray) {
    const fam = nameOf(lookup(ctx, cs.get(0)));
    if (fam === 'ICCBased') {
      const s = lookup(ctx, cs.get(1));
      const n = s instanceof PDFStream ? numberOf(s.dict.get(N('N'))) : undefined;
      if (n === 1 || n === 3) return { n };
      return { skip: n === 4 ? 'cmyk' : 'colorspace' };
    }
    if (fam === 'CalRGB') return { n: 3 };
    if (fam === 'CalGray') return { n: 1 };
    if (fam === 'Indexed' || fam === 'I') return { skip: 'indexed' };
    if (fam === 'Separation') return { skip: 'separation' };
    if (fam === 'DeviceN') return { skip: 'devicen' };
    if (fam === 'Lab') return { skip: 'lab' };
  }
  return { skip: 'colorspace' };
}

function filtersOf(ctx: PDFContext, d: PDFDict): string[] {
  const f = lookup(ctx, d.get(N('Filter')));
  if (f instanceof PDFArray) return f.asArray().map((x) => nameOf(lookup(ctx, x)) ?? '?');
  return f ? [nameOf(f) ?? '?'] : [];
}

function predictorOf(ctx: PDFContext, d: PDFDict): number {
  const parms = lookup(ctx, d.get(N('DecodeParms')));
  return parms instanceof PDFDict ? (numberOf(parms.get(N('Predictor'))) ?? 1) : 1;
}

export interface Candidate {
  ref: PDFRef;
  obj: PDFRawStream;
  width: number;
  height: number;
  n: 1 | 3;
  kind: 'jpeg' | 'flate';
  /** Flate /DecodeParms /Predictor (1 = none, ≥ 10 = PNG). */
  predictor: number;
}

/**
 * The cheap checks, from the dictionary alone (no decoding): subtype, size, bytes, SMask target,
 * masks, filter and colour space. Returns a candidate or the reason it is skipped.
 */
export function cheapCheck(ctx: PDFContext, ref: PDFRef, obj: PDFRawStream, smaskTargets: Set<string>, level: Level): Candidate | SkipReason {
  const d = obj.dict;
  if (smaskTargets.has(ref.toString())) return 'smask-target';
  const width = numberOf(d.get(N('Width'))) ?? 0;
  const height = numberOf(d.get(N('Height'))) ?? 0;
  if (!width || !height || width * height < level.minPixels || obj.contents.length < level.minBytes) return 'small';
  if ((d.get(N('ImageMask')) as { asBoolean?: () => boolean } | undefined)?.asBoolean?.()) return 'imagemask';
  if (d.get(N('Decode'))) return 'decode-array';
  if (d.get(N('Mask'))) return 'mask';
  const filters = filtersOf(ctx, d);
  const only = filters.length === 1 ? filters[0] : null;
  if (filters.includes('JPXDecode')) return 'jpx';
  if (filters.includes('CCITTFaxDecode') || filters.includes('CCF')) return 'ccitt';
  if (filters.includes('JBIG2Decode')) return 'jbig2';
  if (only !== 'DCTDecode' && only !== 'FlateDecode') return 'filter';
  const ci = colorInfo(ctx, d.get(N('ColorSpace')));
  if ('skip' in ci) return ci.skip;
  let predictor = 1;
  if (only === 'FlateDecode') {
    if (numberOf(d.get(N('BitsPerComponent'))) !== 8) return 'bpc';
    predictor = predictorOf(ctx, d);
    if (predictor !== 1 && predictor < 10) return 'tiff-predictor';
  }
  return { ref, obj, width, height, n: ci.n, kind: only === 'DCTDecode' ? 'jpeg' : 'flate', predictor };
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  const buf = await new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}

/** Reverses PNG predictors (Predictor ≥ 10) for 8-bit samples. */
export function unpredictPng(data: Uint8Array, colors: number, columns: number): Uint8Array {
  const bpp = colors;
  const rowLen = colors * columns;
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  const prev = new Uint8Array(rowLen);
  for (let r = 0; r < rows; r++) {
    const ft = data[r * (rowLen + 1)];
    const src = data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1));
    const row = out.subarray(r * rowLen, (r + 1) * rowLen);
    for (let i = 0; i < rowLen; i++) {
      const a = i >= bpp ? row[i - bpp]! : 0;
      const b = prev[i]!;
      const c = i >= bpp ? prev[i - bpp]! : 0;
      let v = src[i]!;
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[i] = v & 255;
    }
    prev.set(row);
  }
  return out;
}

/** Decodes a candidate to RGBA. */
export async function decodeImage(c: Candidate, deps: CompressDeps): Promise<ImageData | SkipReason> {
  const raw = c.obj.contents;
  if (c.kind === 'jpeg') {
    let img: ImageData;
    try {
      img = await deps.jpegDecode(raw);
    } catch {
      return 'decode-failed';
    }
    return img.width === c.width && img.height === c.height ? img : 'dim-mismatch';
  }
  let data: Uint8Array;
  try {
    data = await inflate(raw);
  } catch {
    return 'decode-failed';
  }
  if (c.predictor >= 10) data = unpredictPng(data, c.n, c.width);
  const px = c.width * c.height;
  if (data.length < px * c.n) return 'short-data';
  const rgba = new Uint8ClampedArray(px * 4);
  for (let i = 0, j = 0; i < px; i++, j += c.n) {
    const k = i * 4;
    if (c.n === 1) rgba[k] = rgba[k + 1] = rgba[k + 2] = data[j]!;
    else {
      rgba[k] = data[j]!;
      rgba[k + 1] = data[j + 1]!;
      rgba[k + 2] = data[j + 2]!;
    }
    rgba[k + 3] = 255;
  }
  return new ImageData(rgba, c.width, c.height);
}

/** True if every sampled pixel has R≈G≈B (±6), so the JPEG can be 1-channel gray. */
export function isGray(img: ImageData): boolean {
  const d = img.data;
  const step = Math.max(4, Math.floor(d.length / 4 / 200000) * 4);
  for (let i = 0; i < d.length; i += step) {
    if (Math.abs(d[i]! - d[i + 1]!) > 6 || Math.abs(d[i + 1]! - d[i + 2]!) > 6) return false;
  }
  return true;
}

/** Distinct colours among sampled pixels, stopping just above `cap`. */
export function uniqueColors(img: ImageData, cap = 4096): number {
  const d = img.data;
  const set = new Set<number>();
  const step = Math.max(4, Math.floor(d.length / 4 / 100000) * 4);
  for (let i = 0; i < d.length; i += step) {
    set.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
    if (set.size > cap) break;
  }
  return set.size;
}

/** Flate images with fewer colours than this are line art (logos, charts, screenshots): JPEG would ring. */
export const LINEART_COLORS = 2048;

const KEEP_KEYS = ['SMask', 'Intent', 'Interpolate', 'OC', 'Metadata', 'SMaskInData', 'StructParent'];

export interface ImagePassHooks {
  /** Called once per candidate image. */
  onImage?: (done: number, total: number) => void;
  /** Placement parser (a seam for tests). */
  placements?: (doc: PDFDocument) => Placements;
}

export async function recompressImages(doc: PDFDocument, level: Level, deps: CompressDeps, hooks: ImagePassHooks = {}): Promise<ImageStats> {
  const ctx = doc.context;
  const stats: ImageStats = { seen: 0, replaced: 0, skipped: {}, minSsim: null };
  const skip = (why: SkipReason): void => {
    stats.skipped[why] = (stats.skipped[why] ?? 0) + 1;
  };

  const smaskTargets = new Set<string>();
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    const sm = obj instanceof PDFStream ? obj.dict.get(N('SMask')) : null;
    if (sm instanceof PDFRef) smaskTargets.add(sm.toString());
  }

  const candidates: Candidate[] = [];
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFStream) || nameOf(obj.dict.get(N('Subtype'))) !== 'Image') continue;
    stats.seen++;
    if (!(obj instanceof PDFRawStream)) {
      skip('not-raw');
      continue;
    }
    const r = cheapCheck(ctx, ref, obj, smaskTargets, level);
    if (typeof r === 'string') skip(r);
    else candidates.push(r);
  }
  // The placement parse was the spike's hotspot (17–25 s on text-heavy bundles): only when needed.
  if (!candidates.length) return stats;

  const { place } = (hooks.placements ?? imagePlacements)(doc);
  const pageMax = doc.getPages().reduce((m, p) => Math.max(m, p.getWidth(), p.getHeight()), 0);

  for (let ci = 0; ci < candidates.length; ci++) {
    const c = candidates[ci]!;
    hooks.onImage?.(ci + 1, candidates.length);
    const decoded = await decodeImage(c, deps);
    if (typeof decoded === 'string') {
      skip(decoded);
      continue;
    }
    let img = decoded;
    if (c.kind === 'flate' && uniqueColors(img) < LINEART_COLORS) {
      skip('lineart');
      continue;
    }
    // Displayed size in points; never drawn in any parsed content → the largest page (conservative).
    const pl = place.get(c.ref.toString());
    const dispW = pl ? pl.w : pageMax;
    const dispH = pl ? pl.h : pageMax;
    const ppi = Math.min(c.width / (dispW / 72), c.height / (dispH / 72));
    let tw = c.width;
    let th = c.height;
    if (ppi > level.triggerPpi) {
      const s = level.targetPpi / ppi;
      tw = Math.max(16, Math.round(c.width * s));
      th = Math.max(16, Math.round(c.height * s));
    }
    if (tw !== c.width || th !== c.height) img = await deps.resize(img, tw, th);
    const gray = c.n === 1 || isGray(img);

    let q = level.q;
    let enc: Uint8Array = new Uint8Array();
    let ssim = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      enc = await deps.jpegEncode(img, { quality: q, gray });
      ssim = ssimImages(img, await deps.jpegDecode(enc));
      if (ssim >= level.minSsim) break;
      q = Math.min(95, q + 10);
    }
    if (ssim < level.minSsim) {
      skip('ssim-gate');
      continue;
    }
    if (enc.length > c.obj.contents.length * (1 - level.minGain)) {
      skip('no-gain');
      continue;
    }

    const nd = ctx.obj({ Type: 'XObject', Subtype: 'Image', Width: tw, Height: th, BitsPerComponent: 8, Filter: 'DCTDecode' });
    const cs = c.obj.dict.get(N('ColorSpace'));
    if (gray && c.n === 3) nd.set(N('ColorSpace'), N('DeviceGray'));
    else if (cs) nd.set(N('ColorSpace'), cs);
    for (const k of KEEP_KEYS) {
      const v = c.obj.dict.get(N(k));
      if (v) nd.set(N(k), v);
    }
    ctx.assign(c.ref, PDFRawStream.of(nd, enc));
    stats.replaced++;
    stats.minSsim = stats.minSsim === null ? ssim : Math.min(stats.minSsim, ssim);
  }
  return stats;
}
