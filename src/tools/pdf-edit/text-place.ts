// PDF 글자 넣기·편집 (TOOLS1015 E1): where a text line starts in PDF space. The box is in the page as seen (pdf.js viewport
// at scale 1, the CropBox origin and /Rotate applied); a line's baseline start as seen goes through the page's own
// viewport conversion (convertToPdfPoint, as pdf-sign's toPdfRect), and the text turns counter-clockwise by the page
// rotation, so a viewer that turns the page clockwise shows it upright where it was placed.
import { clampBox, toPdfRect, type Box, type PageInfo, type Stamp } from '../pdf-sign/place';
import { baselineOf } from './items';

export interface TextOrigin {
  x: number;
  y: number;
  /** Counter-clockwise degrees (pdf-lib drawText `rotate`). */
  rotate: number;
}

/**
 * PDF point and turn of line `line`'s baseline start, for a text box drawn from its top-left at `size` points; `ascent`
 * is the first baseline's distance below the top of its line box, in em, without the half leading (items.ts ASCENT).
 */
export function textOrigin(box: Box, info: PageInfo, ascent: number, size: number, line = 0): TextOrigin {
  const b = clampBox(box, info.width, info.height);
  const [x, y] = info.toPdf(b.x, b.y + baselineOf(line, size, ascent)) as [number, number];
  return { x, y, rotate: ((info.rotate % 360) + 360) % 360 };
}

/** pdf-lib drawRectangle arguments for a white box (as a picture's drawImage arguments: lower-left corner, size, turn). */
export function whiteRect(box: Box, info: PageInfo): Omit<Stamp, 'page'> {
  return toPdfRect(box, info);
}
