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

/**
 * Whether `secret` is in the traces in any form a PDF writes text: as is, its UTF-8 or latin1 bytes, UTF-16BE bytes (what
 * field values and Korean text use), each also as hex, the UTF-16BE hex with and without the FEFF mark (either case).
 */
export function hasSecret(traces: string, secret: string): boolean {
  const utf16 = Buffer.from(secret, 'utf16le').swap16();
  const raw = [secret, Buffer.from(secret, 'utf8').toString('latin1'), utf16.toString('latin1')];
  if (raw.some((r) => traces.includes(r))) return true;
  const flat = traces.toLowerCase().replace(/\s+/g, '');
  const hexes = [Buffer.from(secret, 'utf8').toString('hex'), utf16.toString('hex'), 'feff' + utf16.toString('hex')];
  if (/^[\x00-\xff]*$/.test(secret)) hexes.push(Buffer.from(secret, 'latin1').toString('hex'));
  return hexes.some((h) => flat.includes(h));
}
