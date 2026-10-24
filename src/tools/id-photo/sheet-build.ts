// 인화용 모아찍기 builder (brief handoff/ARCHITECT-BRIEF-PRINT1023.md, P3, P5, P8). Loaded by the controller on the
// first tap of 「인화용 모아찍기 만들기」, never with the page. One tile is rendered from the original bitmap at the
// sheet scale, then put N times on a white sheet with a grey outline around each, and encoded by the same worker and
// checks as the single photo (exact pixels, baseline, no APP1, JFIF dpi), at top quality with no size limit.
// Every canvas is zeroed after use. The surfaces are injected so unit tests run the failure paths in Node.
import { PRINT_PPI, type IdPreset } from '../../data/id-photo-presets';
import type { CropState } from '../../lib/idphoto/crop';
import type { EncodeSpec } from '../../lib/idphoto/encode';
import type { EncodeRequest, EncodeResponse } from '../../lib/idphoto/encode.worker';
import { renderOutput } from '../../lib/idphoto/render';
import { OUTLINE_COLOR, sheetPlan, type SheetPlan } from '../../lib/idphoto/sheet';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface SheetCanvas {
  width: number;
  height: number;
  getContext(kind: '2d', opts?: CanvasRenderingContext2DSettings): Ctx | null;
}

export interface SheetDeps {
  /** One tile: the crop drawn at `scale` of the output size (renderOutput). */
  render(bitmap: ImageBitmap, st: CropState, outW: number, outH: number, scale: number): Promise<ImageData>;
  /** A blank canvas of w × h. */
  canvas(w: number, h: number): SheetCanvas;
  /** The verified JPEG of the sheet pixels. */
  encode(pixels: ImageData, spec: EncodeSpec): Promise<Uint8Array>;
}

export type SheetResult = { ok: true; bytes: Uint8Array; plan: SheetPlan } | { ok: false };

/** The sheet pixels: white, every outline, then the tile on each place (putImageData: exact pixels, no resampling). */
export function composeSheet(plan: SheetPlan, tile: ImageData, canvas: SheetDeps['canvas']): ImageData {
  if (tile.width !== plan.tile.w || tile.height !== plan.tile.h) throw new Error('tile is not the plan size');
  const c = canvas(plan.W, plan.H);
  try {
    const g = c.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    if (!g) throw new Error('2d context unavailable');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, plan.W, plan.H);
    g.fillStyle = OUTLINE_COLOR;
    for (const o of plan.outlines) g.fillRect(o.x, o.y, o.w, o.h);
    for (const r of plan.rects) g.putImageData(tile, r.x, r.y);
    return g.getImageData(0, 0, plan.W, plan.H);
  } finally {
    c.width = 0;
    c.height = 0;
  }
}

/** The sheet JPEG of the saved photo (preset and crop state of that save); `{ ok: false }` on any failure. */
export async function buildSheet(bitmap: ImageBitmap, st: CropState, p: IdPreset, deps: SheetDeps): Promise<SheetResult> {
  const plan = sheetPlan(p);
  if (!plan) return { ok: false };
  try {
    const tile = await deps.render(bitmap, st, p.outW, p.outH, plan.tile.k);
    const pixels = composeSheet(plan, tile, deps.canvas);
    // The sheet is always PRINT_PPI (the tile is the paper size at it), whatever the preset's own file dpi.
    const bytes = await deps.encode(pixels, { outW: plan.W, outH: plan.H, dpi: PRINT_PPI });
    return { ok: true, bytes, plan };
  } catch {
    return { ok: false };
  }
}

function domCanvas(w: number, h: number): SheetCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h) as SheetCanvas;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c as SheetCanvas;
}

/**
 * The page's surfaces: renderOutput, a canvas, and the id-photo encode worker (one per sheet, ended when it answers or
 * when `signal` aborts: a newer tap, 다시 만들기, 다른 사진, leaving the page).
 */
export function pageDeps(createWorker: () => Worker, signal: AbortSignal): SheetDeps {
  return {
    render: renderOutput,
    canvas: domCanvas,
    encode: (pixels, spec) =>
      new Promise<Uint8Array>((resolve, reject) => {
        if (signal.aborted) return reject(new Error('aborted'));
        const w = createWorker();
        const end = (): void => {
          w.terminate();
          signal.removeEventListener('abort', onAbort);
        };
        const onAbort = (): void => {
          end();
          reject(new Error('aborted'));
        };
        signal.addEventListener('abort', onAbort);
        w.onerror = (ev) => {
          ev.preventDefault();
          end();
          reject(new Error('encode worker failed'));
        };
        w.onmessage = (ev: MessageEvent<EncodeResponse>) => {
          end();
          if (ev.data.type === 'done') resolve(ev.data.bytes);
          else reject(new Error(ev.data.code));
        };
        const req: EncodeRequest = { type: 'encode', pixels, spec };
        w.postMessage(req, [pixels.data.buffer]);
      }),
  };
}
