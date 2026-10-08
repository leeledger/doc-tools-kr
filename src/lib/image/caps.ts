// Canvas size limits (pure). iOS Safari leaves a canvas over its area limit blank, so callers pass per-device caps
// (feasibility §1, §4 of TOOLS4).

export interface CanvasCaps {
  /** Width × height, at most. */
  maxArea: number;
  /** Longer side, at most. */
  maxEdge: number;
}

/** True when a `width` × `height` canvas is within `caps`. */
export function fitsCaps(width: number, height: number, caps: CanvasCaps): boolean {
  return Math.max(width, height) <= caps.maxEdge && width * height <= caps.maxArea;
}

/**
 * The scale that brings `w` × `h` onto the caps (the long edge to maxEdge or the area to maxArea, whichever is
 * smaller) and the canvas size at that scale, rounded down so it never passes a cap.
 */
export function fitWithinCaps(w: number, h: number, caps: CanvasCaps): { scale: number; width: number; height: number } {
  const scale = Math.min(caps.maxEdge / Math.max(w, h), Math.sqrt(caps.maxArea / (w * h)));
  return { scale, width: Math.max(1, Math.floor(w * scale)), height: Math.max(1, Math.floor(h * scale)) };
}
