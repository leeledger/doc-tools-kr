// SPIKE-HWP-DIRECT approach C: rhwp page SVG (after the production post-processing) → PDF operators, written
// directly with pdf-lib (no svg2pdf, no jsPDF). rhwp 0.8.6 emits a small, regular vocabulary (inventory over 120
// files: svg, g[transform|clip-path|filter], defs, clipPath>rect, rect, line, circle, ellipse, path (M L C Q Z),
// text (one glyph each; textLength, transform, text-anchor, dominant-baseline, font-style, fill-opacity),
// image (jpeg/png/svg data URLs), nested svg with viewBox, linearGradient, marker, feComponentTransfer).
// Everything is emitted in the page's SVG user space after one base `cm` (px → pt, y flipped). Text: one
// Tm + Tj per glyph with an embedded subset slice font (fontkit), so copy and search work. Anything the writer
// does not understand is counted in `stats.unsupported` (the hybrid falls back to raster for that page).
import { PDFDocument, PDFName, type PDFFont, type PDFPage, type PDFRef } from '@cantoo/pdf-lib';
import { FontBook, type LoadedFace } from './fontbook';
import { ImageCache } from './images';
import { parsePageSvg, sanitize } from '../../../src/lib/hwp/svg-dom';

type M = [number, number, number, number, number, number];
const I: M = [1, 0, 0, 1, 0, 0];
export const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const ap = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const isId = (m: M): boolean => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;

export function parseTransform(s: string | null): M {
  let m: M = I;
  if (!s) return m;
  for (const t of s.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const a = t[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let n: M = I;
    switch (t[1]) {
      case 'matrix':
        n = [a[0], a[1], a[2], a[3], a[4], a[5]];
        break;
      case 'translate':
        n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case 'scale':
        n = [a[0], 0, 0, a[1] ?? a[0], 0, 0];
        break;
      case 'rotate': {
        const r = ((a[0] ?? 0) * Math.PI) / 180;
        const c = Math.cos(r);
        const sn = Math.sin(r);
        n = [c, sn, -sn, c, 0, 0];
        if (a.length >= 3) n = mul(mul([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]]);
        break;
      }
      case 'skewX':
        n = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        n = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    m = mul(m, n);
  }
  return m;
}

const NAMED: Record<string, [number, number, number]> = { black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], blue: [0, 0, 255], green: [0, 128, 0], gray: [128, 128, 128], grey: [128, 128, 128], yellow: [255, 255, 0] };
export function parseColor(v: string | null | undefined): [number, number, number] | null {
  if (!v) return null;
  v = v.trim();
  if (v === 'none' || v === 'transparent') return null;
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)];
  m = /^rgba?\(([^)]*)\)$/i.exec(v);
  if (m) {
    const p = m[1].split(/[\s,]+/).map((x) => (x.endsWith('%') ? (parseFloat(x) * 255) / 100 : parseFloat(x)));
    return [p[0], p[1], p[2]];
  }
  return NAMED[v.toLowerCase()] ?? null;
}

let nonFinite = 0;
const f = (n: number): string => {
  if (!Number.isFinite(n)) {
    nonFinite++;
    return '0';
  }
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};
const col = (c: [number, number, number]): string => `${f(c[0] / 255)} ${f(c[1] / 255)} ${f(c[2] / 255)}`;

export interface PageStats {
  glyphs: number;
  invisibleGlyphs: number;
  missingGlyphs: number;
  shapes: number;
  images: number;
  unsupported: string[];
  nonFinite: number;
}

interface Style {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  fillOpacity: number;
  strokeOpacity: number;
  opacity: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  textAnchor: string;
  dominantBaseline: string;
  linecap: string | null;
  linejoin: string | null;
  dash: string | null;
  fillRule?: string;
}

const INHERIT: (keyof Style)[] = ['fill', 'stroke', 'strokeWidth', 'fillOpacity', 'strokeOpacity', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'textAnchor', 'dominantBaseline', 'linecap', 'linejoin', 'dash'];
const ATTR: Record<string, keyof Style> = {
  fill: 'fill',
  stroke: 'stroke',
  'stroke-width': 'strokeWidth',
  'fill-opacity': 'fillOpacity',
  'stroke-opacity': 'strokeOpacity',
  opacity: 'opacity',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-weight': 'fontWeight',
  'font-style': 'fontStyle',
  'text-anchor': 'textAnchor',
  'dominant-baseline': 'dominantBaseline',
  'stroke-linecap': 'linecap',
  'stroke-linejoin': 'linejoin',
  'stroke-dasharray': 'dash',
  'fill-rule': 'fillRule',
};
const NUM = new Set<keyof Style>(['strokeWidth', 'fillOpacity', 'strokeOpacity', 'opacity', 'fontSize']);

function styleOf(el: Element, parent: Style): Style {
  const s: Style = { ...parent, opacity: 1 };
  for (const [a, k] of Object.entries(ATTR)) {
    const v = el.getAttribute(a);
    if (v == null || v === 'inherit') continue;
    (s as any)[k] = NUM.has(k) ? parseFloat(v) : v;
  }
  const st = el.getAttribute('style');
  if (st)
    for (const decl of st.split(';')) {
      const [a, v] = decl.split(':').map((x) => x?.trim());
      const k = a && ATTR[a];
      if (k && v) (s as any)[k] = NUM.has(k) ? parseFloat(v) : v;
    }
  return s;
}
const ROOT_STYLE: Style = { fill: '#000000', stroke: null, strokeWidth: 1, fillOpacity: 1, strokeOpacity: 1, opacity: 1, fontFamily: 'serif', fontSize: 16, fontWeight: '400', fontStyle: 'normal', textAnchor: 'start', dominantBaseline: 'auto', linecap: null, linejoin: null, dash: null };

const num = (el: Element, a: string, d = 0): number => {
  const v = el.getAttribute(a);
  if (v == null) return d;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

// ---------- path geometry → PDF path operators (in the given matrix) ----------
const K = 0.5522847498;
function ellipsePath(m: M, cx: number, cy: number, rx: number, ry: number): string {
  const pts: [number, number][] = [
    [cx + rx, cy],
    [cx + rx, cy + K * ry], [cx + K * rx, cy + ry], [cx, cy + ry],
    [cx - K * rx, cy + ry], [cx - rx, cy + K * ry], [cx - rx, cy],
    [cx - rx, cy - K * ry], [cx - K * rx, cy - ry], [cx, cy - ry],
    [cx + K * rx, cy - ry], [cx + rx, cy - K * ry], [cx + rx, cy],
  ].map(([x, y]) => ap(m, x, y));
  let s = `${f(pts[0][0])} ${f(pts[0][1])} m\n`;
  for (let i = 1; i < pts.length; i += 3) s += `${f(pts[i][0])} ${f(pts[i][1])} ${f(pts[i + 1][0])} ${f(pts[i + 1][1])} ${f(pts[i + 2][0])} ${f(pts[i + 2][1])} c\n`;
  return `${s}h\n`;
}
function rectPath(m: M, x: number, y: number, w: number, h: number, rx = 0, ry = 0): string {
  if (rx > 0 || ry > 0) {
    rx = Math.min(rx || ry, w / 2);
    ry = Math.min(ry || rx, h / 2);
    return pathData(m, `M${x + rx},${y} H${x + w - rx} A${rx},${ry} 0 0 1 ${x + w},${y + ry} V${y + h - ry} A${rx},${ry} 0 0 1 ${x + w - rx},${y + h} H${x + rx} A${rx},${ry} 0 0 1 ${x},${y + h - ry} V${y + ry} A${rx},${ry} 0 0 1 ${x + rx},${y} Z`);
  }
  if (isId(m)) return `${f(x)} ${f(y)} ${f(w)} ${f(h)} re\n`;
  const p = [ap(m, x, y), ap(m, x + w, y), ap(m, x + w, y + h), ap(m, x, y + h)];
  return `${f(p[0][0])} ${f(p[0][1])} m ${f(p[1][0])} ${f(p[1][1])} l ${f(p[2][0])} ${f(p[2][1])} l ${f(p[3][0])} ${f(p[3][1])} l h\n`;
}
function arcToBeziers(x1: number, y1: number, rx: number, ry: number, phi: number, fa: number, fs: number, x2: number, y2: number): number[][] {
  if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
  const sin = Math.sin((phi * Math.PI) / 180);
  const cos = Math.cos((phi * Math.PI) / 180);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const l = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (l > 1) {
    rx *= Math.sqrt(l);
    ry *= Math.sqrt(l);
  }
  const sign = fa === fs ? -1 : 1;
  const sq = Math.max(0, (rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p) / (rx * rx * y1p * y1p + ry * ry * x1p * x1p));
  const coef = sign * Math.sqrt(sq);
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number): number => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI;
  if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2));
  const out: number[][] = [];
  const d = dt / n;
  const k = (4 / 3) * Math.tan(d / 4);
  let t = t1;
  for (let i = 0; i < n; i++) {
    const c1 = Math.cos(t), s1 = Math.sin(t), c2 = Math.cos(t + d), s2 = Math.sin(t + d);
    const pts = [[c1 - k * s1, s1 + k * c1], [c2 + k * s2, s2 - k * c2], [c2, s2]].map(([px, py]) => [cx + rx * px * cos - ry * py * sin, cy + rx * px * sin + ry * py * cos]);
    out.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1], pts[2][0], pts[2][1]]);
    t += d;
  }
  return out;
}
export function pathData(m: M, d: string): string {
  const toks = d.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  let x = 0, y = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lqx = 0, lqy = 0;
  let prev = '';
  let out = '';
  const P = (px: number, py: number): string => {
    const [a, b] = ap(m, px, py);
    return `${f(a)} ${f(b)}`;
  };
  const n = (): number => Number(toks[i++]);
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'M') {
      x = ox + n(); y = oy + n(); sx = x; sy = y;
      out += `${P(x, y)} m\n`;
      cmd = rel ? 'l' : 'L';
    } else if (C === 'L') { x = ox + n(); y = oy + n(); out += `${P(x, y)} l\n`; }
    else if (C === 'H') { x = (rel ? x : 0) + n(); out += `${P(x, y)} l\n`; }
    else if (C === 'V') { y = (rel ? y : 0) + n(); out += `${P(x, y)} l\n`; }
    else if (C === 'C') {
      const x1 = ox + n(), y1 = oy + n(), x2 = ox + n(), y2 = oy + n(); x = ox + n(); y = oy + n();
      out += `${P(x1, y1)} ${P(x2, y2)} ${P(x, y)} c\n`; lcx = x2; lcy = y2;
    } else if (C === 'S') {
      const x1 = /[CS]/.test(prev) ? 2 * x - lcx : x, y1 = /[CS]/.test(prev) ? 2 * y - lcy : y;
      const x2 = ox + n(), y2 = oy + n(); x = ox + n(); y = oy + n();
      out += `${P(x1, y1)} ${P(x2, y2)} ${P(x, y)} c\n`; lcx = x2; lcy = y2;
    } else if (C === 'Q' || C === 'T') {
      let qx: number, qy: number;
      if (C === 'Q') { qx = ox + n(); qy = oy + n(); } else { qx = /[QT]/.test(prev) ? 2 * x - lqx : x; qy = /[QT]/.test(prev) ? 2 * y - lqy : y; }
      const ex = ox + n(), ey = oy + n();
      out += `${P(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y))} ${P(ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey))} ${P(ex, ey)} c\n`;
      lqx = qx; lqy = qy; x = ex; y = ey;
    } else if (C === 'A') {
      const rx = n(), ry = n(), phi = n(), fa = n(), fs = n(); const ex = ox + n(), ey = oy + n();
      for (const b of arcToBeziers(x, y, rx, ry, phi, fa, fs, ex, ey)) out += `${P(b[0], b[1])} ${P(b[2], b[3])} ${P(b[4], b[5])} c\n`;
      x = ex; y = ey;
    } else if (C === 'Z') { out += 'h\n'; x = sx; y = sy; }
    else { i++; }
    prev = C;
    if (i > toks.length + 2) break;
  }
  return out;
}

// ---------- the writer ----------
export interface WriterOptions {
  /** 'full' draws everything; 'text' draws only the text, invisible (Tr 3), for the raster text layer. */
  mode: 'full' | 'text';
  italicSkew?: number;
}

export class VectorWriter {
  doc: PDFDocument;
  fonts: FontBook;
  images: ImageCache;
  private pdfFonts = new Map<string, PDFFont>();
  private glyphCache = new Map<string, { hex: string; adv: number }>();
  private gsCache = new Map<string, PDFRef>();
  constructor(doc: PDFDocument, fonts: FontBook, images: ImageCache) {
    this.doc = doc;
    this.fonts = fonts;
    this.images = images;
  }

  private async pdfFont(face: LoadedFace): Promise<PDFFont> {
    let pf = this.pdfFonts.get(face.def.url);
    if (!pf) {
      pf = await this.doc.embedFont(await this.fonts.ttfOf(face), { subset: true });
      this.pdfFonts.set(face.def.url, pf);
    }
    return pf;
  }

  private gs(page: PDFPage, fillA: number, strokeA: number): string {
    const key = `${f(fillA)}|${f(strokeA)}`;
    let ref = this.gsCache.get(key);
    if (!ref) {
      ref = this.doc.context.register(this.doc.context.obj({ Type: 'ExtGState', ca: fillA, CA: strokeA }));
      this.gsCache.set(key, ref);
    }
    return page.node.newExtGState('GS', ref).toString();
  }

  /** Adds one page for this SVG (w, h in CSS px). With `page`, draws onto an existing page instead. */
  async addPage(svg: SVGSVGElement, w: number, h: number, opts: WriterOptions, existing?: PDFPage): Promise<{ page: PDFPage; stats: PageStats }> {
    nonFinite = 0;
    const page = existing ?? this.doc.addPage([w * 0.75, h * 0.75]);
    const stats: PageStats = { glyphs: 0, invisibleGlyphs: 0, missingGlyphs: 0, shapes: 0, images: 0, unsupported: [], nonFinite: 0 };
    const ids = new Map<string, Element>();
    for (const e of Array.from(svg.querySelectorAll('[id]'))) ids.set(e.getAttribute('id')!, e);
    const out: string[] = [`0.75 0 0 -0.75 0 ${f(h * 0.75)} cm\n`];
    const fontKeys = new Map<string, string>();
    let curFill = '';
    const ctx = { page, stats, ids, out, fontKeys, opts };
    let root: M = I;
    const vb = svg.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
    const sw = num(svg, 'width', w);
    const sh = num(svg, 'height', h);
    if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) root = mul([sw / vb[2], 0, 0, sh / vb[3], 0, 0], [1, 0, 0, 1, -vb[0], -vb[1]]);
    await this.walkChildren(svg, root, ROOT_STYLE, ctx);
    void curFill;
    stats.nonFinite = nonFinite;
    const content = out.join('');
    const stream = this.doc.context.flateStream(content);
    page.node.addContentStream(this.doc.context.register(stream));
    return { page, stats };
  }

  private async walkChildren(el: Element, m: M, st: Style, ctx: any): Promise<void> {
    for (const c of Array.from(el.children)) await this.node(c, m, st, ctx);
  }

  private clip(ctx: any, m: M, ref: string | null): boolean {
    const id = ref && /url\(#([^)]+)\)/.exec(ref)?.[1];
    if (!id) return false;
    const cp = ctx.ids.get(id) as Element | undefined;
    if (!cp) return false;
    let geo = '';
    for (const c of Array.from(cp.children)) {
      const cm = mul(m, parseTransform(c.getAttribute('transform')));
      if (c.localName === 'rect') geo += rectPath(cm, num(c, 'x'), num(c, 'y'), num(c, 'width'), num(c, 'height'));
      else if (c.localName === 'path') geo += pathData(cm, c.getAttribute('d') ?? '');
      else if (c.localName === 'ellipse' || c.localName === 'circle') geo += ellipsePath(cm, num(c, 'cx'), num(c, 'cy'), num(c, c.localName === 'circle' ? 'r' : 'rx'), num(c, c.localName === 'circle' ? 'r' : 'ry'));
      else ctx.stats.unsupported.push(`clip:${c.localName}`);
    }
    ctx.out.push(`q\n${geo || '0 0 0 0 re\n'}W n\n`);
    return true;
  }

  private paint(ctx: any, st: Style, geo: string, m: M, allowFill = true): void {
    if (ctx.opts.mode === 'text' || !geo) return;
    const fillC = allowFill ? this.fillColor(st, ctx) : null;
    const strokeC = parseColor(st.stroke);
    const sw = st.strokeWidth;
    const doStroke = strokeC && sw > 0;
    if (!fillC && !doStroke) return;
    const fa = (st.fillOpacity ?? 1) * st.opacity;
    const sa = (st.strokeOpacity ?? 1) * st.opacity;
    if ((fillC && fa <= 0) && (!doStroke || sa <= 0)) return;
    let s = 'q\n';
    if (fa < 1 || sa < 1) s += `${this.gs(ctx.page, Math.max(0, fa), Math.max(0, sa))} gs\n`;
    if (fillC) s += `${col(fillC)} rg\n`;
    if (doStroke) {
      const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
      s += `${col(strokeC!)} RG ${f(sw * scale)} w\n`;
      if (st.linecap === 'round') s += '1 J\n';
      else if (st.linecap === 'square') s += '2 J\n';
      if (st.linejoin === 'round') s += '1 j\n';
      else if (st.linejoin === 'bevel') s += '2 j\n';
      if (st.dash && st.dash !== 'none') {
        const arr = st.dash.split(/[\s,]+/).map(Number).filter((x) => Number.isFinite(x) && x >= 0);
        if (arr.length && arr.some((x) => x > 0)) s += `[${arr.map((x) => f(x * scale)).join(' ')}] 0 d\n`;
      }
    }
    s += geo;
    const eo = st.fillRule === 'evenodd' ? '*' : '';
    s += fillC && doStroke ? `B${eo}\n` : fillC ? `f${eo}\n` : 'S\n';
    s += 'Q\n';
    ctx.out.push(s);
    ctx.stats.shapes++;
  }

  private gradient: { el: Element; bbox: [number, number, number, number]; m: M } | null = null;
  private fillColor(st: Style, ctx: any): [number, number, number] | null {
    const id = st.fill && /url\(#([^)]+)\)/.exec(st.fill)?.[1];
    if (id) {
      const g = ctx.ids.get(id) as Element | undefined;
      const stop = g?.querySelector('stop');
      return parseColor(stop?.getAttribute('stop-color') ?? null);
    }
    return parseColor(st.fill);
  }

  /** linearGradient fill on a rect: 64 bands along the gradient vector (objectBoundingBox %). */
  private gradientRect(ctx: any, st: Style, m: M, x: number, y: number, w: number, h: number): boolean {
    const id = st.fill && /url\(#([^)]+)\)/.exec(st.fill)?.[1];
    const g = id ? (ctx.ids.get(id) as Element | undefined) : undefined;
    if (!g || g.localName !== 'linearGradient' || ctx.opts.mode === 'text') return false;
    const pc = (a: string, d: number): number => {
      const v = g.getAttribute(a);
      return v == null ? d : v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v);
    };
    const x1 = pc('x1', 0), y1 = pc('y1', 0), x2 = pc('x2', 1), y2 = pc('y2', 0);
    const stops = Array.from(g.querySelectorAll('stop')).map((s) => ({ o: parseFloat(s.getAttribute('offset') ?? '0') / ((s.getAttribute('offset') ?? '').endsWith('%') ? 100 : 1), c: parseColor(s.getAttribute('stop-color')) ?? [0, 0, 0] }));
    if (!stops.length) return false;
    const at = (t: number): [number, number, number] => {
      if (t <= stops[0].o) return stops[0].c;
      for (let i = 1; i < stops.length; i++) if (t <= stops[i].o) {
        const a = stops[i - 1], b = stops[i];
        const u = (t - a.o) / Math.max(1e-9, b.o - a.o);
        return [a.c[0] + (b.c[0] - a.c[0]) * u, a.c[1] + (b.c[1] - a.c[1]) * u, a.c[2] + (b.c[2] - a.c[2]) * u];
      }
      return stops[stops.length - 1].c;
    };
    const N = 64;
    const vertical = Math.abs(y2 - y1) >= Math.abs(x2 - x1);
    let s = 'q\n' + rectPath(m, x, y, w, h) + 'W n\n';
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const c = at(vertical ? (y2 >= y1 ? t : 1 - t) : x2 >= x1 ? t : 1 - t);
      s += `${col(c)} rg\n` + (vertical ? rectPath(m, x, y + (h * i) / N, w, h / N + 0.5) : rectPath(m, x + (w * i) / N, y, w / N + 0.5, h)) + 'f\n';
    }
    ctx.out.push(`${s}Q\n`);
    ctx.stats.shapes++;
    return true;
  }

  private async node(el: Element, m: M, parent: Style, ctx: any): Promise<void> {
    const name = el.localName;
    if (name === 'defs' || name === 'clipPath' || name === 'linearGradient' || name === 'radialGradient' || name === 'marker' || name === 'filter' || name === 'title' || name === 'desc' || name === 'metadata') return;
    if (el.getAttribute('display') === 'none' || el.getAttribute('visibility') === 'hidden') return;
    const st = styleOf(el, parent);
    const own = parseTransform(el.getAttribute('transform'));
    const cm = isId(own) ? m : mul(m, own);
    const clipped = this.clip(ctx, cm, el.getAttribute('clip-path'));
    try {
      switch (name) {
        case 'g':
        case 'a':
        case 'switch': {
          const filt = el.getAttribute('filter');
          const fid = filt && /url\(#([^)]+)\)/.exec(filt)?.[1];
          const fel = fid ? (ctx.ids.get(fid) as Element | undefined) : undefined;
          if (fid && (!fel || !isBrightnessContrast(fel))) ctx.stats.unsupported.push(`filter:${fid}`);
          const saved = this.filter;
          if (fel && isBrightnessContrast(fel)) this.filter = fel;
          await this.walkChildren(el, cm, st, ctx);
          this.filter = saved;
          break;
        }
        case 'svg': {
          const x = num(el, 'x'), y = num(el, 'y');
          const w = num(el, 'width'), h = num(el, 'height');
          let inner: M = mul(cm, [1, 0, 0, 1, x, y]);
          const vb = el.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
          ctx.out.push(`q\n${rectPath(cm, x, y, w, h)}W n\n`);
          if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) inner = mul(inner, viewBoxMatrix(vb, w, h, el.getAttribute('preserveAspectRatio')));
          await this.walkChildren(el, inner, st, ctx);
          ctx.out.push('Q\n');
          break;
        }
        case 'rect': {
          const x = num(el, 'x'), y = num(el, 'y'), w = num(el, 'width'), h = num(el, 'height');
          if (w <= 0 || h <= 0) break;
          if (this.gradientRect(ctx, st, cm, x, y, w, h)) {
            if (st.stroke && st.stroke !== 'none') this.paint(ctx, st, rectPath(cm, x, y, w, h), cm, false);
            break;
          }
          this.paint(ctx, st, rectPath(cm, x, y, w, h, num(el, 'rx'), num(el, 'ry')), cm);
          break;
        }
        case 'line': {
          const x1 = num(el, 'x1'), y1 = num(el, 'y1'), x2 = num(el, 'x2'), y2 = num(el, 'y2');
          const [a, b] = ap(cm, x1, y1);
          const [c, d] = ap(cm, x2, y2);
          this.paint(ctx, { ...st, fill: null }, `${f(a)} ${f(b)} m ${f(c)} ${f(d)} l\n`, cm);
          await this.markers(el, cm, st, ctx, [x1, y1, x2, y2]);
          break;
        }
        case 'polyline':
        case 'polygon': {
          const p = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
          let d = '';
          for (let i = 0; i + 1 < p.length; i += 2) d += `${i ? 'L' : 'M'}${p[i]},${p[i + 1]} `;
          if (name === 'polygon') d += 'Z';
          this.paint(ctx, name === 'polyline' ? { ...st } : st, pathData(cm, d), cm);
          break;
        }
        case 'circle':
          this.paint(ctx, st, ellipsePath(cm, num(el, 'cx'), num(el, 'cy'), num(el, 'r'), num(el, 'r')), cm);
          break;
        case 'ellipse':
          this.paint(ctx, st, ellipsePath(cm, num(el, 'cx'), num(el, 'cy'), num(el, 'rx'), num(el, 'ry')), cm);
          break;
        case 'path':
          this.paint(ctx, st, pathData(cm, el.getAttribute('d') ?? ''), cm);
          break;
        case 'text':
          await this.text(el, cm, st, ctx);
          break;
        case 'image':
          if (ctx.opts.mode !== 'text') await this.image(el, cm, st, ctx);
          break;
        case 'use':
        case 'pattern':
        case 'foreignObject':
        default:
          ctx.stats.unsupported.push(name);
      }
    } finally {
      if (clipped) ctx.out.push('Q\n');
    }
  }

  private filter: Element | null = null;

  private async markers(el: Element, m: M, st: Style, ctx: any, [x1, y1, x2, y2]: number[]): Promise<void> {
    if (ctx.opts.mode === 'text') return;
    for (const [attr, px, py, ang] of [
      ['marker-start', x1, y1, Math.atan2(y2 - y1, x2 - x1)],
      ['marker-end', x2, y2, Math.atan2(y2 - y1, x2 - x1)],
    ] as [string, number, number, number][]) {
      const id = /url\(#([^)]+)\)/.exec(el.getAttribute(attr) ?? '')?.[1];
      if (!id) continue;
      const mk = ctx.ids.get(id) as Element | undefined;
      if (!mk) continue;
      const vb = mk.getAttribute('viewBox')?.split(/[\s,]+/).map(Number) ?? [0, 0, num(mk, 'markerWidth', 3), num(mk, 'markerHeight', 3)];
      const mw = num(mk, 'markerWidth', 3), mh = num(mk, 'markerHeight', 3);
      const units = mk.getAttribute('markerUnits') ?? 'strokeWidth';
      const s = units === 'strokeWidth' ? st.strokeWidth : 1;
      const orient = mk.getAttribute('orient');
      const rot = orient === 'auto' || orient === 'auto-start-reverse' ? ang : ((parseFloat(orient ?? '0') || 0) * Math.PI) / 180;
      let mm = mul(m, [1, 0, 0, 1, px, py]);
      mm = mul(mm, [Math.cos(rot), Math.sin(rot), -Math.sin(rot), Math.cos(rot), 0, 0]);
      mm = mul(mm, [s, 0, 0, s, 0, 0]);
      mm = mul(mm, [mw / vb[2], 0, 0, mh / vb[3], 0, 0]);
      mm = mul(mm, [1, 0, 0, 1, -num(mk, 'refX'), -num(mk, 'refY')]);
      await this.walkChildren(mk, mm, { ...ROOT_STYLE, ...st, stroke: null }, ctx);
    }
  }

  private async text(el: Element, m: M, st: Style, ctx: any): Promise<void> {
    // Flatten the text content: character data of <text> and nested <tspan>s (each with its own style and
    // x / y / dx / dy, a list applying per character), as the SVG text layout does for these simple cases.
    interface Item { ch: string; st: Style; x?: number; y?: number; dx: number; dy: number }
    const items: Item[] = [];
    const list = (e: Element, a: string): number[] | null => {
      const v = e.getAttribute(a);
      if (v == null || !v.trim()) return null;
      const out = v.trim().split(/[\s,]+/).map(Number);
      return out.every(Number.isFinite) ? out : null;
    };
    let tspans = 0;
    const walk = (node: Element, s0: Style, own: boolean): void => {
      const xs = own ? null : list(node, 'x'), ys = own ? null : list(node, 'y'), dxs = list(node, 'dx'), dys = list(node, 'dy');
      let k = 0;
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3) {
          for (const ch of [...(child.nodeValue ?? '')]) {
            if (ch === '\n' || ch === '\r' || ch === '\t') continue;
            items.push({ ch, st: s0, x: xs?.[k], y: ys?.[k], dx: dxs?.[k] ?? 0, dy: dys?.[k] ?? 0 });
            k++;
          }
        } else if (child.nodeType === 1 && ((child as Element).localName === 'tspan' || (child as Element).localName === 'a')) {
          tspans++;
          walk(child as Element, styleOf(child as Element, s0), false);
        }
      }
    };
    walk(el, st, true);
    if (!items.length) return;
    // Resolve a face per char and measure the natural advance.
    const runs: { face: LoadedFace | null; hex: string; adv: number; it: Item }[] = [];
    let total = 0;
    for (const it of items) {
      const cp = it.ch.codePointAt(0)!;
      const w = it.st.fontWeight === 'bold' || it.st.fontWeight === 'bolder' ? 700 : parseInt(it.st.fontWeight, 10) || 400;
      // Space-like code points (NBSP, U+2000–200B, U+3000, figure space…) draw as a plain space.
      const space = cp === 32 || cp === 0xa0 || (cp >= 0x2000 && cp <= 0x200b) || cp === 0x3000 || cp === 0x202f;
      const face = await this.fonts.resolve(it.st.fontFamily, w, space ? 0x20 : cp);
      if (!face) {
        runs.push({ face: null, hex: '', adv: 0.5, it });
        total += 0.5 * (it.st.fontSize / st.fontSize);
        // Private-use code points (Hancom PUA symbols) have no glyph in any font, print path included: not missing.
        const pua = (cp >= 0xe000 && cp <= 0xf8ff) || cp >= 0xf0000;
        if (cp > 32 && !pua) ctx.stats.missingGlyphs++;
        continue;
      }
      const g = await this.glyph(face, space ? ' ' : it.ch);
      runs.push({ face, hex: space ? g.hex : g.hex, adv: g.adv, it });
      total += g.adv * (it.st.fontSize / st.fontSize);
    }
    const fs0 = st.fontSize;
    if (!(fs0 > 0)) return;
    const tl = parseFloat(el.getAttribute('textLength') ?? '');
    const hs = !tspans && Number.isFinite(tl) && tl > 0 && total > 0 ? tl / (total * fs0) : 1;
    let x = num(el, 'x');
    let y = num(el, 'y');
    const width = total * fs0 * hs;
    if (st.textAnchor === 'middle') x -= width / 2;
    else if (st.textAnchor === 'end') x -= width;
    const face0 = runs.find((r) => r.face)?.face;
    if (face0 && st.dominantBaseline && st.dominantBaseline !== 'auto' && st.dominantBaseline !== 'alphabetic') {
      const upm = face0.fk.unitsPerEm;
      const asc = face0.fk.ascent / upm;
      const desc = face0.fk.descent / upm;
      const db = st.dominantBaseline;
      if (db === 'central' || db === 'middle') y += ((asc + desc) / 2) * fs0;
      else if (db === 'hanging' || db === 'text-before-edge') y += asc * fs0;
      else if (db === 'text-after-edge' || db === 'ideographic') y += desc * fs0;
    }
    let s = 'BT\n';
    let q = false;
    let curKey = '';
    let curMode = '';
    let penX = x;
    let penY = y;
    for (const r of runs) {
      const it = r.it;
      if (it.x !== undefined) penX = it.x;
      if (it.y !== undefined) penY = it.y;
      penX += it.dx;
      penY += it.dy;
      const fs = it.st.fontSize;
      const invisible = ctx.opts.mode === 'text' || (it.st.fillOpacity ?? 1) * it.st.opacity <= 0 || it.st.fill === 'none';
      if (r.face && it.ch !== '\u00a0') {
        const c = parseColor(it.st.fill) ?? [0, 0, 0];
        const fa = (it.st.fillOpacity ?? 1) * it.st.opacity;
        // Tr is graphics state and outlives ET: always set it.
        const mode = invisible ? '3 Tr\n' : `0 Tr ${col(c)} rg\n${fa < 1 ? `${this.gs(ctx.page, fa, fa)} gs\n` : ''}`;
        if (!invisible && fa < 1) q = true;
        if (mode !== curMode) {
          s += mode;
          curMode = mode;
        }
        const pf = await this.pdfFont(r.face);
        let key = ctx.fontKeys.get(r.face.def.url);
        if (!key) {
          key = ctx.page.node.newFontDictionary('F', pf.ref).toString();
          ctx.fontKeys.set(r.face.def.url, key);
        }
        if (key !== curKey) {
          s += `${key} 1 Tf\n`;
          curKey = key;
        }
        const skew = it.st.fontStyle === 'italic' || it.st.fontStyle === 'oblique' ? (ctx.opts.italicSkew ?? 0.25) : 0;
        // Glyph matrix in the y-down user space: x-scale fs·hs, y flipped, italic skew.
        const gm = mul(m, [fs * hs, 0, skew * fs, -fs, penX, penY]);
        if (r.face.synthBold && !invisible) s += `2 Tr ${f(fs * 0.03)} w ${col(c)} RG\n`;
        s += `${f(gm[0])} ${f(gm[1])} ${f(gm[2])} ${f(gm[3])} ${f(gm[4])} ${f(gm[5])} Tm ${r.hex} Tj\n`;
        if (r.face.synthBold && !invisible) {
          s += invisible ? '3 Tr\n' : '0 Tr\n';
        }
        if (it.ch.trim()) {
          ctx.stats.glyphs++;
          if (invisible) ctx.stats.invisibleGlyphs++;
        }
      }
      penX += r.adv * fs * hs;
    }
    s += 'ET\n';
    ctx.out.push(q ? `q\n${s}Q\n` : s);
  }

  private async glyph(face: LoadedFace, ch: string): Promise<{ hex: string; adv: number }> {
    const key = `${face.def.url}|${ch}`;
    let g = this.glyphCache.get(key);
    if (!g) {
      const pf = await this.pdfFont(face);
      g = { hex: pf.encodeText(ch).toString(), adv: pf.widthOfTextAtSize(ch, 1) };
      this.glyphCache.set(key, g);
    }
    return g;
  }

  private async image(el: Element, m: M, st: Style, ctx: any): Promise<void> {
    const href = el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? el.getAttribute('xlink:href') ?? '';
    if (!href) return;
    const x = num(el, 'x'), y = num(el, 'y'), w = num(el, 'width'), h = num(el, 'height');
    if (w <= 0 || h <= 0) return;
    // Printed size in page px → 200-dpi target.
    const sx = Math.hypot(m[0], m[1]) * w;
    const sy = Math.hypot(m[2], m[3]) * h;
    // An SVG picture (rhwp's EMF/WMF conversions): draw it as vector through this same writer when it only
    // uses the supported vocabulary; otherwise it is rasterised by the image cache like any bitmap.
    if (/^data:image\/svg\+xml/i.test(href) && !this.filter) {
      const nested = parseSvgDataUrl(href);
      if (nested && svgSupported(nested)) {
        const ids = new Map(ctx.ids as Map<string, Element>);
        for (const e of Array.from(nested.querySelectorAll('[id]'))) ids.set(e.getAttribute('id')!, e);
        const vbAttr = nested.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
        const vb = vbAttr && vbAttr.length === 4 && vbAttr[2] > 0 && vbAttr[3] > 0 ? vbAttr : [0, 0, num(nested, 'width', w), num(nested, 'height', h)];
        const par = el.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet';
        ctx.out.push(`q\n${rectPath(m, x, y, w, h)}W n\n`);
        const inner = mul(mul(m, [1, 0, 0, 1, x, y]), viewBoxMatrix(vb, w, h, par));
        await this.walkChildren(nested, inner, styleOf(nested, ROOT_STYLE), { ...ctx, ids });
        ctx.out.push('Q\n');
        ctx.stats.images++;
        return;
      }
    }
    const img = await this.images.get(href, sx, sy, this.filter);
    if (!img) {
      ctx.stats.unsupported.push('image-decode');
      return;
    }
    // preserveAspectRatio (none | <align> [meet|slice])
    const par = (el.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet').trim();
    let bx = x, by = y, bw = w, bh = h;
    let clip = false;
    if (!par.startsWith('none')) {
      const [align, ms] = par.split(/\s+/);
      const r = img.width / img.height;
      const slice = ms === 'slice';
      if ((w / h > r) !== slice) {
        bw = h * r;
        bh = h;
      } else {
        bw = w;
        bh = w / r;
      }
      const ax = /xMid/.test(align) ? 0.5 : /xMax/.test(align) ? 1 : 0;
      const ay = /YMid/.test(align) ? 0.5 : /YMax/.test(align) ? 1 : 0;
      bx = x + (w - bw) * ax;
      by = y + (h - bh) * ay;
      clip = slice;
    }
    const opacity = st.opacity;
    const im = mul(m, [bw, 0, 0, -bh, bx, by + bh]);
    const name = ctx.page.node.newXObject('Im', img.ref).toString();
    let s = 'q\n';
    if (clip) s += `${rectPath(m, x, y, w, h)}W n\n`;
    if (opacity < 1) s += `${this.gs(ctx.page, opacity, opacity)} gs\n`;
    s += `${f(im[0])} ${f(im[1])} ${f(im[2])} ${f(im[3])} ${f(im[4])} ${f(im[5])} cm ${name} Do\nQ\n`;
    ctx.out.push(s);
    ctx.stats.images++;
  }
}

function isBrightnessContrast(fel: Element): boolean {
  const kids = Array.from(fel.children);
  if (kids.length !== 1 || kids[0].localName !== 'feComponentTransfer') return false;
  return Array.from(kids[0].children).every((c) => /^feFunc[RGB]$/.test(c.localName) && ['linear', 'identity'].includes(c.getAttribute('type') ?? 'identity'));
}

function viewBoxMatrix(vb: number[], w: number, h: number, par: string | null): M {
  const p = (par ?? 'xMidYMid meet').trim();
  let sx = w / vb[2], sy = h / vb[3];
  let tx = 0, ty = 0;
  if (!p.startsWith('none')) {
    const [align, ms] = p.split(/\s+/);
    const s = ms === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
    const ax = /xMid/.test(align) ? 0.5 : /xMax/.test(align) ? 1 : 0;
    const ay = /YMid/.test(align) ? 0.5 : /YMax/.test(align) ? 1 : 0;
    tx = (w - vb[2] * s) * ax;
    ty = (h - vb[3] * s) * ay;
    sx = sy = s;
  }
  return [sx, 0, 0, sy, tx - vb[0] * sx, ty - vb[1] * sy];
}

export { PDFName };

const SVG_OK = new Set(['svg', 'g', 'defs', 'rect', 'line', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'text', 'tspan', 'image', 'clipPath', 'title', 'desc', 'metadata', 'linearGradient', 'stop', 'marker', 'a']);

/** An SVG picture (data:image/svg+xml, base64 or URL-encoded) parsed and sanitised, or null. */
export function parseSvgDataUrl(href: string): SVGSVGElement | null {
  const comma = href.indexOf(',');
  if (comma < 0) return null;
  const meta = href.slice(0, comma);
  let text: string;
  try {
    if (/;base64/i.test(meta)) {
      const bin = atob(href.slice(comma + 1).replace(/\s+/g, ''));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      text = new TextDecoder().decode(bytes);
    } else text = decodeURIComponent(href.slice(comma + 1));
  } catch {
    return null;
  }
  const parsed = parsePageSvg(text);
  if (!parsed.svg) return null;
  sanitize(parsed.svg);
  return parsed.svg;
}

/** True when every element of the picture is in the writer's vocabulary (else: raster). */
export function svgSupported(svg: Element): boolean {
  for (const e of Array.from(svg.getElementsByTagName('*'))) if (!SVG_OK.has(e.localName)) return false;
  return true;
}
