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

export function rewriteFonts(svg: string): string {
  return svg.replace(/font-family="([^"]*)"/g, (_m, chain: string) => {
    const p = pick(chain);
    return `font-family="${p.family}"${p.bold ? ' font-weight="700"' : ''}`;
  });
}

export function scopeIds(svg: string, pre: string): string {
  return svg
    .replace(/\bid="([^"]+)"/g, (_m, id: string) => `id="${pre}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${pre}${id})`)
    .replace(/(xlink:href|href)="#([^"]+)"/g, (_m, a: string, id: string) => `${a}="#${pre}${id}"`);
}
