// SPIKE-HWP-DIRECT approach A: svg2pdf.js 2.8.1 + jsPDF 4.2.1 (latest on npm, MIT), with the fixes for the
// first spike's failures: (1) fonts: every glyph is pointed at one registered jsPDF font = the exact
// unicode-range slice the browser would use (the .woff sibling of the shipped .woff2 slice, unwrapped to TTF;
// jsPDF subsets on output); (2) the SVG is the production post-processed page (scoped ids, cell clips dropped,
// fills fitted, spaces added); (3) images go through the production downscale rule first (downscaleImages,
// then blob: → data: so jsPDF never string-builds a huge base64 image).
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { unzlibSync } from 'fflate';
import { downscaleImages } from '../../../src/lib/hwp/downscale';
import type { FontBook, LoadedFace } from './fontbook';

function woffToTtf(w: Uint8Array): Uint8Array {
  const v = new DataView(w.buffer, w.byteOffset, w.byteLength);
  if (v.getUint32(0) !== 0x774f4646) throw new Error('not WOFF');
  const flavor = v.getUint32(4);
  const n = v.getUint16(12);
  const tables: { tag: number; data: Uint8Array; sum: number }[] = [];
  for (let i = 0; i < n; i++) {
    const o = 44 + i * 20;
    const tag = v.getUint32(o), off = v.getUint32(o + 4), comp = v.getUint32(o + 8), orig = v.getUint32(o + 12), sum = v.getUint32(o + 16);
    const raw = w.subarray(off, off + comp);
    tables.push({ tag, data: comp < orig ? unzlibSync(raw) : raw, sum });
  }
  let size = 12 + 16 * n;
  for (const t of tables) size += (t.data.length + 3) & ~3;
  const out = new Uint8Array(size);
  const o = new DataView(out.buffer);
  let es = 0;
  while (1 << (es + 1) <= n) es++;
  o.setUint32(0, flavor);
  o.setUint16(4, n);
  o.setUint16(6, (1 << es) * 16);
  o.setUint16(8, es);
  o.setUint16(10, n * 16 - (1 << es) * 16);
  let off = 12 + 16 * n;
  tables.forEach((t, i) => {
    o.setUint32(12 + i * 16, t.tag);
    o.setUint32(16 + i * 16, t.sum);
    o.setUint32(20 + i * 16, off);
    o.setUint32(24 + i * 16, t.data.length);
    out.set(t.data, off);
    off += (t.data.length + 3) & ~3;
  });
  return out;
}

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}

const woffUrl = (u: string): string => u.replace('/woff2-dynamic-subset/', '/woff-dynamic-subset/').replace(/\.woff2$/, '.woff');

export class JsPdfWriter {
  doc: jsPDF | null = null;
  private registered = new Map<string, string | null>();
  missing = 0;
  constructor(private fonts: FontBook, private hwpFontSrc: (url: string) => string) {}

  private async register(face: LoadedFace): Promise<string | null> {
    const k = face.def.url;
    if (this.registered.has(k)) return this.registered.get(k)!;
    let name: string | null = null;
    try {
      const r = await fetch(this.hwpFontSrc(woffUrl(k)));
      if (r.ok) {
        const ttf = woffToTtf(new Uint8Array(await r.arrayBuffer()));
        name = `S${this.registered.size}`;
        this.doc!.addFileToVFS(`${name}.ttf`, b64(ttf));
        for (const style of ['normal', 'bold', 'italic', 'bolditalic']) this.doc!.addFont(`${name}.ttf`, name, style, 'Identity-H');
      }
    } catch {
      name = null;
    }
    this.registered.set(k, name);
    return name;
  }

  async addPage(svg: SVGSVGElement, w: number, h: number, host: HTMLElement): Promise<void> {
    const fmt: [number, number] = [w * 0.75, h * 0.75];
    if (!this.doc) this.doc = new jsPDF({ unit: 'pt', format: fmt, orientation: fmt[0] > fmt[1] ? 'l' : 'p', compress: true });
    else this.doc.addPage(fmt, fmt[0] > fmt[1] ? 'l' : 'p');
    for (const t of Array.from(svg.querySelectorAll('text'))) {
      const chain = t.getAttribute('font-family') ?? 'serif';
      const fw = t.getAttribute('font-weight') ?? '400';
      const wgt = fw === 'bold' ? 700 : parseInt(fw, 10) || 400;
      const ch = [...(t.textContent ?? '')].find((c) => c.trim()) ?? ' ';
      const face = await this.fonts.resolve(chain, wgt, ch === ' ' ? 0x20 : ch.codePointAt(0)!);
      const name = face ? await this.register(face) : null;
      if (name) t.setAttribute('font-family', name);
      else if (ch.trim()) this.missing++;
      // Fix: svg2pdf turns textLength on a one-glyph <text> into (textLength − width)/(n − 1) = −Infinity Tc
      // (the first spike's invalid PDFs). Express it as a horizontal scale instead.
      const tl = parseFloat(t.getAttribute('textLength') ?? '');
      const txt = t.textContent ?? '';
      if (Number.isFinite(tl) && face && [...txt].length === 1) {
        const fs = parseFloat(t.getAttribute('font-size') ?? '16');
        const adv = (face.fk.layout(txt).advanceWidth / face.fk.unitsPerEm) * fs;
        t.removeAttribute('textLength');
        t.removeAttribute('lengthAdjust');
        if (adv > 0) {
          const x = parseFloat(t.getAttribute('x') ?? '0');
          const y = parseFloat(t.getAttribute('y') ?? '0');
          t.setAttribute('transform', `${t.getAttribute('transform') ?? ''} translate(${x},${y}) scale(${tl / adv},1) translate(${-x},${-y})`.trim());
        }
      } else if (Number.isFinite(tl) && [...txt].length <= 1) {
        t.removeAttribute('textLength');
        t.removeAttribute('lengthAdjust');
      }
    }
    // Production downscale needs layout: attach, downscale, then inline blob: URLs as data: for jsPDF.
    host.replaceChildren(svg);
    const ds = await downscaleImages(svg);
    for (const im of Array.from(svg.querySelectorAll('image'))) {
      const href = im.getAttribute('href') ?? '';
      if (href.startsWith('blob:')) {
        const b = new Uint8Array(await (await fetch(href)).arrayBuffer());
        const type = b[0] === 0xff ? 'image/jpeg' : 'image/png';
        im.setAttribute('href', `data:${type};base64,${b64(b)}`);
      }
    }
    for (const u of ds.urls) URL.revokeObjectURL(u);
    await svg2pdf(svg, this.doc, { x: 0, y: 0, width: fmt[0], height: fmt[1] });
    host.replaceChildren();
  }

  output(): Uint8Array {
    return new Uint8Array(this.doc!.output('arraybuffer'));
  }
}
