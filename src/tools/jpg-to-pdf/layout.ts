// Page layout for 사진 PDF 변환 (brief TOOLS4 T2). Pure: image size (as displayed, EXIF orientation applied), the
// user's rotation and the options in, page size and draw rectangle out, in PDF points (1/72 inch).

export type PageMode = 'a4' | 'fit';
export type Orient = 'auto' | 'portrait';
export type Rotation = 0 | 90 | 180 | 270;

export interface LayoutOptions {
  page: PageMode;
  /** A4 only: 자동 = the page turns with the photo; 세로 = always portrait. */
  orient: Orient;
  /** A4 only: margin on every side, in mm. */
  marginMm: 0 | 10;
}

export interface Placement {
  pageW: number;
  pageH: number;
  /** Draw rectangle of the (rotated) image, from the page's bottom-left corner. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export const A4_W = 595.28;
export const A4_H = 841.89;
export const PT_PER_MM = 72 / 25.4;

/** (w, h) after a quarter-turn rotation. */
export function rotatedSize(w: number, h: number, rotation: Rotation): { w: number; h: number } {
  return rotation === 90 || rotation === 270 ? { w: h, h: w } : { w, h };
}

export function layout(imgW: number, imgH: number, rotation: Rotation, opts: LayoutOptions): Placement {
  const { w: rw, h: rh } = rotatedSize(imgW, imgH, rotation);
  if (opts.page === 'fit') {
    // The page has the photo's shape, long side as long as A4's, no margin.
    const pageW = rw >= rh ? A4_H : (A4_H * rw) / rh;
    const pageH = rw >= rh ? (A4_H * rh) / rw : A4_H;
    return { pageW, pageH, x: 0, y: 0, w: pageW, h: pageH };
  }
  const portrait = opts.orient === 'portrait' || rw <= rh;
  const pageW = portrait ? A4_W : A4_H;
  const pageH = portrait ? A4_H : A4_W;
  const m = opts.marginMm * PT_PER_MM;
  const s = Math.min((pageW - 2 * m) / rw, (pageH - 2 * m) / rh);
  const w = rw * s;
  const h = rh * s;
  return { pageW, pageH, x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}
