// Module worker: runs mergePlus off the main thread. @cantoo/pdf-lib is only ever loaded here.
import { isEngineLoadFailure } from '../ui/engine-load';
import { PdfError, errorCode, type WorkerErrorCode } from './errors';
import { mergePlus, type MergeReport } from './mergePlus';
import { verifyOutput } from './verify';

export interface WorkerFile {
  buffer: ArrayBuffer;
  password?: string;
  title: string;
}

export type MergeRequest =
  | {
      type: 'merge';
      files: WorkerFile[];
      addFileBookmarks: boolean;
    }
  /** Preload (Polish P.7): the worker script and its imports are loaded by now; nothing else is lazy. */
  | { type: 'warm' };

export type MergeResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; bytes: Uint8Array; report: MergeReport }
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
  if (req?.type !== 'merge') return;
  try {
    const { bytes, report } = await mergePlus(
      req.files.map((f) => ({ bytes: new Uint8Array(f.buffer), password: f.password, title: f.title })),
      {
        addFileBookmarks: req.addFileBookmarks,
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
