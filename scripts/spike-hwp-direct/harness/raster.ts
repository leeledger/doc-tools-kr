// SPIKE-HWP-DIRECT approach B: each page SVG → <img> (SVG with its font slices inlined as data: @font-face)
// → canvas at N dpi → JPEG q 0.85 or PNG (production line-art rule) → full-page image, plus an invisible
// (Tr 3) selectable/searchable text layer from the same <text> glyphs (rhwp glyph positions + our addSpaces
// word spaces) with embedded subset fonts (VectorWriter in 'text' mode).
import type { PDFDocument, PDFPage } from '@cantoo/pdf-lib';
import { isOpaquePhoto, JPEG_QUALITY } from '../../../src/lib/hwp/downscale';
import type { FontBook, LoadedFace } from './fontbook';
import type { VectorWriter, PageStats } from './vector';

export interface RasterOptions {
  dpi: number;
  enc: 'rule' | 'jpeg' | 'png' | 'smaller';
  textLayer: boolean;
  settleMs?: number;
}

const b64cache = new Map<string, string>();
function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}
const toBlob = (c: HTMLCanvasElement, type: string, q?: number): Promise<Blob | null> => new Promise((r) => c.toBlob(r, type, q));

export interface RasterStats {
  px: number;
  enc: string;
  bytes: number;
  fontFaces: number;
  svgBytes: number;
  ms: { fonts: number; decode: number; draw: number; encode: number };
}

export async function fontCss(svg: Element, fonts: FontBook): Promise<{ css: string; faces: number }> {
  const want = new Map<string, Set<string>>();
  for (const t of Array.from(svg.querySelectorAll('text'))) {
    const fam = t.getAttribute('font-family') ?? t.closest('[font-family]')?.getAttribute('font-family') ?? 'serif';
    const fw = t.getAttribute('font-weight') ?? '400';
    const w = fw === 'bold' ? 700 : parseInt(fw, 10) || 400;
    const k = `${w}|${fam}`;
    let set = want.get(k);
    if (!set) want.set(k, (set = new Set()));
    for (const ch of t.textContent ?? '') set.add(ch);
  }
  const faces = new Set<LoadedFace>();
  for (const [k, chars] of want) {
    const [w, fam] = [Number(k.slice(0, k.indexOf('|'))), k.slice(k.indexOf('|') + 1)];
    for (const f of await fonts.facesFor(fam, w, chars)) faces.add(f);
  }
  const seen = new Set<string>();
  let css = '';
  for (const f of faces) {
    if (seen.has(f.def.url)) continue;
    seen.add(f.def.url);
    let data = b64cache.get(f.def.url);
    if (!data) b64cache.set(f.def.url, (data = b64(f.bytes)));
    css += `@font-face{font-family:'${f.def.family}';font-weight:${f.def.weight};font-display:block;src:url(data:font/woff2;base64,${data}) format('woff2');${f.def.range ? `unicode-range:${f.def.range};` : ''}}\n`;
  }
  return { css, faces: seen.size };
}

export async function rasterPage(doc: PDFDocument, svg: SVGSVGElement, w: number, h: number, fonts: FontBook, text: VectorWriter | null, o: RasterOptions): Promise<{ page: PDFPage; stats: RasterStats; text?: PageStats }> {
  const t0 = performance.now();
  const { css, faces } = await fontCss(svg, fonts);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const style = clone.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = css;
  clone.insertBefore(style, clone.firstChild);
  // Intrinsic size = the canvas size, so the SVG is rasterised at N dpi (not at 96 dpi and scaled up, which
  // drops hairlines). The viewBox keeps the page coordinates.
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
  clone.setAttribute('width', String(Math.round((w * o.dpi) / 96)));
  clone.setAttribute('height', String(Math.round((h * o.dpi) / 96)));
  const markup = new XMLSerializer().serializeToString(clone);
  const t1 = performance.now();
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    // Fonts inside an SVG image load asynchronously after decode() (font-display:block text is invisible until
    // then): let them settle before drawing.
    if (o.settleMs) await new Promise((r) => setTimeout(r, o.settleMs));
  } finally {
    URL.revokeObjectURL(url);
  }
  const t2 = performance.now();
  const s = o.dpi / 96;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const t3 = performance.now();
  let enc: 'jpeg' | 'png' = o.enc === 'png' ? 'png' : 'jpeg';
  if (o.enc === 'rule') enc = isOpaquePhoto(ctx.getImageData(0, 0, c.width, c.height).data, c.width) ? 'jpeg' : 'png';
  let blob: Blob | null;
  if (o.enc === 'smaller') {
    const a = await toBlob(c, 'image/jpeg', JPEG_QUALITY);
    const b = await toBlob(c, 'image/png');
    blob = a && b && b.size < a.size ? b : a;
    enc = blob === b ? 'png' : 'jpeg';
  } else blob = await toBlob(c, enc === 'png' ? 'image/png' : 'image/jpeg', JPEG_QUALITY);
  const px = c.width * c.height;
  c.width = 0;
  c.height = 0;
  if (!blob) throw new Error('canvas encode failed');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const t4 = performance.now();
  const image = enc === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const page = doc.addPage([w * 0.75, h * 0.75]);
  page.drawImage(image, { x: 0, y: 0, width: w * 0.75, height: h * 0.75 });
  let tstats: PageStats | undefined;
  if (text && o.textLayer) tstats = (await text.addPage(svg, w, h, { mode: 'text' }, page)).stats;
  return { page, stats: { px, enc, bytes: bytes.length, fontFaces: faces, svgBytes: markup.length, ms: { fonts: t1 - t0, decode: t2 - t1, draw: t3 - t2, encode: t4 - t3 } }, text: tstats };
}
