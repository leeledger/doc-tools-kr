// 인화용 모아찍기 layout (brief handoff/ARCHITECT-BRIEF-PRINT1023.md, P1-P5). Pure: no canvas, no DOM.
// One sheet size, 4×6 inch at PRINT_PPI (the size print services sell; handoff/sources/print1023/). The tile is the
// preset's stated paper size (`mm`) at PRINT_PPI, kept to the output's aspect; presets without `mm` get no sheet (a
// print size we chose would be an invented spec). Margins and gaps are our own layout choices, never shown on a page.
import { PRINT_PPI, printPx, type IdPreset } from '../../data/id-photo-presets';

/** The sheet's long and short edges in pixels (6 and 4 inch). */
export const SHEET_LONG = 6 * PRINT_PPI;
export const SHEET_SHORT = 4 * PRINT_PPI;
/** Blank edge of the sheet (3 mm): absorbs a service's slight crop or overspray. */
export const SHEET_MARGIN = printPx(3);
/** Space between neighbouring tiles (2 mm); the cut outlines sit inside it. */
export const SHEET_GAP = printPx(2);
/** Width of the grey cut outline drawn just outside each tile. */
export const OUTLINE = 2;
export const OUTLINE_COLOR = '#999';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Tile {
  w: number;
  h: number;
  /** Output pixels → tile pixels. */
  k: number;
}

export interface SheetPlan {
  orientation: 'landscape' | 'portrait';
  W: number;
  H: number;
  cols: number;
  rows: number;
  n: number;
  tile: Tile;
  /** Where each tile goes. */
  rects: Rect[];
  /** The outer box of each tile's outline (OUTLINE px wide, around its rect, inside the gap). */
  outlines: Rect[];
}

/** The tile of a preset with a stated paper size; null without one (and for 직접 입력). */
export function tileSize(p: IdPreset): Tile | null {
  if (!p.mm || p.status === 'user') return null;
  const k = Math.min(printPx(p.mm.w) / p.outW, printPx(p.mm.h) / p.outH);
  return { w: Math.round(p.outW * k), h: Math.round(p.outH * k), k };
}

/** Tiles along one edge of length `len`. */
const fit = (len: number, t: number): number => Math.max(0, Math.floor((len - 2 * SHEET_MARGIN + SHEET_GAP) / (t + SHEET_GAP)));

/** The sheet of a preset: both orientations tried, the larger count kept (a tie goes portrait); null without a tile. */
export function sheetPlan(p: IdPreset): SheetPlan | null {
  const tile = tileSize(p);
  if (!tile) return null;
  const options = (['portrait', 'landscape'] as const).map((orientation) => {
    const W = orientation === 'landscape' ? SHEET_LONG : SHEET_SHORT;
    const H = orientation === 'landscape' ? SHEET_SHORT : SHEET_LONG;
    const cols = fit(W, tile.w);
    const rows = fit(H, tile.h);
    return { orientation, W, H, cols, rows, n: cols * rows };
  });
  const best = options[1]!.n > options[0]!.n ? options[1]! : options[0]!;
  if (best.n === 0) return null;
  const x0 = Math.floor((best.W - (best.cols * tile.w + (best.cols - 1) * SHEET_GAP)) / 2);
  const y0 = Math.floor((best.H - (best.rows * tile.h + (best.rows - 1) * SHEET_GAP)) / 2);
  const rects: Rect[] = [];
  for (let r = 0; r < best.rows; r++) {
    for (let c = 0; c < best.cols; c++) rects.push({ x: x0 + c * (tile.w + SHEET_GAP), y: y0 + r * (tile.h + SHEET_GAP), w: tile.w, h: tile.h });
  }
  const outlines = rects.map((r) => ({ x: r.x - OUTLINE, y: r.y - OUTLINE, w: r.w + 2 * OUTLINE, h: r.h + 2 * OUTLINE }));
  return { ...best, tile, rects, outlines };
}

/** True when the tile would enlarge the source photo (crop scale × k > 1): the print may look soft. */
export const sheetUpscales = (s: number, plan: SheetPlan): boolean => s * plan.tile.k > 1;
