import { PDFDocument } from '@cantoo/pdf-lib';
import { PdfCorruptError } from './errors';

/** Reloads the merged output and checks its page count. Throws PdfCorruptError('verify') on mismatch or reload failure. */
export async function verifyOutput(bytes: Uint8Array, expectedPages: number): Promise<void> {
  let pages: number;
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
    pages = doc.getPageCount();
  } catch {
    throw new PdfCorruptError('verify');
  }
  if (pages !== expectedPages) throw new PdfCorruptError('verify');
}
