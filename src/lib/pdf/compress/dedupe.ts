// Lossless: byte-identical streams (fonts, images, ICC profiles repeated per page) become one object
// (spike lib.mjs `dedupeStreams`).
import { PDFArray, PDFDict, PDFRawStream, PDFRef, PDFStream } from '@cantoo/pdf-lib';
import type { PDFDocument, PDFObject } from '@cantoo/pdf-lib';

/** Returns the number of streams that were merged into an identical earlier one. */
export function dedupeStreams(doc: PDFDocument): number {
  const ctx = doc.context;
  const seen = new Map<string, PDFRef>();
  const remap = new Map<string, PDFRef>();
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const c = obj.contents;
    if (c.length < 256) continue;
    let h = 2166136261;
    for (let i = 0; i < c.length; i += Math.max(1, c.length >> 12)) h = Math.imul(h ^ c[i]!, 16777619);
    const key = `${c.length}:${h}:${obj.dict.toString()}`;
    const prev = seen.get(key);
    if (prev) {
      const p = ctx.lookup(prev);
      if (p instanceof PDFRawStream && p.contents.length === c.length && p.contents.every((v, i) => v === c[i])) {
        remap.set(ref.toString(), prev);
        continue;
      }
    }
    seen.set(key, ref);
  }
  if (!remap.size) return 0;
  const fix = (o: PDFObject | undefined): void => {
    if (o instanceof PDFDict) {
      for (const [k, v] of o.entries()) {
        const to = v instanceof PDFRef ? remap.get(v.toString()) : undefined;
        if (to) o.set(k, to);
        else fix(v);
      }
    } else if (o instanceof PDFArray) {
      for (let i = 0; i < o.size(); i++) {
        const v = o.get(i);
        const to = v instanceof PDFRef ? remap.get(v.toString()) : undefined;
        if (to) o.set(i, to);
        else fix(v);
      }
    } else if (o instanceof PDFStream) fix(o.dict);
  };
  for (const [, obj] of ctx.enumerateIndirectObjects()) fix(obj);
  const root = ctx.trailerInfo.Root;
  fix(root instanceof PDFRef ? ctx.lookup(root) : root);
  for (const k of remap.keys()) {
    const [num, gen] = k.split(' ');
    ctx.delete(PDFRef.of(Number(num), Number(gen)));
  }
  return remap.size;
}
