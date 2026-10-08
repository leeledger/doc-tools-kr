// Page size -> canvas size for PDF JPG 변환 (brief TOOLS4 T3). Pure. A page is drawn at ppi / 72 (PDF pages are in
// points, 72 per inch), shrunk only when the canvas would pass the device's limits (lib/image/caps.ts): phones get
// 16,000,000 pixels and a 4,096-pixel long edge (feasibility §1, §4).
import { fitWithinCaps, fitsCaps, type CanvasCaps } from '../../lib/image/caps';

export interface PageScale {
  /** pdf.js viewport scale (1 = 72 pixels per inch). */
  scale: number;
  width: number;
  height: number;
  /** True when the page was drawn smaller than `ppi` asks, to stay within the caps. */
  clamped: boolean;
}

/** Canvas size of a `wPt` × `hPt` page (rotation applied) at `ppi`, within `caps`. */
export function pageScale(wPt: number, hPt: number, ppi: number, caps: CanvasCaps): PageScale {
  const scale = ppi / 72;
  const width = Math.max(1, Math.round(wPt * scale));
  const height = Math.max(1, Math.round(hPt * scale));
  if (fitsCaps(width, height, caps)) return { scale, width, height, clamped: false };
  return { ...fitWithinCaps(wPt, hPt, caps), clamped: true };
}
