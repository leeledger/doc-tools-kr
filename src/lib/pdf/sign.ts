// PDF 서명·도장 넣기 (TOOLS5 U3): draws one PNG on the given pages of a PDF with pdf-lib, in the PDF 합치기 worker (no
// second pdf-lib copy). The document is changed in place (forms, outlines and links stay); an encrypted input opened with
// its password is saved without one. Existing page content is wrapped in q/Q by pdf-lib before the picture is drawn, so a
// content stream that leaves the graphics state changed cannot move the picture.
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { hasSignature } from './compress/signature';
import { PdfCorruptError, assertPdfHeader, isOutOfMemory, mapLoadError, PdfError } from './errors';
import { PRODUCER } from './mergePlus';

export interface SignStamp {
  /** 0-based page. */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Counter-clockwise degrees (the page's /Rotate). */
  rotate: number;
}

export interface SignResult {
  bytes: Uint8Array;
  pageCount: number;
  /** The input carries a digital signature (the output no longer keeps it valid). */
  signed: boolean;
}

export async function signPdf(input: Uint8Array, password: string | undefined, png: Uint8Array, stamps: readonly SignStamp[]): Promise<SignResult> {
  assertPdfHeader(input);
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input, { password: password ?? '', updateMetadata: false, throwOnInvalidObject: false });
  } catch (err) {
    throw mapLoadError(err, Boolean(password));
  }
  try {
    const signed = hasSignature(doc);
    const pages = doc.getPages();
    const image = await doc.embedPng(png);
    for (const s of stamps) {
      const page = pages[s.page];
      if (!page) throw new PdfError('unknown', `no page ${s.page}`);
      page.drawImage(image, { x: s.x, y: s.y, width: s.width, height: s.height, rotate: degrees(s.rotate) });
    }
    doc.setProducer(PRODUCER);
    // PDF/A-1 files (common for issued documents) forbid object streams; pdf-lib refuses them, so those save without.
    const bytes = await doc.save({ useObjectStreams: true, updateFieldAppearances: false }).catch((err: unknown) => {
      if (/PDF\/A-1 forbids object/i.test(err instanceof Error ? err.message : '')) return doc.save({ useObjectStreams: false, updateFieldAppearances: false });
      throw err;
    });
    return { bytes, pageCount: pages.length, signed };
  } catch (err) {
    if (isOutOfMemory(err) || err instanceof PdfError) throw err;
    throw new PdfCorruptError(err instanceof Error ? err.message : String(err));
  }
}
