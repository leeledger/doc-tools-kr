// Exact-size JPEG for 여권·증명사진 (brief Step 4 §2, "encode worker"). Pure, with the encoders injected, so
// Node tests run the real MozJPEG. The pixels already have the output size: this never scales.
// MozJPEG baseline, integer q 50–95, the largest q whose file fits the limit (Step 3 finalSearch). If MozJPEG
// cannot load, the canvas encoder runs the same search (q 0.50–0.95) and the result says `fallback`.
// Every result is verified before it is offered: exact pixel size, ≤ limit, SOF0 (baseline), no APP1 (no
// EXIF/XMP), JFIF units 1 with the preset dpi. A file that fails is discarded, never handed out.
import { finalSearch } from '../image/fit';
import { readJfif, setJfifDpi } from '../image/jfif';
import { sniffImage } from '../image/sniff';
import { isEngineLoadFailure } from '../ui/engine-load';

export const Q_MIN = 50;
export const Q_MAX = 95;

export interface EncodeSpec {
  outW: number;
  outH: number;
  /** Bytes (already × 1000, −1 for 미만); undefined = no limit. */
  limitBytes?: number;
  dpi: number;
}

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface EncodeDeps<P extends Pixels = Pixels> {
  /** MozJPEG at integer quality; rejects (EngineLoadError) when the codec cannot load. */
  mozjpeg(img: P, q: number): Promise<Uint8Array>;
  /** Canvas JPEG at quality 0–1; only used when MozJPEG cannot load. */
  canvas(img: P, q: number): Promise<Uint8Array>;
}

export interface EncodeResult {
  bytes: Uint8Array;
  q: number;
  fallback: boolean;
}

export type EncodeErrorCode = 'unreachable' | 'verify' | 'engine';

export class EncodeError extends Error {
  constructor(
    readonly code: EncodeErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'EncodeError';
  }
}

/** The JPEG markers before the first SOS (segment walk; bounds-checked). */
export function jpegMarkers(b: Uint8Array): number[] {
  const out: number[] = [];
  let i = 2;
  while (i + 3 < b.length && b[i] === 0xff) {
    const m = b[i + 1]!;
    out.push(m);
    if (m === 0xda || m === 0xd9) break;
    i += 2 + ((b[i + 2]! << 8) | b[i + 3]!);
  }
  return out;
}

const SOF = (m: number): boolean => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

/** Problems of an output file against the spec (empty = valid). */
export function verifyOutput(bytes: Uint8Array, spec: EncodeSpec): string[] {
  const e: string[] = [];
  const s = sniffImage(bytes);
  if (s.format !== 'jpeg') return ['not a JPEG'];
  if (s.width !== spec.outW || s.height !== spec.outH) e.push(`size ${s.width}×${s.height}, expected ${spec.outW}×${spec.outH}`);
  if (spec.limitBytes !== undefined && bytes.length > spec.limitBytes) e.push(`${bytes.length} B over the limit ${spec.limitBytes} B`);
  const markers = jpegMarkers(bytes);
  const sof = markers.find(SOF);
  if (sof !== 0xc0) e.push(`first SOF is ${sof === undefined ? 'missing' : `FF${sof.toString(16).toUpperCase()}`}, expected SOF0`);
  if (markers.includes(0xe1) || s.hasExif || s.hasXmp || s.hasGps) e.push('APP1 (EXIF/XMP) present');
  if (s.truncated) e.push('truncated');
  let jfif: ReturnType<typeof readJfif> = null;
  try {
    jfif = readJfif(bytes);
  } catch {
    jfif = null;
  }
  if (!jfif || jfif.units !== 1 || jfif.x !== spec.dpi || jfif.y !== spec.dpi) e.push(`JFIF density ${jfif ? `${jfif.units}/${jfif.x}/${jfif.y}` : 'missing'}, expected 1/${spec.dpi}/${spec.dpi}`);
  return e;
}

/** The encoder output with the JFIF density set (so the size the search compares is the size shipped). */
async function patched(bytes: Promise<Uint8Array>, dpi: number): Promise<Uint8Array> {
  const b = await bytes;
  try {
    return setJfifDpi(b, dpi);
  } catch {
    throw new EncodeError('verify', 'encoder output is not a JPEG');
  }
}

export async function encodeIdPhoto<P extends Pixels>(img: P, spec: EncodeSpec, deps: EncodeDeps<P>): Promise<EncodeResult> {
  if (img.width !== spec.outW || img.height !== spec.outH) throw new EncodeError('verify', 'pixels are not the output size');
  const limit = spec.limitBytes ?? Number.POSITIVE_INFINITY;
  // A tight limit (custom 10 KB at 2,000 px) usually fails at q 50: one encode decides.
  const lowFirst = spec.limitBytes !== undefined && spec.limitBytes < 20_000;
  let fallback = false;
  let found: { bytes: Uint8Array; q: number } | null;
  try {
    found = await finalSearch(img, limit, { encode: (p, q) => patched(deps.mozjpeg(p, q), spec.dpi), lo: Q_MIN, hi: Q_MAX, lowFirst });
  } catch (err) {
    if (err instanceof EncodeError) throw err;
    if (!isEngineLoadFailure(err)) throw new EncodeError('verify', String((err as Error)?.message ?? err));
    fallback = true;
    try {
      found = await finalSearch(img, limit, { encode: (p, q) => patched(deps.canvas(p, q / 100), spec.dpi), lo: Q_MIN, hi: Q_MAX, lowFirst });
    } catch (err2) {
      if (err2 instanceof EncodeError) throw err2;
      throw new EncodeError('engine', String((err2 as Error)?.message ?? err2));
    }
  }
  if (!found) throw new EncodeError('unreachable');
  const problems = verifyOutput(found.bytes, spec);
  if (problems.length) throw new EncodeError('verify', problems.join('; '));
  return { bytes: found.bytes, q: found.q, fallback };
}
