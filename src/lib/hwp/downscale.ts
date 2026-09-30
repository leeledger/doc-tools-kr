// The image downscale rule (brief Step 5 §2, "Output": kr01 printed a 38 MB PDF from a 13 MB source image),
// applied by the PDF writer (src/lib/hwp/pdf/images.ts; HWP direct): an image with a data: href of more than
// 100 KB whose natural size is over 1.25 × the 200-dpi target of its printed size is re-encoded, JPEG q 0.85
// (JPEG source, or no alpha below 255) else PNG, and the smaller of the two versions is kept.
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
