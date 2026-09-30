// Crop geometry of 여권·증명사진 (brief Step 4 §2). Pure; runs in Node.
//
// State {cx, cy, s, rotDeg}: (cx, cy) is the source point at the output centre, s the output px per source px,
// rotDeg the rotation about the output centre. A positive rotDeg turns the photo counter-clockwise on screen,
// so it straightens a head whose eye line falls to the right (residual roll = faceRoll − rotDeg).
//   output = centre + s · R(−θ) · (source − c)        source = c + R(θ) · (output − centre) / s
// with R(θ)(x, y) = (x cosθ − y sinθ, x sinθ + y cosθ) in y-down pixel coordinates. The renderer draws with
// the same transform (render.ts), so what the stage shows is what is saved.

export interface CropState {
  cx: number;
  cy: number;
  s: number;
  rotDeg: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export const ROT_LIMIT = 5;
export const ROT_STEP = 0.5;
/** Zoom-out floor: the whole photo fits in half the frame (far enough to reach every edge). */
export const MIN_ZOOM_FRACTION = 0.5;
/** Corners may sit this far outside the photo (sub-pixel rounding), in source px. */
export const INSIDE_TOL = 0.5;

const rad = (deg: number): number => (deg * Math.PI) / 180;

function rot(p: Point, deg: number): Point {
  const t = rad(deg);
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export function toSource(st: CropState, out: Size, u: number, v: number): Point {
  const d = rot({ x: (u - out.w / 2) / st.s, y: (v - out.h / 2) / st.s }, st.rotDeg);
  return { x: st.cx + d.x, y: st.cy + d.y };
}

export function toOutput(st: CropState, out: Size, x: number, y: number): Point {
  const d = rot({ x: (x - st.cx) * st.s, y: (y - st.cy) * st.s }, -st.rotDeg);
  return { x: out.w / 2 + d.x, y: out.h / 2 + d.y };
}

/** The four output corners (top-left, top-right, bottom-right, bottom-left) in source px. */
export function corners(st: CropState, out: Size): Point[] {
  return [
    toSource(st, out, 0, 0),
    toSource(st, out, out.w, 0),
    toSource(st, out, out.w, out.h),
    toSource(st, out, 0, out.h),
  ];
}

/** True when the whole output frame lies on the photo (W × H source px), within `tol`. */
export function inside(st: CropState, out: Size, W: number, H: number, tol: number = INSIDE_TOL): boolean {
  return corners(st, out).every((p) => p.x >= -tol && p.y >= -tol && p.x <= W + tol && p.y <= H + tol);
}

/** Smallest zoom offered: the whole photo fits in MIN_ZOOM_FRACTION of the frame. */
export function minZoom(out: Size, W: number, H: number): number {
  return Math.min(out.w / W, out.h / H) * MIN_ZOOM_FRACTION;
}

/** s kept in [sMin, 1]: never upscale. */
export function clampZoom(s: number, sMin: number): number {
  return Math.min(1, Math.max(Math.min(sMin, 1), s));
}

/** Moves the photo by (dx, dy) output px (the content follows the pointer). */
export function pan(st: CropState, dxOut: number, dyOut: number): CropState {
  const d = rot({ x: dxOut / st.s, y: dyOut / st.s }, st.rotDeg);
  return { ...st, cx: st.cx - d.x, cy: st.cy - d.y };
}

/** Zooms by `factor` keeping the source point under `anchor` (output px) fixed; s is clamped. */
export function zoomAt(st: CropState, out: Size, factor: number, anchor: Point, sMin: number): CropState {
  const p = toSource(st, out, anchor.x, anchor.y);
  const s = clampZoom(st.s * factor, sMin);
  const d = rot({ x: (anchor.x - out.w / 2) / s, y: (anchor.y - out.h / 2) / s }, st.rotDeg);
  return { ...st, s, cx: p.x - d.x, cy: p.y - d.y };
}

/** Sets the zoom to `s` about the output centre. */
export function zoomTo(st: CropState, out: Size, s: number, sMin: number): CropState {
  return zoomAt(st, out, s / st.s, { x: out.w / 2, y: out.h / 2 }, sMin);
}

export function snapRotation(deg: number): number {
  const c = Math.max(-ROT_LIMIT, Math.min(ROT_LIMIT, deg));
  const snapped = Math.round(c / ROT_STEP) * ROT_STEP;
  return Object.is(snapped, -0) ? 0 : snapped;
}

/** Rotates about the output centre, clamped to ±5° and snapped to 0.5°. */
export function rotate(st: CropState, deltaDeg: number): CropState {
  return { ...st, rotDeg: snapRotation(st.rotDeg + deltaDeg) };
}

/** Two-finger gesture (output px): zoom about the first midpoint, then move with the midpoint. No rotation. */
export function pinch(st: CropState, out: Size, p0: Point, p1: Point, q0: Point, q1: Point, sMin: number): CropState {
  const d0 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const d1 = Math.hypot(q1.x - q0.x, q1.y - q0.y);
  const mp = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  const mq = { x: (q0.x + q1.x) / 2, y: (q0.y + q1.y) / 2 };
  const zoomed = d0 > 0 ? zoomAt(st, out, d1 / d0, mp, sMin) : st;
  return pan(zoomed, mq.x - mp.x, mq.y - mp.y);
}

export interface HeadLength {
  /** Head length as a fraction of the output height. */
  frac: number;
  /** In mm when the preset has a print size, otherwise null. */
  mm: number | null;
}

/** Head length (crown to chin, source px) in the output: as a fraction of the height, and in mm on print. */
export function headLength(crown: Point, chin: Point, st: CropState, out: Size, mmH?: number): HeadLength {
  const a = toOutput(st, out, crown.x, crown.y);
  const b = toOutput(st, out, chin.x, chin.y);
  const frac = Math.hypot(b.x - a.x, b.y - a.y) / out.h;
  return { frac, mm: mmH ? frac * mmH : null };
}
