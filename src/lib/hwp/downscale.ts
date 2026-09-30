// Downscales embedded bitmaps to 200 dpi at their printed size (brief Step 5 §2, "Output": kr01 printed a
// 38 MB PDF from a 13 MB source image). Main thread, needs layout (getScreenCTM). For each <image> with a
// data: href of more than 100 KB whose natural size is over 1.25 × the 200-dpi target: decode (base64 →
// Blob → createImageBitmap, no fetch), draw on an HTMLCanvasElement (no OffscreenCanvas: WebKit on Windows),
// encode JPEG q 0.85 (JPEG source, or no alpha below 255) else PNG, keep the smaller, and swap the href to a
// blob: URL the caller tracks and revokes. SVG sources are left alone; BMP is treated like PNG.
// Arch F2 (Step 5 round 2): a PNG/BMP over 100 KB that is NOT oversized is re-encoded as JPEG q 0.85 at the
// same pixel size when it is a photo: fully opaque and not line art (line art = at most 64 distinct colours,
// or at least 85 % of pixels equal to their left neighbour, which catches text, diagrams and screenshots;
// infographics with photos on flat backgrounds measure ~0.74 (kr36, kr38) and are re-encoded).
// Kept only when the JPEG is smaller.

export const TARGET_DPI = 200;
export const CSS_DPI = 96;
export const MIN_PAYLOAD = 100 * 1024;
export const OVERSIZE = 1.25;
export const JPEG_QUALITY = 0.85;

export interface DownscaleResult {
  /** Images replaced by a smaller blob: URL. */
  downscaled: number;
  /** The new blob: URLs (the caller revokes them on eviction and reset). */
  urls: string[];
}

interface Parsed {
  mime: string;
  bytes: Uint8Array<ArrayBuffer>;
}

/** Splits a base64 data URL; null for anything else (plain-text data URLs are not bitmaps). */
export function parseDataUrl(href: string): Parsed | null {
  const m = /^data:([^;,]+)(?:;[^;,]*)*;base64,/i.exec(href);
  if (!m) return null;
  const b64 = href.slice(m[0].length).replace(/\s+/g, '');
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: m[1].toLowerCase(), bytes };
}

/** Approximate decoded size of a base64 data URL without decoding it. */
export function dataUrlBytes(href: string): number {
  const comma = href.indexOf(',');
  return comma < 0 ? 0 : Math.floor(((href.length - comma - 1) * 3) / 4);
}

/** The 200-dpi pixel target for a printed box of `w` × `h` CSS px. */
export function targetSize(w: number, h: number): { w: number; h: number } {
  return { w: Math.max(1, Math.round((w * TARGET_DPI) / CSS_DPI)), h: Math.max(1, Math.round((h * TARGET_DPI) / CSS_DPI)) };
}

/** True when a natural size is worth reducing for this target (either side over 1.25 ×). */
export function needsDownscale(natural: { w: number; h: number }, target: { w: number; h: number }): boolean {
  return natural.w > target.w * OVERSIZE || natural.h > target.h * OVERSIZE;
}

/** The image's printed box in the page's user units (CSS px at print): attribute size × the CTM scale. */
function printedBox(svg: SVGSVGElement, im: SVGImageElement): { w: number; h: number } {
  const w = parseFloat(im.getAttribute('width') ?? '0');
  const h = parseFloat(im.getAttribute('height') ?? '0');
  const page = svg.getScreenCTM();
  const own = im.getScreenCTM();
  if (!page || !own) return { w, h };
  const m = page.inverse().multiply(own);
  return { w: w * Math.hypot(m.a, m.b), h: h * Math.hypot(m.c, m.d) };
}

function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

export const LINE_ART_MAX_COLOURS = 64;
export const LINE_ART_FLAT_SHARE = 0.85;

/**
 * Photo test for RGBA pixels (row-major, `w` wide): false when any alpha < 255, when there are at most 64
 * distinct colours, or when ≥ 85 % of pixels equal their left neighbour (flat areas: text, diagrams).
 */
export function isOpaquePhoto(data: Uint8ClampedArray | Uint8Array, w: number): boolean {
  const colours = new Set<number>();
  let flat = 0;
  const n = data.length >> 2;
  for (let p = 0; p < n; p++) {
    const i = p << 2;
    if (data[i + 3] < 255) return false;
    const c = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    if (colours.size <= LINE_ART_MAX_COLOURS) colours.add(c);
    if (p % w !== 0 && data[i] === data[i - 4] && data[i + 1] === data[i - 3] && data[i + 2] === data[i - 2]) flat++;
  }
  return colours.size > LINE_ART_MAX_COLOURS && flat / Math.max(1, n - Math.ceil(n / w)) < LINE_ART_FLAT_SHARE;
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number): Promise<Blob | null> => new Promise((resolve) => c.toBlob(resolve, type, q));

export async function downscaleImages(svg: SVGSVGElement, doc: Document = document): Promise<DownscaleResult> {
  const out: DownscaleResult = { downscaled: 0, urls: [] };
  for (const im of Array.from(svg.querySelectorAll('image')) as SVGImageElement[]) {
    const href = im.getAttribute('href') ?? im.getAttribute('xlink:href') ?? '';
    if (!/^data:image\//i.test(href) || /^data:image\/svg/i.test(href)) continue;
    const payload = dataUrlBytes(href);
    if (payload <= MIN_PAYLOAD) continue;
    const box = printedBox(svg, im);
    const target = targetSize(box.w, box.h);
    const parsed = parseDataUrl(href);
    if (!parsed) continue;
    let bitmap: ImageBitmap | null = null;
    const canvas = doc.createElement('canvas');
    try {
      bitmap = await createImageBitmap(new Blob([parsed.bytes], { type: parsed.mime }));
      const natural = { w: bitmap.width, h: bitmap.height };
      const oversize = needsDownscale(natural, target);
      const jpegSource = parsed.mime === 'image/jpeg' || parsed.mime === 'image/jpg';
      if (!oversize && jpegSource) continue;
      // Keep the aspect ratio; reach the target in both directions (never upscale). Not oversized: same size.
      const s = oversize ? Math.min(1, Math.max(target.w / natural.w, target.h / natural.h)) : 1;
      canvas.width = Math.max(1, Math.round(natural.w * s));
      canvas.height = Math.max(1, Math.round(natural.h * s));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) continue;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let jpeg: boolean;
      if (oversize) jpeg = jpegSource || !hasAlpha(ctx, canvas.width, canvas.height);
      else {
        if (!isOpaquePhoto(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width)) continue;
        jpeg = true;
      }
      const blob = jpeg ? await toBlob(canvas, 'image/jpeg', JPEG_QUALITY) : await toBlob(canvas, 'image/png');
      if (!blob || blob.size >= parsed.bytes.length) continue;
      const url = URL.createObjectURL(blob);
      out.urls.push(url);
      im.setAttribute('href', url);
      im.removeAttribute('xlink:href');
      out.downscaled++;
    } catch {
      // An image the browser cannot decode stays as it is (it prints as rhwp drew it).
    } finally {
      bitmap?.close();
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  return out;
}
