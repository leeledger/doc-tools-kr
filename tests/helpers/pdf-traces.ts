// Everything a PDF file says, as text, for "is this string gone from the file" checks (TOOLS1015 E2 round 2): the raw
// bytes, every indirect object written out (strings, names, field values, including those inside object streams), and
// every stream decoded (Flate and the other filters pdf-lib reads). A secret is gone only when neither its literal nor
// its hex form appears anywhere here.
import { PDFDocument, PDFRawStream, decodePDFRawStream } from '@cantoo/pdf-lib';

export async function pdfTraces(bytes: Uint8Array): Promise<string> {
  const parts: string[] = [Buffer.from(bytes).toString('latin1')];
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      parts.push(obj.dict.toString());
      try {
        parts.push(Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1'));
      } catch {
        // An image filter pdf-lib does not decode (DCT): pixels, not text.
      }
    } else parts.push(obj.toString());
  }
  return parts.join('\n');
}

/** Whether `secret` (ASCII) is in the traces as text or as hex, either case. */
export function hasSecret(traces: string, secret: string): boolean {
  const hex = Buffer.from(secret, 'latin1').toString('hex');
  return traces.includes(secret) || traces.toLowerCase().replace(/\s+/g, '').includes(hex);
}
