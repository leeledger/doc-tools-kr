// Automatic and manual framing (brief Step 4 §2, Flow "AUTO-FRAME"). Pure.
// Default framing for every preset (spike values, never called 규격): head = 34/45 of the output height, the
// crown line 4.5/45 of the height below the top edge, centred on the cheek midpoint, no rotation. Never
// upscale, never pad: s > 1 is `lowres`, and a frame that leaves the photo is reported (`outside`).
import type { FaceMeasure, Pt } from '../face/types';
import { C, K } from './calibration';
import { inside, type CropState, type Size } from './crop';

export const HEAD_FRAC = 34 / 45;
export const CROWN_FRAC = 4.5 / 45;

export interface Head {
  crown: Pt;
  chin: Pt;
  /** Crown to chin, source px. */
  px: number;
}

export interface Framing {
  state: CropState;
  /** The photo is too small for this output (s would exceed 1). */
  lowres: boolean;
  /** The frame leaves the photo. */
  outside: boolean;
}

/** Estimated skull top (hair excluded): the average of the chin-based and IPD-based estimates. */
export function estimateHead(face: Pick<FaceMeasure, 'eye' | 'chin' | 'ipd3d' | 'centerX'>, k: number = K, c: number = C): Head {
  const crownY = face.eye.y - (k * (face.chin.y - face.eye.y) + c * face.ipd3d) / 2;
  const crown = { x: face.centerX, y: crownY };
  const chin = { x: face.chin.x, y: face.chin.y };
  return { crown, chin, px: chin.y - crownY };
}

/** The framing that puts the head at 34/45 of the height with the crown at 4.5/45 from the top. */
export function autoFrame(face: FaceMeasure, out: Size, W: number, H: number): Framing {
  const head = estimateHead(face);
  const s = (HEAD_FRAC * out.h) / head.px;
  if (!(s > 0) || !Number.isFinite(s)) return manualFrame(out, W, H);
  const lowres = s > 1;
  const sv = Math.min(1, s);
  // The source point at the output centre: the crown sits CROWN_FRAC·h below the top edge.
  const state: CropState = { cx: face.centerX, cy: head.crown.y + (out.h / 2 - CROWN_FRAC * out.h) / sv, s: sv, rotDeg: 0 };
  return { state, lowres, outside: !inside(state, out, W, H) };
}

/** The largest centred crop of the output aspect (manual start); lowres when even that needs s > 1. */
export function manualFrame(out: Size, W: number, H: number): Framing {
  const s = Math.max(out.w / W, out.h / H);
  const lowres = s > 1 + 1e-9;
  const state: CropState = { cx: W / 2, cy: H / 2, s: Math.min(1, s), rotDeg: 0 };
  return { state, lowres, outside: !inside(state, out, W, H) };
}

/** True when the photo cannot fill `out` at s ≤ 1 even as the largest crop (whole photo < output px). */
export function photoTooSmall(out: Size, W: number, H: number): boolean {
  return manualFrame(out, W, H).lowres;
}
