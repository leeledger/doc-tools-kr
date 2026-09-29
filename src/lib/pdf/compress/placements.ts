// Displayed size of every image XObject (spike lib.mjs `imagePlacements`): follows q/Q/cm/Do through
// page content and nested Form XObjects (depth ≤ 8) and keeps, per image ref, the largest size at
// which it is drawn, in points.
import { PDFArray, PDFDict, PDFName, PDFRef, PDFStream, decodePDFRawStream, PDFRawStream } from '@cantoo/pdf-lib';
import type { PDFContext, PDFDocument, PDFObject } from '@cantoo/pdf-lib';
import { MAX_CONTENT_BYTES, contentOps } from './contentOps';

export type Matrix = [number, number, number, number, number, number];

export interface Placement {
  w: number;
  h: number;
}

export interface Placements {
  /** Keyed by the image ref, e.g. "12 0 R". */
  place: Map<string, Placement>;
  /** Pages whose content could not be parsed; their images fall back to the largest page size. */
  parseFail: number;
}

const N = (s: string): PDFName => PDFName.of(s);
const MAX_DEPTH = 8;

export function lookup(ctx: PDFContext, o: PDFObject | undefined): PDFObject | undefined {
  return o instanceof PDFRef ? ctx.lookup(o) : o;
}

export function nameOf(o: PDFObject | undefined): string | null {
  return o instanceof PDFName ? o.decodeText() : null;
}

export function numberOf(o: PDFObject | undefined): number | undefined {
  const v = (o as { asNumber?: () => number } | undefined)?.asNumber?.();
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Decoded bytes of a content or form stream, or null if its filter is not supported. */
export function streamBytes(s: PDFStream): Uint8Array | null {
  if (!(s instanceof PDFRawStream)) return null;
  try {
    return decodePDFRawStream(s).decode();
  } catch {
    return null;
  }
}

export const mul = (m: readonly number[], n: readonly number[]): Matrix => [
  m[0]! * n[0]! + m[1]! * n[2]!,
  m[0]! * n[1]! + m[1]! * n[3]!,
  m[2]! * n[0]! + m[3]! * n[2]!,
  m[2]! * n[1]! + m[3]! * n[3]!,
  m[4]! * n[0]! + m[5]! * n[2]! + n[4]!,
  m[4]! * n[1]! + m[5]! * n[3]! + n[5]!,
];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function imagePlacements(doc: PDFDocument): Placements {
  const ctx = doc.context;
  const place = new Map<string, Placement>();
  let parseFail = 0;

  // Content bytes left for the current page (page content plus every form it draws).
  let budget = 0;

  const visit = (content: Uint8Array | null, resources: PDFDict | undefined, ctm0: Matrix, depth: number): void => {
    if (!content || depth > MAX_DEPTH || budget <= 0) return;
    const limit = Math.min(content.length, budget);
    budget -= limit;
    const xobjs = lookup(ctx, resources?.get(N('XObject')));
    const stack: Matrix[] = [];
    let ctm = ctm0;
    for (const { op, args } of contentOps(content, limit)) {
      if (op === 'q') stack.push(ctm);
      else if (op === 'Q') ctm = stack.pop() ?? ctm0;
      else if (op === 'cm') {
        const m = args.slice(-6);
        if (m.length === 6 && m.every((a) => typeof a === 'number')) ctm = mul(m as number[], ctm);
      } else if (op === 'Do' && xobjs instanceof PDFDict) {
        const last = args[args.length - 1];
        if (!last || typeof last !== 'object') continue;
        const ref = xobjs.get(N(last.name));
        const xo = lookup(ctx, ref);
        if (!(xo instanceof PDFStream)) continue;
        const subtype = nameOf(xo.dict.get(N('Subtype')));
        if (subtype === 'Image' && ref instanceof PDFRef) {
          const w = Math.hypot(ctm[0], ctm[1]);
          const h = Math.hypot(ctm[2], ctm[3]);
          const k = ref.toString();
          const cur = place.get(k) ?? { w: 0, h: 0 };
          place.set(k, { w: Math.max(cur.w, w), h: Math.max(cur.h, h) });
        } else if (subtype === 'Form') {
          const mArr = lookup(ctx, xo.dict.get(N('Matrix')));
          const fm = mArr instanceof PDFArray ? mArr.asArray().map((x) => numberOf(lookup(ctx, x)) ?? 0) : IDENTITY;
          const res = lookup(ctx, xo.dict.get(N('Resources')));
          visit(streamBytes(xo), res instanceof PDFDict ? res : resources, mul(fm.length === 6 ? fm : IDENTITY, ctm), depth + 1);
        }
      }
    }
  };

  for (const page of doc.getPages()) {
    try {
      budget = MAX_CONTENT_BYTES;
      const node = page.node;
      const contents = lookup(ctx, node.get(N('Contents')));
      const parts = contents instanceof PDFArray ? contents.asArray().map((r) => lookup(ctx, r)) : [contents];
      const chunks: Uint8Array[] = [];
      for (const s of parts) {
        if (!(s instanceof PDFStream)) continue;
        const b = streamBytes(s);
        if (b) chunks.push(b, new Uint8Array([10]));
      }
      const all = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
      let o = 0;
      for (const c of chunks) {
        all.set(c, o);
        o += c.length;
      }
      visit(all, node.Resources(), IDENTITY, 0);
    } catch {
      parseFail++;
    }
  }
  return { place, parseFail };
}
