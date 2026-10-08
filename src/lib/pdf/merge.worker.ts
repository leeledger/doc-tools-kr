// Module worker: runs mergePlus off the main thread. @cantoo/pdf-lib is only ever loaded here. PDF 서명·도장 넣기
// (TOOLS5 U3) sends `sign` here too, so the site carries no second pdf-lib copy for it.
import { isEngineLoadFailure } from '../ui/engine-load';
import { PdfError, errorCode, type WorkerErrorCode } from './errors';
import { mergePlus, type MergeReport } from './mergePlus';
import { signPdf, type SignStamp } from './sign';
import { verifyOutput } from './verify';

export interface WorkerFile {
  buffer: ArrayBuffer;
  password?: string;
  title: string;
  /** 0-based source pages in output order (PDF 나누기·쪽 편집); omitted = all pages. */
  pages?: number[];
  /** Extra clockwise degrees per entry of `pages`. */
  rotate?: number[];
}

export type MergeRequest =
  | {
      type: 'merge';
      files: WorkerFile[];
      addFileBookmarks: boolean;
      /** Report whether an input carries a digital signature (MergeReport.signed). */
      detectSignature?: boolean;
    }
  /** PDF 서명·도장 넣기: one PNG drawn on the given pages of one PDF. */
  | { type: 'sign'; buffer: ArrayBuffer; password?: string; png: ArrayBuffer; stamps: SignStamp[] }
  /** Preload (Polish P.7): the worker script and its imports are loaded by now; nothing else is lazy. */
  | { type: 'warm' };

export type MergeResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; bytes: Uint8Array; report: MergeReport }
  | { type: 'signed'; bytes: Uint8Array; signed: boolean }
  | { type: 'error'; code: WorkerErrorCode; fileIndex?: number }
  | { type: 'warm-done' };

/** The parts of DedicatedWorkerGlobalScope we use (the project compiles against the DOM lib). */
interface WorkerScope {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((ev: MessageEvent<MergeRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const post = (msg: MergeResponse, transfer: Transferable[] = []): void => scope.postMessage(msg, transfer);

scope.onmessage = async (ev) => {
  const req = ev.data;
  if (req?.type === 'warm') {
    post({ type: 'warm-done' });
    return;
  }
  if (req?.type === 'sign') {
    try {
      const out = await signPdf(new Uint8Array(req.buffer), req.password, new Uint8Array(req.png), req.stamps);
      await verifyOutput(out.bytes, out.pageCount);
      post({ type: 'signed', bytes: out.bytes, signed: out.signed }, [out.bytes.buffer]);
    } catch (err) {
      post({ type: 'error', code: isEngineLoadFailure(err) ? 'engine' : errorCode(err) });
    }
    return;
  }
  if (req?.type !== 'merge') return;
  try {
    const { bytes, report } = await mergePlus(
      req.files.map((f) => ({ bytes: new Uint8Array(f.buffer), password: f.password, title: f.title, pages: f.pages, rotate: f.rotate })),
      {
        addFileBookmarks: req.addFileBookmarks,
        detectSignature: req.detectSignature,
        onProgress: (done, total) => post({ type: 'progress', done, total }),
      },
    );
    await verifyOutput(bytes, report.pageCount);
    post({ type: 'done', bytes, report }, [bytes.buffer]);
  } catch (err) {
    const fileIndex = err instanceof PdfError ? err.fileIndex : undefined;
    const code: WorkerErrorCode = isEngineLoadFailure(err) ? 'engine' : errorCode(err);
    post(fileIndex === undefined ? { type: 'error', code } : { type: 'error', code, fileIndex });
  }
};
