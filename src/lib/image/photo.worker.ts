// Module worker for 사진 용량 줄이기. Created when "사진 용량 줄이기" is pressed; items run one at a time.
// Everything heavy (decode, canvases, MozJPEG, resize, WebP) happens here. Cancel = worker.terminate().
// File objects arrive structured-cloned (no byte copy); results go back as transferred buffers.
import type { Device } from '../ui/device';
import { checkDims, LIMITS } from '../../tools/photo-compress/limits';
import { loadMozjpegEncoder, loadResize, loadWebpEncoder } from '../codecs/wasm-browser';
import { decodeImage } from './decode';
import { compressPhoto, quickScoreSize, type PhotoDeps, type PhotoOptions } from './engine';
import { PhotoError, photoErrorCode, type PhotoErrorCode } from './messages';
import { canvasPixels, releaseCanvas, toCanvas } from './raster';
import type { PhotoPhase, PhotoReport } from './report';
import { sniffImage } from './sniff';
import { ssim } from './ssim';

export interface PhotoItem {
  id: number;
  file: Blob;
}

export type PhotoRequest =
  | { type: 'run'; items: PhotoItem[]; options: Omit<PhotoOptions, 'workingLongEdge'>; device: Device }
  /** Preload (Polish P.7): compile MozJPEG and resize (not WebP), then answer warm-done. */
  | { type: 'warm' };

/** The answer to `warm` (separate from the run messages). */
export type PhotoWarmResponse = { type: 'warm-done' } | { type: 'error'; code: 'engine' };

export type PhotoResponse =
  | { type: 'item-phase'; id: number; phase: PhotoPhase }
  | {
      type: 'item-done';
      id: number;
      /** Null when the row is kept (not smaller; nothing to download). */
      bytes: Uint8Array | null;
      mime: string;
      thumb: Uint8Array | null;
      /** The working bitmap as JPEG, only when the mobile cap applied (the compare view's 원본). */
      sourcePreview?: Uint8Array;
      report: PhotoReport;
    }
  | { type: 'item-error'; id: number; code: PhotoErrorCode; width?: number; height?: number }
  | { type: 'run-done' };

interface WorkerScope {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((ev: MessageEvent<PhotoRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const post = (msg: PhotoResponse, transfer: Transferable[] = []): void => scope.postMessage(msg, transfer);

const THUMB_EDGE = 160;
const THUMB_Q = 0.8;
const PREVIEW_Q = 0.92;
/** The squoosh_resize method index of Lanczos3. */
const LANCZOS3 = 3;

async function blobBytes(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await b.arrayBuffer());
}

async function canvasJpeg(c: OffscreenCanvas, q: number): Promise<Uint8Array> {
  return blobBytes(await c.convertToBlob({ type: 'image/jpeg', quality: q }));
}

/** A small JPEG of `src` with long edge ≤ `edge`. */
async function snapshot(src: CanvasImageSource, w: number, h: number, edge: number, q: number): Promise<Uint8Array> {
  const s = Math.min(1, edge / Math.max(w, h));
  const c = toCanvas(src, Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), { flatten: true });
  try {
    return await canvasJpeg(c, q);
  } finally {
    releaseCanvas(c);
  }
}

/** A codec that failed to load is an engine error, never a file error (MozJPEG alone falls back to the canvas). */
function engineLoad(err: unknown): never {
  throw new PhotoError('engine', String((err as Error)?.message ?? err));
}

class TooLarge extends PhotoError {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    super('too-large');
  }
}

/** `src` drawn at (w, h) on white (the JPG output is opaque), as RGBA. */
function drawPixels(src: CanvasImageSource, w: number, h: number): ImageData {
  const c = toCanvas(src, w, h, { flatten: true });
  const img = canvasPixels(c);
  releaseCanvas(c);
  return img;
}

function deps(file: Blob, device: Device): PhotoDeps<ImageBitmap, OffscreenCanvas> {
  const refs = new WeakMap<ImageBitmap, ImageData>();
  return {
    async decode(_bytes, sniff, opts) {
      const d = await decodeImage(file, sniff, opts);
      // Header without a size (some AVIF files): the decoded source decides.
      const dims = checkDims(d.sourceWidth, d.sourceHeight, device);
      if (dims.level === 'hard') {
        d.close();
        throw new TooLarge(d.sourceWidth, d.sourceHeight);
      }
      return d;
    },
    toCanvas,
    pixels: canvasPixels,
    release: releaseCanvas,
    canvasJpeg,
    async measure(bytes, mime) {
      const bm = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }));
      const size = { width: bm.width, height: bm.height };
      bm.close();
      return size;
    },
    async mozjpeg(img, q) {
      const encode = await loadMozjpegEncoder();
      // jSquash defaults (as the spike), except baseline: a precaution for 기관 upload validators.
      // progressive: false alone still gives SOF1 when a quantiser exceeds 255; baseline: true caps them (SOF0).
      return new Uint8Array(await encode(img, { quality: q, progressive: false, baseline: true }));
    },
    async resize(img, w, h, opts) {
      const resize = await loadResize().catch(engineLoad);
      const src = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength);
      const out = resize(src, img.width, img.height, w, h, LANCZOS3, opts.premultiply, false);
      return new ImageData(new Uint8ClampedArray(out.buffer, out.byteOffset, out.byteLength) as Uint8ClampedArray<ArrayBuffer>, w, h);
    },
    async quickScore(src, bytes) {
      const { width, height } = quickScoreSize(src.width, src.height);
      let ref = refs.get(src);
      if (!ref) {
        ref = drawPixels(src, width, height);
        refs.set(src, ref);
      }
      const bm = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }));
      try {
        return ssim(ref, drawPixels(bm, width, height));
      } finally {
        bm.close();
      }
    },
    async webp(img, q) {
      const encode = await loadWebpEncoder().catch(engineLoad);
      return new Uint8Array(await encode(img, { quality: q }));
    },
  };
}

async function thumbOf(bytes: Uint8Array, mime: string): Promise<Uint8Array | null> {
  try {
    const bm = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }), { imageOrientation: 'from-image' });
    try {
      return await snapshot(bm, bm.width, bm.height, THUMB_EDGE, THUMB_Q);
    } finally {
      bm.close();
    }
  } catch {
    return null; // the row shows its icon instead
  }
}

async function runItem(item: PhotoItem, req: Extract<PhotoRequest, { type: 'run' }>): Promise<void> {
  const phase = (p: PhotoPhase): void => post({ type: 'item-phase', id: item.id, phase: p });
  phase('decode');
  const bytes = await blobBytes(item.file);
  const sniff = sniffImage(bytes);
  if (sniff.format === 'unknown') throw new PhotoError('not-image');
  if (sniff.format === 'tiff') throw new PhotoError('unsupported');
  if (sniff.animated) throw new PhotoError('animated');
  if (sniff.truncated) throw new PhotoError('truncated');
  const limits = LIMITS[req.device];
  let sourcePreview: Uint8Array | undefined;
  const r = await compressPhoto(
    { bytes, sniff },
    { ...req.options, workingLongEdge: limits.workingLongEdge },
    deps(item.file, req.device),
    {
      onPhase: phase,
      async onCapped(src, w, h) {
        sourcePreview = await snapshot(src, w, h, Math.max(w, h), PREVIEW_Q);
      },
    },
  );
  const thumb = await thumbOf(r.bytes ?? bytes, r.bytes ? r.mime : (item.file.type || 'image/jpeg'));
  const transfer: Transferable[] = [];
  if (r.bytes) transfer.push(r.bytes.buffer);
  if (thumb) transfer.push(thumb.buffer);
  if (sourcePreview) transfer.push(sourcePreview.buffer);
  post({ type: 'item-done', id: item.id, bytes: r.bytes, mime: r.mime, thumb, ...(sourcePreview ? { sourcePreview } : {}), report: r.report }, transfer);
}

scope.onmessage = (ev) => {
  const req = ev.data;
  if (req.type === 'warm') {
    const answer = (msg: PhotoWarmResponse): void => scope.postMessage(msg, []);
    Promise.all([loadMozjpegEncoder(), loadResize()]).then(
      () => answer({ type: 'warm-done' }),
      () => answer({ type: 'error', code: 'engine' }),
    );
    return;
  }
  if (req.type !== 'run') return;
  void (async () => {
    for (const item of req.items) {
      try {
        await runItem(item, req);
      } catch (err) {
        const size = err instanceof TooLarge ? { width: err.width, height: err.height } : {};
        post({ type: 'item-error', id: item.id, code: photoErrorCode(err), ...size });
      }
    }
    post({ type: 'run-done' });
  })();
};
