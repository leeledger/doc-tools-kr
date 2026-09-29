// Module worker for PDF 용량 줄이기. Everything heavy (pdf-lib, qpdf, MozJPEG, resize) loads here, after
// the user presses the button. Cancel = worker.terminate(), which also frees all WASM memory.
// The password is used for the qpdf call only; it is never echoed back or logged.
import { isEngineLoadFailure } from '../ui/engine-load';
import { PdfCorruptError, errorCode, type WorkerErrorCode } from './errors';
import type { CompressDeps } from './compress/deps';
import { compressPdf } from './compress/engine';
import { KEEP_ORIGINAL_RATIO, TARGET_SEARCH, type LevelName } from './compress/levels';
import { RasterAssembler } from './compress/raster';
import type { CompressReport, Phase } from './compress/report';
import { searchTarget } from './compress/target';
import { loadCodecs, loadQpdf, warmQpdf } from './compress/wasm-browser';

export type CompressRequest =
  | { type: 'compress'; bytes: ArrayBuffer; level: LevelName; password?: string; expectedPages: number }
  /** 목표 용량 (Polish P.13): one worker runs the whole search. */
  | { type: 'compress-target'; bytes: ArrayBuffer; targetBytes: number; password?: string; expectedPages: number }
  /** Preload (Polish P.7): load the codecs and qpdf, then answer warm-done. */
  | { type: 'warm' }
  | { type: 'raster-begin'; pageCount: number }
  | { type: 'raster-page'; rgba: ArrayBuffer; width: number; height: number; ptW: number; ptH: number }
  | { type: 'raster-end'; inBytes: number };

export interface TargetOutcome {
  outcome: 'hit' | 'miss';
  targetBytes: number;
}

export type CompressResponse =
  | { type: 'progress'; phase: Phase; done: number; total: number }
  /** 목표 용량: rung `rung` of `of` started. */
  | { type: 'target-progress'; rung: number; of: number }
  /** `bytes` is null when the original is kept (the page already holds it; nothing to download). */
  | { type: 'done'; bytes: Uint8Array | null; keptOriginal: boolean; report: CompressReport; target?: TargetOutcome }
  | { type: 'error'; code: WorkerErrorCode }
  | { type: 'raster-ack'; page: number }
  | { type: 'warm-done' };

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

async function compressTarget(req: Extract<CompressRequest, { type: 'compress-target' }>): Promise<void> {
  const input = new Uint8Array(req.bytes);
  const d = await deps();
  const r = await searchTarget(
    async (rung, index) => {
      post({ type: 'target-progress', rung: index + 1, of: TARGET_SEARCH.length });
      return compressPdf(
        input,
        { level: rung, password: req.password, expectedPages: req.expectedPages, onProgress: (p) => post({ type: 'progress', ...p }) },
        d,
      );
    },
    TARGET_SEARCH,
    req.targetBytes,
    input.length,
  );
  if (r.outcome === 'hit' || r.outcome === 'miss') {
    post({ type: 'done', bytes: r.bytes, keptOriginal: false, report: r.report, target: { outcome: r.outcome, targetBytes: req.targetBytes } }, [r.bytes.buffer]);
  } else if (r.outcome === 'none' && r.report) {
    post({ type: 'done', bytes: null, keptOriginal: true, report: { ...r.report, keptOriginal: true, outBytes: input.length } });
  } else {
    // 'already': the page never starts a run for an input that fits (it says so itself).
    throw new Error('target search: the input already fits');
  }
}

async function warm(): Promise<void> {
  await Promise.all([loadCodecs(), warmQpdf()]);
  post({ type: 'warm-done' });
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

async function rasterStep(req: Extract<CompressRequest, { type: `raster-${string}` }>): Promise<void> {
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
      else if (req.type === 'compress-target') await compressTarget(req);
      else if (req.type === 'warm') await warm();
      else await rasterStep(req);
    } catch (err) {
      // A codec, qpdf or chunk that did not load is `engine`: never mapped to a file error (Polish P.1).
      post({ type: 'error', code: isEngineLoadFailure(err) ? 'engine' : errorCode(err) });
    }
  });
};
