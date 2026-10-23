// 증명사진 촬영 live hints and burst (IDCAM1022 D5 burst, D6; Step C). Loaded by the controller when the camera is on
// (its own lazy chunk, so the controller stays within its budget). The hints read a ≤160 px copy of the overlay
// rectangle at most 4 times a second while the page is visible, plus the phone's roll from deviceorientation where those
// events arrive without asking (no motion prompt is ever made). Advice only: nothing here can stop a capture. The burst
// keeps the sharpest of the frames grabbed around the shutter; the frames themselves are never changed.
import type { IdPreset } from '../../data/id-photo-presets';
import {
  BURST,
  BURST_GAP_MS,
  LIVE_HZ,
  LIVE_SIDE,
  SETTLED_START,
  SHARP_SIDE,
  analyseFrame,
  fitSize,
  isTilted,
  pickHint,
  rollDeg,
  settle,
  sharpness,
} from '../../lib/idphoto/live';
import type { Rect } from './capture';
import { HINTS } from './copy';

/**
 * Starts the live hints on `video`; `show` gets the hint text ('' for none) each time it changes. Returns the stop
 * function (clears the timer, the orientation listener and the hint).
 */
export function watchHints(video: HTMLVideoElement, rect: () => Rect, preset: () => IdPreset, show: (text: string) => void): () => void {
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d', { willReadFrequently: true });
  let roll: number | null = null;
  let state = SETTLED_START;
  const onTilt = (e: DeviceOrientationEvent): void => {
    roll = rollDeg(e.beta, e.gamma);
  };
  const tick = (): void => {
    if (!g || document.visibilityState === 'hidden' || video.readyState < 2) return;
    const r = rect();
    if (!r.w || !r.h) return;
    const s = fitSize(r.w, r.h, LIVE_SIDE);
    if (canvas.width !== s.w || canvas.height !== s.h) {
      canvas.width = s.w;
      canvas.height = s.h;
    }
    g.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, s.w, s.h);
    const img = g.getImageData(0, 0, s.w, s.h);
    const before = state.shown;
    state = settle(state, pickHint(analyseFrame(img, preset()), isTilted(roll)));
    if (state.shown !== before) show(state.shown ? HINTS[state.shown] : '');
  };
  window.addEventListener('deviceorientation', onTilt);
  const timer = setInterval(tick, 1000 / LIVE_HZ);
  return () => {
    clearInterval(timer);
    window.removeEventListener('deviceorientation', onTilt);
    canvas.width = 0;
    canvas.height = 0;
    show('');
  };
}

const release = (c: HTMLCanvasElement | null): void => {
  if (!c) return;
  c.width = 0;
  c.height = 0;
};

/** Sharpness of a full-size frame, read on a ≤256 px copy. */
function frameSharpness(frame: HTMLCanvasElement): number {
  const s = fitSize(frame.width, frame.height, SHARP_SIDE);
  const c = document.createElement('canvas');
  c.width = s.w;
  c.height = s.h;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return 0;
  g.drawImage(frame, 0, 0, s.w, s.h);
  const v = sharpness(g.getImageData(0, 0, s.w, s.h));
  release(c);
  return v;
}

/**
 * D5 burst: grabs BURST frames BURST_GAP_MS apart (the first at once) and returns the sharpest; at most two full-size
 * frames are held at a time. Null when no frame could be grabbed or `alive()` turns false (the camera was stopped).
 */
export async function sharpestFrame(grab: () => HTMLCanvasElement | null, alive: () => boolean): Promise<HTMLCanvasElement | null> {
  let best: HTMLCanvasElement | null = null;
  let bestScore = -1;
  for (let i = 0; i < BURST; i++) {
    if (i) {
      await new Promise((r) => setTimeout(r, BURST_GAP_MS));
      if (!alive()) {
        release(best);
        return null;
      }
    }
    const frame = grab();
    if (!frame) continue;
    const score = frameSharpness(frame);
    if (score > bestScore) {
      release(best);
      best = frame;
      bestScore = score;
    } else release(frame);
  }
  return best;
}
