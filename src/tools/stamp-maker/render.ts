// 도장 만들기 (STAMP1015 D4 / D6): paints a draw list (layout.ts) on a 2D context at any size — the tiles, the large preview
// and the PNG all go through here, so what is seen is what is saved. Transparent background; one colour; square-inverse
// cuts its text out of the filled square (destination-out). Works on a page canvas and on @napi-rs/canvas (unit tests).
import { REF_EM } from './limits';
import { fontOf, type Face, type Shape, type StampLayout } from './layout';

/** The subset of CanvasRenderingContext2D the painter uses. */
export interface Ctx2D {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(a: number): void;
  scale(x: number, y: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number): void;
  fill(): void;
  stroke(): void;
  fillText(t: string, x: number, y: number): void;
  strokeText(t: string, x: number, y: number): void;
  font: string;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineJoin: string;
  lineCap: string;
  textAlign: string;
  textBaseline: string;
  globalCompositeOperation: string;
}

/** Colours (D6; labels are late copy in the controller). */
export const COLORS = { red: '#D0202E', orange: '#E0482A', black: '#1A1A1A', blue: '#1D4ED8' } as const;
export type ColorId = keyof typeof COLORS;

/** Pixel size of a layout whose long edge is `long` pixels. */
export function pixelSize(l: StampLayout, long: number): { w: number; h: number } {
  return { w: Math.max(1, Math.round(l.w * long)), h: Math.max(1, Math.round(l.h * long)) };
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (q <= 0) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    return;
  }
  ctx.moveTo(x + q, y);
  ctx.arcTo(x + w, y, x + w, y + h, q);
  ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q);
  ctx.arcTo(x, y, x + w, y, q);
  ctx.closePath();
}

function shape(ctx: Ctx2D, s: Shape): void {
  switch (s.k) {
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(s.cx, s.cy, s.rx, s.ry, 0, 0, Math.PI * 2);
      ctx.lineWidth = s.lw;
      ctx.stroke();
      return;
    case 'rect':
      roundRect(ctx, s.x, s.y, s.w, s.h, s.r);
      ctx.lineWidth = s.lw;
      ctx.stroke();
      return;
    case 'fill-rect':
      roundRect(ctx, s.x, s.y, s.w, s.h, s.r);
      ctx.fill();
      return;
    case 'line':
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.lineWidth = s.lw;
      ctx.stroke();
      return;
  }
}

/** CSS font of a glyph (the unit tests pass a slice-aware one: Skia does not fall back between unicode-range slices). */
export type FontOf = (text: string, face: Face, weight: 400 | 700, px: number) => string;
const pageFont: FontOf = (_t, face, weight, px) => fontOf(face, weight, px);

/** Clear margin around the stamp, as a share of the long edge: the frame's soft edge is never cut by the image edge. */
export const EDGE = 0.01;

/** Paints `l` with its long edge `long` pixels, from (0, 0), on a cleared area (inside an EDGE margin). */
export function paintStamp(ctx: Ctx2D, l: StampLayout, long: number, color: string, font: FontOf = pageFont): void {
  const { w, h } = pixelSize(l, long);
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  const k = long * (1 - 2 * EDGE);
  ctx.translate((w - l.w * k) / 2, (h - l.h * k) / 2);
  ctx.scale(k, k);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  for (const s of l.shapes) shape(ctx, s);
  if (l.cut) ctx.globalCompositeOperation = 'destination-out';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const g of l.glyphs) {
    ctx.save();
    ctx.translate(g.x, g.y);
    if (g.rot) ctx.rotate(g.rot);
    ctx.scale(g.sx, g.sy);
    ctx.font = font(g.text, g.face, g.weight, REF_EM);
    ctx.fillText(g.text, g.dx, g.dy);
    if (g.stroke) {
      ctx.lineWidth = g.stroke;
      ctx.lineJoin = 'round';
      ctx.strokeText(g.text, g.dx, g.dy);
    }
    ctx.restore();
  }
  ctx.restore();
}
