// 전자서명·도장 이미지, draw tab (Sprint C, C1; brief "Draw tab"): Pointer Events on a DPR-aware canvas, quadratic
// smoothing through the midpoints, 3 pen colours (key.ts INK_COLORS), 되돌리기 / 지우기. Export renders the strokes
// on a transparent canvas of a fixed size and goes through the photo tab's crop and size steps (key.ts 9-10).
// The pad is pointer-only by nature; its help text points keyboard users to the photo tab.
import { INK_COLORS, cropAndResize, cropRect, sizeOptions, type InkSize, type Rgba } from '../../lib/ink/key';
import { announce as live, clearAlert } from '../../lib/ui/announce';
import { COPY } from './copy';
import { encodeWithRetry, saveBlob } from './png';

export type Point = readonly [number, number];
export type Stroke = Point[];
export type Pen = keyof typeof INK_COLORS;

/** Size of the exported drawing (the pad is 5:2, stamp.css); 원본 크기 is the crop of this. */
export const EXPORT_W = 1500;
export const EXPORT_H = 600;
/** Pen width as a share of the pad width. */
export const PEN_SHARE = 0.006;
const FILE_NAME = '서명.png';

const css = (rgb: readonly [number, number, number]): string => `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;

/**
 * Draws strokes (points as shares of the width and height, 0..1) on a context of size w x h: a dot for a tap,
 * else quadratic curves through the midpoints of successive points, ending on the last point.
 */
export function drawStrokes(g: CanvasRenderingContext2D, strokes: readonly Stroke[], w: number, h: number, pen: Pen): void {
  g.clearRect(0, 0, w, h);
  const lw = Math.max(1.5, w * PEN_SHARE);
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = g.fillStyle = css(INK_COLORS[pen]);
  for (const s of strokes) {
    if (s.length === 0) continue;
    const p = s.map(([x, y]) => [x * w, y * h] as const);
    if (p.length === 1) {
      g.beginPath();
      g.arc(p[0]![0], p[0]![1], lw / 2, 0, Math.PI * 2);
      g.fill();
      continue;
    }
    g.beginPath();
    g.moveTo(p[0]![0], p[0]![1]);
    for (let i = 1; i < p.length - 1; i++) {
      const [x, y] = p[i]!;
      const [nx, ny] = p[i + 1]!;
      g.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    const last = p[p.length - 1]!;
    g.lineTo(last[0], last[1]);
    g.stroke();
  }
}

/** Straight RGBA of the cropped, sized drawing, or null when nothing is drawn. */
export function exportDrawing(strokes: readonly Stroke[], pen: Pen, size: InkSize, noPad: boolean): { px: Rgba; rect: ReturnType<typeof cropRect> } | null {
  const c = document.createElement('canvas');
  c.width = EXPORT_W;
  c.height = EXPORT_H;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  drawStrokes(g, strokes, EXPORT_W, EXPORT_H, pen);
  const rgba = g.getImageData(0, 0, EXPORT_W, EXPORT_H).data;
  c.width = 0;
  c.height = 0;
  const alpha = new Float32Array(EXPORT_W * EXPORT_H);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3]! / 255;
  const rect = cropRect(alpha, EXPORT_W, EXPORT_H, noPad);
  if (!rect) return null;
  return { px: cropAndResize(rgba, EXPORT_W, EXPORT_H, rect, size), rect };
}

function must<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

/** Wires the draw tab (entry.ts imports this when the tab is first opened). */
export function initPad(): void {
  const root = document.getElementById('ss-draw');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = 'true';
  const box = must<HTMLElement>('ss-pad-box');
  const canvas = must<HTMLCanvasElement>('ss-pad');
  const undoBtn = must<HTMLButtonElement>('ss-undo');
  const clearBtn = must<HTMLButtonElement>('ss-clear');
  const noPad = must<HTMLInputElement>('ss-pad-nopad');
  const downloadBtn = must<HTMLButtonElement>('ss-pad-download');
  const reason = must<HTMLElement>('ss-pad-reason');
  const sizeInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="ss-pad-size"]')];
  const g = canvas.getContext('2d');
  if (!g) return;

  const strokes: Stroke[] = [];
  let drawing: { id: number; stroke: Stroke } | null = null;
  let cssW = 0;
  let cssH = 0;

  const checked = (name: string): string => root.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? '';
  const pen = (): Pen => (checked('ss-pen') || 'black') as Pen;
  const size = (): InkSize => {
    const s = checked('ss-pad-size');
    return s === '' || s === '0' ? null : (Number(s) as InkSize);
  };

  function redraw(): void {
    const dpr = window.devicePixelRatio || 1;
    g!.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStrokes(g!, strokes, cssW, cssH, pen());
  }

  function resize(): void {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = window.devicePixelRatio || 1;
    cssW = r.width;
    cssH = r.height;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    redraw();
  }

  function update(): void {
    const empty = strokes.length === 0;
    undoBtn.disabled = empty;
    clearBtn.disabled = empty;
    downloadBtn.disabled = empty;
    reason.textContent = empty ? COPY.padEmpty : '';
    reason.hidden = !empty;
    // A 크기 bigger than the drawing is disabled (downscale only).
    const out = empty ? null : exportDrawing(strokes, pen(), null, noPad.checked);
    const enabled = out?.rect ? new Map(sizeOptions(out.rect).map((o) => [String(o.size ?? 0), o.enabled])) : null;
    for (const el of sizeInputs) {
      el.disabled = enabled ? !enabled.get(el.value) : el.value !== '0';
      if (el.disabled && el.checked) sizeInputs.find((x) => x.value === '0')!.checked = true;
    }
  }

  const at = (e: PointerEvent): Point => {
    const r = canvas.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (drawing || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing = { id: e.pointerId, stroke: [at(e)] };
    strokes.push(drawing.stroke);
    clearAlert(root);
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing || e.pointerId !== drawing.id) return;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) drawing.stroke.push(at(ev));
    redraw();
  });
  const end = (e: PointerEvent): void => {
    if (!drawing || e.pointerId !== drawing.id) return;
    drawing = null;
    update();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  undoBtn.addEventListener('click', () => {
    strokes.pop();
    redraw();
    update();
  });
  clearBtn.addEventListener('click', () => {
    strokes.length = 0;
    redraw();
    update();
  });
  for (const el of root.querySelectorAll<HTMLInputElement>('input[name="ss-pen"]')) {
    el.addEventListener('change', () => {
      redraw();
      update();
    });
  }
  noPad.addEventListener('change', update);

  downloadBtn.addEventListener('click', async () => {
    const out = exportDrawing(strokes, pen(), size(), noPad.checked);
    if (!out) return;
    downloadBtn.disabled = true;
    const blob = await encodeWithRetry(out.px, async (s) => exportDrawing(strokes, pen(), s, noPad.checked)?.px ?? null);
    downloadBtn.disabled = strokes.length === 0;
    if (!blob) return live('alert', COPY.encode, root);
    clearAlert(root);
    saveBlob(blob, FILE_NAME);
    live('status', COPY.saved(FILE_NAME), root);
  });

  new ResizeObserver(resize).observe(box);
  resize();
  update();
}
