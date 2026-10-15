// Module worker of PDF 글자 넣기·편집 (TOOLS1015 E1): pdf-lib, fontkit and the HWP PDF face list, kept out of merge.worker
// (which PDF 합치기, 나누기 and 서명 넣기 load). The face list and the .woff slices are same-origin GETs of our own static
// files under /fonts/hwp/ (font-source.ts guards that); never file data.
import { isEngineLoadFailure } from '../ui/engine-load';
import { createFontSource } from '../hwp/pdf/font-source';
import { MissingGlyphError, editPdf, type EditDraw } from './edit';
import { errorCode, type WorkerErrorCode } from './errors';
import { verifyOutput } from './verify';

export interface EditRequest {
  type: 'edit';
  buffer: ArrayBuffer;
  password?: string;
  draws: EditDraw[];
  /** The font-family chain the preview uses (FaceTable.resolve). */
  chain: string;
}

export type EditResponse =
  | { type: 'done'; bytes: Uint8Array; signed: boolean }
  /** Characters no bundled face has; nothing was saved. */
  | { type: 'missing'; chars: string }
  /** `font`: the face list or a slice could not be fetched. */
  | { type: 'error'; code: WorkerErrorCode | 'font' };

/** The parts of DedicatedWorkerGlobalScope we use (the project compiles against the DOM lib). */
interface WorkerScope {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((ev: MessageEvent<EditRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const post = (msg: EditResponse, transfer: Transferable[] = []): void => scope.postMessage(msg, transfer);

scope.onmessage = async (ev) => {
  const req = ev.data;
  if (req?.type !== 'edit') return;
  let fontFailed = false;
  try {
    let source: Awaited<ReturnType<typeof createFontSource>>;
    try {
      source = await createFontSource(() => {
        fontFailed = true;
      });
    } catch {
      post({ type: 'error', code: 'font' });
      return;
    }
    const out = await editPdf(new Uint8Array(req.buffer), req.password, req.draws, source.table, req.chain);
    await verifyOutput(out.bytes, out.pageCount);
    post({ type: 'done', bytes: out.bytes, signed: out.signed }, [out.bytes.buffer]);
  } catch (err) {
    // A slice that did not arrive looks like a character no face has: the network is the cause then.
    if (err instanceof MissingGlyphError) post(fontFailed ? { type: 'error', code: 'font' } : { type: 'missing', chars: err.chars });
    else post({ type: 'error', code: isEngineLoadFailure(err) ? 'engine' : errorCode(err) });
  }
};
