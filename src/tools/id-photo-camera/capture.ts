// 증명사진 촬영 (IDCAM1022 D3, D5): the pure half of the capture. The overlay rectangle is the largest centred
// rectangle of the preset's aspect inside the video frame; the saved still is exactly that rectangle cut from the frame
// at its own resolution, so /id-photo/ (manualFrame = the largest centred crop of the same aspect) opens it as lined up.
// The preview of the front camera is mirrored on screen; the still is taken from the frame itself, never mirrored.

export interface Size {
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The overlay rectangle in frame pixels: the largest centred rectangle of `aspect` (w:h) inside `frame`, in whole
 * pixels, never larger than the frame. Zero size for an empty frame or aspect.
 */
export function overlayRect(frame: Size, aspect: Size): Rect {
  if (!(frame.w > 0 && frame.h > 0 && aspect.w > 0 && aspect.h > 0)) return { x: 0, y: 0, w: 0, h: 0 };
  const r = aspect.w / aspect.h;
  let w: number;
  let h: number;
  if (frame.w / frame.h > r) {
    h = frame.h;
    w = Math.min(frame.w, Math.round(h * r));
  } else {
    w = frame.w;
    h = Math.min(frame.h, Math.round(w / r));
  }
  return { x: Math.floor((frame.w - w) / 2), y: Math.floor((frame.h - h) / 2), w, h };
}

/**
 * A rectangle seen on a mirrored preview, in the frame's own (unmirrored) pixels: x is reflected about the frame's
 * vertical centre. Unchanged when the preview is not mirrored (and for a centred rectangle either way).
 */
export function unmirrorRect(rect: Rect, frameW: number, mirrored: boolean): Rect {
  return mirrored ? { ...rect, x: frameW - rect.x - rect.w } : { ...rect };
}

/** The rectangle `rect` (frame pixels) on a box showing the whole frame at `box` size (CSS pixels). */
export function toBox(rect: Rect, frame: Size, box: Size): Rect {
  const kx = frame.w > 0 ? box.w / frame.w : 0;
  const ky = frame.h > 0 ? box.h / frame.h : 0;
  return { x: rect.x * kx, y: rect.y * ky, w: rect.w * kx, h: rect.h * ky };
}

/** The still is smaller than the preset's output: /id-photo/ would block it (it never enlarges). */
export function isLowres(rect: Size, out: Size): boolean {
  return rect.w < out.w || rect.h < out.h;
}

/** Mean Rec. 601 luma (0-255) of RGBA pixels; 0 for no pixels. */
export function meanLuma(rgba: ArrayLike<number>): number {
  const n = Math.floor(rgba.length / 4);
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n * 4; i += 4) sum += 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
  return sum / n;
}

/** A frame this dark is a camera that has not delivered a picture yet (iOS black frame), not a photo. */
export const BLACK_LUMA = 4;

/** The frame is (nearly) all black. */
export function isBlackFrame(rgba: ArrayLike<number>): boolean {
  return meanLuma(rgba) < BLACK_LUMA;
}
