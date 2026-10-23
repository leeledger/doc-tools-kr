// 증명사진 촬영 live hints and burst choice (IDCAM1022 D5 burst, D6; Step C). Pure: every function reads pixels
// (RGBA, row-major) or sensor angles and returns numbers or a hint id; nothing is drawn, edited or sent. The hints are
// advice only and never block the 찍기 button.
// - background: checkBackground (./background.ts, the /id-photo/ check with its own thresholds) on the overlay's strips.
// - dark face / backlight: mean L* inside the guide's face oval. DARK_L and BACKLIGHT_DL are OUR heuristics (not a rule
//   of any 제출처; never shown as a number; BUILD-LOG IDCAM1022 C).
// - level: the phone's roll in the screen plane from deviceorientation beta/gamma, only when such events arrive on
//   their own (no motion prompt is ever asked for). TILT_DEG is our heuristic too.
// - burst: of the frames taken around the shutter, the sharpest by the variance of the Laplacian of a small luma copy.
import type { IdPreset } from '../../data/id-photo-presets';
import { checkBackground, srgbToLab, type BackgroundResult } from './background';
import { guides } from './guides';

export interface Pixels {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/** Longest side of the copy the live hints read. */
export const LIVE_SIDE = 160;
/** Analyses per second, at most. */
export const LIVE_HZ = 4;
/** Longest side of the luma copy the sharpness is measured on. */
export const SHARP_SIDE = 256;
/** Frames in a burst and the time between them. */
export const BURST = 3;
export const BURST_GAP_MS = 250;
/** Face oval mean L* below this: too dark (our heuristic). */
export const DARK_L = 35;
/** Background mean L* minus face oval mean L* above this: backlit (our heuristic). */
export const BACKLIGHT_DL = 40;
/** Roll away from upright (or from lying on its side) above this, in degrees: not level (our heuristic). */
export const TILT_DEG = 5;
/** The face is measured inside the guide oval shrunk to this size, so hair and the background at its edge stay out. */
export const OVAL_INNER = 0.8;
/** A hint changes only after the same result this many analyses in a row (no flicker). */
export const SETTLE = 2;

export type Hint = 'backlight' | 'dark' | 'background' | 'level';

export interface LiveResult {
  background: BackgroundResult;
  /** Mean L* inside the (inner) face oval; NaN when the oval holds no pixel. */
  faceL: number;
  dark: boolean;
  backlight: boolean;
}

/** `w`×`h` scaled down (never up) so the longer side is at most `max`, whole pixels, at least 1. */
export function fitSize(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Mean L* of the pixels inside the ellipse (cx, cy, rx, ry) in the image's pixels; NaN when none. */
export function ovalMeanL(img: Pixels, oval: { cx: number; cy: number; rx: number; ry: number }): number {
  const { width: w, height: h, data } = img;
  if (!(oval.rx > 0 && oval.ry > 0)) return NaN;
  const y0 = Math.max(0, Math.floor(oval.cy - oval.ry));
  const y1 = Math.min(h - 1, Math.ceil(oval.cy + oval.ry));
  let n = 0;
  let sum = 0;
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - oval.cy) / oval.ry;
    if (dy * dy > 1) continue;
    const half = oval.rx * Math.sqrt(1 - dy * dy);
    const x0 = Math.max(0, Math.ceil(oval.cx - half - 0.5));
    const x1 = Math.min(w - 1, Math.floor(oval.cx + half - 0.5));
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4;
      sum += srgbToLab(data[i]!, data[i + 1]!, data[i + 2]!)[0];
      n++;
    }
  }
  return n ? sum / n : NaN;
}

/** The live checks on a copy of the overlay rectangle (the preset's aspect, any size). */
export function analyseFrame(img: Pixels, preset: IdPreset): LiveResult {
  const background = checkBackground(img);
  const { oval } = guides(preset, { w: img.width, h: img.height });
  const faceL = ovalMeanL(img, { cx: oval.cx, cy: oval.cy, rx: oval.rx * OVAL_INNER, ry: oval.ry * OVAL_INNER });
  const known = Number.isFinite(faceL);
  return {
    background,
    faceL,
    dark: known && faceL < DARK_L,
    backlight: known && background.meanL - faceL > BACKLIGHT_DL,
  };
}

/**
 * The phone's roll in its screen plane, in degrees (0 = upright portrait), from deviceorientation beta and gamma
 * (W3C: R = Rz(alpha)·Rx(beta)·Ry(gamma); gravity in the device frame = (cos b·sin g, −sin b, −cos b·cos g)). Null when
 * an angle is missing or the phone lies nearly flat (the screen-plane part of gravity is under half of it).
 */
export function rollDeg(beta: number | null | undefined, gamma: number | null | undefined): number | null {
  if (typeof beta !== 'number' || typeof gamma !== 'number' || !Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const b = (beta * Math.PI) / 180;
  const g = (gamma * Math.PI) / 180;
  const x = Math.cos(b) * Math.sin(g);
  const y = Math.sin(b);
  if (Math.hypot(x, y) < 0.5) return null;
  return (Math.atan2(x, y) * 180) / Math.PI;
}

/** The roll is more than TILT_DEG away from the nearest quarter turn (portrait or landscape, either way up). */
export function isTilted(roll: number | null): boolean {
  if (roll === null) return false;
  return Math.abs(roll - 90 * Math.round(roll / 90)) > TILT_DEG;
}

/** The one hint to show, most useful first: backlight (the cause of a dark face) > dark > background > level. */
export function pickHint(r: LiveResult | null, tilted: boolean): Hint | null {
  if (r?.backlight) return 'backlight';
  if (r?.dark) return 'dark';
  if (r && !r.background.ok) return 'background';
  return tilted ? 'level' : null;
}

export interface Settled {
  shown: Hint | null;
  next: Hint | null;
  seen: number;
}

export const SETTLED_START: Settled = { shown: null, next: null, seen: 0 };

/** Debounce: `shown` becomes `hint` once it has come SETTLE analyses in a row. */
export function settle(s: Settled, hint: Hint | null): Settled {
  const seen = hint === s.next ? s.seen + 1 : 1;
  return { shown: seen >= SETTLE ? hint : s.shown, next: hint, seen };
}

/** Rec. 601 luma of RGBA pixels. */
export function lumaOf(rgba: ArrayLike<number>): Float32Array {
  const n = Math.floor(rgba.length / 4);
  const out = new Float32Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) out[j] = 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
  return out;
}

/** Sharpness: the variance of the 4-neighbour Laplacian of the luma over the inner pixels; 0 below 3×3. */
export function sharpness(img: Pixels): number {
  const { width: w, height: h } = img;
  if (w < 3 || h < 3) return 0;
  const l = lumaOf(img.data);
  let n = 0;
  let sum = 0;
  let sum2 = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = l[i - 1]! + l[i + 1]! + l[i - w]! + l[i + w]! - 4 * l[i]!;
      sum += v;
      sum2 += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return Math.max(0, sum2 / n - mean * mean);
}
