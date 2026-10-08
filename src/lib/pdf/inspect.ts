// Main-thread inspection of one PDF with pdf.js: page count, encryption status, page-1 thumbnail.
// pdf.js is imported dynamically the first time a file is inspected, so it is not part of the initial page JS.
// openPdf / renderPageThumb are shared with PDF 용량 줄이기 (result check, previews, raster rendering).
import { EngineLoadError, isEngineLoadFailure, withEngineRetry } from '../ui/engine-load';
import { PdfCorruptError, PdfWrongPasswordError, assertPdfHeader } from './errors';

type PdfJs = typeof import('pdfjs-dist');
export type PdfJsDoc = import('pdfjs-dist').PDFDocumentProxy;

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

/** pdf.js and its shared worker. A load failure is an EngineLoadError and is not cached (the next call retries). */
function loadPdfJs() {
  pdfjsPromise ??= withEngineRetry(() => import('pdfjs-dist')).then((lib) => {
    const base = `/vendor/pdfjs/${lib.version}/`;
    lib.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.min.mjs`;
    // One shared pdf.js worker for every opened file.
    const worker = new lib.PDFWorker();
    return { lib, worker, base };
  });
  pdfjsPromise.catch(() => {
    pdfjsPromise = null;
  });
  return pdfjsPromise;
}

/** Drops a pdf.js worker that failed to start, so the next attempt creates a fresh one instead of leaking it. */
function resetPdfJs(worker: { destroy(): void }): void {
  try {
    worker.destroy();
  } catch {
    // Already gone.
  }
  pdfjsPromise = null;
}

/** Preload (Polish P.7): pdf.js and its worker script, ready before the first file is picked. */
export async function preloadPdfJs(): Promise<void> {
  const { worker } = await loadPdfJs();
  try {
    await worker.promise;
  } catch (err) {
    resetPdfJs(worker);
    throw new EngineLoadError('pdf.js worker did not start', { cause: err });
  }
}

function isPasswordError(lib: PdfJs, err: unknown): err is { code: number } {
  return err instanceof lib.PasswordException || (err as { name?: string } | null)?.name === 'PasswordException';
}

export interface OpenedPdf {
  doc: PdfJsDoc;
  /** Destroys the loading task and frees the document in the pdf.js worker. */
  close(): Promise<void>;
}

/**
 * Opens a PDF with pdf.js. Resolves to `null` if a user password is needed and none was given.
 * Throws PdfWrongPasswordError or PdfCorruptError.
 */
export async function openPdf(bytes: Uint8Array, password?: string): Promise<OpenedPdf | null> {
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
  try {
    const doc = await task.promise;
    return { doc, close: () => task.destroy() };
  } catch (err) {
    await task.destroy().catch(() => undefined);
    // The pdf.js worker (or its fake-worker fallback) did not load: never the file's fault.
    if (isEngineLoadFailure(err)) {
      resetPdfJs(worker);
      throw new EngineLoadError('pdf.js worker failed', { cause: err });
    }
    if (isPasswordError(lib, err)) {
      if (err.code === lib.PasswordResponses.INCORRECT_PASSWORD) throw new PdfWrongPasswordError();
      return null;
    }
    throw new PdfCorruptError(err instanceof Error ? err.message : String(err));
  }
}

/** CSS size of a `unitW` × `unitH` page drawn at most `maxW` wide and `maxH` tall, aspect kept. Pure. */
export function thumbCssWidth(unitW: number, unitH: number, maxW: number, maxH = Infinity): number {
  return Math.min(maxW, (maxH * unitW) / unitH);
}

/**
 * Renders page `index` (0-based) at most `maxW` × `maxH` CSS px (aspect kept; `maxH` unbounded by default, so the
 * page is `maxW` wide) at min(devicePixelRatio, 2). Null if rendering failed.
 */
export async function renderPageThumb(doc: PdfJsDoc, index: number, maxW: number, maxH = Infinity): Promise<HTMLCanvasElement | null> {
  try {
    const page = await doc.getPage(index + 1);
    const unit = page.getViewport({ scale: 1 });
    const cssWidth = thumbCssWidth(unit.width, unit.height, maxW, maxH);
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const viewport = page.getViewport({ scale: (cssWidth * dpr) / unit.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${Math.round(viewport.height / dpr)}px`;
    await page.render({ canvas, viewport }).promise;
    page.cleanup();
    return canvas;
  } catch {
    // A failed preview never blocks the tool; the placeholder stays.
    return null;
  }
}

/**
 * Inspects a PDF. Throws PdfNotPdfError, PdfWrongPasswordError or PdfCorruptError.
 * A user-password file without a password resolves to `{encrypted:'user', pageCount:null}`.
 */
export async function inspect(bytes: Uint8Array, password?: string): Promise<InspectResult> {
  assertPdfHeader(bytes);
  const opened = await openPdf(bytes, password);
  if (!opened) return { pageCount: null, encrypted: 'user', thumbnail: null };
  const { doc } = opened;
  try {
    const pageCount = doc.numPages;
    const encrypted: EncryptionStatus = password ? 'user' : (await doc.getPermissions()) !== null ? 'owner' : 'none';
    const thumbnail = await renderPageThumb(doc, 0, THUMB_WIDTH);
    return { pageCount, encrypted, thumbnail };
  } finally {
    await opened.close();
  }
}
