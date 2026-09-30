// The document faces as PDF fonts (SPIKE-HWP-DIRECT §6.2 "faces.ts"). Pure: resolves (font-family chain,
// weight, code point) to one unicode-range slice the way the browser's font matching does for the preview.
// The face list comes from the build (scripts/gen-hwp-fonts.mjs → /fonts/hwp/hwp-pdf-faces.*.json), in
// resolution order; loading a face is injected (font-source.ts in the browser, a file read in tests).
import { FAMILY, pick } from '../svg-string';

export interface FaceDef {
  family: string;
  weight: number;
  /** Same-origin URL of the .woff slice. */
  url: string;
  /** CSS unicode-range, or null for the whole face. */
  range: string | null;
}

/** The part of a fontkit font the writer uses. */
export interface FontMetrics {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  numGlyphs: number;
  hasGlyphForCodePoint(cp: number): boolean;
}

export interface LoadedFace {
  def: FaceDef;
  font: FontMetrics;
  /** TrueType/OpenType bytes for embedding (unwrapped from the .woff). */
  sfnt: Uint8Array;
  /** The .woff as fetched (the raster fallback inlines it as a data: @font-face). */
  woff: Uint8Array;
}

export interface Resolved {
  face: LoadedFace;
  /** Weight ≥ 600 wanted but the family has no 700 face: the writer strokes the glyph (Tr 2). */
  synthBold: boolean;
}

export type Range = [number, number];

/** The face list as scripts/gen-hwp-fonts.mjs writes it: faces are [family, weight, folder, file, range] indexes. */
export interface PackedFaces {
  families: string[];
  dirs: string[];
  ranges: string[];
  faces: [number, number, number, string, number][];
}

export function unpackFaces(p: PackedFaces): FaceDef[] {
  return p.faces.map(([f, weight, d, file, r]) => ({ family: p.families[f] ?? '', weight, url: `${p.dirs[d] ?? ''}${file}`, range: r < 0 ? null : (p.ranges[r] ?? null) }));
}

/** CSS unicode-range → inclusive code point ranges (single, a-b, and U+4?? wildcards). null = everything. */
export function parseRanges(s: string | null): Range[] {
  if (!s) return [[0, 0x10ffff]];
  const out: Range[] = [];
  for (const part of s.split(',')) {
    const t = part.trim().replace(/^U\+/i, '');
    if (!t) continue;
    let r: Range;
    if (t.includes('?')) r = [parseInt(t.replace(/\?/g, '0'), 16), parseInt(t.replace(/\?/g, 'F'), 16)];
    else if (t.includes('-')) {
      const [a = '', b = ''] = t.split('-');
      r = [parseInt(a, 16), parseInt(b, 16)];
    } else r = [parseInt(t, 16), parseInt(t, 16)];
    if (Number.isFinite(r[0]) && Number.isFinite(r[1])) out.push(r);
  }
  return out;
}

/** Hancom private-use symbols: no font renders them (the print path showed nothing either); never "missing". */
export function isPua(cp: number): boolean {
  return (cp >= 0xe000 && cp <= 0xf8ff) || cp >= 0xf0000;
}

const GENERIC: Record<string, string> = { serif: FAMILY.serif, 'sans-serif': FAMILY.sans };
/** Tried after the chain, as the browser would reach a system font. */
const LAST_RESORT = [FAMILY.fallback, FAMILY.sans, FAMILY.serif];

interface Entry {
  def: FaceDef;
  ranges: Range[];
}

export class FaceTable {
  /** Code point → times no bundled face had it (PUA excluded). */
  readonly missing = new Map<number, number>();
  private readonly byFamily = new Map<string, Entry[]>();
  private readonly loaded = new Map<string, Promise<LoadedFace | null>>();
  private readonly cache = new Map<string, Resolved | null>();

  constructor(
    defs: FaceDef[],
    private readonly load: (def: FaceDef) => Promise<LoadedFace | null>,
  ) {
    for (const def of defs) {
      let a = this.byFamily.get(def.family);
      if (!a) this.byFamily.set(def.family, (a = []));
      a.push({ def, ranges: parseRanges(def.range) });
    }
  }

  /** Our families named by a font-family chain, in order. A chain naming none of them (an SVG picture's 바탕,
   * Malgun Gothic…) goes through the page mapping pick(). */
  families(chain: string): string[] {
    const own = chain
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .map((s) => GENERIC[s] ?? s)
      .filter((s) => this.byFamily.has(s));
    if (chain.includes('Anolim') || chain.includes('Pretendard')) return [...new Set(own)];
    return [...new Set([...own, ...this.families(pick(chain).family)])];
  }

  private face(def: FaceDef): Promise<LoadedFace | null> {
    let p = this.loaded.get(def.url);
    if (!p) {
      p = this.load(def).catch(() => null);
      this.loaded.set(def.url, p);
    }
    return p;
  }

  /** The face for one code point, or null (counted in `missing` unless it is a private-use code point). */
  async resolve(chain: string, weight: number, cp: number): Promise<Resolved | null> {
    if (isPua(cp)) return null;
    const want = weight >= 600 ? 700 : 400;
    const key = `${chain}|${want}|${cp}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const fams = this.families(chain);
    for (const extra of LAST_RESORT) if (!fams.includes(extra)) fams.push(extra);
    let found: Resolved | null = null;
    outer: for (const fam of fams) {
      const all = this.byFamily.get(fam);
      if (!all) continue;
      const hasWant = all.some((e) => e.def.weight === want);
      // A family without the wanted weight (the fallback faces declare 100–900 or only 400): any of its faces.
      for (const e of all) {
        if (hasWant && e.def.weight !== want) continue;
        if (!e.ranges.some(([a, b]) => cp >= a && cp <= b)) continue;
        const lf = await this.face(e.def);
        if (!lf || !lf.font.hasGlyphForCodePoint(cp)) continue;
        found = { face: lf, synthBold: want === 700 && !hasWant };
        break outer;
      }
    }
    if (!found) this.missing.set(cp, (this.missing.get(cp) ?? 0) + 1);
    this.cache.set(key, found);
    return found;
  }
}
