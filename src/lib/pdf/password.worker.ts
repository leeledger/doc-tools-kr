// Module worker for PDF 암호 해제·설정 (TOOLS4 T4): one qpdf run (lock = AES-256, unlock = --decrypt with the typed
// password) and the signature check (pdf-lib) on the plain side of the file. Loaded after the person presses the
// button. Cancel = worker.terminate(). The password is used for the qpdf call only: it is never echoed back, logged or
// posted; qpdf's log lines are mapped to a code (password.ts) and dropped.
import { PDFDocument } from '@cantoo/pdf-lib';
import { isEngineLoadFailure } from '../ui/engine-load';
import { hasSignature } from './compress/signature';
import { errorCode, isOutOfMemory, type WorkerErrorCode } from './errors';
import { lockArgs, passwordFailure, qpdfDone, randomOwnerPassword, unlockArgs } from './password';
import { loadQpdf } from './qpdf/load';

export type PasswordRequest = { type: 'lock' | 'unlock'; buffer: ArrayBuffer; password: string };

export type PasswordResponse =
  /** `signed`: the plain document carries a digital signature, which the new file no longer keeps valid. */
  | { type: 'done'; bytes: Uint8Array; signed: boolean }
  | { type: 'error'; code: WorkerErrorCode };

/** The parts of DedicatedWorkerGlobalScope we use (the project compiles against the DOM lib). */
interface WorkerScope {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((ev: MessageEvent<PasswordRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const post = (msg: PasswordResponse, transfer: Transferable[] = []): void => scope.postMessage(msg, transfer);

/** hasSignature on an unencrypted PDF. A file pdf-lib cannot read gets no warning (qpdf already wrote it). */
async function signed(plain: Uint8Array): Promise<boolean> {
  try {
    return hasSignature(await PDFDocument.load(plain, { updateMetadata: false, throwOnInvalidObject: false, ignoreEncryption: true }));
  } catch (err) {
    if (isOutOfMemory(err)) throw err;
    return false;
  }
}

scope.onmessage = async (ev) => {
  const req = ev.data;
  if (req?.type !== 'lock' && req?.type !== 'unlock') return;
  try {
    const input = new Uint8Array(req.buffer);
    const lock = req.type === 'lock';
    const r = await loadQpdf()(lock ? lockArgs(req.password, randomOwnerPassword()) : unlockArgs(req.password), input);
    if (!qpdfDone(r)) {
      post({ type: 'error', code: passwordFailure(r, true) });
      return;
    }
    const sig = await signed(lock ? input : r.out);
    post({ type: 'done', bytes: r.out, signed: sig }, [r.out.buffer]);
  } catch (err) {
    post({ type: 'error', code: isEngineLoadFailure(err) ? 'engine' : errorCode(err) });
  }
};
