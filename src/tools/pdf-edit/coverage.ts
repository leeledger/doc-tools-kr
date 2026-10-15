// PDF 글자 넣기·편집 (TOOLS1015 E1): which characters the PDF faces can draw, known while the person types (a character
// no face has is named on the item and saving waits). Read from the HWP PDF face list the worker uses too
// (/fonts/hwp/hwp-pdf-faces.*.json): one same-origin GET of our own static file, never file data.
import pdfFaces from '../../generated/hwp-pdf-faces.json';
import { parseRanges, unpackFaces, type PackedFaces, type Range } from '../../lib/hwp/pdf/faces';

/** The families FaceTable.resolve tries for the 'Anolim HWP Sans' chain (the chain, then the last resorts), weight 400. */
export const COVER_FAMILIES: readonly string[] = ['Anolim HWP Sans', 'Anolim HWP Fallback', 'Anolim HWP Serif'];

/** The code point ranges of those faces. Pure. */
export function coverageOf(p: PackedFaces): Range[] {
  return unpackFaces(p)
    .filter((d) => d.weight === 400 && COVER_FAMILIES.includes(d.family))
    .flatMap((d) => parseRanges(d.range));
}

/** Whether a code point is in the ranges (null = not known: every character passes, the worker checks again). */
export const covered = (ranges: readonly Range[] | null, cp: number): boolean => !ranges || ranges.some(([a, b]) => cp >= a && cp <= b);

/** Fetches the face list and returns its coverage; throws when it cannot be fetched. */
export async function loadCoverage(): Promise<Range[]> {
  const url = new URL(pdfFaces.json, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/fonts/hwp/')) throw new Error('not a font list of this site');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`faces ${res.status}`);
  return coverageOf((await res.json()) as PackedFaces);
}
