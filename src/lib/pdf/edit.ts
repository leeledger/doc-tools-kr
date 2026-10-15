// PDF 글자 넣기·편집 (TOOLS1015 E1): white boxes, then text lines, drawn on the pages of one PDF with pdf-lib, in
// edit.worker.ts. Loaded as signPdf loads (password, damaged objects tolerated, PDF/A-1 saved without object streams);
// the document is changed in place, so the original pages stay vector and forms, outlines and links stay. Text goes in
// with the HWP PDF faces (Noto Sans KR slices, SIL OFL): each code point resolves to one slice (FaceTable, as the HWP
// writer), a line is drawn as runs of one face each, and each face is embedded once per document as a subset, so the
// inserted text is real text (copy and search work).
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFStream, degrees, rgb, type PDFFont, type PDFObject } from '@cantoo/pdf-lib';
import fontkit from '@cantoo/fontkit';
import type { FaceTable, LoadedFace } from '../hwp/pdf/faces';
import { hasSignature } from './compress/signature';
import { PdfCorruptError, PdfError, assertPdfHeader, isOutOfMemory, mapLoadError } from './errors';
import { PRODUCER } from './mergePlus';

export interface EditLine {
  text: string;
  /** Baseline start in PDF space. */
  x: number;
  y: number;
}

export type EditDraw =
  | {
      kind: 'text';
      /** 0-based page. */
      page: number;
      lines: EditLine[];
      size: number;
      /** 0-255. */
      rgb: readonly [number, number, number];
      /** Counter-clockwise degrees (the page's /Rotate). */
      rotate: number;
    }
  | {
      kind: 'white';
      page: number;
      /** Lower-left corner as seen, in PDF space; size; counter-clockwise turn (as a pdf-sign stamp). */
      x: number;
      y: number;
      width: number;
      height: number;
      rotate: number;
    };

export interface EditResult {
  bytes: Uint8Array;
  pageCount: number;
  /** The input carries a digital signature (the output no longer keeps it valid). */
  signed: boolean;
}

/** Characters no bundled face has (nothing was saved). */
export class MissingGlyphError extends Error {
  constructor(readonly chars: string) {
    super(`no face for ${chars}`);
  }
}

/** One line as runs of one face each (a code point no face has is collected in `missing`). */
export async function runsOf(text: string, fonts: FaceTable, chain: string, missing: Set<string>): Promise<{ face: LoadedFace; text: string }[]> {
  const runs: { face: LoadedFace; text: string }[] = [];
  for (const ch of text) {
    const r = await fonts.resolve(chain, 400, ch.codePointAt(0)!);
    if (!r) {
      missing.add(ch);
      continue;
    }
    const last = runs[runs.length - 1];
    if (last && last.face === r.face) last.text += ch;
    else runs.push({ face: r.face, text: ch });
  }
  return runs;
}

export async function editPdf(input: Uint8Array, password: string | undefined, draws: readonly EditDraw[], fonts: FaceTable, chain: string): Promise<EditResult> {
  assertPdfHeader(input);
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input, { password: password ?? '', updateMetadata: false, throwOnInvalidObject: false });
  } catch (err) {
    throw mapLoadError(err, Boolean(password));
  }
  // Every line resolved before anything is drawn: a character no face has stops the save with the full list.
  const missing = new Set<string>();
  const planned: { draw: EditDraw; runs: { face: LoadedFace; text: string }[][] }[] = [];
  for (const d of draws) planned.push({ draw: d, runs: d.kind === 'text' ? await Promise.all(d.lines.map((l) => runsOf(l.text, fonts, chain, missing))) : [] });
  if (missing.size) throw new MissingGlyphError([...missing].join(''));
  try {
    doc.registerFontkit(fontkit as unknown as Parameters<PDFDocument['registerFontkit']>[0]);
    const signed = hasSignature(doc);
    const pages = doc.getPages();
    const embedded = new Map<LoadedFace, PDFFont>();
    const fontOf = async (face: LoadedFace): Promise<PDFFont> => {
      let f = embedded.get(face);
      if (!f) embedded.set(face, (f = await doc.embedFont(face.sfnt, { subset: true })));
      return f;
    };
    // White boxes first: new text may go on top of a box that hides the old text.
    const ordered = [...planned.filter((p) => p.draw.kind === 'white'), ...planned.filter((p) => p.draw.kind === 'text')];
    for (const { draw: d, runs } of ordered) {
      const page = pages[d.page];
      if (!page) throw new PdfError('unknown', `no page ${d.page}`);
      if (d.kind === 'white') {
        page.drawRectangle({ x: d.x, y: d.y, width: d.width, height: d.height, rotate: degrees(d.rotate), color: rgb(1, 1, 1), borderWidth: 0 });
        continue;
      }
      const color = rgb(d.rgb[0] / 255, d.rgb[1] / 255, d.rgb[2] / 255);
      const t = (d.rotate * Math.PI) / 180;
      for (const [i, line] of d.lines.entries()) {
        let { x, y } = line;
        for (const run of runs[i] ?? []) {
          const font = await fontOf(run.face);
          page.drawText(run.text, { x, y, size: d.size, font, color, rotate: degrees(d.rotate) });
          const w = font.widthOfTextAtSize(run.text, d.size);
          x += Math.cos(t) * w;
          y += Math.sin(t) * w;
        }
      }
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

/** A page replaced by a picture (PDF 글자 넣기·편집 「그림으로 바꿔 저장」, TOOLS1015 E2). */
export interface FlatPageIn {
  /** 0-based page. */
  index: number;
  jpeg: Uint8Array;
  /** The page size as seen (points): the new page has it, unrotated, with the picture over all of it. */
  width: number;
  height: number;
}

/** Replaces each listed page of an unencrypted PDF (the E1 output) by a same-size page holding only its picture. */
export async function flattenPdf(input: Uint8Array, pages: readonly FlatPageIn[]): Promise<{ bytes: Uint8Array; pageCount: number }> {
  assertPdfHeader(input);
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input, { updateMetadata: false, throwOnInvalidObject: false });
  } catch (err) {
    throw mapLoadError(err, false);
  }
  try {
    // The annotations (form widgets among them) of the pages being replaced: their fields go too.
    const gone = new Set<string>();
    for (const p of pages) {
      if (p.index < 0 || p.index >= doc.getPageCount()) throw new PdfError('unknown', `no page ${p.index}`);
      const annots = doc.getPage(p.index).node.Annots();
      for (let i = 0; i < (annots?.size() ?? 0); i++) {
        const r = annots!.get(i);
        if (r instanceof PDFRef) gone.add(r.toString());
      }
    }
    for (const p of pages) {
      const image = await doc.embedJpg(p.jpeg);
      const page = doc.insertPage(p.index, [p.width, p.height]);
      page.drawImage(image, { x: 0, y: 0, width: p.width, height: p.height });
      doc.removePage(p.index + 1);
    }
    dropFields(doc, gone);
    doc.setProducer(PRODUCER);
    // removePage deletes only the page dictionary: its content streams, fonts, annotations and field values would still
    // be written. Everything no longer reachable from the trailer is dropped, so the covered text leaves the file.
    dropUnreachable(doc);
    const bytes = await doc.save({ useObjectStreams: true, updateFieldAppearances: false }).catch((err: unknown) => {
      if (/PDF\/A-1 forbids object/i.test(err instanceof Error ? err.message : '')) return doc.save({ useObjectStreams: false, updateFieldAppearances: false });
      throw err;
    });
    return { bytes, pageCount: doc.getPageCount() };
  } catch (err) {
    if (isOutOfMemory(err) || err instanceof PdfError) throw err;
    throw new PdfCorruptError(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Removes from /AcroForm /Fields every widget in `gone` (a removed page's annotations) and every field left without
 * widgets, so a typed value (/V) on a replaced page does not stay in the form.
 */
function dropFields(doc: PDFDocument, gone: ReadonlySet<string>): void {
  const acro = doc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  const fields = acro?.lookupMaybe(PDFName.of('Fields'), PDFArray);
  if (!acro || !fields || !gone.size) return;
  const KIDS = PDFName.of('Kids');
  /** Prunes `arr` in place; true when something is left. */
  const prune = (arr: PDFArray): boolean => {
    for (let i = arr.size() - 1; i >= 0; i--) {
      const ref = arr.get(i);
      const node = doc.context.lookup(ref);
      let keep = true;
      if (ref instanceof PDFRef && gone.has(ref.toString())) keep = false;
      else if (node instanceof PDFDict) {
        const kids = node.lookupMaybe(KIDS, PDFArray);
        if (kids && kids.size() > 0) keep = prune(kids);
      }
      if (!keep) arr.remove(i);
    }
    return arr.size() > 0;
  };
  prune(fields);
}

/** Deletes every indirect object that the trailer's /Root and /Info no longer reach. */
export function dropUnreachable(doc: PDFDocument): void {
  const ctx = doc.context;
  const seen = new Set<string>();
  const stack: PDFObject[] = [];
  const { Root, Info } = ctx.trailerInfo;
  if (Root) stack.push(Root);
  if (Info) stack.push(Info);
  while (stack.length) {
    const o = stack.pop()!;
    if (o instanceof PDFRef) {
      const k = o.toString();
      if (seen.has(k)) continue;
      seen.add(k);
      const target = ctx.lookup(o);
      if (target) stack.push(target);
    } else if (o instanceof PDFDict) {
      for (const [, v] of o.entries()) stack.push(v);
    } else if (o instanceof PDFArray) {
      for (let i = 0; i < o.size(); i++) stack.push(o.get(i));
    } else if (o instanceof PDFStream) {
      stack.push(o.dict);
    }
  }
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!seen.has(ref.toString())) ctx.delete(ref);
}
