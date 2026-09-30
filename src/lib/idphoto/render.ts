// Output rendering (brief Step 4 §2), main thread. The same transform as crop.ts and the stage, drawn at the
// exact output size. For a large downscale (s < 0.5) the bitmap is first resized to 2·s with the browser's
// high-quality resampler, so the final draw never skips source pixels (no aliasing at 4000 px → 137 px).
// Temporary bitmaps are closed and canvases zeroed. A DOM canvas stands in where the page has no
// OffscreenCanvas.
import type { CropState } from './crop';

export const PRESCALE_BELOW = 0.5;

type Surface = OffscreenCanvas | HTMLCanvasElement;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function surface(w: number, h: number): Surface {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function context(c: Surface): Ctx {
  const g = c.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true }) as Ctx | null;
  if (!g) throw new Error('2d context unavailable');
  return g;
}

/**
 * Draws `src` (covering srcW × srcH source px) into `g` with the crop transform, at `scale` of the output (1 = full size,
 * used smaller for previews). The background is white (the JPG output is opaque).
 */
export function drawCrop(g: Ctx, src: CanvasImageSource, srcW: number, srcH: number, st: CropState, outW: number, outH: number, scale = 1): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, outW * scale, outH * scale);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.translate((outW * scale) / 2, (outH * scale) / 2);
  g.rotate((-st.rotDeg * Math.PI) / 180);
  g.scale(st.s * scale, st.s * scale);
  g.translate(-st.cx, -st.cy);
  // `src` may be a pre-scaled copy: it is drawn back over the source size (srcW × srcH).
  g.drawImage(src, 0, 0, srcW, srcH);
  g.setTransform(1, 0, 0, 1, 0, 0);
}

/** The output pixels (outW × outH), from the working bitmap and the crop state. */
export async function renderOutput(bitmap: ImageBitmap, st: CropState, outW: number, outH: number): Promise<ImageData> {
  let src: ImageBitmap = bitmap;
  if (st.s < PRESCALE_BELOW) {
    const w = Math.max(1, Math.ceil(bitmap.width * 2 * st.s));
    const h = Math.max(1, Math.ceil(bitmap.height * 2 * st.s));
    src = await createImageBitmap(bitmap, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
  }
  const c = surface(outW, outH);
  try {
    const g = context(c);
    drawCrop(g, src, bitmap.width, bitmap.height, st, outW, outH);
    return g.getImageData(0, 0, outW, outH);
  } finally {
    if (src !== bitmap) src.close();
    c.width = 0;
    c.height = 0;
  }
}

/** A small preview of the output (long edge ≤ `edge`), for the background check while adjusting. */
export function renderPreview(bitmap: ImageBitmap, st: CropState, outW: number, outH: number, edge: number): ImageData {
  const scale = Math.min(1, edge / Math.max(outW, outH));
  const w = Math.max(1, Math.round(outW * scale));
  const h = Math.max(1, Math.round(outH * scale));
  const c = surface(w, h);
  try {
    const g = context(c);
    drawCrop(g, bitmap, bitmap.width, bitmap.height, st, outW, outH, scale);
    return g.getImageData(0, 0, w, h);
  } finally {
    c.width = 0;
    c.height = 0;
  }
}
