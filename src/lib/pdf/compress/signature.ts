// Digital-signature detection. Recompressing or restructuring a signed PDF invalidates the signature,
// so the result screen warns about it.
import { PDFArray, PDFDict, PDFName, PDFRef, PDFStream } from '@cantoo/pdf-lib';
import type { PDFDocument, PDFObject } from '@cantoo/pdf-lib';

const N = (s: string): PDFName => PDFName.of(s);
const isName = (o: PDFObject | undefined, name: string): boolean => o instanceof PDFName && o.decodeText() === name;

/** Direct (non-reference) values nested in a dict/array are checked too, up to this depth. */
const MAX_DEPTH = 6;

function signedDict(d: PDFDict, depth: number): boolean {
  if (isName(d.get(N('Type')), 'Sig')) return true;
  if (isName(d.get(N('FT')), 'Sig') && d.get(N('V'))) return true;
  if (d.get(N('ByteRange'))) return true;
  return depth < MAX_DEPTH && [...d.entries()].some(([, v]) => signedDirect(v, depth + 1));
}

function signedDirect(o: PDFObject, depth: number): boolean {
  if (o instanceof PDFRef) return false;
  if (o instanceof PDFDict) return signedDict(o, depth);
  if (o instanceof PDFArray) return depth < MAX_DEPTH && o.asArray().some((v) => signedDirect(v, depth + 1));
  return false;
}

/**
 * True if the document carries a digital signature: an object with /Type /Sig, a field with /FT /Sig
 * and a value, any dictionary with a /ByteRange, or a catalog /Perms (DocMDP / UR signatures).
 */
export function hasSignature(doc: PDFDocument): boolean {
  if (doc.catalog.get(N('Perms'))) return true;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && signedDict(obj, 0)) return true;
    if (obj instanceof PDFStream && signedDict(obj.dict, 0)) return true;
  }
  return false;
}
