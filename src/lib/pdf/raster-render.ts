// Main-thread pdf.js page → RGBA for "이미지로 변환" (pdf.js stays on the main thread in this step).
// One page at a time; the canvas is zeroed as soon as its pixels are read.
import { rasterScale } from './compress/levels';
import type { PdfJsDoc } from './inspect';

export interface RasterPage {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  /** Page size in points at scale 1, rotation applied. */
  ptW: number;
  ptH: number;
}

export async function renderRasterPage(doc: PdfJsDoc, pageNo: number): Promise<RasterPage> {
  const page = await doc.getPage(pageNo);
  const unit = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: rasterScale(unit.width, unit.height) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d context unavailable');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  try {
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { rgba: data, width, height, ptW: unit.width, ptH: unit.height };
  } finally {
    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;
  }
}
