// rhwp page SVG (after the production post-processing in svg-dom.ts) → PDF content, written directly with
// pdf-lib (SPIKE-HWP-DIRECT §6.3). rhwp 0.8.6 emits a small, regular vocabulary (inventory over 120 files:
// svg, g[transform|clip-path|filter], clipPath, rect, line, circle, ellipse, path, text with one glyph each,
// image (jpeg/png/svg data URLs), nested svg, linearGradient, marker, feComponentTransfer).
// One base `cm` per page (px → pt, y down), then everything in the page's SVG user space; the current transform
// is tracked here, so paths and clips are pre-transformed and text gets one Tm per glyph. Glyphs come from
// embedded subset slices, so the text can be selected and searched. Anything the writer cannot express is
// recorded in `stats.unsupported` (export.ts then draws that page as an image instead).
import type { PDFDocument, PDFFont, PDFPage, PDFRef } from '@cantoo/pdf-lib';
import { parsePageSvg, sanitize } from '../svg-dom';
import type { FaceTable, LoadedFace, Resolved } from './faces';
import { isPua } from './faces';
import { brightnessContrast, type Filter, type ImageCache } from './images';

export type M = [number, number, number, number, number, number];
const I: M = [1, 0, 0, 1, 0, 0];
export const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const ap = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const isId = (m: M): boolean => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
const nums = (s: string): number[] => s.split(/[\s,]+/).filter(Boolean).map(Number);

export function parseTransform(s: string | null): M {
  let m: M = I;
  if (!s) return m;
  for (const t of s.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const a = nums(t[2] ?? '');
    let n: M = I;
    switch (t[1]) {
      case 'matrix':
        n = [a[0] ?? 1, a[1] ?? 0, a[2] ?? 0, a[3] ?? 1, a[4] ?? 0, a[5] ?? 0];
        break;
      case 'translate':
        n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case 'scale':
        n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const r = ((a[0] ?? 0) * Math.PI) / 180;
        n = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
        if (a.length >= 3) n = mul(mul([1, 0, 0, 1, a[1]!, a[2]!], n), [1, 0, 0, 1, -a[1]!, -a[2]!]);
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

type RGB = [number, number, number];
const NAMED: Record<string, RGB> = { black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], blue: [0, 0, 255], green: [0, 128, 0], gray: [128, 128, 128], grey: [128, 128, 128], yellow: [255, 255, 0] };

export function parseColor(v: string | null | undefined): RGB | null {
  if (!v) return null;
  const s = v.trim();
  if (s === 'none' || s === 'transparent') return null;
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [parseInt(m[1]!.slice(0, 2), 16), parseInt(m[1]!.slice(2, 4), 16), parseInt(m[1]!.slice(4, 6), 16)];
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1]![i]! + m![1]![i]!, 16)) as RGB;
  m = /^rgba?\(([^)]*)\)$/i.exec(s);
  if (m) {
    const p = m[1]!.split(/[\s,/]+/).map((x) => (x.endsWith('%') ? (parseFloat(x) * 255) / 100 : parseFloat(x)));
    return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
  }
  return NAMED[s.toLowerCase()] ?? null;
}

export interface PageStats {
  glyphs: number;
  invisibleGlyphs: number;
  missingGlyphs: number;
  shapes: number;
  images: number;
  unsupported: string[];
  /** Non-finite numbers written as 0 (the first spike's `-Infinity Tc` made invalid PDFs). */
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
  fillRule: string | null;
}

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

function setStyle(s: Style, k: keyof Style, v: string): void {
  if (NUM.has(k)) {
    const n = parseFloat(v);
    if (Number.isFinite(n)) (s as unknown as Record<string, number>)[k] = n;
  } else (s as unknown as Record<string, string>)[k] = v;
}

function styleOf(el: Element, parent: Style): Style {
  // opacity does not inherit (it multiplies down the tree through `inherited`).
  const s: Style = { ...parent, opacity: 1 };
  for (const [a, k] of Object.entries(ATTR)) {
    const v = el.getAttribute(a);
    if (v != null && v !== 'inherit') setStyle(s, k, v);
  }
  const st = el.getAttribute('style');
  if (st)
    for (const decl of st.split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      const k = ATTR[decl.slice(0, i).trim()];
      const v = decl.slice(i + 1).trim();
      if (k && v) setStyle(s, k, v);
    }
  s.opacity *= parent.opacity;
  return s;
}

const ROOT_STYLE: Style = {
  fill: '#000000',
  stroke: null,
  strokeWidth: 1,
  fillOpacity: 1,
  strokeOpacity: 1,
  opacity: 1,
  fontFamily: 'serif',
  fontSize: 16,
  fontWeight: '400',
  fontStyle: 'normal',
  textAnchor: 'start',
  dominantBaseline: 'auto',
  linecap: null,
  linejoin: null,
  dash: null,
  fillRule: null,
};

const num = (el: Element, a: string, d = 0): number => {
  const v = el.getAttribute(a);
  if (v == null) return d;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
const refId = (v: string | null | undefined): string | undefined => (v ? /url\(\s*['"]?#([^)'"]+)['"]?\s*\)/.exec(v)?.[1] : undefined);

const K = 0.5522847498;

function arcToBeziers(x1: number, y1: number, rx0: number, ry0: number, phi: number, fa: number, fs: number, x2: number, y2: number): number[][] {
  let rx = Math.abs(rx0);
  let ry = Math.abs(ry0);
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [[x1, y1, x2, y2, x2, y2]];
  const sin = Math.sin((phi * Math.PI) / 180);
  const cos = Math.cos((phi * Math.PI) / 180);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const l = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (l > 1) {
    rx *= Math.sqrt(l);
    ry *= Math.sqrt(l);
  }
  const sign = fa === fs ? -1 : 1;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const sq = den > 0 ? Math.max(0, (rx * rx * ry * ry - den) / den) : 0;
  const coef = sign * Math.sqrt(sq);
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number): number => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI;
  if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const d = dt / n;
  const k = (4 / 3) * Math.tan(d / 4);
  const out: number[][] = [];
  let t = t1;
  for (let i = 0; i < n; i++) {
    const c1 = Math.cos(t);
    const s1 = Math.sin(t);
    const c2 = Math.cos(t + d);
    const s2 = Math.sin(t + d);
    const pts = [
      [c1 - k * s1, s1 + k * c1],
      [c2 + k * s2, s2 - k * c2],
      [c2, s2],
    ].map(([px, py]) => [cx + rx * px! * cos - ry * py! * sin, cy + rx * px! * sin + ry * py! * cos]);
    out.push([pts[0]![0]!, pts[0]![1]!, pts[1]![0]!, pts[1]![1]!, pts[2]![0]!, pts[2]![1]!]);
    t += d;
  }
  return out;
}

function viewBoxMatrix(vb: number[], w: number, h: number, par: string | null): M {
  const p = (par ?? 'xMidYMid meet').trim();
  let sx = w / vb[2]!;
  let sy = h / vb[3]!;
  let tx = 0;
  let ty = 0;
  if (!p.startsWith('none')) {
    const [align = 'xMidYMid', ms] = p.split(/\s+/);
    const s = ms === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
    const ax = /xMid/.test(align) ? 0.5 : /xMax/.test(align) ? 1 : 0;
    const ay = /YMid/.test(align) ? 0.5 : /YMax/.test(align) ? 1 : 0;
    tx = (w - vb[2]! * s) * ax;
    ty = (h - vb[3]! * s) * ay;
    sx = sy = s;
  }
  return [sx, 0, 0, sy, tx - vb[0]! * sx, ty - vb[1]! * sy];
}

const viewBoxOf = (el: Element): number[] | null => {
  const vb = nums(el.getAttribute('viewBox') ?? '');
  return vb.length === 4 && vb.every(Number.isFinite) && vb[2]! > 0 && vb[3]! > 0 ? vb : null;
};

/** The writer's element vocabulary for an SVG picture drawn as vector (anything else: rasterised). */
const SVG_OK = new Set(['svg', 'g', 'defs', 'rect', 'line', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'text', 'tspan', 'image', 'clipPath', 'title', 'desc', 'metadata', 'linearGradient', 'stop', 'marker', 'a']);

/** An SVG picture (data:image/svg+xml, base64 or URL-encoded), parsed and sanitised, or null. */
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

/** True when every element of the picture is in the writer's vocabulary. */
export function svgSupported(svg: Element): boolean {
  for (const e of Array.from(svg.getElementsByTagName('*'))) if (!SVG_OK.has(e.localName)) return false;
  return true;
}

export interface WriterOptions {
  /** 'full' draws everything; 'text' draws only the text, invisible (Tr 3): the raster fallback's text layer. */
  mode: 'full' | 'text';
}

interface Ctx {
  page: PDFPage;
  stats: PageStats;
  ids: Map<string, Element>;
  out: string[];
  fontKeys: Map<string, string>;
  mode: 'full' | 'text';
  filter: Filter | null;
}

const ITALIC_SKEW = 0.25;
const SYNTH_BOLD_STROKE = 0.03;
const GRADIENT_BANDS = 64;
const SKIP = new Set(['defs', 'clipPath', 'linearGradient', 'radialGradient', 'marker', 'filter', 'title', 'desc', 'metadata', 'style']);

export class SvgPdfWriter {
  private readonly pdfFonts = new Map<string, Promise<PDFFont>>();
  private readonly glyphs = new Map<string, { hex: string; adv: number }>();
  private readonly gsRefs = new Map<string, PDFRef>();
  private nonFinite = 0;

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: FaceTable,
    private readonly images: ImageCache | null,
  ) {}

  /** A PDF number: 3 decimals, never NaN/Infinity (written as 0 and counted). */
  private f(n: number): string {
    if (!Number.isFinite(n)) {
      this.nonFinite++;
      return '0';
    }
    const r = Math.round(n * 1000) / 1000;
    return Object.is(r, -0) ? '0' : String(r);
  }

  private col(c: RGB): string {
    return `${this.f(c[0] / 255)} ${this.f(c[1] / 255)} ${this.f(c[2] / 255)}`;
  }

  private pt(m: M, x: number, y: number): string {
    const [a, b] = ap(m, x, y);
    return `${this.f(a)} ${this.f(b)}`;
  }

  /**
   * Draws this page SVG (`w` × `h` CSS px) onto a new page, or onto `existing` (the raster text layer).
   * The page is added even when the SVG uses something unsupported; the caller decides from the stats.
   */
  async addPage(svg: Element, w: number, h: number, opts: WriterOptions, existing?: PDFPage): Promise<{ page: PDFPage; stats: PageStats }> {
    this.nonFinite = 0;
    const page = existing ?? this.doc.addPage([this.num(w * 0.75), this.num(h * 0.75)]);
    const stats: PageStats = { glyphs: 0, invisibleGlyphs: 0, missingGlyphs: 0, shapes: 0, images: 0, unsupported: [], nonFinite: 0 };
    const ids = new Map<string, Element>();
    for (const e of Array.from(svg.querySelectorAll('[id]'))) ids.set(e.getAttribute('id')!, e);
    const out: string[] = [`q\n0.75 0 0 -0.75 0 ${this.f(h * 0.75)} cm\n`];
    const ctx: Ctx = { page, stats, ids, out, fontKeys: new Map(), mode: opts.mode, filter: null };
    let root: M = I;
    const vb = viewBoxOf(svg);
    if (vb) root = mul([num(svg, 'width', w) / vb[2]!, 0, 0, num(svg, 'height', h) / vb[3]!, 0, 0], [1, 0, 0, 1, -vb[0]!, -vb[1]!]);
    await this.children(svg, root, ROOT_STYLE, ctx);
    out.push('Q\n');
    stats.nonFinite = this.nonFinite;
    page.node.addContentStream(this.doc.context.register(this.doc.context.flateStream(out.join(''))));
    return { page, stats };
  }

  private num(n: number): number {
    if (Number.isFinite(n) && n > 0) return n;
    this.nonFinite++;
    return 1;
  }

  private async children(el: Element, m: M, st: Style, ctx: Ctx): Promise<void> {
    for (const c of Array.from(el.children)) await this.node(c, m, st, ctx);
  }

  private gs(ctx: Ctx, fillA: number, strokeA: number): string {
    const fa = Math.max(0, Math.min(1, fillA));
    const sa = Math.max(0, Math.min(1, strokeA));
    const key = `${this.f(fa)}|${this.f(sa)}`;
    let ref = this.gsRefs.get(key);
    if (!ref) {
      ref = this.doc.context.register(this.doc.context.obj({ Type: 'ExtGState', ca: fa, CA: sa }));
      this.gsRefs.set(key, ref);
    }
    return `${ctx.page.node.newExtGState('GS', ref).toString()} gs\n`;
  }

  // ---------- geometry ----------

  private ellipse(m: M, cx: number, cy: number, rx: number, ry: number): string {
    const p = [
      [cx + rx, cy],
      [cx + rx, cy + K * ry], [cx + K * rx, cy + ry], [cx, cy + ry],
      [cx - K * rx, cy + ry], [cx - rx, cy + K * ry], [cx - rx, cy],
      [cx - rx, cy - K * ry], [cx - K * rx, cy - ry], [cx, cy - ry],
      [cx + K * rx, cy - ry], [cx + rx, cy - K * ry], [cx + rx, cy],
    ] as [number, number][];
    let s = `${this.pt(m, ...p[0]!)} m\n`;
    for (let i = 1; i < p.length; i += 3) s += `${this.pt(m, ...p[i]!)} ${this.pt(m, ...p[i + 1]!)} ${this.pt(m, ...p[i + 2]!)} c\n`;
    return `${s}h\n`;
  }

  private rect(m: M, x: number, y: number, w: number, h: number, rx0 = 0, ry0 = 0): string {
    if (rx0 > 0 || ry0 > 0) {
      const rx = Math.min(rx0 || ry0, w / 2);
      const ry = Math.min(ry0 || rx0, h / 2);
      return this.path(m, `M${x + rx},${y} H${x + w - rx} A${rx},${ry} 0 0 1 ${x + w},${y + ry} V${y + h - ry} A${rx},${ry} 0 0 1 ${x + w - rx},${y + h} H${x + rx} A${rx},${ry} 0 0 1 ${x},${y + h - ry} V${y + ry} A${rx},${ry} 0 0 1 ${x + rx},${y} Z`);
    }
    if (isId(m)) return `${this.f(x)} ${this.f(y)} ${this.f(w)} ${this.f(h)} re\n`;
    return `${this.pt(m, x, y)} m ${this.pt(m, x + w, y)} l ${this.pt(m, x + w, y + h)} l ${this.pt(m, x, y + h)} l h\n`;
  }

  /** SVG path data (M L H V C S Q T A Z, absolute and relative) → PDF path operators in `m`. */
  path(m: M, d: string): string {
    const toks = d.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
    let i = 0;
    let cmd = '';
    let x = 0;
    let y = 0;
    let sx = 0;
    let sy = 0;
    let lcx = 0;
    let lcy = 0;
    let lqx = 0;
    let lqy = 0;
    let prev = '';
    let out = '';
    const n = (): number => Number(toks[i++]);
    while (i < toks.length) {
      if (/[A-Za-z]/.test(toks[i]!)) cmd = toks[i++]!;
      else if (!cmd) break;
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      const ox = rel ? x : 0;
      const oy = rel ? y : 0;
      const before = i;
      if (C === 'M') {
        x = ox + n();
        y = oy + n();
        sx = x;
        sy = y;
        out += `${this.pt(m, x, y)} m\n`;
        cmd = rel ? 'l' : 'L';
      } else if (C === 'L') {
        x = ox + n();
        y = oy + n();
        out += `${this.pt(m, x, y)} l\n`;
      } else if (C === 'H') {
        x = ox + n();
        out += `${this.pt(m, x, y)} l\n`;
      } else if (C === 'V') {
        y = oy + n();
        out += `${this.pt(m, x, y)} l\n`;
      } else if (C === 'C') {
        const x1 = ox + n();
        const y1 = oy + n();
        const x2 = ox + n();
        const y2 = oy + n();
        x = ox + n();
        y = oy + n();
        out += `${this.pt(m, x1, y1)} ${this.pt(m, x2, y2)} ${this.pt(m, x, y)} c\n`;
        lcx = x2;
        lcy = y2;
      } else if (C === 'S') {
        const smooth = prev === 'C' || prev === 'S';
        const x1 = smooth ? 2 * x - lcx : x;
        const y1 = smooth ? 2 * y - lcy : y;
        const x2 = ox + n();
        const y2 = oy + n();
        x = ox + n();
        y = oy + n();
        out += `${this.pt(m, x1, y1)} ${this.pt(m, x2, y2)} ${this.pt(m, x, y)} c\n`;
        lcx = x2;
        lcy = y2;
      } else if (C === 'Q' || C === 'T') {
        let qx: number;
        let qy: number;
        if (C === 'Q') {
          qx = ox + n();
          qy = oy + n();
        } else {
          const smooth = prev === 'Q' || prev === 'T';
          qx = smooth ? 2 * x - lqx : x;
          qy = smooth ? 2 * y - lqy : y;
        }
        const ex = ox + n();
        const ey = oy + n();
        out += `${this.pt(m, x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y))} ${this.pt(m, ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey))} ${this.pt(m, ex, ey)} c\n`;
        lqx = qx;
        lqy = qy;
        x = ex;
        y = ey;
      } else if (C === 'A') {
        const rx = n();
        const ry = n();
        const phi = n();
        const fa = n();
        const fs = n();
        const ex = ox + n();
        const ey = oy + n();
        for (const b of arcToBeziers(x, y, rx, ry, phi, fa, fs, ex, ey)) out += `${this.pt(m, b[0]!, b[1]!)} ${this.pt(m, b[2]!, b[3]!)} ${this.pt(m, b[4]!, b[5]!)} c\n`;
        x = ex;
        y = ey;
      } else if (C === 'Z') {
        out += 'h\n';
        x = sx;
        y = sy;
      } else i++;
      prev = C;
      // A command without numbers after it (e.g. a trailing "L") must not loop forever.
      if (i === before && C !== 'Z') break;
    }
    return out;
  }

  // ---------- painting ----------

  private clip(ctx: Ctx, m: M, ref: string | null): boolean {
    const id = refId(ref);
    if (!id) return false;
    const cp = ctx.ids.get(id);
    if (!cp) return false;
    let geo = '';
    for (const c of Array.from(cp.children)) {
      const cm = mul(m, parseTransform(c.getAttribute('transform')));
      if (c.localName === 'rect') geo += this.rect(cm, num(c, 'x'), num(c, 'y'), num(c, 'width'), num(c, 'height'));
      else if (c.localName === 'path') geo += this.path(cm, c.getAttribute('d') ?? '');
      else if (c.localName === 'circle') geo += this.ellipse(cm, num(c, 'cx'), num(c, 'cy'), num(c, 'r'), num(c, 'r'));
      else if (c.localName === 'ellipse') geo += this.ellipse(cm, num(c, 'cx'), num(c, 'cy'), num(c, 'rx'), num(c, 'ry'));
      else ctx.stats.unsupported.push(`clip:${c.localName}`);
    }
    ctx.out.push(`q\n${geo || '0 0 0 0 re\n'}W n\n`);
    return true;
  }

  private fillColor(st: Style, ctx: Ctx): RGB | null {
    const id = refId(st.fill);
    if (id) {
      const stop = ctx.ids.get(id)?.querySelector('stop');
      return parseColor(stop?.getAttribute('stop-color') ?? null);
    }
    return parseColor(st.fill);
  }

  private paint(ctx: Ctx, st: Style, geo: string, m: M, allowFill = true): void {
    if (ctx.mode === 'text' || !geo) return;
    const fillC = allowFill ? this.fillColor(st, ctx) : null;
    const strokeC = parseColor(st.stroke);
    const doStroke = strokeC !== null && st.strokeWidth > 0;
    const fa = st.fillOpacity * st.opacity;
    const sa = st.strokeOpacity * st.opacity;
    const doFill = fillC !== null && fa > 0;
    const strokeOn = doStroke && sa > 0;
    if (!doFill && !strokeOn) return;
    let s = 'q\n';
    if ((doFill && fa < 1) || (strokeOn && sa < 1)) s += this.gs(ctx, fa, sa);
    if (doFill) s += `${this.col(fillC)} rg\n`;
    if (strokeOn) {
      const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
      s += `${this.col(strokeC)} RG ${this.f(st.strokeWidth * scale)} w\n`;
      if (st.linecap === 'round') s += '1 J\n';
      else if (st.linecap === 'square') s += '2 J\n';
      if (st.linejoin === 'round') s += '1 j\n';
      else if (st.linejoin === 'bevel') s += '2 j\n';
      if (st.dash && st.dash !== 'none') {
        const arr = nums(st.dash).filter((v) => Number.isFinite(v) && v >= 0);
        if (arr.some((v) => v > 0)) s += `[${arr.map((v) => this.f(v * scale)).join(' ')}] 0 d\n`;
      }
    }
    const eo = st.fillRule === 'evenodd' ? '*' : '';
    s += geo + (doFill && strokeOn ? `B${eo}\n` : doFill ? `f${eo}\n` : 'S\n') + 'Q\n';
    ctx.out.push(s);
    ctx.stats.shapes++;
  }

  /** linearGradient fill on a rect: bands along the gradient axis, clipped to the rect. */
  private gradientRect(ctx: Ctx, st: Style, m: M, x: number, y: number, w: number, h: number): boolean {
    const id = refId(st.fill);
    const g = id ? ctx.ids.get(id) : undefined;
    if (!g || g.localName !== 'linearGradient' || ctx.mode === 'text') return false;
    const pc = (a: string, d: number): number => {
      const v = g.getAttribute(a);
      const n = v == null ? d : v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v);
      return Number.isFinite(n) ? n : d;
    };
    const x1 = pc('x1', 0);
    const y1 = pc('y1', 0);
    const x2 = pc('x2', 1);
    const y2 = pc('y2', 0);
    const stops = Array.from(g.querySelectorAll('stop')).map((s) => {
      const o = s.getAttribute('offset') ?? '0';
      return { o: parseFloat(o) / (o.endsWith('%') ? 100 : 1) || 0, c: parseColor(s.getAttribute('stop-color')) ?? ([0, 0, 0] as RGB) };
    });
    if (!stops.length) return false;
    const at = (t: number): RGB => {
      if (t <= stops[0]!.o) return stops[0]!.c;
      for (let i = 1; i < stops.length; i++)
        if (t <= stops[i]!.o) {
          const a = stops[i - 1]!;
          const b = stops[i]!;
          const u = (t - a.o) / Math.max(1e-9, b.o - a.o);
          return [a.c[0] + (b.c[0] - a.c[0]) * u, a.c[1] + (b.c[1] - a.c[1]) * u, a.c[2] + (b.c[2] - a.c[2]) * u];
        }
      return stops[stops.length - 1]!.c;
    };
    const vertical = Math.abs(y2 - y1) >= Math.abs(x2 - x1);
    let s = `q\n${this.rect(m, x, y, w, h)}W n\n`;
    const fa = st.fillOpacity * st.opacity;
    if (fa < 1) s += this.gs(ctx, fa, 1);
    for (let i = 0; i < GRADIENT_BANDS; i++) {
      const t = (i + 0.5) / GRADIENT_BANDS;
      const c = at(vertical ? (y2 >= y1 ? t : 1 - t) : x2 >= x1 ? t : 1 - t);
      const band = vertical ? this.rect(m, x, y + (h * i) / GRADIENT_BANDS, w, h / GRADIENT_BANDS + 0.5) : this.rect(m, x + (w * i) / GRADIENT_BANDS, y, w / GRADIENT_BANDS + 0.5, h);
      s += `${this.col(c)} rg\n${band}f\n`;
    }
    ctx.out.push(`${s}Q\n`);
    ctx.stats.shapes++;
    return true;
  }

  private async node(el: Element, m: M, parent: Style, ctx: Ctx): Promise<void> {
    const name = el.localName;
    if (SKIP.has(name)) return;
    if (el.getAttribute('display') === 'none' || el.getAttribute('visibility') === 'hidden') return;
    const st = styleOf(el, parent);
    const own = parseTransform(el.getAttribute('transform'));
    const cm = isId(own) ? m : mul(m, own);
    const clipped = this.clip(ctx, cm, el.getAttribute('clip-path'));
    try {
      switch (name) {
        case 'g':
        case 'a': {
          const fid = refId(el.getAttribute('filter'));
          const saved = ctx.filter;
          if (fid) {
            const fel = ctx.ids.get(fid);
            const bc = fel ? brightnessContrast(fel) : null;
            if (bc) ctx.filter = bc;
            else ctx.stats.unsupported.push(`filter:${fid}`);
          }
          await this.children(el, cm, st, ctx);
          ctx.filter = saved;
          break;
        }
        case 'svg': {
          const x = num(el, 'x');
          const y = num(el, 'y');
          const w = num(el, 'width');
          const h = num(el, 'height');
          let inner: M = mul(cm, [1, 0, 0, 1, x, y]);
          const vb = viewBoxOf(el);
          ctx.out.push(`q\n${this.rect(cm, x, y, w, h)}W n\n`);
          if (vb) inner = mul(inner, viewBoxMatrix(vb, w, h, el.getAttribute('preserveAspectRatio')));
          await this.children(el, inner, st, ctx);
          ctx.out.push('Q\n');
          break;
        }
        case 'rect': {
          const x = num(el, 'x');
          const y = num(el, 'y');
          const w = num(el, 'width');
          const h = num(el, 'height');
          if (w <= 0 || h <= 0) break;
          if (this.gradientRect(ctx, st, cm, x, y, w, h)) {
            if (st.stroke && st.stroke !== 'none') this.paint(ctx, st, this.rect(cm, x, y, w, h), cm, false);
            break;
          }
          this.paint(ctx, st, this.rect(cm, x, y, w, h, num(el, 'rx'), num(el, 'ry')), cm);
          break;
        }
        case 'line': {
          const x1 = num(el, 'x1');
          const y1 = num(el, 'y1');
          const x2 = num(el, 'x2');
          const y2 = num(el, 'y2');
          this.paint(ctx, { ...st, fill: null }, `${this.pt(cm, x1, y1)} m ${this.pt(cm, x2, y2)} l\n`, cm);
          await this.markers(el, cm, st, ctx, x1, y1, x2, y2);
          break;
        }
        case 'polyline':
        case 'polygon': {
          const p = nums(el.getAttribute('points') ?? '');
          let d = '';
          for (let i = 0; i + 1 < p.length; i += 2) d += `${i ? 'L' : 'M'}${p[i]},${p[i + 1]} `;
          if (name === 'polygon' && d) d += 'Z';
          this.paint(ctx, st, this.path(cm, d), cm);
          break;
        }
        case 'circle':
          this.paint(ctx, st, this.ellipse(cm, num(el, 'cx'), num(el, 'cy'), num(el, 'r'), num(el, 'r')), cm);
          break;
        case 'ellipse':
          this.paint(ctx, st, this.ellipse(cm, num(el, 'cx'), num(el, 'cy'), num(el, 'rx'), num(el, 'ry')), cm);
          break;
        case 'path':
          this.paint(ctx, st, this.path(cm, el.getAttribute('d') ?? ''), cm);
          break;
        case 'text':
          await this.text(el, cm, st, ctx);
          break;
        case 'image':
          if (ctx.mode !== 'text') await this.image(el, cm, st, ctx);
          break;
        default:
          ctx.stats.unsupported.push(name);
      }
    } finally {
      if (clipped) ctx.out.push('Q\n');
    }
  }

  /** marker-start / marker-end on a line (arrowheads): orient auto, markerUnits, viewBox, refX/refY. */
  private async markers(el: Element, m: M, st: Style, ctx: Ctx, x1: number, y1: number, x2: number, y2: number): Promise<void> {
    if (ctx.mode === 'text') return;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    for (const [attr, px, py] of [
      ['marker-start', x1, y1],
      ['marker-end', x2, y2],
    ] as [string, number, number][]) {
      const id = refId(el.getAttribute(attr));
      const mk = id ? ctx.ids.get(id) : undefined;
      if (!mk) continue;
      const mw = num(mk, 'markerWidth', 3);
      const mh = num(mk, 'markerHeight', 3);
      const vb = viewBoxOf(mk) ?? [0, 0, mw, mh];
      const s = (mk.getAttribute('markerUnits') ?? 'strokeWidth') === 'strokeWidth' ? st.strokeWidth : 1;
      const orient = mk.getAttribute('orient');
      let rot = orient === 'auto' || orient === 'auto-start-reverse' ? ang : ((parseFloat(orient ?? '0') || 0) * Math.PI) / 180;
      if (orient === 'auto-start-reverse' && attr === 'marker-start') rot += Math.PI;
      let mm = mul(m, [1, 0, 0, 1, px, py]);
      mm = mul(mm, [Math.cos(rot), Math.sin(rot), -Math.sin(rot), Math.cos(rot), 0, 0]);
      mm = mul(mm, [s, 0, 0, s, 0, 0]);
      mm = mul(mm, [mw / vb[2]!, 0, 0, mh / vb[3]!, 0, 0]);
      mm = mul(mm, [1, 0, 0, 1, -num(mk, 'refX'), -num(mk, 'refY')]);
      await this.children(mk, mm, { ...st, stroke: null, opacity: st.opacity }, ctx);
    }
  }

  private async pdfFont(face: LoadedFace): Promise<PDFFont> {
    let pf = this.pdfFonts.get(face.def.url);
    if (!pf) {
      pf = this.doc.embedFont(face.sfnt, { subset: true });
      this.pdfFonts.set(face.def.url, pf);
    }
    return pf;
  }

  private async glyph(face: LoadedFace, ch: string): Promise<{ hex: string; adv: number }> {
    const key = `${face.def.url}|${ch}`;
    let g = this.glyphs.get(key);
    if (!g) {
      const pf = await this.pdfFont(face);
      g = { hex: pf.encodeText(ch).toString(), adv: pf.widthOfTextAtSize(ch, 1) };
      this.glyphs.set(key, g);
    }
    return g;
  }

  private async text(el: Element, m: M, st: Style, ctx: Ctx): Promise<void> {
    // The characters of <text> and nested <tspan>s (each with its own style and x/y/dx/dy lists, one value per
    // character), as SVG text layout does for these simple cases.
    interface Item {
      ch: string;
      st: Style;
      x?: number;
      y?: number;
      dx: number;
      dy: number;
    }
    const items: Item[] = [];
    const list = (e: Element, a: string): number[] | null => {
      const v = e.getAttribute(a);
      if (v == null || !v.trim()) return null;
      const out = nums(v);
      return out.every(Number.isFinite) ? out : null;
    };
    let tspans = 0;
    const walk = (node: Element, s0: Style, root: boolean): void => {
      const xs = root ? null : list(node, 'x');
      const ys = root ? null : list(node, 'y');
      const dxs = list(node, 'dx');
      const dys = list(node, 'dy');
      let k = 0;
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3) {
          for (const ch of child.nodeValue ?? '') {
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
    const fs0 = st.fontSize;
    if (!items.length || !(fs0 > 0)) return;
    const runs: { r: Resolved | null; hex: string; adv: number; it: Item }[] = [];
    let total = 0;
    for (const it of items) {
      const cp = it.ch.codePointAt(0)!;
      const weight = it.st.fontWeight === 'bold' || it.st.fontWeight === 'bolder' ? 700 : parseInt(it.st.fontWeight, 10) || 400;
      // Space-like code points (NBSP, U+2000–200B, U+202F, U+3000) and addSpaces' spaces draw as a real space.
      const space = cp === 32 || cp === 0xa0 || (cp >= 0x2000 && cp <= 0x200b) || cp === 0x202f || cp === 0x3000;
      const r = await this.fonts.resolve(it.st.fontFamily, weight, space ? 0x20 : cp);
      if (!r) {
        runs.push({ r: null, hex: '', adv: 0.5, it });
        total += 0.5 * (it.st.fontSize / fs0);
        if (cp > 32 && !isPua(cp)) ctx.stats.missingGlyphs++;
        continue;
      }
      const g = await this.glyph(r.face, space ? ' ' : it.ch);
      runs.push({ r, hex: g.hex, adv: g.adv, it });
      total += g.adv * (it.st.fontSize / fs0);
    }
    const tl = parseFloat(el.getAttribute('textLength') ?? '');
    const hs = !tspans && Number.isFinite(tl) && tl > 0 && total > 0 ? tl / (total * fs0) : 1;
    let x = num(el, 'x');
    let y = num(el, 'y');
    const width = total * fs0 * hs;
    if (st.textAnchor === 'middle') x -= width / 2;
    else if (st.textAnchor === 'end') x -= width;
    const face0 = runs.find((r) => r.r)?.r?.face;
    const db = st.dominantBaseline;
    if (face0 && db && db !== 'auto' && db !== 'alphabetic') {
      const upm = face0.font.unitsPerEm || 1000;
      const asc = face0.font.ascent / upm;
      const desc = face0.font.descent / upm;
      if (db === 'central' || db === 'middle') y += ((asc + desc) / 2) * fs0;
      else if (db === 'hanging' || db === 'text-before-edge') y += asc * fs0;
      else if (db === 'text-after-edge' || db === 'ideographic') y += desc * fs0;
    }
    let s = 'BT\n';
    let curKey = '';
    let curMode = '';
    let curAlpha = 1;
    let penX = x;
    let penY = y;
    for (const { r, hex, adv, it } of runs) {
      if (it.x !== undefined) penX = it.x;
      if (it.y !== undefined) penY = it.y;
      penX += it.dx;
      penY += it.dy;
      const fs = it.st.fontSize;
      const fa = it.st.fillOpacity * it.st.opacity;
      const invisible = ctx.mode === 'text' || fa <= 0 || it.st.fill === 'none';
      if (r && it.ch !== ' ') {
        const c = parseColor(it.st.fill) ?? [0, 0, 0];
        // Tr is graphics state and outlives ET: every text object sets it before its first glyph.
        const mode = invisible ? '3 Tr\n' : `0 Tr ${this.col(c)} rg\n`;
        if (mode !== curMode) {
          s += mode;
          curMode = mode;
        }
        const alpha = invisible ? 1 : Math.min(1, fa);
        if (alpha !== curAlpha) {
          s += this.gs(ctx, alpha, alpha);
          curAlpha = alpha;
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
        const skew = it.st.fontStyle === 'italic' || it.st.fontStyle === 'oblique' ? ITALIC_SKEW : 0;
        // Glyph matrix in the y-down user space: x scale fs·hs, y flipped, italic skew.
        const gm = mul(m, [fs * hs, 0, skew * fs, -fs, penX, penY]);
        const bold = r.synthBold && !invisible;
        if (bold) s += `2 Tr ${this.f(fs * SYNTH_BOLD_STROKE)} w ${this.col(c)} RG\n`;
        s += `${gm.map((v) => this.f(v)).join(' ')} Tm ${hex} Tj\n`;
        if (bold) s += '0 Tr\n';
        if (it.ch.trim()) {
          ctx.stats.glyphs++;
          if (invisible) ctx.stats.invisibleGlyphs++;
        }
      }
      penX += adv * fs * hs;
    }
    s += 'ET\n';
    ctx.out.push(curAlpha !== 1 ? `q\n${s}Q\n` : s);
  }

  private async image(el: Element, m: M, st: Style, ctx: Ctx): Promise<void> {
    const href = el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? el.getAttribute('xlink:href') ?? '';
    if (!href) return;
    const x = num(el, 'x');
    const y = num(el, 'y');
    const w = num(el, 'width');
    const h = num(el, 'height');
    if (w <= 0 || h <= 0) return;
    const par = (el.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet').trim();
    // An SVG picture (rhwp's EMF/WMF conversions): drawn as vector through this writer when it only uses the
    // supported vocabulary (rasterising looked faint and shifted, adm29 p81); otherwise like a bitmap.
    if (/^data:image\/svg\+xml/i.test(href) && !ctx.filter) {
      const nested = parseSvgDataUrl(href);
      if (nested && svgSupported(nested)) {
        const ids = new Map(ctx.ids);
        for (const e of Array.from(nested.querySelectorAll('[id]'))) ids.set(e.getAttribute('id')!, e);
        const vb = viewBoxOf(nested) ?? [0, 0, num(nested, 'width', w), num(nested, 'height', h)];
        ctx.out.push(`q\n${this.rect(m, x, y, w, h)}W n\n`);
        const inner = mul(mul(m, [1, 0, 0, 1, x, y]), viewBoxMatrix(vb, w, h, par));
        await this.children(nested, inner, styleOf(nested, { ...ROOT_STYLE, opacity: st.opacity }), { ...ctx, ids });
        ctx.out.push('Q\n');
        ctx.stats.images++;
        return;
      }
    }
    const img = this.images ? await this.images.get(href, Math.hypot(m[0], m[1]) * w, Math.hypot(m[2], m[3]) * h, ctx.filter) : null;
    if (!img) {
      ctx.stats.unsupported.push('image-decode');
      return;
    }
    let bx = x;
    let by = y;
    let bw = w;
    let bh = h;
    let slice = false;
    if (!par.startsWith('none')) {
      const [align = 'xMidYMid', ms] = par.split(/\s+/);
      const r = img.width / img.height;
      slice = ms === 'slice';
      if (w / h > r !== slice) bw = h * r;
      else bh = w / r;
      bx = x + (w - bw) * (/xMid/.test(align) ? 0.5 : /xMax/.test(align) ? 1 : 0);
      by = y + (h - bh) * (/YMid/.test(align) ? 0.5 : /YMax/.test(align) ? 1 : 0);
    }
    const im = mul(m, [bw, 0, 0, -bh, bx, by + bh]);
    const name = ctx.page.node.newXObject('Im', img.ref).toString();
    let s = 'q\n';
    if (slice) s += `${this.rect(m, x, y, w, h)}W n\n`;
    if (st.opacity < 1) s += this.gs(ctx, st.opacity, st.opacity);
    s += `${im.map((v) => this.f(v)).join(' ')} cm ${name} Do\nQ\n`;
    ctx.out.push(s);
    ctx.stats.images++;
  }
}
