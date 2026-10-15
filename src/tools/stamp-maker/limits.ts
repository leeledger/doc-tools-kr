// 도장 만들기 (STAMP1015): every number the tool uses, in one place (brief D3-D6). These are tool choices, never called
// 규격 (no official stamp size is cited).

/** maxlength of the name input (and of the corp company name). */
export const INPUT_MAX = 20;
/** maxlength of the corp-round centre text (D4: 1-6 graphemes). */
export const CENTER_MAX = 6;
/** Input debounce before the grid repaints (D5). */
export const DEBOUNCE_MS = 250;
/** A font slice that has not arrived by then counts as failed: paint with the system face (D5). */
export const FONT_TIMEOUT_MS = 4000;

/** Size choices, long edge in mm (D6). */
export const SIZES_MM = [12, 15, 18, 21, 24, 30] as const;
export type SizeMm = (typeof SIZES_MM)[number];
/** Pixel density at 1x and with 「2배로 선명하게」 (D6). */
export const PPI_1X = 600;
export const PPI_2X = 1200;

/** Pixels of `mm` at `ppi` (18 mm at 600 ppi -> 425). */
export function mmToPx(mm: number, ppi: number): number {
  return Math.round((mm / 25.4) * ppi);
}

/** Line width [얇게 | 보통 | 두껍게] as a share of the frame's short edge (D4). */
export const LINE_SHARE = { thin: 0.03, normal: 0.05, thick: 0.07 } as const;
/** Inner ring width as a share of the outer ring width (D4). */
export const INNER_RING_SHARE = 0.4;
/** Padding inside the frame line, as a share of the short edge (D4). */
export const PADDING_SHARE = 0.06;
/** Non-uniform glyph stretch (x scale / y scale) is kept inside this range (D4). */
export const STRETCH_MIN = 0.6;
export const STRETCH_MAX = 1.6;
/** Share of a cell the glyph's ink may use (the rest is the gap between glyphs). */
export const CELL_FILL = 0.9;
/** 굵게: a same-colour stroke of this share of the reference em (D5). */
export const HEAVY_STROKE_SHARE = 0.025;
/** Reference font size the draw list's glyph offsets are measured at. */
export const REF_EM = 100;
/** corp-round: the company name never spans more of the ring than this (D4). */
export const ARC_MAX_DEG = 300;
