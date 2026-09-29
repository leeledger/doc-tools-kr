// Main-thread inspection of one PDF with pdf.js: page count, encryption status, page-1 thumbnail.
// pdf.js is imported dynamically the first time a file is inspected, so it is not part of the initial page JS.
import { PdfCorruptError, PdfWrongPasswordError, assertPdfHeader } from './errors';

type PdfJs = typeof import('pdfjs-dist');

export type EncryptionStatus = 'none' | 'owner' | 'user';

export interface InspectResult {
  /** `null` while a user password is still needed. */
  pageCount: number | null;
  encrypted: EncryptionStatus;
  /** Page-1 render, 160 CSS px wide. `null` while locked or if rendering failed. */
  thumbnail: HTMLCanvasElement | null;
}

export const THUMB_WIDTH = 160;

let pdfjsPromise: Promise<{ lib: PdfJs; worker: InstanceType<PdfJs['PDFWorker']>; base: string }> | null = null;

function loadPdfJs() {
  pdfjsPromise ??= import('pdfjs-dist').then((lib) => {
    const base = `/vendor/pdfjs/${lib.version}/`;
    lib.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.min.mjs`;
    // One shared pdf.js worker for every inspected file.
    const worker = new lib.PDFWorker();
    return { lib, worker, base };
  });
  return pdfjsPromise;
}

function isPasswordError(lib: PdfJs, err: unknown): err is { code: number } {
  return err instanceof lib.PasswordException || (err as { name?: string } | null)?.name === 'PasswordException';
}

async function renderThumbnail(doc: import('pdfjs-dist').PDFDocumentProxy): Promise<HTMLCanvasElement | null> {
  try {
    const page = await doc.getPage(1);
    const unit = page.getViewport({ scale: 1 });
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const viewport = page.getViewport({ scale: (THUMB_WIDTH * dpr) / unit.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    canvas.style.width = `${THUMB_WIDTH}px`;
    canvas.style.height = `${Math.round(viewport.height / dpr)}px`;
    await page.render({ canvas, viewport }).promise;
    page.cleanup();
    return canvas;
  } catch {
    // A failed thumbnail never blocks the merge; the placeholder stays.
    return null;
  }
}

/**
 * Inspects a PDF. Throws PdfNotPdfError, PdfWrongPasswordError or PdfCorruptError.
 * A user-password file without a password resolves to `{encrypted:'user', pageCount:null}`.
 */
export async function inspect(bytes: Uint8Array, password?: string): Promise<InspectResult> {
  assertPdfHeader(bytes);
  const { lib, worker, base } = await loadPdfJs();
  const task = lib.getDocument({
    // pdf.js transfers the buffer it is given, so it gets a copy.
    data: bytes.slice(),
    password,
    worker,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
    enableXfa: false,
  });
  let doc: import('pdfjs-dist').PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (err) {
    await task.destroy().catch(() => undefined);
    if (isPasswordError(lib, err)) {
      if (err.code === lib.PasswordResponses.INCORRECT_PASSWORD) throw new PdfWrongPasswordError();
      return { pageCount: null, encrypted: 'user', thumbnail: null };
    }
    throw new PdfCorruptError(err instanceof Error ? err.message : String(err));
  }
  try {
    const pageCount = doc.numPages;
    const encrypted: EncryptionStatus = password ? 'user' : (await doc.getPermissions()) !== null ? 'owner' : 'none';
    const thumbnail = await renderThumbnail(doc);
    return { pageCount, encrypted, thumbnail };
  } finally {
    await task.destroy();
  }
}
