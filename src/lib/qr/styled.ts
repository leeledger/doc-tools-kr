// QR colors on top of the plain renderers (QR1031 D9). Pure. Only #rrggbb gets in (parseHex); black on white returns
// the plain output unchanged, so the default files are byte-identical. The logo plate and picture are added on top by
// logo-render.ts (the lazy logo chunk), which takes these outputs from the controller.
import type { QrModules } from './encode';
import { qrRgba, qrSvg } from './render';
import { DEFAULT_BG, DEFAULT_FG, parseHex, rgb } from './style';

export interface QrColors {
  fg: string;
  bg: string;
}

/** The colors as #rrggbb (anything else = the default). */
export const cleanColors = (c: QrColors): QrColors => ({ fg: parseHex(c.fg, DEFAULT_FG), bg: parseHex(c.bg, DEFAULT_BG) });

/** qrSvg in the chosen colors: the background rect and the module path get them. */
export function colorSvg(modules: QrModules, colors: QrColors): string {
  const { fg, bg } = cleanColors(colors);
  const svg = qrSvg(modules);
  if (fg === DEFAULT_FG && bg === DEFAULT_BG) return svg;
  return svg.replace(' fill="#fff"/>', ` fill="${bg}"/>`).replace('<path fill="#000"', `<path fill="${fg}"`);
}

/** qrRgba in the chosen colors (its pixels are only black or white). */
export function colorRgba(modules: QrModules, px: number, colors: QrColors): ReturnType<typeof qrRgba> {
  const { fg, bg } = cleanColors(colors);
  const img = qrRgba(modules, px);
  if (fg === DEFAULT_FG && bg === DEFAULT_BG) return img;
  const dark = rgb(fg);
  const light = rgb(bg);
  const { data } = img;
  for (let i = 0; i < data.length; i += 4) {
    const c = data[i] === 0 ? dark : light;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
  }
  return img;
}
