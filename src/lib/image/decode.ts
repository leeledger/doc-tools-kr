// Worker-side decode (brief Step 3 §2): EXIF orientation and colour management by the browser, with an
// optional long-edge cap applied on decode. Errors map to `heic` (the sniff said HEIC) or `corrupt`.
import type { Decoded } from './engine';
import { PhotoError } from './messages';
import { orientedSize, type Sniff } from './sniff';

const BASE: ImageBitmapOptions = { imageOrientation: 'from-image', colorSpaceConversion: 'default', premultiplyAlpha: 'default' };

export function capSize(w: number, h: number, maxLongEdge: number | null): { width: number; height: number } {
  if (!maxLongEdge || Math.max(w, h) <= maxLongEdge) return { width: w, height: h };
  const s = maxLongEdge / Math.max(w, h);
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

async function bitmap(blob: Blob, sniff: Sniff, opts: ImageBitmapOptions): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { ...BASE, ...opts });
  } catch (err) {
    if (err instanceof RangeError) throw err;
    throw new PhotoError(sniff.format === 'heic' ? 'heic' : 'corrupt', String((err as Error)?.message ?? err));
  }
}

/** Downscales `bm` to (w, h) through an OffscreenCanvas and closes it. */
async function shrink(bm: ImageBitmap, w: number, h: number): Promise<ImageBitmap> {
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d', { colorSpace: 'srgb' });
  if (!g) throw new Error('2d context unavailable');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bm, 0, 0, w, h);
  bm.close();
  const out = await createImageBitmap(c);
  c.width = 0;
  c.height = 0;
  return out;
}

export async function decodeImage(blob: Blob, sniff: Sniff, opts: { maxLongEdge: number | null }): Promise<Decoded<ImageBitmap>> {
  const cap = opts.maxLongEdge;
  const expected = orientedSize(sniff);
  let bm: ImageBitmap | null = null;
  /** Oriented size before any cap. */
  let natural: { width: number; height: number } | null = null;
  if (cap && expected && Math.max(expected.width, expected.height) > cap) {
    const want = capSize(expected.width, expected.height, cap);
    bm = await bitmap(blob, sniff, { resizeWidth: want.width, resizeHeight: want.height, resizeQuality: 'high' });
    natural = expected;
    // A browser that resized before orienting gives the wrong aspect: decode again at full size and
    // downscale on a canvas instead.
    if (Math.abs(bm.width / bm.height - want.width / want.height) > 0.02) {
      bm.close();
      bm = null;
    }
  }
  if (!bm) {
    bm = await bitmap(blob, sniff, {});
    natural = { width: bm.width, height: bm.height };
  }
  // The resize option was ignored (or there was no header size): downscale now.
  if (cap && Math.max(bm.width, bm.height) > cap) {
    const want = capSize(bm.width, bm.height, cap);
    bm = await shrink(bm, want.width, want.height);
  }
  const out = bm;
  return {
    src: out,
    width: out.width,
    height: out.height,
    sourceWidth: natural!.width,
    sourceHeight: natural!.height,
    capped: Boolean(cap && Math.max(natural!.width, natural!.height) > cap),
    close: () => out.close(),
  };
}
