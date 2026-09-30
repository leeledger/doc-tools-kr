// Page images → PDF image XObjects (SPIKE-HWP-DIRECT §6.3 "Images"). The production downscale rule
// (downscale.ts: 200 dpi at the printed size, oversize > 1.25 ×, payload > 100 KB, JPEG q 0.85 for photos and
// JPEG sources, PNG for line art, keep the smaller) now runs here instead of in the preview.
// - A JPEG that needs nothing is embedded as is (no decode).
// - A CMYK JPEG always goes through the canvas (PDF viewers disagree on Adobe-inverted CMYK).
// - Every distinct href (+ filter) is embedded once per document (rhwp repeats header logos on every page).
// - A brightness/contrast filter (feComponentTransfer linear) is applied to the pixels in linearRGB, as the
//   SVG filter does by default.
// The canvas work is injected (`Recode`), so everything else is unit-tested in Node.
import type { PDFDocument, PDFRef } from '@cantoo/pdf-lib';
import { JPEG_QUALITY, MIN_PAYLOAD, dataUrlBytes, isOpaquePhoto, needsDownscale, parseDataUrl, targetSize } from '../downscale';

export interface EmbeddedImage {
  ref: PDFRef;
  width: number;
  height: number;
}

export interface ImageStats {
  images: number;
  passthrough: number;
  reencoded: number;
  failed: number;
}

export interface Filter {
  id: string;
  slope: [number, number, number];
  intercept: [number, number, number];
}

export interface RecodeInput {
  bytes: Uint8Array;
  mime: string;
  /** 200-dpi pixel target of the printed box. */
  target: { w: number; h: number };
  /** Per-channel 256-entry lookup tables, or null. */
  lut: Uint8ClampedArray[] | null;
  jpegSource: boolean;
}

/** Decodes, scales (never up; SVG sources are drawn at the target), filters and encodes. null = cannot decode. */
export type Recode = (x: RecodeInput) => Promise<{ bytes: Uint8Array; jpeg: boolean } | null>;

export function jpegInfo(b: Uint8Array): { w: number; h: number; comps: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const mk = b[i + 1]!;
    if (mk === 0xff) {
      i++;
      continue;
    }
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    const sof = (mk >= 0xc0 && mk <= 0xc3) || (mk >= 0xc5 && mk <= 0xc7) || (mk >= 0xc9 && mk <= 0xcb) || (mk >= 0xcd && mk <= 0xcf);
    if (sof) return { h: (b[i + 5]! << 8) | b[i + 6]!, w: (b[i + 7]! << 8) | b[i + 8]!, comps: b[i + 9]! };
    i += 2 + len;
  }
  return null;
}

export function pngInfo(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** feFuncX type="linear" in linearRGB, as a lookup table over sRGB bytes. */
export function filterLut(slope: number, intercept: number): Uint8ClampedArray {
  return Uint8ClampedArray.from({ length: 256 }, (_, v) => Math.round(255 * toSrgb(Math.max(0, Math.min(1, slope * toLinear(v / 255) + intercept)))));
}

/** The filter of a <g filter>, when it is a brightness/contrast feComponentTransfer (linear or identity). */
export function brightnessContrast(fel: Element): Filter | null {
  const kids = Array.from(fel.children);
  const ft = kids[0];
  if (kids.length !== 1 || !ft || ft.localName !== 'feComponentTransfer') return null;
  const slope: [number, number, number] = [1, 1, 1];
  const intercept: [number, number, number] = [0, 0, 0];
  for (const c of Array.from(ft.children)) {
    const k = ({ feFuncR: 0, feFuncG: 1, feFuncB: 2 } as Record<string, number>)[c.localName];
    if (k === undefined) return null;
    const type = c.getAttribute('type') ?? 'identity';
    if (type === 'identity') continue;
    if (type !== 'linear') return null;
    const s = parseFloat(c.getAttribute('slope') ?? '1');
    const b = parseFloat(c.getAttribute('intercept') ?? '0');
    slope[k] = Number.isFinite(s) ? s : 1;
    intercept[k] = Number.isFinite(b) ? b : 0;
  }
  return { id: fel.getAttribute('id') ?? '', slope, intercept };
}

/** 64-bit FNV-1a (two lanes) over the whole href: the dedupe key never holds the data URL itself. */
function hrefKey(href: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ href.length;
  for (let i = 0; i < href.length; i++) {
    const c = href.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
  }
  return `${href.length}:${(a >>> 0).toString(36)}:${(b >>> 0).toString(36)}`;
}

export class ImageCache {
  readonly stats: ImageStats = { images: 0, passthrough: 0, reencoded: 0, failed: 0 };
  private readonly map = new Map<string, Promise<EmbeddedImage | null>>();

  constructor(
    private readonly doc: PDFDocument,
    private readonly recode: Recode,
  ) {}

  /** The XObject for this href drawn at `printedW` × `printedH` page px, or null when it cannot be decoded. */
  get(href: string, printedW: number, printedH: number, filter: Filter | null): Promise<EmbeddedImage | null> {
    const key = `${filter?.id ?? ''}|${hrefKey(href)}`;
    let p = this.map.get(key);
    if (!p) {
      p = this.embed(href, printedW, printedH, filter).catch(() => null);
      p.then((r) => {
        if (!r) this.stats.failed++;
      });
      this.map.set(key, p);
    }
    return p;
  }

  private async embed(href: string, pw: number, ph: number, filter: Filter | null): Promise<EmbeddedImage | null> {
    const target = targetSize(pw, ph);
    const parsed = parseDataUrl(href);
    if (!parsed) return null;
    this.stats.images++;
    const payload = dataUrlBytes(href);
    const jpegSource = parsed.mime === 'image/jpeg' || parsed.mime === 'image/jpg';
    const jpeg = jpegSource ? jpegInfo(parsed.bytes) : null;
    const png = parsed.mime === 'image/png' ? pngInfo(parsed.bytes) : null;
    const natural = jpeg ?? png;
    const oversize = natural ? needsDownscale(natural, target) : true;
    const cmyk = jpeg?.comps === 4;
    if (!filter && jpeg && !cmyk && (!oversize || payload <= MIN_PAYLOAD)) return this.pass(await this.doc.embedJpg(parsed.bytes));
    if (!filter && png && payload <= MIN_PAYLOAD) return this.pass(await this.doc.embedPng(parsed.bytes));
    const lut = filter ? [0, 1, 2].map((k) => filterLut(filter.slope[k]!, filter.intercept[k]!)) : null;
    const out = await this.recode({ bytes: parsed.bytes, mime: parsed.mime, target, lut, jpegSource });
    if (!out) return null;
    // Keep the original when it is smaller and embeddable as is.
    if (!filter && out.bytes.length >= parsed.bytes.length && jpeg && !cmyk) return this.pass(await this.doc.embedJpg(parsed.bytes));
    if (!filter && out.bytes.length >= parsed.bytes.length && png) return this.pass(await this.doc.embedPng(parsed.bytes));
    this.stats.reencoded++;
    const img = out.jpeg ? await this.doc.embedJpg(out.bytes) : await this.doc.embedPng(out.bytes);
    return { ref: img.ref, width: img.width, height: img.height };
  }

  private pass(img: { ref: PDFRef; width: number; height: number }): EmbeddedImage {
    this.stats.passthrough++;
    return { ref: img.ref, width: img.width, height: img.height };
  }
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number): Promise<Blob | null> => new Promise((r) => c.toBlob(r, type, q));

/** The browser Recode: <img>/ImageBitmap → HTMLCanvasElement (no OffscreenCanvas: WebKit on Windows). */
export const canvasRecode: Recode = async ({ bytes, mime, target, lut, jpegSource }) => {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
  const svg = mime === 'image/svg+xml';
  let src: CanvasImageSource & { width: number; height: number };
  let close = (): void => undefined;
  if (svg) {
    const url = URL.createObjectURL(blob);
    const im = new Image();
    im.src = url;
    try {
      await im.decode();
    } finally {
      URL.revokeObjectURL(url);
    }
    src = im;
  } else {
    const bm = await createImageBitmap(blob);
    src = bm;
    close = () => bm.close();
  }
  const c = document.createElement('canvas');
  try {
    const nw = src.width || target.w;
    const nh = src.height || target.h;
    const oversize = svg || needsDownscale({ w: nw, h: nh }, target);
    const s = svg ? Math.max(target.w / nw, target.h / nh) : oversize ? Math.min(1, Math.max(target.w / nw, target.h / nh)) : 1;
    c.width = Math.max(1, Math.round(nw * s));
    c.height = Math.max(1, Math.round(nh * s));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    if (lut) {
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = lut[k]![d[i + k]!]!;
      ctx.putImageData(data, 0, 0);
    }
    let alpha = false;
    for (let i = 3; i < data.data.length; i += 4)
      if (data.data[i]! < 255) {
        alpha = true;
        break;
      }
    const jpeg = !alpha && (jpegSource || isOpaquePhoto(data.data, c.width));
    const out = await toBlob(c, jpeg ? 'image/jpeg' : 'image/png', jpeg ? JPEG_QUALITY : undefined);
    if (!out) return null;
    return { bytes: new Uint8Array(await out.arrayBuffer()), jpeg };
  } finally {
    close();
    c.width = 0;
    c.height = 0;
  }
};
