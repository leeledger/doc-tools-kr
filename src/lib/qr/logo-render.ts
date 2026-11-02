// The center logo (QR1031 D7, D9), in the lazy logo chunk: it works on the colored outputs the controller already made
// (styled.ts), so this chunk imports nothing from the controller's. A square plate in the background color over the
// modules: its side is the largest odd module count <= 22 % of the symbol side (sizes are odd, so it sits on the module
// grid): version 5 (37 modules) → 7, version 40 (177) → 37, 3.4–4.8 % of the symbol, spanning 39–61 % of the side
// (never a finder). The picture is contain-fit 1 module inside it. SVG: the plate rect and one <image> with a PNG data
// URL (nothing else enters the attribute). PNG: the plate in the pixels, then drawImage with smoothing on.
import { QUIET, pngModulePx, rgbaPng } from './render';

/** Plate side as a share of the symbol side (before rounding down to an odd module count). */
export const LOGO_SHARE = 0.22;

/** The center picture: a PNG data URL (SVG) and the same picture to draw (PNG), with its pixel size. */
export interface QrLogo {
  dataUrl: string;
  width: number;
  height: number;
  image?: CanvasImageSource;
}

type Rgba = { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number };

const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
const HEX = /^#[0-9a-f]{6}$/;

/** The logo plate of a `size`-module symbol, in modules from the symbol's top-left (no quiet zone). */
export function logoPlate(size: number): { start: number; side: number } {
  let side = Math.floor(size * LOGO_SHARE);
  if (side % 2 === 0) side -= 1;
  return { start: (size - side) / 2, side };
}

/** `svg` (a colored qrSvg of a `size`-module symbol) with the plate in `bg` (#rrggbb) and the picture. */
export function logoSvg(svg: string, size: number, bg: string, logo: QrLogo): string {
  const { start, side } = logoPlate(size);
  const at = start + QUIET;
  let add = `<rect x="${at}" y="${at}" width="${side}" height="${side}" fill="${HEX.test(bg) ? bg : '#ffffff'}"/>`;
  if (PNG_DATA_URL.test(logo.dataUrl)) {
    add += `<image href="${logo.dataUrl}" x="${at + 1}" y="${at + 1}" width="${side - 2}" height="${side - 2}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  return svg.replace('</svg>', `${add}</svg>`);
}

/** Paints the plate of `img` (a colored qrRgba, `px` per module) in `bg` (#rrggbb). */
export function plateRgba(img: Rgba, size: number, px: number, bg: string): Rgba {
  const n = parseInt(HEX.test(bg) ? bg.slice(1) : 'ffffff', 16);
  const { start, side } = logoPlate(size);
  const from = (start + QUIET) * px;
  const to = (start + side + QUIET) * px;
  for (let y = from; y < to; y++) {
    for (let x = from; x < to; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = (n >> 16) & 255;
      img.data[i + 1] = (n >> 8) & 255;
      img.data[i + 2] = n & 255;
    }
  }
  return img;
}

/** PNG blob of `img` (a colored qrRgba at pngModulePx) with the plate and the picture contain-fit inside it. */
export function logoPng(img: Rgba, size: number, bg: string, logo: QrLogo): Promise<Blob> {
  const px = pngModulePx(size);
  return rgbaPng(plateRgba(img, size, px, bg), (ctx) => {
    if (!logo.image || logo.width <= 0 || logo.height <= 0) return;
    const { start, side } = logoPlate(size);
    const box = (side - 2) * px;
    const s = Math.min(box / logo.width, box / logo.height);
    const w = logo.width * s;
    const h = logo.height * s;
    const at = (start + QUIET + 1) * px;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(logo.image, at + (box - w) / 2, at + (box - h) / 2, w, h);
  });
}
