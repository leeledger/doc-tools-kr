// 도장 만들기 (STAMP1015 D4): text rules and auto-fit, pure (no DOM). The output is a draw list in unit coordinates (the
// frame's long edge is 1); the same list paints the tiles, the large preview and the PNG, so what is seen is what is
// saved. Glyph ink boxes come from an injected `measure` (canvas actualBoundingBox* in the page, @napi-rs/canvas in the
// unit tests, the em box where a browser has no ink metrics).
import {
  ARC_MAX_DEG,
  CELL_FILL,
  HEAVY_STROKE_SHARE,
  INNER_RING_SHARE,
  LINE_SHARE,
  PADDING_SHARE,
  REF_EM,
  STRETCH_MAX,
  STRETCH_MIN,
} from './limits';
import { DEFAULT_CENTER, STYLES, type DateLabel, type StyleDef, type StyleId } from './styles';

export type Face = 'serif' | 'sans' | 'myeongjo' | 'gothic';
export const FACES: readonly Face[] = ['serif', 'sans', 'myeongjo', 'gothic'];
/** The HWP faces already served from /fonts/hwp/ (scripts/gen-hwp-fonts.mjs HWP_FAMILIES; D5). */
export const FACE_FAMILY: Record<Face, string> = {
  serif: 'Anolim HWP Serif',
  sans: 'Anolim HWP Sans',
  myeongjo: 'Anolim HWP Myeongjo',
  gothic: 'Anolim HWP Gothic',
};
/** The system face painted when the web face could not load (D5). */
export const FACE_GENERIC: Record<Face, 'serif' | 'sans-serif'> = { serif: 'serif', sans: 'sans-serif', myeongjo: 'serif', gothic: 'sans-serif' };

/** 가늘게 = 400; 보통 = 700; 굵게 = 700 plus a same-colour stroke (D5). */
export type Weight = 'light' | 'regular' | 'heavy';
export type Suffix = 'auto' | 'none' | 'in' | 'jiin';
export type Line = keyof typeof LINE_SHARE;
export type Script = 'hangul' | 'hanja' | 'latin';

export interface StampOptions {
  face: Face;
  weight: Weight;
  /** null = the style's own direction. */
  vertical: boolean | null;
  suffix: Suffix;
  line: Line;
  /** corp-round centre text (1-6 graphemes). */
  center: string;
  /** date-round top label. */
  label: DateLabel;
  /** date-round middle line, YYYY.MM.DD. */
  date: string;
}

export const DEFAULT_OPTIONS: StampOptions = {
  face: 'serif',
  weight: 'regular',
  vertical: null,
  suffix: 'auto',
  line: 'normal',
  center: DEFAULT_CENTER,
  label: '확인',
  date: '2026.01.01',
};

/** Ink box of `text` at REF_EM px, textAlign left, alphabetic baseline at (0, 0); left/ascent measured leftward/upward. */
export interface Ink {
  left: number;
  right: number;
  ascent: number;
  descent: number;
}
export type Measure = (text: string, face: Face, weight: 400 | 700) => Ink;

/** The region a glyph must stay inside (also used by the tests). */
export type Region =
  | { k: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { k: 'rect'; x: number; y: number; w: number; h: number; r: number }
  | { k: 'band'; cx: number; cy: number; r0: number; r1: number };

export type Shape =
  | { k: 'ellipse'; cx: number; cy: number; rx: number; ry: number; lw: number }
  | { k: 'rect'; x: number; y: number; w: number; h: number; r: number; lw: number }
  | { k: 'fill-rect'; x: number; y: number; w: number; h: number; r: number }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; lw: number };

export interface GlyphItem {
  text: string;
  face: Face;
  weight: 400 | 700;
  /** Stroke width in REF_EM px (0 = none). */
  stroke: number;
  /** Centre of the ink box, unit coordinates. */
  x: number;
  y: number;
  /** Rotation in radians (arc glyphs). */
  rot: number;
  /** Unit length per REF_EM px, horizontally and vertically (before the rotation). */
  sx: number;
  sy: number;
  /** fillText origin at REF_EM px that centres the ink on (0, 0). */
  dx: number;
  dy: number;
  /** Half the ink box (with stroke) in unit coordinates, before the rotation. */
  hw: number;
  hh: number;
  region: Region;
}

export interface StampLayout {
  style: StyleId;
  /** Frame size in unit coordinates; the long edge is 1. */
  w: number;
  h: number;
  shapes: Shape[];
  glyphs: GlyphItem[];
  /** square-inverse: glyphs are cut out of the filled shape (destination-out). */
  cut: boolean;
}

export type LayoutResult = { ok: true; layout: StampLayout } | { ok: false; reason: 'empty' | 'too-long' };

// ---------- text ----------

const HANGUL = /^[\uAC00-\uD7A3]$/u;
// CJK unified, plus the two KS X 1001 compatibility ideographs normalize() keeps (below).
const HANJA = /^[\u4E00-\u9FFF\uF92C\uF9B8]$/u;
const LATIN = /^[A-Za-z0-9]$/;
const SYMBOL = /^[·&()\-.]$/u;

export const isHanja = (g: string): boolean => HANJA.test(g);
const isLetter = (g: string): boolean => HANGUL.test(g) || HANJA.test(g) || LATIN.test(g);

/**
 * KS X 1001 D2AB and E7E6 are compatibility ideographs (U+F92C, U+F9B8) whose NFC forms U+90CE / U+96B8 are in neither Noto KR
 * face, while the compatibility code points are (probe e, measured over the fontsource slices 2026-10-15): keep those two.
 */
const NFC_KEEP: Record<string, string> = { '\u90CE': '\uF92C', '\u96B8': '\uF9B8' };
/** Hanja Noto Sans KR does not have (probe e): painted in Noto Serif KR. */
const SANS_GAPS = new Set(['\u9699']);

/** NFC (compatibility ideographs -> unified), trimmed; whitespace dropped, or collapsed to one space where kept (D4). */
export function normalize(raw: string, keepSpaces: boolean): string {
  const s = raw.normalize('NFC').replace(/[\u90CE\u96B8]/gu, (c) => NFC_KEEP[c]!);
  return keepSpaces ? s.replace(/\s+/gu, ' ').trim() : s.replace(/\s+/gu, '');
}

const segmenter: { segment(s: string): Iterable<{ segment: string }> } | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;

/** User-perceived characters (Intl.Segmenter; code points where it is missing). */
export function graphemes(s: string, seg = segmenter): string[] {
  if (!seg) return Array.from(s);
  return Array.from(seg.segment(s), (x) => x.segment);
}

/** The first grapheme no stamp takes (D4: Hangul syllables, CJK unified, A-Z a-z 0-9, · & ( ) - .), or null. */
export function badChar(raw: string): string | null {
  for (const g of graphemes(normalize(raw, true))) {
    if (g === ' ') continue;
    if (!isLetter(g) && !SYMBOL.test(g)) return g;
  }
  return null;
}

/** hanja when every letter is Hanja; latin when every letter is A-Z a-z 0-9 (or there is none); else hangul (D4). */
export function scriptOf(gs: readonly string[]): Script {
  const letters = gs.filter(isLetter);
  if (!letters.length || letters.every((g) => LATIN.test(g))) return 'latin';
  if (letters.every(isHanja)) return 'hanja';
  return 'hangul';
}

const lines = (gs: readonly string[]): number => gs.filter((g) => g !== ' ').length;

/** The 인 / 지인 (印 / 之印) graphemes added to a square grid (D4). */
export function suffixFor(def: StyleDef, gs: readonly string[], mode: Suffix): string[] {
  if (!def.suffix || mode === 'none') return [];
  const script = scriptOf(gs);
  const one = script === 'hanja' ? ['印'] : ['인'];
  const two = script === 'hanja' ? ['之', '印'] : ['지', '인'];
  if (mode === 'in') return one;
  if (mode === 'jiin') return two;
  if (script === 'latin') return [];
  const n = lines(gs);
  let add: string[];
  if (def.kind === 'corp') {
    const side = Math.ceil(Math.sqrt(n));
    add = n === side * side ? [] : n + 2 <= side * side ? two : one;
  } else add = n === 3 ? one : n === 2 ? two : [];
  return n + add.length <= (def.maxCells ?? Infinity) ? add : [];
}

/** The face a grapheme is painted in: Hanja in a Nanum face goes to its Noto counterpart (D5, Nanum has no Hanja); a Hanja the Sans face lacks goes to Serif. */
export function faceFor(face: Face, g: string): Face {
  if (!isHanja(g)) return face;
  if ((face === 'sans' || face === 'gothic') && SANS_GAPS.has(g)) return 'serif';
  return face === 'myeongjo' ? 'serif' : face === 'gothic' ? 'sans' : face;
}

/** The CSS font of a face (the generic family follows, so a missing web face falls back to the same system face). */
export function fontOf(face: Face, weight: 400 | 700, px: number): string {
  return `${weight} ${px}px "${FACE_FAMILY[face]}", ${FACE_GENERIC[face]}`;
}

/** The em box: the ink box where a browser gives no actualBoundingBox* (D4 / probe b). */
export function emInk(width: number): Ink {
  return { left: 0, right: width, ascent: REF_EM * 0.88, descent: REF_EM * 0.12 };
}

// ---------- grid ----------

/** How many lines (columns when vertical, rows when horizontal) a style uses for n cells. */
export function lineCount(style: StyleId, n: number, vertical: boolean): number {
  if (n <= 1) return 1;
  switch (style) {
    case 'round':
    case 'round-double':
    case 'corp-round':
      return vertical ? (n <= 3 ? 1 : n === 4 ? 2 : 3) : n <= 3 ? 1 : 2;
    case 'oval':
      return vertical ? (n <= 4 ? 1 : 2) : n <= 2 ? 1 : 2;
    case 'square-seal':
    case 'square-round':
    case 'square-inverse':
      return vertical ? (n <= 4 ? 2 : 3) : n <= 2 ? 1 : n <= 4 ? 2 : 3;
    case 'corp-square':
      return Math.ceil(Math.sqrt(n));
    default:
      return 1;
  }
}

/** n cells over k lines, the first lines (right column / top row) holding the extra one. */
export function distribute(n: number, k: number): number[] {
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Splits graphemes into lines in reading order: vertical = column-major right->left, horizontal = row-major. */
export function toLines(gs: readonly string[], k: number, counts: readonly number[] = distribute(gs.length, k)): string[][] {
  const out: string[][] = [];
  let i = 0;
  for (const c of counts) {
    out.push(gs.slice(i, i + c));
    i += c;
  }
  return out;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const cellWeight = (g: string): number => (g === ' ' ? 0.5 : 1);

/**
 * Fits one line of glyphs into its cells with one common scale (D4: a name keeps an even size); the stretch stays inside
 * [STRETCH_MIN, STRETCH_MAX]. `cells[j]` is the box of gs[j].
 */
function fitLine(gs: readonly string[], cells: readonly Box[], o: StampOptions, measure: Measure, region: Region): GlyphItem[] {
  const weight = o.weight === 'light' ? 400 : 700;
  const stroke = o.weight === 'heavy' ? REF_EM * HEAVY_STROKE_SHARE : 0;
  const inks = gs.map((g) => (g === ' ' ? null : measure(g, faceFor(o.face, g), weight)));
  let sx = Infinity;
  let sy = Infinity;
  gs.forEach((g, j) => {
    const ink = inks[j];
    if (!ink) return;
    const w = Math.max(ink.left + ink.right, REF_EM * 0.05) + stroke;
    const h = Math.max(ink.ascent + ink.descent, REF_EM * 0.05) + stroke;
    sx = Math.min(sx, (cells[j]!.w * CELL_FILL) / w);
    sy = Math.min(sy, (cells[j]!.h * CELL_FILL) / h);
  });
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return [];
  if (sx / sy > STRETCH_MAX) sx = sy * STRETCH_MAX;
  if (sx / sy < STRETCH_MIN) sy = sx / STRETCH_MIN;
  const out: GlyphItem[] = [];
  gs.forEach((g, j) => {
    const ink = inks[j];
    if (!ink) return;
    const c = cells[j]!;
    const w = Math.max(ink.left + ink.right, REF_EM * 0.05) + stroke;
    const h = Math.max(ink.ascent + ink.descent, REF_EM * 0.05) + stroke;
    out.push({
      text: g,
      face: faceFor(o.face, g),
      weight,
      stroke,
      x: c.x + c.w / 2,
      y: c.y + c.h / 2,
      rot: 0,
      sx,
      sy,
      dx: -(ink.right - ink.left) / 2,
      dy: (ink.ascent - ink.descent) / 2,
      hw: (sx * w) / 2,
      hh: (sy * h) / 2,
      region,
    });
  });
  return out;
}

/** Lays `gs` out in `box` as `k` lines (vertical: columns right->left; horizontal: rows top->bottom). */
function fitGrid(gs: readonly string[], k: number, vertical: boolean, box: Box, o: StampOptions, measure: Measure, region: Region, counts?: readonly number[]): GlyphItem[] {
  const out: GlyphItem[] = [];
  toLines(gs, k, counts).forEach((line, i) => {
    const total = line.reduce((s, g) => s + cellWeight(g), 0);
    const cells: Box[] = [];
    let at = 0;
    for (const g of line) {
      const share = cellWeight(g) / total;
      if (vertical) {
        const w = box.w / k;
        cells.push({ x: box.x + box.w - (i + 1) * w, y: box.y + at * box.h, w, h: share * box.h });
      } else {
        const h = box.h / k;
        cells.push({ x: box.x + at * box.w, y: box.y + i * h, w: share * box.w, h });
      }
      at += share;
    }
    out.push(...fitLine(line, cells, o, measure, region));
  });
  return out;
}

/** Preferred cell width / height inside round and oval frames (slightly tall: the seal look). */
const ROUND_CELL = 0.85;

/** The text box of `k` lines of up to `m` cells, inscribed in an ellipse (rx, ry) around (cx, cy). */
function inscribed(cx: number, cy: number, rx: number, ry: number, k: number, m: number, vertical: boolean): Box {
  const a = vertical ? (k * ROUND_CELL) / m : (m * ROUND_CELL) / k;
  const by = 1 / Math.sqrt((a / rx) ** 2 + (1 / ry) ** 2);
  const bx = a * by;
  return { x: cx - bx, y: cy - by, w: 2 * bx, h: 2 * by };
}

function maxPerLine(n: number, k: number): number {
  return Math.ceil(n / k);
}

/** Text laid out inside an ellipse (round, round-double, oval, the corp-round centre). */
function inEllipse(style: StyleId, gs: readonly string[], vertical: boolean, cx: number, cy: number, rx: number, ry: number, o: StampOptions, measure: Measure): GlyphItem[] {
  const k = lineCount(style, gs.length, vertical);
  const box = inscribed(cx, cy, rx, ry, k, maxPerLine(gs.length, k), vertical);
  return fitGrid(gs, k, vertical, box, o, measure, { k: 'ellipse', cx, cy, rx, ry });
}

/** The arc of corp-round: centred on the top, tangent-rotated, span = min(300°, n × step) (D4). */
function onArc(gs: readonly string[], cx: number, cy: number, r0: number, r1: number, o: StampOptions, measure: Measure): GlyphItem[] {
  const weight = o.weight === 'light' ? 400 : 700;
  const stroke = o.weight === 'heavy' ? REF_EM * HEAVY_STROKE_SHARE : 0;
  const units = gs.reduce((s, g) => s + cellWeight(g), 0);
  // A glyph about as wide as the band is tall, with 15 % air between neighbours.
  const natural = 2 * Math.atan(((r1 - r0) / 2 / r0) * 1.15);
  const step = Math.min(natural, ((ARC_MAX_DEG * Math.PI) / 180) / units);
  // Box half-width the neighbours allow at the band's inner edge, then the height that keeps its outer corners inside r1.
  const hwMax = r0 * Math.tan(step / 2) * CELL_FILL;
  const cellH = Math.sqrt(r1 * r1 - hwMax * hwMax) - r0;
  const rc = r0 + cellH / 2;
  const inks = gs.map((g) => (g === ' ' ? null : measure(g, faceFor(o.face, g), weight)));
  let sx = Infinity;
  let sy = Infinity;
  for (const ink of inks) {
    if (!ink) continue;
    sx = Math.min(sx, (2 * hwMax) / (Math.max(ink.left + ink.right, REF_EM * 0.05) + stroke));
    sy = Math.min(sy, (cellH * CELL_FILL) / (Math.max(ink.ascent + ink.descent, REF_EM * 0.05) + stroke));
  }
  if (!Number.isFinite(sx)) return [];
  if (sx / sy > STRETCH_MAX) sx = sy * STRETCH_MAX;
  if (sx / sy < STRETCH_MIN) sy = sx / STRETCH_MIN;
  const span = step * units;
  const region: Region = { k: 'band', cx, cy, r0, r1 };
  const out: GlyphItem[] = [];
  let at = 0;
  gs.forEach((g, j) => {
    const wgt = cellWeight(g);
    const theta = -Math.PI / 2 - span / 2 + step * (at + wgt / 2);
    at += wgt;
    const ink = inks[j];
    if (!ink) return;
    const w = Math.max(ink.left + ink.right, REF_EM * 0.05) + stroke;
    const h = Math.max(ink.ascent + ink.descent, REF_EM * 0.05) + stroke;
    out.push({
      text: g,
      face: faceFor(o.face, g),
      weight,
      stroke,
      x: cx + rc * Math.cos(theta),
      y: cy + rc * Math.sin(theta),
      rot: theta + Math.PI / 2,
      sx,
      sy,
      dx: -(ink.right - ink.left) / 2,
      dy: (ink.ascent - ink.descent) / 2,
      hw: (sx * w) / 2,
      hh: (sy * h) / 2,
      region,
    });
  });
  return out;
}

// ---------- styles ----------

/** The graphemes a style paints from typed text (spaces dropped, or kept as one, per style). */
export function textOf(style: StyleId, raw: string): string[] {
  return graphemes(normalize(raw, STYLES[style].keepSpaces));
}

/** Whether `raw` fits the style (D3 per-style maximum, and the cell maximum after the suffix). */
export function fits(style: StyleId, raw: string, suffix: Suffix): boolean {
  const def = STYLES[style];
  const gs = textOf(style, raw);
  const n = lines(gs);
  if (n > def.max) return false;
  return n + suffixFor(def, gs, suffix).length <= (def.maxCells ?? Infinity);
}

/** Line width of a style in unit coordinates (D4: share of the short edge; square-seal draws a thick line). */
function lineWidth(style: StyleId, line: Line, short: number): number {
  return LINE_SHARE[line] * short * (style === 'square-seal' ? 1.3 : 1);
}

/** The frame and text of one style. `raw` is the typed text (name or company name). */
export function layoutStamp(style: StyleId, raw: string, o: StampOptions, measure: Measure): LayoutResult {
  const def = STYLES[style];
  const typed = textOf(style, raw);
  const n = lines(typed);
  if (!n) return { ok: false, reason: 'empty' };
  if (!fits(style, raw, o.suffix)) return { ok: false, reason: 'too-long' };
  const vertical = def.orient && o.vertical !== null ? o.vertical : def.vertical;
  const gs = [...typed, ...suffixFor(def, typed, o.suffix)];

  if (style === 'plain') {
    // Square cells along the text (a space is half a cell), the padding around it.
    const along = gs.reduce((s, g) => s + cellWeight(g), 0);
    const pad = PADDING_SHARE;
    const long = along + 2 * pad;
    const short = 1 + 2 * pad;
    const w = vertical ? short / long : 1;
    const h = vertical ? 1 : short / long;
    const p = pad / long;
    const box = { x: p, y: p, w: w - 2 * p, h: h - 2 * p };
    const region: Region = { k: 'rect', x: 0, y: 0, w, h, r: 0 };
    return { ok: true, layout: { style, w, h, shapes: [], glyphs: fitGrid(gs, 1, vertical, box, o, measure, region), cut: false } };
  }

  const w = def.aspect >= 1 ? 1 : def.aspect;
  const h = def.aspect >= 1 ? 1 / def.aspect : 1;
  const short = Math.min(w, h);
  const lw = lineWidth(style, o.line, short);
  const pad = PADDING_SHARE * short;
  const cx = w / 2;
  const cy = h / 2;
  const shapes: Shape[] = [];
  let glyphs: GlyphItem[] = [];

  switch (style) {
    case 'round':
    case 'oval': {
      shapes.push({ k: 'ellipse', cx, cy, rx: w / 2 - lw / 2, ry: h / 2 - lw / 2, lw });
      glyphs = inEllipse(style, gs, vertical, cx, cy, w / 2 - lw - pad, h / 2 - lw - pad, o, measure);
      break;
    }
    case 'round-double': {
      const r = 0.5 - lw / 2;
      const lwIn = lw * INNER_RING_SHARE;
      const rIn = 0.5 - lw - lw * 0.8 - lwIn / 2;
      shapes.push({ k: 'ellipse', cx, cy, rx: r, ry: r, lw }, { k: 'ellipse', cx, cy, rx: rIn, ry: rIn, lw: lwIn });
      const rt = rIn - lwIn / 2 - pad;
      glyphs = inEllipse(style, gs, vertical, cx, cy, rt, rt, o, measure);
      break;
    }
    case 'square-seal':
    case 'square-round':
    case 'square-inverse':
    case 'rect-v':
    case 'rect-h':
    case 'corp-square': {
      const corner = style === 'square-round' ? 0.18 * short : 0;
      if (style === 'square-inverse') shapes.push({ k: 'fill-rect', x: 0, y: 0, w, h, r: 0 });
      else shapes.push({ k: 'rect', x: lw / 2, y: lw / 2, w: w - lw, h: h - lw, r: Math.max(0, corner - lw / 2), lw });
      // A rounded corner takes room from the grid's corner cells: inset a little more there.
      const inset = lw + pad + (corner ? corner * (1 - Math.SQRT1_2) : 0);
      const box = { x: inset, y: inset, w: w - 2 * inset, h: h - 2 * inset };
      const k = style === 'rect-v' || style === 'rect-h' ? 1 : lineCount(style, gs.length, vertical);
      const region: Region = { k: 'rect', x: lw, y: lw, w: w - 2 * lw, h: h - 2 * lw, r: Math.max(0, corner - lw) };
      // A personal 3-glyph seal with no suffix: the surname alone in the right column (tall), the given name on the left
      // (홍 | 길동), as seal makers cut it. A company name (corp-square) reads straight through.
      const counts = def.kind === 'personal' && vertical && k === 2 && gs.length === 3 ? [1, 2] : undefined;
      glyphs = fitGrid(gs, k, vertical, box, o, measure, region, counts);
      break;
    }
    case 'corp-round': {
      const r = 0.5 - lw / 2;
      const lwIn = lw * INNER_RING_SHARE * 1.5;
      // The inner ring at about half the radius leaves a band wide enough for a readable company name.
      const rIn = 0.26;
      shapes.push({ k: 'ellipse', cx, cy, rx: r, ry: r, lw }, { k: 'ellipse', cx, cy, rx: rIn, ry: rIn, lw: lwIn });
      const r0 = rIn + lwIn / 2 + pad * 0.25;
      const r1 = 0.5 - lw - pad * 0.25;
      glyphs = onArc(gs, cx, cy, r0, r1, o, measure);
      const centre = graphemes(normalize(o.center, false));
      if (centre.length) {
        const rt = rIn - lwIn / 2 - pad * 0.6;
        glyphs.push(...inEllipse('corp-round', centre, true, cx, cy, rt, rt, o, measure));
      }
      break;
    }
    case 'date-round': {
      const r = 0.5 - lw / 2;
      shapes.push({ k: 'ellipse', cx, cy, rx: r, ry: r, lw });
      const lwC = lw * 0.6;
      const d = 0.15;
      const half = Math.sqrt(r * r - d * d);
      shapes.push({ k: 'line', x1: cx - half, y1: cy - d, x2: cx + half, y2: cy - d, lw: lwC }, { k: 'line', x1: cx - half, y1: cy + d, x2: cx + half, y2: cy + d, lw: lwC });
      const rt = 0.5 - lw - pad * 0.5;
      const inner = d + lwC / 2 + pad * 0.4;
      const segH = (rt - inner) * 0.62;
      const segHalf = Math.sqrt(rt * rt - (inner + segH) ** 2);
      const region: Region = { k: 'ellipse', cx, cy, rx: rt, ry: rt };
      const top = { x: cx - segHalf, y: cy - inner - segH, w: 2 * segHalf, h: segH };
      const bottom = { x: cx - segHalf, y: cy + inner, w: 2 * segHalf, h: segH };
      const midH = d - lwC / 2 - pad * 0.4;
      const midHalf = Math.sqrt(rt * rt - midH * midH);
      const mid = { x: cx - midHalf, y: cy - midH, w: 2 * midHalf, h: 2 * midH };
      glyphs = [
        ...fitGrid(graphemes(o.label), 1, false, top, o, measure, region),
        ...fitLine([o.date], [mid], o, measure, region),
        ...fitGrid(gs, 1, false, bottom, o, measure, region),
      ];
      break;
    }
  }
  return { ok: true, layout: { style, w, h, shapes, glyphs, cut: style === 'square-inverse' } };
}

/** Today in local time as YYYY.MM.DD (date-round default). */
export function todayDot(now = new Date()): string {
  const p = (v: number): string => String(v).padStart(2, '0');
  return `${now.getFullYear()}.${p(now.getMonth() + 1)}.${p(now.getDate())}`;
}

/** input[type=date] value (YYYY-MM-DD) -> YYYY.MM.DD, or null when it is not a date. */
export function dotDate(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}
