// Page range input ("1-3, 5") for tools that work on some pages of a PDF (TOOLS4 T0; first used by
// /pdf-to-jpg/). Pure: the caller maps the error code to its own message.

export type PageRangeError =
  /** Nothing but spaces and commas. */
  | 'empty'
  /** A page below 1 or above the document's page count. */
  | 'out-of-range'
  /** A span written high to low ("5-3"). */
  | 'reversed'
  /** Anything that is not a page number or a span of two page numbers. */
  | 'junk';

export type PageRangeResult = { ok: true; pages: number[] } | { ok: false; error: PageRangeError };

/** A dash a Korean keyboard or phone may produce between two page numbers. */
const SPAN = /^(\d+)\s*[-‐‑–—~～]\s*(\d+)$/;
const SINGLE = /^\d+$/;
/** Commas, including the full-width one; spaces alone also separate ("1 3 5"). */
const SEPARATOR = /[,，\s]+/;

/**
 * Pages of `text` as sorted, unique, 1-based page numbers for a document of `pageCount` pages.
 * Spans may carry spaces around the dash ("1 - 3"), which is joined before splitting.
 */
export function parseRange(text: string, pageCount: number): PageRangeResult {
  const joined = text.trim().replace(/\s*([-‐‑–—~～])\s*/g, '$1');
  const parts = joined.split(SEPARATOR).filter((p) => p !== '');
  if (!parts.length) return { ok: false, error: 'empty' };
  const pages = new Set<number>();
  for (const part of parts) {
    const span = SPAN.exec(part);
    if (span) {
      const from = Number(span[1]);
      const to = Number(span[2]);
      if (from > to) return { ok: false, error: 'reversed' };
      if (from < 1 || to > pageCount) return { ok: false, error: 'out-of-range' };
      for (let p = from; p <= to; p++) pages.add(p);
    } else if (SINGLE.test(part)) {
      const p = Number(part);
      if (p < 1 || p > pageCount) return { ok: false, error: 'out-of-range' };
      pages.add(p);
    } else {
      return { ok: false, error: 'junk' };
    }
  }
  return { ok: true, pages: [...pages].sort((a, b) => a - b) };
}
