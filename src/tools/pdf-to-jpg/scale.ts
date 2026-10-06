// Page size -> canvas size for PDF JPG 변환 (brief TOOLS4 T3). Pure. A page is drawn at ppi / 72 (PDF pages are in
// points, 72 per inch), shrunk only when the canvas would pass the device's limits: iOS Safari leaves a canvas over its
// area limit blank, so phones get 16,000,000 pixels and a 4,096-pixel long edge (feasibility §1, §4).

export interface CanvasCaps {
  /** Width × height, at most. */
  maxArea: number;
  /** Longer side, at most. */
  maxEdge: number;
}

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
  let scale = ppi / 72;
  let width = Math.max(1, Math.round(wPt * scale));
  let height = Math.max(1, Math.round(hPt * scale));
  if (Math.max(width, height) <= caps.maxEdge && width * height <= caps.maxArea) return { scale, width, height, clamped: false };
  scale = Math.min(caps.maxEdge / Math.max(wPt, hPt), Math.sqrt(caps.maxArea / (wPt * hPt)));
  // Rounded down so the canvas never passes a cap.
  width = Math.max(1, Math.floor(wPt * scale));
  height = Math.max(1, Math.floor(hPt * scale));
  return { scale, width, height, clamped: true };
}
