// Module worker for PDF 용량 줄이기. Everything heavy (pdf-lib, qpdf, MozJPEG, resize) loads here, after
// the user presses the button. Cancel = worker.terminate(), which also frees all WASM memory.
// The password is used for the qpdf call only; it is never echoed back or logged.
import { PdfCorruptError, errorCode, type PdfErrorCode } from './errors';
import type { CompressDeps } from './compress/deps';
import { compressPdf } from './compress/engine';
import { KEEP_ORIGINAL_RATIO, type LevelName } from './compress/levels';
import { RasterAssembler } from './compress/raster';
import type { CompressReport, Phase } from './compress/report';
import { loadCodecs, loadQpdf } from './compress/wasm-browser';

export type CompressRequest =
  | { type: 'compress'; bytes: ArrayBuffer; level: LevelName; password?: string; expectedPages: number }
  | { type: 'raster-begin'; pageCount: number }
  | { type: 'raster-page'; rgba: ArrayBuffer; width: number; height: number; ptW: number; ptH: number }
  | { type: 'raster-end'; inBytes: number };

export type CompressResponse =
  | { type: 'progress'; phase: Phase; done: number; total: number }
  /** `bytes` is null when the original is kept (the page already holds it; nothing to download). */
  | { type: 'done'; bytes: Uint8Array | null; keptOriginal: boolean; report: CompressReport }
  | { type: 'error'; code: PdfErrorCode }
  | { type: 'raster-ack'; page: number };

/** The parts of DedicatedWorkerGlobalScope we use (the project compiles against the DOM lib). */
interface WorkerScope {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((ev: MessageEvent<CompressRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const post = (msg: CompressResponse, transfer: Transferable[] = []): void => scope.postMessage(msg, transfer);

async function deps(): Promise<CompressDeps> {
  return { qpdf: loadQpdf(), ...(await loadCodecs()) };
}

async function compress(req: Extract<CompressRequest, { type: 'compress' }>): Promise<void> {
  const { bytes, keptOriginal, report } = await compressPdf(
    new Uint8Array(req.bytes),
    {
      level: req.level,
      password: req.password,
      expectedPages: req.expectedPages,
      onProgress: (p) => post({ type: 'progress', ...p }),
    },
    await deps(),
  );
  if (keptOriginal) post({ type: 'done', bytes: null, keptOriginal, report });
  else post({ type: 'done', bytes, keptOriginal, report }, [bytes.buffer]);
}

let raster: { assembler: RasterAssembler; pageCount: number; t0: number } | null = null;

async function rasterStep(req: Exclude<CompressRequest, { type: 'compress' }>): Promise<void> {
  if (req.type === 'raster-begin') {
    raster = { assembler: new RasterAssembler(await loadCodecs()), pageCount: req.pageCount, t0: performance.now() };
    return;
  }
  if (!raster) throw new Error('raster: not started');
  if (req.type === 'raster-page') {
    await raster.assembler.addPage(new Uint8ClampedArray(req.rgba), req.width, req.height, req.ptW, req.ptH);
    post({ type: 'raster-ack', page: raster.assembler.pages });
    return;
  }
  // Never partial: every page announced in raster-begin must have arrived.
  if (raster.assembler.pages !== raster.pageCount) throw new PdfCorruptError('raster page count mismatch');
  const out = await raster.assembler.finish();
  const kept = out.length >= KEEP_ORIGINAL_RATIO * req.inBytes;
  const report: CompressReport = {
    level: 'raster',
    inBytes: req.inBytes,
    outBytes: kept ? req.inBytes : out.length,
    keptOriginal: kept,
    ...(kept ? { keptReason: 'raster-larger' as const } : {}),
    pages: raster.assembler.pages,
    imagesSeen: 0,
    imagesReplaced: 0,
    skipped: {},
    minImageSsim: null,
    signed: false,
    ownerRestrictionRemoved: false,
    ms: { raster: Math.round(performance.now() - raster.t0) },
  };
  raster = null;
  if (kept) post({ type: 'done', bytes: null, keptOriginal: true, report });
  else post({ type: 'done', bytes: out, keptOriginal: false, report }, [out.buffer]);
}

// Messages are handled strictly in order (raster pages arrive while the previous one may still encode).
let queue: Promise<void> = Promise.resolve();

scope.onmessage = (ev) => {
  const req = ev.data;
  queue = queue.then(async () => {
    try {
      if (req.type === 'compress') await compress(req);
      else await rasterStep(req);
    } catch (err) {
      post({ type: 'error', code: errorCode(err) });
    }
  });
};
