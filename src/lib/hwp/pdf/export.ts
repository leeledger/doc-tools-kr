// HWP → PDF bytes in the page (SPIKE-HWP-DIRECT §6.1–6.3, "H"): one page at a time from the worker, the
// production post-processing (svg-dom), the vector writer, and the raster fallback for a page the writer cannot
// express (something unsupported, a glyph no bundled face has, or a non-finite number). A page that fails to
// parse becomes a blank page of the right size. The main thread yields after every page, and the AbortSignal is
// checked between pages; an abort never reaches save().
import { PDFDocument } from '@cantoo/pdf-lib';
import fontkit from '@cantoo/fontkit';
import type { PageInfo } from '../engine';
import { addSpaces, dropCellClips, ensureViewBox, fitFillImages, parsePageSvg, sanitize, type TextRun } from '../svg-dom';
import type { FaceTable } from './faces';
import { createFontSource } from './font-source';
import { ImageCache, canvasRecode, type ImageStats, type Recode } from './images';
import { rasterPageWith, type RasterPage } from './raster-page';
import { SvgPdfWriter } from './svg-to-pdf';

export interface ExportPage {
  svg: string;
  runs: TextRun[];
  failed: boolean;
}

export interface ExportStats {
  pages: number;
  failedPages: number;
  fallbackPages: number;
  /** Elements and attributes the sanitizer removed (rhwp output never needs any). */
  sanitizerRemovals: number;
  glyphs: number;
  missingGlyphs: number;
  /** The code points no bundled face has (up to 40, as text), for the report. */
  missingChars: string;
  nonFinite: number;
  /** What sent pages to the fallback: element or reason → pages. */
  unsupported: Record<string, number>;
  images: ImageStats;
  /** .woff bytes fetched (0 when the fonts were injected). */
  fontBytes: number;
}

export interface ExportOptions {
  infos: PageInfo[];
  getPage(i: number): Promise<ExportPage>;
  onProgress?(done: number, total: number): void;
  signal?: AbortSignal;
  /** Injected in tests; the browser loads the face list and the slices (font-source.ts). */
  fonts?: FaceTable;
  recode?: Recode;
  /** Injected in tests; the browser draws the page on a canvas (raster-page.ts). */
  raster?: RasterPage;
}

const aborted = (): DOMException => new DOMException('PDF export aborted', 'AbortError');
const yieldToLoop = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export async function exportPdf(o: ExportOptions): Promise<{ blob: Blob; stats: ExportStats }> {
  const check = (): void => {
    if (o.signal?.aborted) throw aborted();
  };
  check();
  let fonts = o.fonts;
  let fontBytes = (): number => 0;
  if (!fonts) {
    const src = await createFontSource();
    fonts = src.table;
    fontBytes = src.fetchedBytes;
  }
  check();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit as unknown as Parameters<PDFDocument['registerFontkit']>[0]);
  const images = new ImageCache(pdf, o.recode ?? canvasRecode);
  const writer = new SvgPdfWriter(pdf, fonts, images);
  const raster = o.raster ?? rasterPageWith(fonts, writer);
  const n = o.infos.length;
  const stats: ExportStats = { pages: n, failedPages: 0, fallbackPages: 0, sanitizerRemovals: 0, glyphs: 0, missingGlyphs: 0, missingChars: '', nonFinite: 0, unsupported: {}, images: images.stats, fontBytes: 0 };
  for (let i = 0; i < n; i++) {
    const info = o.infos[i]!;
    const p = await o.getPage(i);
    check();
    const parsed = p.failed ? null : parsePageSvg(p.svg).svg;
    if (!parsed) {
      stats.failedPages++;
      pdf.addPage([info.w * 0.75, info.h * 0.75]);
    } else {
      stats.sanitizerRemovals += sanitize(parsed);
      ensureViewBox(parsed);
      dropCellClips(parsed);
      fitFillImages(parsed);
      addSpaces(parsed, p.runs);
      const { stats: s } = await writer.addPage(parsed, info.w, info.h, { mode: 'full' });
      stats.nonFinite += s.nonFinite;
      if (s.unsupported.length || s.missingGlyphs || s.nonFinite) {
        pdf.removePage(pdf.getPageCount() - 1);
        for (const u of new Set(s.unsupported)) stats.unsupported[u] = (stats.unsupported[u] ?? 0) + 1;
        if (s.missingGlyphs) stats.unsupported['missing-glyph'] = (stats.unsupported['missing-glyph'] ?? 0) + 1;
        if (s.nonFinite) stats.unsupported['non-finite'] = (stats.unsupported['non-finite'] ?? 0) + 1;
        stats.missingGlyphs += s.missingGlyphs;
        stats.fallbackPages++;
        const t = await raster(pdf, parsed as SVGSVGElement, info.w, info.h);
        stats.glyphs += t.glyphs;
      } else stats.glyphs += s.glyphs;
    }
    o.onProgress?.(i + 1, n);
    await yieldToLoop();
    check();
  }
  const bytes = await pdf.save({ useObjectStreams: true });
  stats.fontBytes = fontBytes();
  stats.missingChars = [...fonts.missing.keys()].slice(0, 40).map((c) => String.fromCodePoint(c)).join('');
  return { blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), stats };
}
