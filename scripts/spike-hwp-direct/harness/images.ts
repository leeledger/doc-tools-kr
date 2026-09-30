// SPIKE-HWP-DIRECT: page images → PDF image XObjects, with the production downscale rule (src/lib/hwp/downscale.ts:
// 200 dpi at the printed size, > 1.25 × oversize, > 100 KB payload, JPEG q 0.85 when opaque (or a JPEG source),
// PNG otherwise; a non-oversized opaque photo PNG is re-encoded as JPEG; keep the smaller). JPEG passes through
// untouched when it needs nothing (not oversized, no filter, not CMYK). Every distinct href (+ filter) is embedded
// once per document, so a logo repeated on every page costs one XObject.
import type { PDFDocument, PDFRef } from '@cantoo/pdf-lib';
import { CSS_DPI, isOpaquePhoto, JPEG_QUALITY, MIN_PAYLOAD, OVERSIZE, TARGET_DPI, dataUrlBytes, parseDataUrl } from '../../../src/lib/hwp/downscale';

export interface EmbeddedImage {
  ref: PDFRef;
  width: number;
  height: number;
}

export interface ImageStats {
  images: number;
  passthrough: number;
  reencoded: number;
  bytesIn: number;
  bytesOut: number;
  failed: number;
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number): Promise<Blob | null> => new Promise((r) => c.toBlob(r, type, q));

function jpegInfo(b: Uint8Array): { w: number; h: number; comps: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const mk = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if ((mk >= 0xc0 && mk <= 0xc3) || (mk >= 0xc5 && mk <= 0xc7) || (mk >= 0xc9 && mk <= 0xcb) || (mk >= 0xcd && mk <= 0xcf)) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9] };
    i += 2 + len;
  }
  return null;
}
function pngInfo(b: Uint8Array): { w: number; h: number } | null {
  if (b[0] !== 0x89 || b[1] !== 0x50) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

function filterParams(fel: Element | null): { slope: number[]; intercept: number[] } | null {
  if (!fel) return null;
  const slope = [1, 1, 1];
  const intercept = [0, 0, 0];
  for (const c of Array.from(fel.querySelectorAll('feFuncR, feFuncG, feFuncB'))) {
    const k = { feFuncR: 0, feFuncG: 1, feFuncB: 2 }[c.localName as 'feFuncR'];
    if ((c.getAttribute('type') ?? '') !== 'linear') continue;
    slope[k] = parseFloat(c.getAttribute('slope') ?? '1');
    intercept[k] = parseFloat(c.getAttribute('intercept') ?? '0');
  }
  return { slope, intercept };
}

export class ImageCache {
  private map = new Map<string, Promise<EmbeddedImage | null>>();
  stats: ImageStats = { images: 0, passthrough: 0, reencoded: 0, bytesIn: 0, bytesOut: 0, failed: 0 };
  constructor(private doc: PDFDocument, private opts: { dpi?: number } = {}) {}

  get(href: string, printedW: number, printedH: number, filter: Element | null): Promise<EmbeddedImage | null> {
    const key = `${filter?.getAttribute('id') ?? ''}|${href.length}|${href.slice(-64)}|${href.slice(0, 256)}`;
    let p = this.map.get(key);
    if (!p) {
      p = this.embed(href, printedW, printedH, filter).catch(() => {
        this.stats.failed++;
        return null;
      });
      this.map.set(key, p);
    }
    return p;
  }

  private async embed(href: string, pw: number, ph: number, filter: Element | null): Promise<EmbeddedImage | null> {
    const dpi = this.opts.dpi ?? TARGET_DPI;
    const target = { w: Math.max(1, Math.round((pw * dpi) / CSS_DPI)), h: Math.max(1, Math.round((ph * dpi) / CSS_DPI)) };
    const parsed = parseDataUrl(href);
    if (!parsed) return null;
    this.stats.images++;
    this.stats.bytesIn += parsed.bytes.length;
    const fp = filterParams(filter);
    const payload = dataUrlBytes(href);
    const jpeg = parsed.mime === 'image/jpeg' || parsed.mime === 'image/jpg' ? jpegInfo(parsed.bytes) : null;
    const png = parsed.mime === 'image/png' ? pngInfo(parsed.bytes) : null;
    const natural = jpeg ?? png;
    const oversize = natural ? natural.w > target.w * OVERSIZE || natural.h > target.h * OVERSIZE : true;
    // Pass-through: nothing to do.
    if (!fp && jpeg && jpeg.comps !== 4 && (!oversize || payload <= MIN_PAYLOAD)) return this.done(await this.doc.embedJpg(parsed.bytes), parsed.bytes.length, true);
    if (!fp && png && (payload <= MIN_PAYLOAD || !oversize)) {
      // A non-oversized PNG > 100 KB that is an opaque photo is re-encoded (below); others pass.
      if (payload <= MIN_PAYLOAD) return this.done(await this.doc.embedPng(parsed.bytes), parsed.bytes.length, true);
    }
    // Canvas path: decode, scale (never up), filter, encode.
    const blob = new Blob([parsed.bytes], { type: parsed.mime });
    let src: CanvasImageSource & { width: number; height: number };
    let close = (): void => undefined;
    if (parsed.mime === 'image/svg+xml') {
      const url = URL.createObjectURL(blob);
      const im = new Image();
      im.src = url;
      await im.decode();
      URL.revokeObjectURL(url);
      src = im;
    } else {
      const bm = await createImageBitmap(blob);
      src = bm;
      close = () => bm.close();
    }
    try {
      const nw = src.width || target.w;
      const nh = src.height || target.h;
      const isOver = parsed.mime === 'image/svg+xml' ? true : nw > target.w * OVERSIZE || nh > target.h * OVERSIZE;
      const s = parsed.mime === 'image/svg+xml' ? Math.max(target.w / nw, target.h / nh) : isOver ? Math.min(1, Math.max(target.w / nw, target.h / nh)) : 1;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(nw * s));
      c.height = Math.max(1, Math.round(nh * s));
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, c.width, c.height);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      if (fp) {
        // SVG filters run in linearRGB by default (color-interpolation-filters): sRGB → linear, a·C + b, → sRGB.
        const d = data.data;
        const toLin = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        const toSrgb = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
        const lut = [0, 1, 2].map((k) => Uint8ClampedArray.from({ length: 256 }, (_, v) => Math.round(255 * toSrgb(Math.max(0, Math.min(1, fp.slope[k] * toLin(v / 255) + fp.intercept[k]))))));
        for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = lut[k][d[i + k]];
        ctx.putImageData(data, 0, 0);
      }
      let alpha = false;
      for (let i = 3; i < data.data.length; i += 4) if (data.data[i] < 255) { alpha = true; break; }
      const photo = !alpha && isOpaquePhoto(data.data, c.width);
      const useJpeg = !alpha && (jpeg !== null || photo || (isOver && !alpha && photo));
      let out: Blob | null;
      if (useJpeg) out = await toBlob(c, 'image/jpeg', JPEG_QUALITY);
      else out = await toBlob(c, 'image/png');
      // Opaque, oversized, not photo-like (line art): PNG, but keep a JPEG if that is much smaller.
      c.width = 0;
      c.height = 0;
      if (!out) return null;
      const bytes = new Uint8Array(await out.arrayBuffer());
      // Keep the original when it is smaller and needs no filter / is embeddable as is.
      if (!fp && bytes.length >= parsed.bytes.length && jpeg && jpeg.comps !== 4) return this.done(await this.doc.embedJpg(parsed.bytes), parsed.bytes.length, true);
      if (!fp && bytes.length >= parsed.bytes.length && png) return this.done(await this.doc.embedPng(parsed.bytes), parsed.bytes.length, true);
      this.stats.reencoded++;
      return this.done(useJpeg ? await this.doc.embedJpg(bytes) : await this.doc.embedPng(bytes), bytes.length, false);
    } finally {
      close();
    }
  }

  private done(img: { ref: PDFRef; width: number; height: number }, bytes: number, pass: boolean): EmbeddedImage {
    if (pass) this.stats.passthrough++;
    this.stats.bytesOut += bytes;
    return { ref: img.ref, width: img.width, height: img.height };
  }
}
