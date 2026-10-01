// PNG export of 전자서명·도장 이미지 (Sprint C, C1; brief failure row "export"): straight RGBA -> canvas -> PNG blob.
// `toBlob` can return null when Safari runs short of room for the canvas; the caller then tries once at the next
// smaller size, then shows an error. Saving goes through a temporary link (nothing leaves the device).
import { INK_SIZES, type InkSize, type Rgba } from '../../lib/ink/key';

export async function encodePng(px: Rgba): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = px.width;
  c.height = px.height;
  const g = c.getContext('2d');
  if (!g) return null;
  g.putImageData(new ImageData(px.data as Uint8ClampedArray<ArrayBuffer>, px.width, px.height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      c.toBlob(resolve, 'image/png');
    } catch {
      resolve(null);
    }
  });
  c.width = 0;
  c.height = 0;
  return blob;
}

/** The next 크기 below an output whose long edge is `long` (downscale only), or null when there is none. */
export function nextSmaller(long: number): InkSize | null {
  for (const s of INK_SIZES) if (s !== null && s < long) return s;
  return null;
}

/**
 * Encodes `first`; when that gives nothing, asks `smaller(size)` for the same image at the next smaller size and
 * encodes that once. Null when both fail (or there is no smaller size).
 */
export async function encodeWithRetry(
  first: Rgba,
  smaller: (size: InkSize) => Promise<Rgba | null>,
  encode: (px: Rgba) => Promise<Blob | null> = encodePng,
): Promise<Blob | null> {
  const blob = await encode(first);
  if (blob) return blob;
  const size = nextSmaller(Math.max(first.width, first.height));
  if (size === null) return null;
  const px = await smaller(size);
  return px ? encode(px) : null;
}

let lastUrl: string | null = null;

/** Saves `blob` as `name` (a temporary link; the previous object URL is released). */
export function saveBlob(blob: Blob, name: string): void {
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = lastUrl;
  a.download = name;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = null;
  });
}
