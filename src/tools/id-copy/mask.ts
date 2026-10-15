// 신분증 사본 만들기 (TOOLS1015 I1): pure geometry and the one drawing pass of the copy. Every rectangle lives in the
// photo as turned (the decoded photo, EXIF orientation applied, then the user's quarter turns): the crop box and the
// black boxes ("가릴 곳") alike, so a crop never moves a box off what it covers. Turning the photo turns the crop and
// the boxes with it. The copy is one canvas: photo (turned, cropped) -> opaque black boxes -> watermark tiles. Nothing
// else goes into the file: the pixels are re-encoded, so no metadata and nothing under a box survives.
import type { ImagesRequest } from '../../lib/pdf/images.worker';
import { markFontPx, tileGrid, MARK_ANGLE, MARK_ALPHA, MARK_COLOR, MARK_LINE_HEIGHT } from './watermark';

export type Rotation = 0 | 90 | 180 | 270;

/** A rectangle in the turned photo's pixels: top-left corner and size. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** At most this many black boxes. */
export const MAX_MASKS = 20;
/** Smallest box edge, as a share of the turned photo's long edge (and never under 4 pixels). */
const MIN_SHARE = 0.02;
/** A new box: this share of the view's width and height, in the middle of the view. */
const START_W = 0.4;
const START_H = 0.12;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi));
const finite = (v: number, d: number): number => (Number.isFinite(v) ? v : d);

/** Smallest box edge for a photo turned to `w` × `h`. */
export const minEdge = (w: number, h: number): number => Math.max(4, Math.round(Math.max(w, h) * MIN_SHARE));

/** (w, h) after a quarter turn. */
export function turnedSize(w: number, h: number, rotation: Rotation): { w: number; h: number } {
  return rotation === 90 || rotation === 270 ? { w: h, h: w } : { w, h };
}

/** The next quarter turn, clockwise. */
export const nextRotation = (r: Rotation): Rotation => (((r + 90) % 360) as Rotation);

/**
 * `r` kept inside `bounds`: no larger than the bounds, at least `min` on each side (unless the bounds are smaller),
 * then moved inside. Non-finite numbers fall back to the bounds.
 */
export function clampRect(r: Rect, bounds: Rect, min: number): Rect {
  const w = clamp(finite(r.w, bounds.w), Math.min(min, bounds.w), bounds.w);
  const h = clamp(finite(r.h, bounds.h), Math.min(min, bounds.h), bounds.h);
  return {
    x: clamp(finite(r.x, bounds.x), bounds.x, bounds.x + bounds.w - w),
    y: clamp(finite(r.y, bounds.y), bounds.y, bounds.y + bounds.h - h),
    w,
    h,
  };
}

/** `r` moved by (dx, dy), kept inside `bounds`. */
export function moveRect(r: Rect, dx: number, dy: number, bounds: Rect, min: number): Rect {
  return clampRect({ ...r, x: r.x + dx, y: r.y + dy }, bounds, min);
}

/** `r` resized to `w` × `h` (any shape) with its top-left corner fixed, kept inside `bounds`. */
export function resizeRect(r: Rect, w: number, h: number, bounds: Rect, min: number): Rect {
  const right = bounds.x + bounds.w;
  const bottom = bounds.y + bounds.h;
  return clampRect({ x: r.x, y: r.y, w: Math.min(Math.max(w, min), right - r.x), h: Math.min(Math.max(h, min), bottom - r.y) }, bounds, min);
}

/** A new black box in the middle of `view`; a second one starts a little lower so it is not on top of the first. */
export function startMask(view: Rect, count: number, min: number): Rect {
  const w = view.w * START_W;
  const h = view.h * START_H;
  const step = Math.max(min, view.h * 0.06);
  return clampRect({ x: view.x + (view.w - w) / 2, y: view.y + (view.h - h) / 2 + (count % 5) * step, w, h }, view, min);
}

/** `r` in a photo `h` pixels high, after the photo turns a quarter clockwise (a `w` × `h` photo becomes `h` × `w`). */
export function turnRect(r: Rect, h: number): Rect {
  return { x: h - r.y - r.h, y: r.x, w: r.h, h: r.w };
}

/** The whole turned photo as a rectangle. */
export const fullRect = (w: number, h: number): Rect => ({ x: 0, y: 0, w, h });

/** The pixels a box covers on the output, widened to whole pixels so no half-covered edge pixel keeps part of the photo. */
export function coverPixels(r: Rect, scale: number): Rect {
  const x0 = Math.floor(r.x * scale);
  const y0 = Math.floor(r.y * scale);
  return { x: x0, y: y0, w: Math.ceil((r.x + r.w) * scale) - x0, h: Math.ceil((r.y + r.h) * scale) - y0 };
}

/** The 2D context calls the drawing pass makes (an HTMLCanvasElement's in the page, @napi-rs/canvas in the tests). */
export interface DrawCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(a: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  drawImage(src: unknown, x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
}

export interface CopyPlan {
  /** The decoded photo (EXIF orientation applied) and its size. */
  src: unknown;
  srcW: number;
  srcH: number;
  rotation: Rotation;
  /** The part kept, in the turned photo. */
  crop: Rect;
  /** Black boxes, in the turned photo. */
  masks: readonly Rect[];
  /** Watermark lines; empty: none. */
  mark: readonly string[];
}

/** The 글꼴 of the watermark: the system's sans-serif (pixels only; the page's UI font is never used). */
export const MARK_FONT_FAMILY = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

/**
 * Draws the copy onto a `crop.w * scale` × `crop.h * scale` canvas: the photo, then the black boxes, then the
 * watermark tiled over the whole canvas. The order is the guarantee: the boxes cover the photo's pixels, the
 * watermark goes over everything.
 */
export function drawCopy(ctx: DrawCtx, plan: CopyPlan, scale: number, outW: number, outH: number): void {
  const { srcW, srcH, rotation, crop } = plan;
  const turned = turnedSize(srcW, srcH, rotation);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Photo: into the turned frame, shifted by the crop, scaled to the output.
  ctx.setTransform(scale, 0, 0, scale, -crop.x * scale, -crop.y * scale);
  ctx.translate(turned.w / 2, turned.h / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(plan.src, -srcW / 2, -srcH / 2, srcW, srcH);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Boxes: opaque black, whole output pixels.
  ctx.fillStyle = '#000000';
  ctx.globalAlpha = 1;
  for (const m of plan.masks) {
    const p = coverPixels({ ...m, x: m.x - crop.x, y: m.y - crop.y }, scale);
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }
  if (plan.mark.length) drawMark(ctx, plan.mark, outW, outH, markFontPx(crop.w, crop.h) * scale);
  ctx.restore();
}

/** The watermark: the lines as one block, repeated on a grid turned by MARK_ANGLE that covers the whole canvas. */
function drawMark(ctx: DrawCtx, lines: readonly string[], w: number, h: number, fontPx: number): void {
  ctx.save();
  ctx.font = `700 ${fontPx}px ${MARK_FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = MARK_COLOR;
  ctx.globalAlpha = MARK_ALPHA;
  const lineH = fontPx * MARK_LINE_HEIGHT;
  const blockW = Math.max(...lines.map((l) => ctx.measureText(l).width), fontPx);
  const blockH = lineH * lines.length;
  const angle = (MARK_ANGLE * Math.PI) / 180;
  ctx.setTransform(1, 0, 0, 1, w / 2, h / 2);
  ctx.rotate(angle);
  for (const c of tileGrid(w, h, blockW + fontPx * 2, blockH + fontPx * 1.5, MARK_ANGLE)) {
    lines.forEach((line, i) => ctx.fillText(line, c.x, c.y - blockH / 2 + lineH * (i + 0.5)));
  }
  ctx.restore();
}

/** The 사진 PDF 변환 worker's request for the copy: that one JPEG, upright, on an A4 portrait page with a 10 mm margin. */
export function pdfRequest(jpeg: Blob, maxEdge: number): ImagesRequest {
  return { type: 'build', items: [{ file: jpeg, rotation: 0 }], layout: { page: 'a4', orient: 'portrait', marginMm: 10 }, size: 'original', maxEdge };
}
