// The per-page fallback (SPIKE-HWP-DIRECT §6.2 "raster-page.ts"): a page the vector writer cannot express is
// drawn as a 200-dpi image, with an invisible (Tr 3) text layer from the same glyphs, so the page can still be
// searched and copied. The SVG gets its font slices inlined as data: @font-face (an SVG image cannot load
// anything), goes through <img> → canvas → PNG (line art) or JPEG q 0.85 (photo), and becomes a full-page image.
// Browser only (canvas, Image); export.ts takes it as an injectable function.
import type { PDFDocument } from '@cantoo/pdf-lib';
import { JPEG_QUALITY, isOpaquePhoto } from '../downscale';
import type { FaceTable, LoadedFace } from './faces';
import type { PageStats, SvgPdfWriter } from './svg-to-pdf';

export const RASTER_DPI = 200;
/** Fonts inside an SVG image load after img.decode() resolves: without a pause, glyphs were missing (spike). */
export const FONT_SETTLE_MS = 150;

const b64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const toBlob = (c: HTMLCanvasElement, type: string, q?: number): Promise<Blob | null> => new Promise((r) => c.toBlob(r, type, q));

/** The @font-face rules for every face the page's text resolves to. */
async function fontCss(svg: Element, fonts: FaceTable): Promise<string> {
  const faces = new Set<LoadedFace>();
  for (const t of Array.from(svg.querySelectorAll('text'))) {
    const fam = t.closest('[font-family]')?.getAttribute('font-family') ?? 'serif';
    const fw = t.closest('[font-weight]')?.getAttribute('font-weight') ?? '400';
    const weight = fw === 'bold' ? 700 : parseInt(fw, 10) || 400;
    for (const ch of t.textContent ?? '') {
      const cp = ch.codePointAt(0)!;
      if (cp <= 32) continue;
      const r = await fonts.resolve(fam, weight, cp);
      if (r) faces.add(r.face);
    }
  }
  let css = '';
  for (const f of faces) css += `@font-face{font-family:'${f.def.family}';font-weight:${f.def.weight};font-display:block;src:url(data:font/woff;base64,${b64(f.woff)}) format('woff');${f.def.range ? `unicode-range:${f.def.range};` : ''}}\n`;
  return css;
}

export type RasterPage = (doc: PDFDocument, svg: SVGSVGElement, w: number, h: number) => Promise<PageStats>;

/** A RasterPage bound to this document's fonts and text writer. */
export function rasterPageWith(fonts: FaceTable, text: SvgPdfWriter): RasterPage {
  return async (doc, svg, w, h) => {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const style = clone.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = await fontCss(svg, fonts);
    clone.insertBefore(style, clone.firstChild);
    // Intrinsic size = the canvas size: rasterised at 200 dpi, not at 96 dpi and scaled up (that drops hairlines).
    if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const s = RASTER_DPI / 96;
    const cw = Math.max(1, Math.round(w * s));
    const ch = Math.max(1, Math.round(h * s));
    clone.setAttribute('width', String(cw));
    clone.setAttribute('height', String(ch));
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
      await new Promise((r) => setTimeout(r, FONT_SETTLE_MS));
    } finally {
      URL.revokeObjectURL(url);
    }
    const c = document.createElement('canvas');
    let bytes: Uint8Array;
    let png: boolean;
    try {
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('no 2d context');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      png = !isOpaquePhoto(ctx.getImageData(0, 0, cw, ch).data, cw);
      const blob = await toBlob(c, png ? 'image/png' : 'image/jpeg', png ? undefined : JPEG_QUALITY);
      if (!blob) throw new Error('canvas encode failed');
      bytes = new Uint8Array(await blob.arrayBuffer());
    } finally {
      c.width = 0;
      c.height = 0;
    }
    const image = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const page = doc.addPage([w * 0.75, h * 0.75]);
    page.drawImage(image, { x: 0, y: 0, width: w * 0.75, height: h * 0.75 });
    return (await text.addPage(svg, w, h, { mode: 'text' }, page)).stats;
  };
}
