// QR renderers (CARD1026 C5/C6): black #000 on white #fff, a 4-module quiet zone on every side (qrcode.com 「상하좌우
// 4cell 이상」, handoff/sources/card1026/qrcode-com.txt), integer module sizes and no smoothing so edges stay crisp.
// QR1031: colors and the logo are applied on top of these outputs (styled.ts, logo-render.ts), so these stay as they
// were (business-card uses them as is).
import type { QrModules } from './encode';

/** Quiet zone width in modules (qrcode.com). */
export const QUIET = 4;
/** Target PNG width in px (print-friendly; the module size is an integer, so the real width is at most this). */
export const PNG_TARGET = 1200;
const PNG_MIN_MODULE = 8;

/**
 * SVG with a viewBox in modules (quiet zone included): a white background and one black path. Each dark run of a
 * row is one 1-module-high rectangle (the same squares as 1×1 cells, fewer path commands and no seams).
 */
export function qrSvg(modules: QrModules): string {
  const total = modules.length + QUIET * 2;
  let d = '';
  modules.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let end = x;
      while (row[end + 1]) end++;
      const w = end - x + 1;
      d += `M${x + QUIET} ${y + QUIET}h${w}v1h-${w}z`;
      x = end;
    }
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" role="img" shape-rendering="crispEdges">` +
    `<title>QR 코드</title><rect width="${total}" height="${total}" fill="#fff"/><path fill="#000" d="${d}"/></svg>`
  );
}

/** Module size in px for the PNG: the largest integer that keeps the image near 1,200 px, never below 8. */
export const pngModulePx = (size: number): number => Math.max(PNG_MIN_MODULE, Math.floor(PNG_TARGET / (size + QUIET * 2)));

/** RGBA pixels of the QR with its quiet zone, `px` pixels per module. Pure. */
export function qrRgba(modules: QrModules, px: number): { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number } {
  const width = (modules.length + QUIET * 2) * px;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  modules.forEach((row, my) => {
    row.forEach((dark, mx) => {
      if (!dark) return;
      for (let y = (my + QUIET) * px; y < (my + QUIET + 1) * px; y++) {
        const start = (y * width + (mx + QUIET) * px) * 4;
        for (let i = start; i < start + px * 4; i += 4) {
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
        }
      }
    });
  });
  return { data, width, height: width };
}

/** PNG blob of the QR (about 1,200 px wide), drawn from qrRgba on a canvas. */
export const qrPng = (modules: QrModules): Promise<Blob> => rgbaPng(qrRgba(modules, pngModulePx(modules.length)));

/** PNG blob of RGBA pixels drawn on a canvas; `draw` paints on top before encoding (QR1031: the logo). */
export function rgbaPng(
  { data, width, height }: { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number },
  draw?: (ctx: CanvasRenderingContext2D) => void,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('qrPng: no 2d context'));
  ctx.putImageData(new ImageData(data, width, height), 0, 0);
  draw?.(ctx);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('qrPng: toBlob gave null'))), 'image/png');
  });
}
