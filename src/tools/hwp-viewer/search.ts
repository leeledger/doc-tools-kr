// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// In-document search of /hwp-viewer/ (G2 A0 build order 6). Pure. Text is compared NFC-normalised with every
// space removed (whitespace-folded): rhwp draws no space glyphs and a line break splits words, so "한글 파일"
// finds "한글파일" and a word broken across two lines. Hits never overlap.

/** NFC, then every whitespace character removed. */
export function fold(s: string): string {
  return s.normalize('NFC').replace(/\s+/gu, '');
}

/** Start offsets (in `hay`) of the non-overlapping matches of `needle`; both already folded. */
export function findAll(hay: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) out.push(at);
  return out;
}

export interface Hit {
  /** Page index (0-based). */
  page: number;
  /** The k-th match on that page (0-based). */
  k: number;
}

/** The hit to show first: the first one on or after page `from`, else the first one. */
export function firstFrom(hits: readonly Hit[], from: number): number {
  if (!hits.length) return -1;
  const i = hits.findIndex((h) => h.page >= from);
  return i === -1 ? 0 : i;
}

/** One drawn glyph of a page and the element that draws it. */
export interface Glyph<E> {
  el: E;
  ch: string;
}

/**
 * The glyph sequence of a page in the order the page draws it (the order the worker's text has), with
 * whitespace dropped: `texts` are the page's <text> elements and their text.
 */
export function glyphs<E>(texts: Iterable<{ el: E; text: string }>): Glyph<E>[] {
  const out: Glyph<E>[] = [];
  for (const t of texts) for (const ch of t.text.normalize('NFC')) if (!/\s/u.test(ch)) out.push({ el: t.el, ch });
  return out;
}

/** The elements that draw the k-th match of `needle` (folded) among `seq`, in order; [] when there is none. */
export function matchElements<E>(seq: readonly Glyph<E>[], needle: string, k: number): E[] {
  const hay = seq.map((g) => g.ch).join('');
  const starts = findAll(hay, needle);
  if (!starts.length) return [];
  // The page and the worker count the same glyphs; if they ever disagree, show the last match on the page.
  const start = starts[Math.min(k, starts.length - 1)];
  // Offsets count UTF-16 units; walk the glyphs to map them back.
  const out: E[] = [];
  let pos = 0;
  for (const g of seq) {
    const end = pos + g.ch.length;
    if (end > start && pos < start + needle.length && !out.includes(g.el)) out.push(g.el);
    pos = end;
    if (pos >= start + needle.length) break;
  }
  return out;
}
