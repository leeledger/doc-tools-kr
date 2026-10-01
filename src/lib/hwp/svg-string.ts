// String-level post-processing of rhwp page SVGs (brief Step 5 §2), run in the worker. Pure.
// - rewriteFonts: the spike's pick() map, from the first family of rhwp's fallback chain to one bundled face.
// - scopeIds: namespaces every id per page (rhwp reuses clipPath/pattern ids on every page; with several
//   page SVGs in one document url(#id) resolves to the first match). The word boundary below is the two
//   source characters backslash + b; tests/unit/source-bytes.test.ts guards against a literal 0x08 byte.

export const FAMILY = {
  serif: 'Anolim HWP Serif',
  sans: 'Anolim HWP Sans',
  myeongjo: 'Anolim HWP Myeongjo',
  gothic: 'Anolim HWP Gothic',
  pretendard: 'Pretendard Variable',
  fallback: 'Anolim HWP Fallback',
} as const;

const HEAVY = /헤드라인|견고딕|견명조|HY견|H2hdr|H2gtr|HYHeadLine|그래픽|굵은/i;

const chainOf = (face: string, generic: 'serif' | 'sans-serif'): string => `'${face}','${FAMILY.fallback}',${generic}`;

export interface Pick {
  family: string;
  bold: boolean;
}

/** The spike's pick(): `chain` is the raw font-family attribute value (entities not decoded). */
export function pick(chain: string): Pick {
  const first = (chain.split(',')[0] ?? '').replace(/&apos;|'|"/g, '').trim();
  const serif = /serif\s*$/.test(chain) && !/sans-serif\s*$/.test(chain);
  if (/나눔명조|Nanum ?Myeongjo/i.test(first)) return { family: chainOf(FAMILY.myeongjo, 'serif'), bold: false };
  if (/나눔고딕|Nanum ?Gothic/i.test(first)) return { family: chainOf(FAMILY.gothic, 'sans-serif'), bold: false };
  if (/맑은|Malgun|Pretendard/i.test(first)) return { family: chainOf(FAMILY.pretendard, 'sans-serif'), bold: false };
  if (HEAVY.test(first)) return { family: chainOf(FAMILY.sans, 'sans-serif'), bold: true };
  return { family: serif ? chainOf(FAMILY.serif, 'serif') : chainOf(FAMILY.sans, 'sans-serif'), bold: false };
}

/**
 * Maps every font-family attribute. A HEAVY face also gets font-weight="700"; when the element already has a
 * font-weight (rhwp writes font-weight="bold" after font-family) that value is replaced, never duplicated: a
 * repeated attribute is an XML error, so DOMParser would reject the whole page. (The spike used innerHTML,
 * whose HTML parser keeps the first of two attributes: our inserted 700. Same result.)
 */
export function rewriteFonts(svg: string): string {
  return svg.replace(/<[A-Za-z][^<>]*\sfont-family="[^"]*"[^<>]*>/g, (tag) => {
    let bold = false;
    let out = tag.replace(/font-family="([^"]*)"/g, (_m, chain: string) => {
      const p = pick(chain);
      bold ||= p.bold;
      return `font-family="${p.family}"`;
    });
    if (bold) out = /\sfont-weight="[^"]*"/.test(out) ? out.replace(/(\s)font-weight="[^"]*"/, '$1font-weight="700"') : out.replace(/(\sfont-family="[^"]*")/, '$1 font-weight="700"');
    return out;
  });
}

export function scopeIds(svg: string, pre: string): string {
  return svg
    .replace(/\bid="([^"]+)"/g, (_m, id: string) => `id="${pre}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${pre}${id})`)
    .replace(/(xlink:href|href)="#([^"]+)"/g, (_m, a: string, id: string) => `${a}="#${pre}${id}"`);
}

const ENTITY: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decode = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e: string) => {
    if (e[0] !== '#') return ENTITY[e.toLowerCase()] ?? m;
    const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });

/**
 * The text a page shows, in drawing order: the content of every <text> element (inner tags dropped, entities
 * decoded), joined. The search of /hwp-viewer/ reads this, not getPageTextLayout(): on the 10 fixtures the
 * layout runs miss characters the page draws on 116 of 236 pages (G2 A0 Step 0, BUILD-LOG). The order is the
 * order of the <text> elements in the page DOM, so a hit can be found again among them.
 */
export function glyphText(svg: string): string {
  let out = '';
  for (const m of svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)) out += decode(m[1].replace(/<[^>]*>/g, ''));
  return out;
}
