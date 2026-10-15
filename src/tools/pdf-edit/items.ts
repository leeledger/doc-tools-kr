// PDF 글자 넣기·편집 (TOOLS1015 E1): what goes on a page, as pure data and rules. A text item (글자, or 오늘 날짜 filled in
// for the person) is lines of text at a size and colour, drawn from the top-left of its box; a white box (흰 상자) is a
// white rectangle. Boxes are in the page as seen (pdf.js viewport at scale 1, points, origin top-left; pdf-sign/place.ts).
import type { Box } from '../pdf-sign/place';
import { safeFileName } from '../../lib/ui/format';
import { MAX_TEXT, SIZE_DEFAULT, SIZE_MAX, SIZE_MIN } from './limits';

export type ItemKind = 'text' | 'date' | 'white';
export type TextColor = 'black' | 'blue';
export type DateFormat = 'dot' | 'long' | 'dash';

export const DATE_FORMATS: readonly DateFormat[] = ['dot', 'long', 'dash'];
export const TEXT_COLORS: readonly TextColor[] = ['black', 'blue'];
/** The colours as 0-255 RGB (검정 #000000, 파랑 #1d4ed8). */
export const RGB: Readonly<Record<TextColor, readonly [number, number, number]>> = { black: [0, 0, 0], blue: [0x1d, 0x4e, 0xd8] };
export const CSS_COLOR: Readonly<Record<TextColor, string>> = { black: '#000000', blue: '#1d4ed8' };

/** Line height and the first baseline below the top of the box, in em (the preview and the PDF use the same numbers). */
export const LINE_HEIGHT = 1.3;
export const ASCENT = 0.88;
/** Half the extra line height above the first line, in em. */
const HALF_LEADING = (LINE_HEIGHT - 1) / 2;
/** The width of an empty text item, in em (room for the placeholder). */
const EMPTY_EM = 6;

/** The font-family chain of the preview and of the PDF writer (FaceTable.resolve). */
export const FONT_CHAIN = "'Anolim HWP Sans'";
export const PREVIEW_FAMILY = '"Anolim HWP Sans","Anolim HWP Fallback","Anolim HWP Serif"';

export interface TextItem {
  id: number;
  kind: 'text' | 'date';
  /** 0-based page. */
  page: number;
  box: Box;
  text: string;
  size: number;
  color: TextColor;
  /** The date form of a 오늘 날짜 item. */
  format: DateFormat;
}

export interface WhiteItem {
  id: number;
  kind: 'white';
  page: number;
  box: Box;
}

export type EditItem = TextItem | WhiteItem;

export const isText = (i: EditItem): i is TextItem => i.kind !== 'white';

/** The text as typed, made drawable: CR LF and lone CR → LF, tabs → a space, at most MAX_TEXT characters. */
export function cleanText(s: string): string {
  return Array.from(s.replace(/\r\n?/g, '\n').replace(/\t/g, ' ')).slice(0, MAX_TEXT).join('');
}

/** The lines of a text item (the person's own line breaks only; no wrapping). */
export const linesOf = (text: string): string[] => cleanText(text).split('\n');

/** A size kept in SIZE_MIN..SIZE_MAX, whole points (a non-number is the default). */
export function clampSize(n: number): number {
  if (!Number.isFinite(n)) return SIZE_DEFAULT;
  return Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(n)));
}

/** Today in the chosen form, local time: 2026. 10. 15. | 2026년 10월 15일 | 2026-10-15. */
export function formatDate(d: Date, f: DateFormat): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (f === 'long') return `${y}년 ${m}월 ${day}일`;
  if (f === 'dash') return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return `${y}. ${m}. ${day}.`;
}

/**
 * The box of a text item at (x, y): as wide as its longest line, LINE_HEIGHT per line. `widthEm` measures a line in em
 * (the preview font); an empty item keeps room for its placeholder.
 */
export function textBox(x: number, y: number, text: string, size: number, widthEm: (line: string) => number): Box {
  const lines = linesOf(text);
  const em = text.trim() ? Math.max(...lines.map((l) => widthEm(l))) : EMPTY_EM;
  return { x, y, w: Math.max(em, 0.5) * size, h: lines.length * LINE_HEIGHT * size };
}

/**
 * The size that fits the text inside a `pageW` × `pageH` page (never above `size`; SIZE_MIN at least, where a very long
 * line may still run off the page).
 */
export function fitSize(text: string, size: number, pageW: number, pageH: number, widthEm: (line: string) => number): number {
  const b = textBox(0, 0, text, 1, widthEm);
  const most = Math.floor(Math.min(pageW / b.w, pageH / b.h));
  return Math.max(SIZE_MIN, Math.min(size, most));
}

/** The y of line `i`'s baseline below the top of the box, in points. */
export const baselineOf = (i: number, size: number, ascent = ASCENT): number => (i * LINE_HEIGHT + HALF_LEADING + ascent) * size;

/** Distinct characters of `text` that `covers` says no font has (line breaks aside), in order of first use. */
export function uncovered(text: string, covers: (cp: number) => boolean): string[] {
  const out: string[] = [];
  for (const ch of cleanText(text)) {
    if (ch === '\n' || out.includes(ch)) continue;
    if (!covers(ch.codePointAt(0)!)) out.push(ch);
  }
  return out;
}

/** The usage value of a save (what the document got): one kind, or 여러 가지. */
export function itemsValue(items: readonly EditItem[]): ItemKind | 'mix' {
  const kinds = new Set(items.map((i) => i.kind));
  return kinds.size === 1 ? [...kinds][0]! : 'mix';
}

/** `{base}_작성.pdf`. */
export const editName = (fileName: string): string => safeFileName(fileName.replace(/\.pdf$/i, ''), '_작성.pdf');
