// SPIKE-HWP-DIRECT: the document faces as PDF fonts. Parses the production @font-face CSS (hwp-fonts.<hash>.css:
// Noto Serif/Sans KR, Nanum Myeongjo/Gothic, the fallback subset) plus the static Pretendard Regular/Bold
// dynamic subset (for 'Pretendard Variable', whose default instance is not the 400/700 the browser picks), and
// resolves (font-family chain, weight, code point) to one unicode-range slice, as the browser's font matching
// does. Slices are fetched from our own origin (the same files the viewer loads) and parsed with fontkit.
import fontkit from '@cantoo/fontkit';
import hwpFonts from '../../../src/generated/hwp-fonts.json';
import { woffToSfnt } from '../woff.mjs';
import { pick } from '../../../src/lib/hwp/svg-string';
import { FACES as FALLBACK_EXT, rangeCss } from '../fallback-faces.mjs';

/**
 * @cantoo/fontkit's subsetter writes empty/broken outlines when the source is WOFF2 (measured: every glyph
 * invisible or a box). The PDF path therefore reads the WOFF 1.0 sibling of each slice and unwraps it to
 * TrueType (woffToSfnt, ~40 lines, fflate). Production: ship the .woff siblings next to the .woff2 slices.
 */
export function woffSibling(url: string): string {
  const root = '/@fs/' + String((globalThis as any).ROOT);
  const u = new URL(url);
  const m = /\/fonts\/hwp\/([a-z-]+)@[^/]+\/([^/]+)\.woff2$/.exec(u.pathname);
  if (/\/fb-[a-z0-9]+\.woff2$/.test(u.pathname)) return url.replace(/\.woff2$/, '.woff');
  if (m && m[1] === 'fallback') return `${root}/regress-out/direct/anolim-hwp-fallback.woff`;
  if (m) return `${root}/node_modules/@fontsource/${m[1]}/files/${m[2]}.woff`;
  return url.replace('/woff2-dynamic-subset/', '/woff-dynamic-subset/').replace(/\.woff2$/, '.woff');
}

export interface FaceDef {
  family: string;
  weight: number;
  url: string;
  ranges: [number, number][];
  range: string | null;
}

export interface LoadedFace {
  def: FaceDef;
  /** The .woff2 slice as shipped (raster @font-face). */
  bytes: Uint8Array;
  fk: any;
  /** TrueType for PDF embedding (lazy; from the .woff sibling). */
  ttf?: Promise<Uint8Array>;
  /** Requested weight ≥ 600 but the family has no 700 face: synthesise bold. */
  synthBold?: boolean;
}

export function parseRanges(s: string | null): [number, number][] {
  if (!s) return [[0, 0x10ffff]];
  const out: [number, number][] = [];
  for (const part of s.split(',')) {
    const t = part.trim().replace(/^U\+/i, '');
    if (!t) continue;
    if (t.includes('?')) out.push([parseInt(t.replace(/\?/g, '0'), 16), parseInt(t.replace(/\?/g, 'F'), 16)]);
    else if (t.includes('-')) {
      const [a, b] = t.split('-');
      out.push([parseInt(a, 16), parseInt(b, 16)]);
    } else out.push([parseInt(t, 16), parseInt(t, 16)]);
  }
  return out;
}

export function parseFaceCss(css: string, base: string, rename?: (f: string) => string, weights?: number[]): FaceDef[] {
  const out: FaceDef[] = [];
  for (const block of css.split('@font-face').slice(1)) {
    const fam = /font-family:\s*([^;}]+)/.exec(block)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
    const w = Number(/font-weight:\s*(\d+)/.exec(block)?.[1] ?? 400);
    const src = /url\(\s*['"]?([^'")]+\.woff2)['"]?\s*\)/.exec(block)?.[1];
    const range = /unicode-range:\s*([^;}]+)/.exec(block)?.[1] ?? null;
    if (!fam || !src) continue;
    if (weights && !weights.includes(w)) continue;
    out.push({ family: rename ? rename(fam) : fam, weight: w, url: new URL(src, base).href, ranges: parseRanges(range), range });
  }
  return out;
}

const GENERIC: Record<string, string> = { serif: 'Anolim HWP Serif', 'sans-serif': 'Anolim HWP Sans' };

export class FontBook {
  faces: FaceDef[] = [];
  private byFamily = new Map<string, FaceDef[]>();
  private loaded = new Map<string, Promise<LoadedFace | null>>();
  private cache = new Map<string, LoadedFace | null>();
  fetchedBytes = 0;
  missing = new Map<number, number>();

  static async create(opts: { pretendardCss?: string } = {}): Promise<FontBook> {
    const fb = new FontBook();
    const cssUrl = new URL(hwpFonts.css, location.href).href;
    const css = await (await fetch(cssUrl)).text();
    fb.faces.push(...parseFaceCss(css, cssUrl));
    if (opts.pretendardCss) {
      const u = new URL(opts.pretendardCss, location.href).href;
      const p = await (await fetch(u)).text();
      fb.faces.push(...parseFaceCss(p, u, () => 'Pretendard Variable', [400, 700]));
    }
    // Extended fallback faces (gen-fallback-ext.mjs): the symbol blocks the four families lack.
    for (const f of FALLBACK_EXT) fb.faces.push({ family: 'Anolim HWP Fallback', weight: 400, url: new URL(`/@fs/${String((globalThis as any).ROOT)}/regress-out/direct/fonts/fb-${f.id}.woff2`, location.href).href, ranges: f.ranges, range: rangeCss(f.ranges) });
    for (const f of fb.faces) {
      let a = fb.byFamily.get(f.family);
      if (!a) fb.byFamily.set(f.family, (a = []));
      a.push(f);
    }
    return fb;
  }

  families(chain: string): string[] {
    return chain
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .map((s) => GENERIC[s] ?? s)
      .filter((s) => this.byFamily.has(s))
      // A chain with none of our families (an SVG picture naming 바탕, Malgun Gothic…): the page mapping.
      .concat(chain.includes('Anolim') || chain.includes('Pretendard') ? [] : this.families(pick(chain).family));
  }

  private load(def: FaceDef): Promise<LoadedFace | null> {
    let p = this.loaded.get(def.url);
    if (!p) {
      p = (async () => {
        try {
          const r = await fetch(def.url);
          if (!r.ok) return null;
          const bytes = new Uint8Array(await r.arrayBuffer());
          this.fetchedBytes += bytes.length;
          const lf: LoadedFace = { def, bytes, fk: fontkit.create(bytes as any) };
          (p as any).__face = lf;
          return lf;
        } catch {
          return null;
        }
      })();
      this.loaded.set(def.url, p);
    }
    return p;
  }

  ttfOf(face: LoadedFace): Promise<Uint8Array> {
    const base = (this.loaded.get(face.def.url) as any).__face as LoadedFace | undefined;
    const holder = base ?? face;
    if (!holder.ttf)
      holder.ttf = (async () => {
        const r = await fetch(woffSibling(face.def.url));
        if (!r.ok) throw new Error(`woff sibling ${r.status} ${face.def.url}`);
        const w = new Uint8Array(await r.arrayBuffer());
        this.pdfFetchedBytes += w.length;
        return woffToSfnt(w);
      })();
    return holder.ttf;
  }
  pdfFetchedBytes = 0;

  /** The face for one code point, or null (counted in `missing`). */
  async resolve(chain: string, weight: number, cp: number): Promise<LoadedFace | null> {
    const want = weight >= 600 ? 700 : 400;
    const key = `${chain}|${want}|${cp}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    let found: LoadedFace | null = null;
    const fams = this.families(chain);
    // Generic fallbacks last, as the browser would reach a system font: Noto Sans KR, then Noto Serif KR.
    for (const extra of ['Anolim HWP Fallback', 'Anolim HWP Sans', 'Anolim HWP Serif']) if (!fams.includes(extra)) fams.push(extra);
    outer: for (const fam of fams) {
      const all = this.byFamily.get(fam)!;
      const hasWant = all.some((f) => f.weight === want);
      // A family without the wanted weight (the fallback faces declare 100–900 or only 400): any of its faces.
      for (const def of all) {
        if (hasWant && def.weight !== want) continue;
        if (!def.ranges.some(([a, b]) => cp >= a && cp <= b)) continue;
        const lf = await this.load(def);
        if (!lf || !lf.fk.hasGlyphForCodePoint(cp)) continue;
        found = want === 700 && !hasWant ? { ...lf, synthBold: true } : lf;
        break outer;
      }
    }
    if (!found) this.missing.set(cp, (this.missing.get(cp) ?? 0) + 1);
    this.cache.set(key, found);
    return found;
  }

  /** Every face url with its unicode-range CSS for (family, weight) sets and chars (raster path). */
  async facesFor(chain: string, weight: number, chars: Iterable<string>): Promise<Set<LoadedFace>> {
    const out = new Set<LoadedFace>();
    for (const ch of chars) {
      const cp = ch.codePointAt(0)!;
      if (cp <= 32) continue;
      const f = await this.resolve(chain, weight, cp);
      if (f) out.add(f);
    }
    return out;
  }
}
