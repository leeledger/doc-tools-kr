// Module worker: runs mergePlus off the main thread. @cantoo/pdf-lib is only ever loaded here.
import { PdfError, errorCode, type PdfErrorCode } from './errors';
import { mergePlus, type MergeReport } from './mergePlus';
import { verifyOutput } from './verify';

export interface WorkerFile {
  buffer: ArrayBuffer;
  password?: string;
  title: string;
}

export interface MergeRequest {
  type: 'merge';
  files: WorkerFile[];
  addFileBookmarks: boolean;
}

export type MergeResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; bytes: Uint8Array; report: MergeReport }
  | { type: 'error'; code: PdfErrorCode; fileIndex?: number };

/** The parts of DedicatedWorkerGlobalScope we use (the project compiles against the DOM lib). */
interface WorkerScope {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((ev: MessageEvent<MergeRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const post = (msg: MergeResponse, transfer: Transferable[] = []): void => scope.postMessage(msg, transfer);

scope.onmessage = async (ev) => {
  const req = ev.data;
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
    post(fileIndex === undefined ? { type: 'error', code: errorCode(err) } : { type: 'error', code: errorCode(err), fileIndex });
  }
};
