// Merge "plus" on @cantoo/pdf-lib: copyPages, plus
// - internal link destinations detached before copying and re-attached to the new page objects
//   (plain copyPages drags orphan copies of target pages along); annotation /P back-pointers are
//   handled the same way, since form-field /Kids otherwise pull in copies of other pages,
// - AcroForm fields merged into one form, clashing names renamed `<name>_<fileNo>`,
// - outline trees copied and remapped, with an optional top-level bookmark per file.
// Typed port of spikes/pdf/harness/merge_plus.mjs. Addition over the spike: the /P detach (step 0).
import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFObjectCopier,
  PDFRef,
  PDFString,
  degrees,
  type PDFContext,
  type PDFObject,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { PdfCorruptError, PdfError, assertPdfHeader, isOutOfMemory, mapLoadError } from './errors';

export interface MergeInput {
  bytes: Uint8Array;
  password?: string;
  /** 0-based source page indices, in output order. `null`/omitted = all pages. */
  pages?: number[] | null;
  /** Extra clockwise rotation in degrees, per selected page (same order as `pages`). */
  rotate?: number[];
  /** Title of the per-file bookmark. */
  title?: string;
}

export interface MergeReport {
  renamedFields: number;
  droppedLinkDests: number;
  remappedLinkDests: number;
  pageCount: number;
}

export interface MergeOptions {
  addFileBookmarks?: boolean;
  /** Called after each input file has been copied. */
  onProgress?: (done: number, total: number) => void;
}

export const PRODUCER = '문서딱 (doc-tools-kr)';

interface OutlineItem {
  title: string;
  pageRef: PDFRef;
  rest: PDFObject[];
  children: OutlineItem[];
}

interface PendingLink {
  page: number;
  ai: number;
  ti: number;
  rest: PDFObject[];
}

const N = (s: string): PDFName => PDFName.of(s);

function lookup(ctx: PDFContext, o: PDFObject | undefined): PDFObject | undefined {
  return o instanceof PDFRef ? ctx.lookup(o) : o;
}

function nameOf(o: PDFObject | undefined): string | null {
  return o instanceof PDFName ? o.asString().slice(1) : null;
}

function txt(o: PDFObject | undefined): string {
  if (o instanceof PDFString || o instanceof PDFHexString) return o.decodeText();
  if (o instanceof PDFName) return o.asString().slice(1);
  return o ? String(o) : '';
}

/** Explicit destinations may keep their tail (/XYZ l t z, /Fit, ...) only if it holds plain values. */
function isPlainDestTail(rest: PDFObject[]): boolean {
  return rest.length > 0 && rest.every((x) => x instanceof PDFName || x instanceof PDFNumber || x === PDFNull);
}

function namedDests(doc: PDFDocument): Map<string, PDFObject> {
  const ctx = doc.context;
  const m = new Map<string, PDFObject>();
  const walk = (nodeIn: PDFObject | undefined, depth = 0): void => {
    const node = lookup(ctx, nodeIn);
    if (!(node instanceof PDFDict) || depth > 30) return;
    const ns = lookup(ctx, node.get(N('Names')));
    if (ns instanceof PDFArray) {
      for (let i = 0; i + 1 < ns.size(); i += 2) m.set(txt(lookup(ctx, ns.get(i))), ns.get(i + 1));
    }
    const kids = lookup(ctx, node.get(N('Kids')));
    if (kids instanceof PDFArray) kids.asArray().forEach((k) => walk(k, depth + 1));
  };
  const names = lookup(ctx, doc.catalog.get(N('Names')));
  if (names instanceof PDFDict) walk(names.get(N('Dests')));
  const old = lookup(ctx, doc.catalog.get(N('Dests')));
  if (old instanceof PDFDict) for (const [k, v] of old.entries()) m.set(txt(k), v);
  return m;
}

function resolveDest(ctx: PDFContext, dest: PDFObject, names: Map<string, PDFObject>): PDFArray | null {
  let d = lookup(ctx, dest);
  if (d && !(d instanceof PDFArray)) d = lookup(ctx, names.get(txt(d)));
  if (d instanceof PDFDict) d = lookup(ctx, d.get(N('D')));
  return d instanceof PDFArray ? d : null;
}

function destTail(ctx: PDFContext, arr: PDFArray): PDFObject[] {
  return arr
    .asArray()
    .slice(1)
    .map((x) => lookup(ctx, x))
    .filter((x): x is PDFObject => x !== undefined);
}

/** Copies the source outline, remapping each entry to its output page. Entries whose page was removed keep only their children. */
function copyOutline(src: PDFDocument, map: Map<number, PDFRef>): OutlineItem[] {
  const ctx = src.context;
  const names = namedDests(src);
  const refs = src.getPages().map((p) => p.ref.toString());
  const ol = lookup(ctx, src.catalog.get(N('Outlines')));
  if (!(ol instanceof PDFDict)) return [];
  const conv = (first: PDFObject | undefined, depth: number): OutlineItem[] => {
    const res: OutlineItem[] = [];
    let cur = first;
    let guard = 0;
    while (cur && guard++ < 20000 && depth < 20) {
      const it = lookup(ctx, cur);
      if (!(it instanceof PDFDict)) break;
      let dest = it.get(N('Dest'));
      const a = lookup(ctx, it.get(N('A')));
      if (!dest && a instanceof PDFDict && nameOf(a.get(N('S'))) === 'GoTo') dest = a.get(N('D'));
      const arr = dest ? resolveDest(ctx, dest, names) : null;
      const si = arr ? refs.indexOf(String(arr.get(0))) : -1;
      const children = conv(it.get(N('First')), depth + 1);
      const pageRef = map.get(si);
      if (arr && pageRef) {
        res.push({ title: txt(lookup(ctx, it.get(N('Title')))), pageRef, rest: destTail(ctx, arr), children });
      } else {
        res.push(...children);
      }
      cur = it.get(N('Next'));
    }
    return res;
  };
  return conv(ol.get(N('First')), 0);
}

function writeOutline(out: PDFDocument, roots: OutlineItem[]): void {
  if (!roots.length) return;
  const ctx = out.context;
  const outlines = ctx.obj({ Type: 'Outlines' });
  const olRef = ctx.register(outlines);
  const build = (items: OutlineItem[], parentRef: PDFRef): { first: PDFRef; last: PDFRef; count: number } => {
    const refs = items.map(() => ctx.nextRef());
    let count = 0;
    items.forEach((it, i) => {
      const dest = isPlainDestTail(it.rest) ? [it.pageRef, ...it.rest] : [it.pageRef, 'Fit'];
      const d = ctx.obj({ Title: PDFHexString.fromText(it.title), Parent: parentRef, Dest: dest });
      if (i > 0) d.set(N('Prev'), refs[i - 1]!);
      if (i < items.length - 1) d.set(N('Next'), refs[i + 1]!);
      if (it.children.length) {
        const c = build(it.children, refs[i]!);
        d.set(N('First'), c.first);
        d.set(N('Last'), c.last);
        d.set(N('Count'), PDFNumber.of(-c.count));
      }
      ctx.assign(refs[i]!, d);
      count++;
    });
    return { first: refs[0]!, last: refs[refs.length - 1]!, count };
  };
  const r = build(roots, olRef);
  outlines.set(N('First'), r.first);
  outlines.set(N('Last'), r.last);
  outlines.set(N('Count'), PDFNumber.of(r.count));
  out.catalog.set(N('Outlines'), olRef);
}

async function loadSource(f: MergeInput): Promise<PDFDocument> {
  assertPdfHeader(f.bytes);
  try {
    return await PDFDocument.load(f.bytes, {
      password: f.password ?? '',
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
  } catch (err) {
    throw mapLoadError(err, Boolean(f.password));
  }
}

/**
 * Tags an error with the input file it came from. Load and copy failures are already PdfErrors
 * (not-pdf / password / corrupt); anything else is a bug on our side and stays `unknown`, so the
 * user is never told to remove a file that is fine.
 * @internal exported for tests
 */
export function withFileIndex(err: unknown, fileIndex: number): unknown {
  if (isOutOfMemory(err)) return err;
  const e = err instanceof PdfError ? err : new PdfError('unknown', err instanceof Error ? err.message : String(err));
  e.fileIndex = fileIndex;
  return e;
}

/** Runs a step that reads the input structure; malformed input surfaces as PdfCorruptError. */
async function readingInput<T>(fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isOutOfMemory(err) || err instanceof PdfError) throw err;
    throw new PdfCorruptError(err instanceof Error ? err.message : String(err));
  }
}

/** Deletes /P from every widget in the AcroForm field tree (widgets need not be listed in any page /Annots). */
function stripFieldTreeP(ctx: PDFContext, acro: PDFDict): void {
  const seen = new Set<PDFObject>();
  const walk = (o: PDFObject | undefined, depth: number): void => {
    const d = lookup(ctx, o);
    if (!(d instanceof PDFDict) || seen.has(d) || depth > 50) return;
    seen.add(d);
    d.delete(N('P'));
    const kids = lookup(ctx, d.get(N('Kids')));
    if (kids instanceof PDFArray) kids.asArray().forEach((k) => walk(k, depth + 1));
  };
  const fields = lookup(ctx, acro.get(N('Fields')));
  if (fields instanceof PDFArray) fields.asArray().forEach((f) => walk(f, 0));
}

/** Adds /DR /Font entries of a later file that the output /DR lacks (first file wins per key). */
function mergeDrFonts(octx: PDFContext, dr: PDFDict, sctx: PDFContext, sDr: PDFDict, copier: PDFObjectCopier): void {
  const srcFonts = lookup(sctx, sDr.get(N('Font')));
  if (!(srcFonts instanceof PDFDict)) return;
  let fonts = lookup(octx, dr.get(N('Font')));
  if (!(fonts instanceof PDFDict)) {
    fonts = octx.obj({});
    dr.set(N('Font'), fonts);
  }
  const target = fonts as PDFDict;
  for (const [key, value] of srcFonts.entries()) {
    if (!target.has(key)) target.set(key, copier.copy(value));
  }
}

/** First of `base`, `base_2`, `base_3`, ... that `taken` rejects. */
function freeName(base: string, taken: (n: string) => boolean): string {
  let name = base;
  for (let k = 2; taken(name); k++) name = `${base}_${k}`;
  return name;
}

function normalizeAngle(a: number): number {
  return ((a % 360) + 360) % 360;
}

export async function mergePlus(
  files: MergeInput[],
  opts: MergeOptions = {},
): Promise<{ bytes: Uint8Array; report: MergeReport }> {
  const addFileBookmarks = opts.addFileBookmarks ?? true;
  const out = await PDFDocument.create({ updateMetadata: false });
  const octx = out.context;
  const fieldRefs: PDFRef[] = [];
  const fieldKeys = new Set<string>();
  const usedNames = new Set<string>();
  let dr: PDFDict | null = null;
  let da: PDFObject | null = null;
  let needApp = false;
  const outlineRoots: OutlineItem[] = [];
  const report: MergeReport = { renamedFields: 0, droppedLinkDests: 0, remappedLinkDests: 0, pageCount: 0 };
  let expectedPages = 0;

  for (let fi = 0; fi < files.length; fi++) {
    const f = files[fi]!;
    try {
      const src = await loadSource(f);
      const sctx = src.context;
      const srcPages = await readingInput(() => src.getPages());
      const srcRefs = srcPages.map((p) => p.ref.toString());
      const idx = f.pages ?? src.getPageIndices();
      if (idx.some((i) => !Number.isInteger(i) || i < 0 || i >= srcPages.length)) {
        throw new PdfError('unknown', 'page index out of range');
      }
      expectedPages += idx.length;
      const names = namedDests(src);

      // 0. Detach annotation /P (page back-pointers) on every source page. A form field's /Kids reach
      //    widgets on other pages, and their /P would drag orphan copies of those pages along.
      //    Page /Annots first (to remember which widgets had /P), then the AcroForm field tree.
      const hadP = new Set<string>();
      srcPages.forEach((page, i) => {
        const annots = lookup(sctx, page.node.get(N('Annots')));
        if (!(annots instanceof PDFArray)) return;
        annots.asArray().forEach((a, ai) => {
          const ad = lookup(sctx, a);
          if (ad instanceof PDFDict && ad.has(N('P'))) {
            ad.delete(N('P'));
            hadP.add(`${i}:${ai}`);
          }
        });
      });
      const sAcro = lookup(sctx, src.catalog.get(N('AcroForm')));
      if (sAcro instanceof PDFDict) stripFieldTreeP(sctx, sAcro);

      // 1. Detach internal link destinations before copying.
      const pending: PendingLink[] = [];
      for (const i of new Set(idx)) {
        const annots = lookup(sctx, srcPages[i]!.node.get(N('Annots')));
        if (!(annots instanceof PDFArray)) continue;
        annots.asArray().forEach((a, ai) => {
          const ad = lookup(sctx, a);
          if (!(ad instanceof PDFDict)) return;
          let dest = ad.get(N('Dest'));
          const act = lookup(sctx, ad.get(N('A')));
          let viaA = false;
          if (!dest && act instanceof PDFDict && nameOf(act.get(N('S'))) === 'GoTo') {
            dest = act.get(N('D'));
            viaA = true;
          }
          if (!dest) return;
          const arr = resolveDest(sctx, dest, names);
          if (viaA) ad.delete(N('A'));
          else ad.delete(N('Dest'));
          pending.push({
            page: i,
            ai,
            ti: arr ? srcRefs.indexOf(String(arr.get(0))) : -1,
            rest: arr ? destTail(sctx, arr) : [],
          });
        });
      }

      const pages: PDFPage[] = await readingInput(() => out.copyPages(src, idx));
      const base = out.getPageCount();
      pages.forEach((p, k) => {
        const extra = f.rotate?.[k];
        if (extra) p.setRotation(degrees(normalizeAngle(p.getRotation().angle + extra)));
        out.addPage(p);
      });
      const map = new Map<number, PDFRef>();
      idx.forEach((si, k) => {
        if (!map.has(si)) map.set(si, out.getPage(base + k).ref);
      });

      // 2. Re-attach /P to the copied page and link destinations to the new page objects
      //    (copyPages preserves annotation order).
      idx.forEach((si, k) => {
        const an = lookup(octx, pages[k]!.node.get(N('Annots')));
        if (!(an instanceof PDFArray)) return;
        an.asArray().forEach((a, ai) => {
          const d = lookup(octx, a);
          if (d instanceof PDFDict && hadP.has(`${si}:${ai}`) && !d.has(N('P'))) d.set(N('P'), pages[k]!.ref);
        });
      });
      for (const pd of pending) {
        idx.forEach((si, k) => {
          if (si !== pd.page) return;
          const an = lookup(octx, pages[k]!.node.get(N('Annots')));
          if (!(an instanceof PDFArray)) return;
          const d = lookup(octx, an.get(pd.ai));
          if (!(d instanceof PDFDict)) return;
          const target = map.get(pd.ti);
          if (!target) {
            report.droppedLinkDests++;
            return;
          }
          d.set(N('Dest'), octx.obj(isPlainDestTail(pd.rest) ? [target, ...pd.rest] : [target, 'Fit']));
          report.remappedLinkDests++;
        });
      }

      // 3. Form fields.
      if (sAcro instanceof PDFDict) {
        const copier = PDFObjectCopier.for(sctx, octx);
        const sDr = lookup(sctx, sAcro.get(N('DR')));
        if (sDr instanceof PDFDict) {
          if (!dr) dr = copier.copy(sDr);
          else mergeDrFonts(octx, dr, sctx, sDr, copier);
        }
        if (!da && sAcro.get(N('DA'))) da = sAcro.get(N('DA')) ?? null;
        const na = lookup(sctx, sAcro.get(N('NeedAppearances')));
        if (na instanceof PDFBool && na.asBoolean()) needApp = true;
        // Root fields of this file, in page order. Names that clash with an earlier file get the first
        // free `<name>_<fileNo>[_k]`; the final names are what later files are checked against.
        const roots: { d: PDFDict; nm: string }[] = [];
        for (const p of pages) {
          const an = lookup(octx, p.node.get(N('Annots')));
          if (!(an instanceof PDFArray)) continue;
          for (const r of an.asArray()) {
            let d = lookup(octx, r);
            if (!(d instanceof PDFDict) || nameOf(d.get(N('Subtype'))) !== 'Widget') continue;
            let ref: PDFObject | undefined = r;
            let g = 0;
            while (d instanceof PDFDict && d.get(N('Parent')) && g++ < 30) {
              ref = d.get(N('Parent'));
              d = lookup(octx, ref);
            }
            if (!(ref instanceof PDFRef) || !(d instanceof PDFDict) || fieldKeys.has(ref.toString())) continue;
            fieldKeys.add(ref.toString());
            fieldRefs.push(ref);
            roots.push({ d, nm: txt(lookup(octx, d.get(N('T')))) });
          }
        }
        const original = new Set(roots.map((r) => r.nm));
        const finals = new Set<string>();
        for (const r of roots) {
          let name = r.nm;
          if (usedNames.has(name)) {
            name = freeName(`${r.nm}_${fi + 1}`, (n) => usedNames.has(n) || original.has(n) || finals.has(n));
            r.d.set(N('T'), PDFHexString.fromText(name));
            report.renamedFields++;
          }
          finals.add(name);
        }
        finals.forEach((n) => usedNames.add(n));
      }

      // 4. Bookmarks.
      const kids = copyOutline(src, map);
      if (addFileBookmarks && files.length > 1 && pages.length) {
        outlineRoots.push({ title: f.title || `문서 ${fi + 1}`, pageRef: out.getPage(base).ref, rest: [], children: kids });
      } else {
        outlineRoots.push(...kids);
      }
    } catch (err) {
      throw withFileIndex(err, fi);
    }
    opts.onProgress?.(fi + 1, files.length);
  }

  if (fieldRefs.length) {
    const acro = octx.obj({ Fields: fieldRefs });
    if (dr) acro.set(N('DR'), dr);
    if (da) acro.set(N('DA'), da);
    if (needApp) acro.set(N('NeedAppearances'), PDFBool.True);
    out.catalog.set(N('AcroForm'), octx.register(acro));
  }
  writeOutline(out, outlineRoots);
  out.setProducer(PRODUCER);
  // The worker re-checks this count against the reloaded output (verifyOutput).
  report.pageCount = expectedPages;
  const bytes = await out.save({ useObjectStreams: true, updateFieldAppearances: false });
  return { bytes, report };
}
