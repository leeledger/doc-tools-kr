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

/** Rows read per pixel read when looking for transparency: width × 256 × 4 bytes at a time, not the whole image. */
export const SCAN_ROWS = 256;

/**
 * True when any pixel is not fully opaque, reading `height` rows in bands of `rows` through `read(y, h)` and stopping
 * at the first band that has one (Review T2 Should Fix 4: a 4,096-pixel photo is 64 MB as one ImageData). Pure.
 */
export function bandsHaveTransparency(height: number, read: (y: number, h: number) => { data: Uint8ClampedArray | Uint8Array }, rows: number = SCAN_ROWS): boolean {
  for (let y = 0; y < height; y += rows) if (hasTransparency(read(y, Math.min(rows, height - y)))) return true;
  return false;
}

/** bandsHaveTransparency over a canvas. */
export function canvasHasTransparency(c: OffscreenCanvas): boolean {
  const g = c.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
  if (!g) throw new Error('2d context unavailable');
  return bandsHaveTransparency(c.height, (y, h) => g.getImageData(0, y, c.width, h));
}

/** Frees the canvas backing store now instead of at garbage collection. */
export function releaseCanvas(c: OffscreenCanvas): void {
  c.width = 0;
  c.height = 0;
}

/**
 * The photo workers draw and encode on an OffscreenCanvas (2d + convertToBlob). Browsers without it (Safari before
 * 16.4) get a notice up front instead of a failure per photo; there is no main-thread path. Workers expose
 * OffscreenCanvas wherever the page does, so the page-side check stands for the worker. (Moved here from the
 * /photo-compress/ controller in TOOLS4 T2; /jpg-to-pdf/ uses it too.)
 */
export function canDrawOffscreen(): boolean {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') return false;
  try {
    const c = new OffscreenCanvas(1, 1);
    return c.getContext('2d') !== null && typeof c.convertToBlob === 'function';
  } catch {
    return false;
  }
}
