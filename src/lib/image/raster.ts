// Worker-side canvas helpers (brief Step 3 §2). `hasTransparency` is pure and also runs in Node.

/** An sRGB OffscreenCanvas of (w, h) with `src` drawn at high-quality smoothing; white underneath when `flatten`. */
export function toCanvas(src: CanvasImageSource, w: number, h: number, opts: { flatten: boolean }): OffscreenCanvas {
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
  if (!g) throw new Error('2d context unavailable');
  if (opts.flatten) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
  }
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, w, h);
  return c;
}

export function canvasPixels(c: OffscreenCanvas): ImageData {
  const g = c.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
  if (!g) throw new Error('2d context unavailable');
  return g.getImageData(0, 0, c.width, c.height);
}

/** True when any pixel is not fully opaque (a full scan). */
export function hasTransparency(img: { data: Uint8ClampedArray | Uint8Array }): boolean {
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) if (d[i]! < 255) return true;
  return false;
}

/** Frees the canvas backing store now instead of at garbage collection. */
export function releaseCanvas(c: OffscreenCanvas): void {
  c.width = 0;
  c.height = 0;
}
