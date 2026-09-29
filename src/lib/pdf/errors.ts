/** `verify`: the main-thread check of a compressed result failed (PDF 용량 줄이기). */
export type PdfErrorCode = 'not-pdf' | 'password' | 'wrong-password' | 'corrupt' | 'oom' | 'unknown' | 'verify';

export class PdfError extends Error {
  readonly code: PdfErrorCode;
  /** Index of the input file that caused the error, when known. */
  fileIndex?: number;
  constructor(code: PdfErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = new.target.name;
  }
}

/** No `%PDF-` header in the first 1024 bytes. */
export class PdfNotPdfError extends PdfError {
  constructor(message?: string) {
    super('not-pdf', message);
  }
}

export class PdfPasswordRequiredError extends PdfError {
  constructor(message?: string) {
    super('password', message);
  }
}

export class PdfWrongPasswordError extends PdfError {
  constructor(message?: string) {
    super('wrong-password', message);
  }
}

export class PdfCorruptError extends PdfError {
  constructor(message?: string) {
    super('corrupt', message);
  }
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** True if `%PDF-` appears within the first 1024 bytes (what viewers accept). */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, 1024) - PDF_MAGIC.length;
  outer: for (let i = 0; i <= end; i++) {
    for (let k = 0; k < PDF_MAGIC.length; k++) if (bytes[i + k] !== PDF_MAGIC[k]) continue outer;
    return true;
  }
  return false;
}

export function assertPdfHeader(bytes: Uint8Array): void {
  if (!hasPdfHeader(bytes)) throw new PdfNotPdfError();
}

/** True for allocation failures (RangeError from typed arrays / wasm, or engine "out of memory"). */
export function isOutOfMemory(err: unknown): boolean {
  if (err instanceof RangeError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /out of memory|allocation failed|array buffer allocation/i.test(msg);
}

/** Maps an error thrown by `PDFDocument.load` to our typed errors. */
export function mapLoadError(err: unknown, passwordGiven: boolean): Error {
  if (err instanceof PdfError) return err;
  if (isOutOfMemory(err)) return err as Error;
  const name = err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : String(err);
  if (/password incorrect/i.test(msg)) return new PdfWrongPasswordError();
  if (name === 'EncryptedPDFError' || /needs password|is encrypted/i.test(msg)) {
    return passwordGiven ? new PdfWrongPasswordError() : new PdfPasswordRequiredError();
  }
  return new PdfCorruptError(msg);
}

/** Error code for anything thrown by the merge pipeline. */
export function errorCode(err: unknown): PdfErrorCode {
  if (err instanceof PdfError) return err.code;
  if (isOutOfMemory(err)) return 'oom';
  return 'unknown';
}
