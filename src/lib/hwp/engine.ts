// The document session behind the worker (brief Step 5 §2, "hwp.worker.ts"), framework-free so the error
// mapping is unit-tested with a fake rhwp. getPageText() is never called (R13: super-linear, 79 s of 85 s on
// a 411-page file); spaces come from getPageTextLayout().runs instead.
import { HwpError, type HwpErrorCode } from './errors';
import type { Features } from './features';
import { rewriteFonts, scopeIds } from './svg-string';
import { slimRuns, type TextRun } from './svg-dom';

/** The part of rhwp's HwpDocument this tool uses. */
export interface RhwpDocument {
  pageCount(): number;
  getPageInfo(page: number): string;
  renderPageSvg(page: number): string;
  getPageTextLayout(page: number): string;
  free(): void;
}

export type RhwpDocumentCtor = new (bytes: Uint8Array) => RhwpDocument;

export interface PageInfo {
  w: number;
  h: number;
}

export interface RenderedPage {
  i: number;
  svg: string;
  runs: TextRun[];
}

/** A parse failure: memory → oom; otherwise a 배포용 document → distribution; else corrupt. */
export function classifyParseError(err: unknown, features: Pick<Features, 'distribution'>): HwpErrorCode {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof RangeError || (err as { name?: unknown } | null)?.name === 'RangeError' || /out of memory/i.test(msg)) return 'oom';
  return features.distribution ? 'distribution' : 'corrupt';
}

export function openDocument(Ctor: RhwpDocumentCtor, bytes: Uint8Array, features: Pick<Features, 'distribution'>): RhwpDocument {
  try {
    return new Ctor(bytes);
  } catch (err) {
    throw new HwpError(classifyParseError(err, features), 'rhwp could not open the document', { cause: err });
  }
}

export function pageInfos(doc: RhwpDocument, pages: number): PageInfo[] {
  const out: PageInfo[] = [];
  for (let i = 0; i < pages; i++) {
    const info = JSON.parse(doc.getPageInfo(i)) as { width?: unknown; height?: unknown };
    out.push({ w: Number(info.width) || 794, h: Number(info.height) || 1123 });
  }
  return out;
}

/** Page i as a scoped, font-mapped SVG string plus the text runs addSpaces needs. */
export function renderPage(doc: RhwpDocument, i: number): RenderedPage {
  const svg = scopeIds(rewriteFonts(doc.renderPageSvg(i)), `p${i}_`);
  let runs: TextRun[] = [];
  try {
    runs = slimRuns((JSON.parse(doc.getPageTextLayout(i)) as { runs?: unknown }).runs);
  } catch {
    // No layout: the page still renders; copy/paste just has no inserted spaces.
  }
  return { i, svg, runs };
}

/** The key of a page size for the named @page rules: p{round W}x{round H}. */
export function sizeKey(p: PageInfo): string {
  return `p${Math.round(p.w)}x${Math.round(p.h)}`;
}
