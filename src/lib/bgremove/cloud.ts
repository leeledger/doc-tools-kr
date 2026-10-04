// 배경 지우기 cloud client (C2-cloud, brief handoff/ARCHITECT-BRIEF-C2-CLOUD.md §3, §4, §6). Loaded by the page
// controller after a photo is picked, and only in a build with the cloud path on (__BG_CLOUD__).
//
// work copy -> copy at long edge <= 1024 (the model's own size), JPEG q0.9 through a canvas (EXIF/GPS never survive a
// canvas; checked again before sending) -> one POST /api/remove-bg (same origin, no cookies) per press, never retried
// here -> RGBA WebP (lossless, 256 alpha levels: spike-2) -> its alpha only, as a float mask; the page scales it up
// and runs its own blur-fusion on the full-size work copy, so the colours always come from the device.
import { capSize } from '../image/decode';
import { sniffImage } from '../image/sniff';

export const API_PATH = '/api/remove-bg';
/** Long edge of the copy that is sent (brief §3: the model runs at 1024). */
export const SEND_EDGE = 1024;
export const JPEG_QUALITY = 0.9;
/** Brief §4: the client gives up after 30 s. */
export const TIMEOUT_MS = 30_000;
/** The Function refuses bodies over 2,000,000 bytes (413); a 1024 px JPEG q0.9 is ~150-300 KB. */
export const MAX_SEND_BYTES = 2_000_000;

export type CloudFailure = 'busy' | 'quota' | 'failed';
export type CloudResult = { ok: true; blob: Blob } | { ok: false; why: CloudFailure | 'aborted' };

/** The JPEG segment markers up to the first scan. */
function jpegMarkers(b: Uint8Array): number[] {
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

/** A JPEG with no APP1 segment (EXIF, XMP, GPS): the only thing the page may send. */
export function isCleanJpeg(bytes: Uint8Array): boolean {
  const s = sniffImage(bytes);
  return s.format === 'jpeg' && !s.hasExif && !s.hasXmp && !s.hasGps && !jpegMarkers(bytes).includes(0xe1);
}

export interface Canvas2d {
  canvas: { width: number; height: number; toBlob(cb: (b: Blob | null) => void, type?: string, quality?: number): void };
  g: Pick<CanvasRenderingContext2D, 'drawImage' | 'fillRect'> & { fillStyle: unknown; imageSmoothingEnabled: boolean; imageSmoothingQuality: ImageSmoothingQuality };
}

export interface Copy {
  /** Exactly the bytes that were checked, and that are sent. */
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
}

/**
 * The copy that is sent: the work picture at long edge <= 1024 on white (a transparent PNG has no colour behind it),
 * as JPEG q0.9. Null when the canvas cannot make it, when it is too big, or when it would carry an APP1 segment.
 */
export async function makeCopy(src: CanvasImageSource & { width: number; height: number }, create: (w: number, h: number) => Canvas2d | null): Promise<Copy | null> {
  const { width, height } = capSize(src.width, src.height, SEND_EDGE);
  const k = create(width, height);
  if (!k) return null;
  k.g.fillStyle = '#FFFFFF';
  k.g.fillRect(0, 0, width, height);
  k.g.imageSmoothingEnabled = true;
  k.g.imageSmoothingQuality = 'high';
  k.g.drawImage(src, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      k.canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    } catch {
      resolve(null);
    }
  });
  k.canvas.width = 0;
  k.canvas.height = 0;
  if (!blob || blob.size === 0 || blob.size > MAX_SEND_BYTES) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!isCleanJpeg(bytes)) return null;
  return { bytes, width, height };
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** What an answer means for the page (brief §4 error table). */
export async function readAnswer(res: Response): Promise<CloudResult> {
  if (res.status === 200 && (res.headers.get('content-type') ?? '').startsWith('image/webp')) return { ok: true, blob: await res.blob() };
  if (res.status === 429) return { ok: false, why: 'busy' };
  if (res.status === 503) {
    const body = await res.text().catch(() => '');
    if (/"error"\s*:\s*"quota"|9422/.test(body)) return { ok: false, why: 'quota' };
  }
  return { ok: false, why: 'failed' };
}

/**
 * One request. `signal`: the page's 취소 / new photo. A timeout (30 s), a network error or a broken answer is
 * 'failed'; nothing is retried here, because each try costs one of the month's free transformations.
 */
export async function requestCutout(copy: Uint8Array<ArrayBuffer>, signal: AbortSignal, fetcher: FetchLike = (u, i) => fetch(u, i), timeoutMs = TIMEOUT_MS): Promise<CloudResult> {
  const ctl = new AbortController();
  const stop = (): void => ctl.abort();
  signal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(stop, timeoutMs);
  try {
    const res = await fetcher(API_PATH, {
      method: 'POST',
      body: copy,
      headers: { 'Content-Type': 'image/jpeg' },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: ctl.signal,
    });
    return await readAnswer(res);
  } catch {
    return { ok: false, why: signal.aborted ? 'aborted' : 'failed' };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }
}

/** The alpha channel of straight RGBA as a 0..1 mask. */
export function alphaMask(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const n = width * height;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rgba[i * 4 + 3]! / 255;
  return out;
}

/** The answer must be the copy's shape (the Images binding keeps the input size; 2 % slack for rounding). */
export function sameShape(sw: number, sh: number, rw: number, rh: number): boolean {
  return rw > 0 && rh > 0 && Math.abs(sw / sh - rw / rh) <= 0.02 * (sw / sh);
}

export interface Mask {
  mask: Float32Array;
  width: number;
  height: number;
}

/** Decodes the answer and keeps its alpha. Null when it is not a picture of the copy's shape. */
export async function decodeAlpha(blob: Blob, copy: { width: number; height: number }): Promise<Mask | null> {
  let bm: ImageBitmap | null = null;
  try {
    bm = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const { width, height } = bm;
    if (!sameShape(copy.width, copy.height, width, height)) return null;
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(bm, 0, 0);
    const px = g.getImageData(0, 0, width, height).data;
    c.width = 0;
    c.height = 0;
    return { mask: alphaMask(px, width, height), width, height };
  } catch {
    return null;
  } finally {
    bm?.close();
  }
}
