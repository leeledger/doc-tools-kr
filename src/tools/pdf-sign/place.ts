// PDF 서명·도장 넣기 (TOOLS5 U3): pure placement decisions. A placement is a box in the page as seen (pdf.js viewport at
// scale 1: origin top-left, units = PDF points, /Rotate and the CropBox already applied), shared by the pages it is put
// on ("같은 자리에"). Saving maps the box to pdf-lib drawImage arguments through the page's own viewport conversion
// (pdf.js `convertToPdfPoint`), so turned pages and CropBoxes with a non-zero origin get the picture upright where it
// was placed.
import { parseRange, type PageRangeError } from '../../lib/pdf/page-range';
import { safeFileName } from '../../lib/ui/format';

/** A box on the page as seen: top-left corner and size, in points. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 넣을 쪽 (usage `place`): the page it was made on, a typed range, or every page. */
export type Where = 'one' | 'range' | 'all';
export const WHERE: readonly Where[] = ['one', 'range', 'all'];

export interface Placement {
  id: number;
  box: Box;
  where: Where;
  /** 0-based page the placement was made on (its page for `one`). */
  page: number;
  /** The typed range for `range` ("1-3, 5"). */
  range: string;
}

/** One page as seen, from pdf.js: viewport size at scale 1, /Rotate, and the viewport's conversion to PDF space. */
export interface PageInfo {
  width: number;
  height: number;
  /** Clockwise page rotation, 0 / 90 / 180 / 270. */
  rotate: number;
  toPdf(x: number, y: number): [number, number] | number[];
}

/** pdf-lib `drawImage` arguments: the picture's own lower-left corner in PDF space, its size, counter-clockwise turn. */
export interface Stamp {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: number;
}

/** Smallest picture edge, in points (about 4 mm). */
export const MIN_EDGE = 12;
/** A new placement: this share of the page width, at most MAX_START points wide, MARGIN from the lower right corner. */
const START_SHARE = 0.25;
const MAX_START = 150;
const MARGIN = 36;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi));
/** A usable edge length: finite and at least MIN_EDGE. */
const edge = (v: number): number => (Number.isFinite(v) ? Math.max(v, MIN_EDGE) : MIN_EDGE);
/** Height / width of a box; 1 when either side is not a positive finite number (never NaN or 0). */
const aspectOf = (box: Box): number => (box.w > 0 && box.h > 0 && Number.isFinite(box.h / box.w) ? box.h / box.w : 1);

/**
 * The box kept inside a `width` × `height` page: no larger than the page (aspect kept), not smaller than MIN_EDGE on its
 * short side (unless the page itself is smaller), then moved inside.
 */
export function clampBox(box: Box, width: number, height: number): Box {
  const aspect = aspectOf(box);
  let w = edge(box.w);
  // Fit the page first, then the minimum (a tiny page wins over the minimum).
  w = Math.min(w, width, height / aspect);
  const minW = aspect >= 1 ? MIN_EDGE : MIN_EDGE / aspect;
  w = Math.max(w, Math.min(minW, width, height / aspect));
  const h = w * aspect;
  return { x: clamp(box.x, 0, width - w), y: clamp(box.y, 0, height - h), w, h };
}

/** A new placement's box for a picture of `imgW` × `imgH` on a `width` × `height` page: lower right, a quarter wide. */
export function startBox(imgW: number, imgH: number, width: number, height: number): Box {
  const w = Math.min(width * START_SHARE, MAX_START);
  const h = (w * imgH) / imgW;
  return clampBox({ x: width - MARGIN - w, y: height - MARGIN - h, w, h }, width, height);
}

/** The box moved by (dx, dy) points, kept inside the page. */
export function moveBox(box: Box, dx: number, dy: number, width: number, height: number): Box {
  return clampBox({ ...box, x: box.x + dx, y: box.y + dy }, width, height);
}

/** The box `w` points wide (aspect kept, top-left corner fixed), kept inside the page. */
export function resizeBox(box: Box, w: number, width: number, height: number): Box {
  // At least MIN_EDGE on both sides, so the aspect can never collapse to 0 or NaN.
  const aspect = aspectOf(box);
  w = Math.max(edge(w), MIN_EDGE / aspect);
  const h = w * aspect;
  // Grow toward the lower right; if that leaves the page, the clamp moves it back in.
  return clampBox({ x: box.x, y: box.y, w, h }, width, height);
}

/** The box for a new picture aspect (그림 바꾸기): same width and top-left corner (each page clamps it when shown or saved). */
export function reshapeBox(box: Box, imgW: number, imgH: number): Box {
  const aspect = imgW > 0 && imgH > 0 ? imgH / imgW : 1;
  return { ...box, h: edge(box.w) * aspect };
}

export type PagesResult = { ok: true; pages: number[] } | { ok: false; error: PageRangeError };

/** 0-based pages a placement goes on, in a document of `pageCount` pages. */
export function pagesOf(p: Placement, pageCount: number): PagesResult {
  if (p.where === 'all') return { ok: true, pages: Array.from({ length: pageCount }, (_, i) => i) };
  if (p.where === 'one') return { ok: true, pages: [p.page] };
  const r = parseRange(p.range, pageCount);
  return r.ok ? { ok: true, pages: r.pages.map((n) => n - 1) } : r;
}

/** Whether the placement shows on 0-based page `index` (an invalid range shows on its own page only). */
export function showsOn(p: Placement, index: number, pageCount: number): boolean {
  const r = pagesOf(p, pageCount);
  return r.ok ? r.pages.includes(index) : p.page === index;
}

/**
 * pdf-lib drawImage arguments for `box` on a page as seen: the picture's lower-left corner as seen is its own origin,
 * its width and height are the PDF-space lengths of the box's bottom and left edges, and it turns counter-clockwise by
 * the page rotation (the viewer turns the page clockwise by the same amount, so the picture reads upright).
 */
export function toPdfRect(box: Box, info: PageInfo): Omit<Stamp, 'page'> {
  const b = clampBox(box, info.width, info.height);
  const [x0, y0] = info.toPdf(b.x, b.y + b.h) as [number, number];
  const [x1, y1] = info.toPdf(b.x + b.w, b.y + b.h) as [number, number];
  const [x2, y2] = info.toPdf(b.x, b.y) as [number, number];
  return {
    x: x0,
    y: y0,
    width: Math.hypot(x1 - x0, y1 - y0),
    height: Math.hypot(x2 - x0, y2 - y0),
    rotate: ((info.rotate % 360) + 360) % 360,
  };
}

/** Every stamp of every placement, by page; null with the first placement whose range is wrong. */
export async function stampsFor(
  placements: readonly Placement[],
  pageCount: number,
  info: (index: number) => Promise<PageInfo>,
): Promise<{ ok: true; stamps: Stamp[] } | { ok: false; id: number; error: PageRangeError }> {
  const stamps: Stamp[] = [];
  for (const p of placements) {
    const r = pagesOf(p, pageCount);
    if (!r.ok) return { ok: false, id: p.id, error: r.error };
    for (const page of r.pages) stamps.push({ page, ...toPdfRect(p.box, await info(page)) });
  }
  stamps.sort((a, b) => a.page - b.page);
  return { ok: true, stamps };
}

/** The usage value of a save: 모든 쪽 if any placement covers every page, else 범위 if any uses one, else 고른 쪽. */
export function placeValue(placements: readonly Placement[]): Where {
  if (placements.some((p) => p.where === 'all')) return 'all';
  if (placements.some((p) => p.where === 'range')) return 'range';
  return 'one';
}

/** `{base}_서명.pdf`. */
export const signName = (fileName: string): string => safeFileName(fileName.replace(/\.pdf$/i, ''), '_서명.pdf');
