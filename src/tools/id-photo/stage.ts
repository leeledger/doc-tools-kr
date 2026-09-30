// Pointer, pinch and keyboard input on the /id-photo/ stage (brief Step 4 §3.2). Converts CSS px to output px
// and hands intents to the controller; it keeps no crop state itself.
// - One finger or the mouse drags (pans); two fingers pinch about their midpoint. `touch-action: none` is set
//   on the stage only (CSS), so the page still scrolls everywhere else.
// - Keys on the focused stage: arrows move 1 output px (Shift 10), + / = and − zoom ×1.01 (Shift ×1.05),
//   [ and ] rotate 0.5°, Home resets.
import type { Point } from '../../lib/idphoto/crop';

export interface StageHandlers {
  pan(dx: number, dy: number): void;
  zoom(factor: number, anchor: Point | null): void;
  pinch(p0: Point, p1: Point, q0: Point, q1: Point): void;
  rotate(deltaDeg: number): void;
  reset(): void;
  /** A gesture ended (the controller announces the checklist once, not per frame). */
  end(): void;
}

export const KEY_STEP = 1;
export const KEY_STEP_SHIFT = 10;
export const ZOOM_STEP = 1.01;
export const ZOOM_STEP_SHIFT = 1.05;
export const ROT_KEY_STEP = 0.5;

/** The handler for one key, or null when the stage ignores it. */
export function keyIntent(key: string, shift: boolean, h: StageHandlers): (() => void) | null {
  const step = shift ? KEY_STEP_SHIFT : KEY_STEP;
  const z = shift ? ZOOM_STEP_SHIFT : ZOOM_STEP;
  switch (key) {
    case 'ArrowLeft':
      return () => h.pan(-step, 0);
    case 'ArrowRight':
      return () => h.pan(step, 0);
    case 'ArrowUp':
      return () => h.pan(0, -step);
    case 'ArrowDown':
      return () => h.pan(0, step);
    case '+':
    case '=':
    case 'Add':
      return () => h.zoom(z, null);
    case '-':
    case '_':
    case '−':
    case 'Subtract':
      return () => h.zoom(1 / z, null);
    case '[':
      return () => h.rotate(-ROT_KEY_STEP);
    case ']':
      return () => h.rotate(ROT_KEY_STEP);
    case 'Home':
      return () => h.reset();
    default:
      return null;
  }
}

/**
 * Wires `stage`. `outW` is the output width the stage shows (CSS px → output px uses the stage's current
 * width, so it follows resizes). Returns a detach function.
 */
export function attachStage(stage: HTMLElement, outW: () => number, h: StageHandlers): () => void {
  const pointers = new Map<number, Point>();
  const toOut = (e: PointerEvent): Point => {
    const r = stage.getBoundingClientRect();
    const k = outW() / r.width;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  };

  const down = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (pointers.size >= 2) return;
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      return;
    }
    pointers.set(e.pointerId, toOut(e));
    e.preventDefault();
  };
  const move = (e: PointerEvent): void => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = toOut(e);
    if (pointers.size === 1) {
      h.pan(cur.x - prev.x, cur.y - prev.y);
    } else {
      const [a, b] = [...pointers.entries()];
      const other = a![0] === e.pointerId ? b![1] : a![1];
      const firstIsMe = a![0] === e.pointerId;
      if (firstIsMe) h.pinch(prev, other, cur, other);
      else h.pinch(other, prev, other, cur);
    }
    pointers.set(e.pointerId, cur);
  };
  const up = (e: PointerEvent): void => {
    if (!pointers.delete(e.pointerId)) return;
    if (!pointers.size) h.end();
  };
  const key = (e: KeyboardEvent): void => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const run = keyIntent(e.key, e.shiftKey, h);
    if (!run) return;
    e.preventDefault();
    run();
    h.end();
  };

  stage.addEventListener('pointerdown', down);
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('lostpointercapture', up);
  stage.addEventListener('keydown', key);
  return () => {
    stage.removeEventListener('pointerdown', down);
    stage.removeEventListener('pointermove', move);
    stage.removeEventListener('pointerup', up);
    stage.removeEventListener('pointercancel', up);
    stage.removeEventListener('lostpointercapture', up);
    stage.removeEventListener('keydown', key);
    pointers.clear();
  };
}
