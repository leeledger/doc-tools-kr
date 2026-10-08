// PDF 나누기·쪽 편집 (brief TOOLS5 U2): pure decisions. The edit state is the page list as shown (order, extra
// rotation, removed, selected); every save mode turns it into merge-worker inputs (0-based source pages + extra
// clockwise degrees, the mergePlus `pages` / `rotate` shape). The split modes count pages of the edited document:
// page k is the k-th page left in the list, in the shown order.
import { parseRange, type PageRangeError } from '../../lib/pdf/page-range';
import { baseName, safeFileName } from '../../lib/ui/format';

export interface PageState {
  /** 0-based page of the source PDF. */
  src: number;
  /** Extra clockwise degrees (0, 90, 180, 270). */
  rotate: number;
  removed: boolean;
  selected: boolean;
}

export type SaveMode = 'edit' | 'extract' | 'ranges' | 'every' | 'each';
export const SAVE_MODES: readonly SaveMode[] = ['edit', 'extract', 'ranges', 'every', 'each'];

/** One output PDF: source pages and their extra rotation, plus its first and last page of the edited document (1-based). */
export interface PartPlan {
  pages: number[];
  rotate: number[];
  first: number;
  last: number;
}

export const initialState = (pageCount: number): PageState[] =>
  Array.from({ length: pageCount }, (_, src) => ({ src, rotate: 0, removed: false, selected: false }));

export const keptPages = (state: readonly PageState[]): PageState[] => state.filter((p) => !p.removed);

/** `deg` more clockwise, kept in 0-359. */
export const turn = (rotate: number, deg = 90): number => (((rotate + deg) % 360) + 360) % 360;

/** Moves the entry at `from` to `to` (both clamped); a new array. */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  const out = list.slice();
  const j = Math.max(0, Math.min(out.length - 1, to));
  if (from < 0 || from >= out.length || from === j) return out;
  const [item] = out.splice(from, 1);
  out.splice(j, 0, item!);
  return out;
}

function part(kept: readonly PageState[], positions: readonly number[]): PartPlan {
  const ps = positions.map((p) => kept[p - 1]!);
  return { pages: ps.map((p) => p.src), rotate: ps.map((p) => p.rotate), first: positions[0]!, last: positions[positions.length - 1]! };
}

const all = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

/** 편집한 PDF 하나로: every page left, in the shown order. Null when every page was removed. */
export function editPlan(state: readonly PageState[]): PartPlan | null {
  const kept = keptPages(state);
  return kept.length ? part(kept, all(kept.length)) : null;
}

/** 고른 쪽만 새 PDF로: the selected pages left, in the shown order. Null when none is selected. */
export function extractPlan(state: readonly PageState[]): PartPlan | null {
  const kept = keptPages(state);
  const positions = kept.flatMap((p, i) => (p.selected ? [i + 1] : []));
  return positions.length ? part(kept, positions) : null;
}

export type PartsResult =
  | { ok: true; parts: number[][] }
  /** `line`: 1-based line of the range text with the problem (0 when the whole text is empty). */
  | { ok: false; error: PageRangeError; line: number };

/**
 * 범위대로 나누기: one PDF per line, each line a `parseRange` range ("1-3", "1-3, 5") over `pageCount` pages. Blank lines
 * are skipped; parts may overlap. Pages of a part come in page order.
 */
export function parseParts(text: string, pageCount: number): PartsResult {
  const parts: number[][] = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (const [i, line] of lines.entries()) {
    if (!line.trim()) continue;
    const r = parseRange(line, pageCount);
    if (!r.ok) return { ok: false, error: r.error, line: i + 1 };
    parts.push(r.pages);
  }
  return parts.length ? { ok: true, parts } : { ok: false, error: 'empty', line: 0 };
}

/** N쪽씩 나누기 (한 쪽씩 = 1): pages 1..pageCount in runs of `size`, the last run shorter if it does not divide. */
export function everyN(pageCount: number, size: number): number[][] {
  if (!Number.isInteger(size) || size < 1) return [];
  const parts: number[][] = [];
  for (let first = 1; first <= pageCount; first += size) parts.push(all(Math.min(size, pageCount - first + 1)).map((k) => first + k - 1));
  return parts;
}

/** The parts of a split over the edited document. */
export const splitPlans = (state: readonly PageState[], parts: readonly number[][]): PartPlan[] => {
  const kept = keptPages(state);
  return parts.map((positions) => part(kept, positions));
};

/** The 쪽 수 field of N쪽씩 나누기: a whole number from 1, or null. */
export function parseSize(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  const v = Number(t);
  return v >= 1 ? v : null;
}

export const editName = (fileName: string): string => safeFileName(baseName(fileName), '_편집.pdf');
export const extractName = (fileName: string): string => safeFileName(baseName(fileName), '_추출.pdf');
export const splitZipName = (fileName: string): string => safeFileName(baseName(fileName), '_나누기.zip');
/** `{base}_{first}-{last}.pdf`; a one-page part is `{base}_{page}.pdf`. */
export const partName = (fileName: string, p: Pick<PartPlan, 'first' | 'last'>): string =>
  safeFileName(baseName(fileName), p.first === p.last ? `_${p.first}.pdf` : `_${p.first}-${p.last}.pdf`);
