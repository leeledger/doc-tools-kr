// The guide overlay of /id-photo/ (brief Step 4 §3.2 "adjust"). Drawn on its own canvas above the photo, in
// output coordinates scaled to the stage. Colour plus a label or a line style for every guide, never colour
// alone: crown line (solid), head band (hatched green band with its label), eye line (dashed, 참고), centre
// line (dotted), face oval (dashed), and grey hatching where the frame is outside the photo.
import type { IdPreset } from '../../data/id-photo-presets';
import { EYE_FRAC } from '../../lib/idphoto/calibration';
import { toOutput, type CropState } from '../../lib/idphoto/crop';
import { CROWN_FRAC, HEAD_FRAC } from '../../lib/idphoto/frame';

export const LABELS = {
  crown: '정수리(머리카락 제외)',
  /** A head rule measured from the top of the hair (headBand.measure 'hair'). */
  hair: '머리 맨 위(머리카락 포함)',
  chinOfficial: '턱 끝 위치 (규격 32–36 mm)',
  chinReference: '턱 끝 위치 (참고 범위)',
  eye: '눈 높이(참고)',
} as const;

const CROWN = '#1d4ed8';
const BAND = 'rgba(22, 163, 74, 0.22)';
const BAND_EDGE = '#15803d';
const GUIDE = 'rgba(15, 23, 42, 0.75)';

/** Patterns per context and (colour, step): the overlay redraws on every drag frame. */
const patterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern | string>>();

function hatch(g: CanvasRenderingContext2D, color: string, step: number): CanvasPattern | string {
  const key = `${color}|${step}`;
  let cache = patterns.get(g);
  if (!cache) patterns.set(g, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = step;
  c.height = step;
  const p = c.getContext('2d');
  if (!p) return color;
  p.strokeStyle = color;
  p.lineWidth = Math.max(1, step / 6);
  p.beginPath();
  p.moveTo(0, step);
  p.lineTo(step, 0);
  p.stroke();
  const pattern = g.createPattern(c, 'repeat') ?? color;
  cache.set(key, pattern);
  return pattern;
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string, below = false): void {
  g.font = `700 ${px}px "Anolim UI Sans", "Pretendard Variable", sans-serif`;
  const w = g.measureText(text).width;
  const pad = px * 0.3;
  const top = below ? y + pad : y - px - pad * 2;
  g.fillStyle = 'rgba(255, 255, 255, 0.88)';
  g.fillRect(x - pad, top, w + pad * 2, px + pad * 1.6);
  g.fillStyle = color;
  g.textBaseline = 'top';
  g.fillText(text, x, top + pad * 0.5);
}

/**
 * Draws the guide for `preset` on `canvas` (sized by the caller at devicePixelRatio). `src` is the working
 * bitmap size; the hatching shows where the frame leaves it.
 */
export function drawOverlay(canvas: HTMLCanvasElement, preset: IdPreset, st: CropState, src: { w: number; h: number }): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  const k = W / preset.outW;
  g.clearRect(0, 0, W, H);
  const out = { w: preset.outW, h: preset.outH };

  // Outside the photo: the frame minus the photo's outline (even-odd), hatched grey.
  const pts = [toOutput(st, out, 0, 0), toOutput(st, out, src.w, 0), toOutput(st, out, src.w, src.h), toOutput(st, out, 0, src.h)];
  g.save();
  g.beginPath();
  g.rect(0, 0, W, H);
  g.moveTo(pts[0]!.x * k, pts[0]!.y * k);
  for (const p of pts.slice(1)) g.lineTo(p.x * k, p.y * k);
  g.closePath();
  g.fillStyle = 'rgba(100, 100, 100, 0.55)';
  g.fill('evenodd');
  g.fillStyle = hatch(g, 'rgba(255, 255, 255, 0.7)', Math.max(6, Math.round(8 * (W / 360))));
  g.fill('evenodd');
  g.restore();

  const line = Math.max(1, W / 300);
  const fontPx = Math.max(10, Math.round(W / 30));
  const crownY = CROWN_FRAC * H;
  const head = HEAD_FRAC * H;
  const bandTop = crownY + preset.headBand.minFrac * H;
  const bandBottom = crownY + preset.headBand.maxFrac * H;

  // Face oval (dashed): crown to the target chin, centred.
  g.save();
  g.setLineDash([line * 5, line * 4]);
  g.strokeStyle = GUIDE;
  g.lineWidth = line;
  g.beginPath();
  g.ellipse(W / 2, crownY + head / 2, head * 0.34, head / 2, 0, 0, Math.PI * 2);
  g.stroke();
  // Centre line (dotted).
  g.setLineDash([line, line * 3]);
  g.beginPath();
  g.moveTo(W / 2, 0);
  g.lineTo(W / 2, H);
  g.stroke();
  // Eye line (dashed, reference).
  const eyeY = crownY + EYE_FRAC * head;
  g.setLineDash([line * 8, line * 4]);
  g.beginPath();
  g.moveTo(0, eyeY);
  g.lineTo(W, eyeY);
  g.stroke();
  g.restore();

  // Chin band: green, hatched, edged.
  g.fillStyle = BAND;
  g.fillRect(0, bandTop, W, bandBottom - bandTop);
  g.fillStyle = hatch(g, 'rgba(21, 128, 61, 0.35)', Math.max(6, Math.round(8 * (W / 360))));
  g.fillRect(0, bandTop, W, bandBottom - bandTop);
  g.strokeStyle = BAND_EDGE;
  g.lineWidth = line;
  g.strokeRect(0, bandTop, W, bandBottom - bandTop);

  // Crown line (solid, thick).
  g.strokeStyle = CROWN;
  g.lineWidth = line * 2;
  g.beginPath();
  g.moveTo(0, crownY);
  g.lineTo(W, crownY);
  g.stroke();

  const pad = fontPx * 0.5;
  label(g, preset.headBand.measure === 'hair' ? LABELS.hair : LABELS.crown, pad, crownY, fontPx, CROWN, true);
  label(g, LABELS.eye, pad, eyeY, fontPx, '#0f172a');
  label(g, preset.headBand.kind === 'official' ? LABELS.chinOfficial : LABELS.chinReference, pad, bandBottom, fontPx, BAND_EDGE, true);
}
