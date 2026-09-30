// DOM post-processing of one page SVG on the main thread (brief Step 5 §2). DOM only, no layout; unit-tested
// in jsdom. The four rhwp 0.8.6 workarounds are exact ports of spikes/hwp/convert.html (V2.6):
// dropCellClips (R12), fitFillImages (R2) and addSpaces (no space glyphs); the sanitizer and ensureViewBox
// are additions.

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface ParsedPage {
  svg: SVGSVGElement | null;
  /** True when the markup did not parse (the caller shows a placeholder and counts it). */
  failed: boolean;
}

/** Parses one page SVG string; a parsererror (or a non-SVG root) is `failed`, never an exception. */
export function parsePageSvg(markup: string, parser: DOMParser = new DOMParser()): ParsedPage {
  let doc: Document;
  try {
    doc = parser.parseFromString(markup, 'image/svg+xml');
  } catch {
    return { svg: null, failed: true };
  }
  const root = doc.documentElement;
  if (!root || root.localName !== 'svg' || root.namespaceURI !== SVG_NS || doc.getElementsByTagName('parsererror').length > 0) return { svg: null, failed: true };
  return { svg: root as unknown as SVGSVGElement, failed: false };
}

const REMOVE = new Set(['script', 'foreignObject', 'iframe', 'object', 'embed', 'animate', 'set', 'animateTransform', 'animateMotion']);
const SAFE_IMAGE_HREF = /^(data:image\/|blob:)/i;

/**
 * Defence in depth (the CSP already blocks inline script): removes active elements, unwraps <a> (keeping
 * its children), drops every on* attribute and every href that is not a same-document fragment, or on
 * <image> a data:image/… or blob: URL. Returns the number of removals (elements, unwraps and attributes).
 */
export function sanitize(svg: Element): number {
  let removed = 0;
  const all = [svg, ...Array.from(svg.getElementsByTagName('*'))];
  for (const el of all) {
    if (!el.isConnected && el !== svg) continue;
    const name = el.localName;
    if (REMOVE.has(name)) {
      el.remove();
      removed++;
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const local = attr.localName.toLowerCase();
      if (local.startsWith('on')) {
        el.removeAttributeNode(attr);
        removed++;
      } else if (local === 'href') {
        const v = attr.value.trim();
        const ok = v.startsWith('#') || (name === 'image' && SAFE_IMAGE_HREF.test(v));
        if (!ok) {
          el.removeAttributeNode(attr);
          removed++;
        }
      }
    }
    if (name === 'a' && el.parentNode) {
      while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
      el.remove();
      removed++;
    }
  }
  return removed;
}

/** Adds viewBox="0 0 W H" from width/height when missing, so the screen preview can scale. */
export function ensureViewBox(svg: Element): boolean {
  if (svg.getAttribute('viewBox')) return false;
  const w = parseFloat(svg.getAttribute('width') ?? '');
  const h = parseFloat(svg.getAttribute('height') ?? '');
  if (!(w > 0 && h > 0)) return false;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  return true;
}

/** R12: rhwp cells can be shorter than their content; drop cell clips, keep body and fill clips. */
export function dropCellClips(svg: Element): number {
  let n = 0;
  for (const g of Array.from(svg.querySelectorAll('g[clip-path*="cell-clip"]'))) {
    g.removeAttribute('clip-path');
    n++;
  }
  return n;
}

/** R2: fit a cell picture fill that overflows its fill-clip rect (5 % tolerance) into that rect, centred. */
export function fitFillImages(svg: Element): number {
  let n = 0;
  for (const im of Array.from(svg.querySelectorAll('image'))) {
    const g = im.closest('g[clip-path*="fill-clip"]');
    if (!g) continue;
    const id = (g.getAttribute('clip-path') ?? '').match(/url\(#([^)]+)\)/)?.[1];
    if (!id) continue;
    const r = svg.querySelector(`[id="${id.replace(/["\\]/g, '\\$&')}"] rect`);
    if (!r) continue;
    const rw = +(r.getAttribute('width') ?? 0);
    const rh = +(r.getAttribute('height') ?? 0);
    const iw = +(im.getAttribute('width') ?? 0);
    const ih = +(im.getAttribute('height') ?? 0);
    if (iw <= rw * 1.05 && ih <= rh * 1.05) continue;
    im.setAttribute('x', r.getAttribute('x') ?? '0');
    im.setAttribute('y', r.getAttribute('y') ?? '0');
    im.setAttribute('width', String(rw));
    im.setAttribute('height', String(rh));
    im.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    n++;
  }
  return n;
}

/** A text run of rhwp getPageTextLayout(i).runs (only the fields addSpaces reads). */
export interface TextRun {
  text: string;
  x: number;
  y: number;
  h: number;
  charX: number[];
}

/** Keeps only what addSpaces needs (the worker posts this, not the full layout). */
export function slimRuns(runs: unknown): TextRun[] {
  if (!Array.isArray(runs)) return [];
  const out: TextRun[] = [];
  for (const r of runs as Partial<TextRun>[]) {
    if (!r || typeof r.text !== 'string' || !r.text.includes(' ') || !Array.isArray(r.charX)) continue;
    out.push({ text: r.text, x: Number(r.x), y: Number(r.y), h: Number(r.h), charX: r.charX.map(Number) });
  }
  return out;
}

interface Glyph {
  e: Element;
  x: number;
  y: number;
}

/**
 * rhwp draws one <text> per glyph and no space glyphs, so text copied from the PDF has no word spaces.
 * Inserts a space <text> after the glyph before each space of a run (nearest glyph within 0.75 px of the
 * run's char x; glyphs indexed by floor(y)). Leading spaces have nothing to anchor to and are skipped.
 */
export function addSpaces(svg: Element, runs: TextRun[]): number {
  const rows = new Map<number, Glyph[]>();
  for (const e of Array.from(svg.querySelectorAll('text'))) {
    const o = { e, x: +(e.getAttribute('x') ?? NaN), y: +(e.getAttribute('y') ?? NaN) };
    const k = Math.floor(o.y);
    let a = rows.get(k);
    if (!a) rows.set(k, (a = []));
    a.push(o);
  }
  let added = 0;
  for (const r of runs) {
    if (!r.text || !r.text.includes(' ') || !r.charX) continue;
    const chars = [...r.text];
    const lo = r.y - 2;
    const hi = r.y + r.h * 1.6 + 2;
    const inRun: Glyph[] = [];
    for (let k = Math.floor(lo); k <= Math.floor(hi); k++) {
      const a = rows.get(k);
      if (a) for (const o of a) if (o.y >= lo && o.y <= hi) inRun.push(o);
    }
    const find = (j: number): { e: Element } | null => {
      const gx = r.x + r.charX[j];
      let best: Glyph | null = null;
      let bd = 0.75;
      for (const o of inRun) {
        const dd = Math.abs(o.x - gx);
        if (dd < bd) {
          bd = dd;
          best = o;
        }
      }
      return best;
    };
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] !== ' ') continue;
      let prev: { e: Element } | null = null;
      for (let j = i - 1; j >= 0 && !prev; j--) if (chars[j] !== ' ') prev = find(j);
      if (!prev) continue;
      const sp = prev.e.cloneNode(false) as Element;
      sp.textContent = ' ';
      sp.setAttribute('x', String(r.x + r.charX[i]));
      sp.setAttribute('xml:space', 'preserve');
      (sp as unknown as ElementCSSInlineStyle).style.whiteSpace = 'pre';
      prev.e.after(sp);
      prev = { e: sp };
      added++;
    }
  }
  return added;
}

/** Ids a url(#…) or href="#…" of this page points at that no element of the page carries. */
export function danglingRefs(svg: Element): number {
  const ids = new Set(Array.from(svg.querySelectorAll('[id]')).map((e) => e.getAttribute('id')));
  let n = 0;
  for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.localName === 'href' && attr.value.startsWith('#') && !ids.has(attr.value.slice(1))) n++;
      for (const m of attr.value.matchAll(/url\(#([^)]+)\)/g)) if (!ids.has(m[1])) n++;
    }
  }
  return n;
}
