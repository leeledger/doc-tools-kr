// 도장 만들기 (STAMP1015 S1): text rules, grids, auto-fit, the arc, 인주 질감 and the pHYs chunk — pure modules, measured
// with the real HWP faces on @napi-rs/canvas (tests/helpers/stamp-fonts.ts).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@cantoo/fontkit';
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { INK_KEEP_MIN, applyInk, mulberry32 } from '../../src/tools/stamp-maker/ink';
import {
  DEFAULT_OPTIONS,
  badChar,
  distribute,
  dotDate,
  faceFor,
  fits,
  graphemes,
  layoutStamp,
  lineCount,
  normalize,
  scriptOf,
  suffixFor,
  todayDot,
  toLines,
  type GlyphItem,
  type Measure,
  type Region,
  type StampLayout,
  type StampOptions,
  type Suffix,
} from '../../src/tools/stamp-maker/layout';
import { PPI_1X, PPI_2X, SIZES_MM, STRETCH_MAX, STRETCH_MIN, mmToPx } from '../../src/tools/stamp-maker/limits';
import { crc32, ppiToPpm, readPhys, withPhys } from '../../src/tools/stamp-maker/png';
import { STYLES, STYLE_IDS, type StyleId } from '../../src/tools/stamp-maker/styles';
import { emMeasure, inkMeasure } from '../helpers/stamp-fonts';

const O = (more: Partial<StampOptions> = {}): StampOptions => ({ ...DEFAULT_OPTIONS, ...more });

function layout(style: StyleId, text: string, more: Partial<StampOptions> = {}, measure: Measure = inkMeasure): StampLayout {
  const r = layoutStamp(style, text, O(more), measure);
  if (!r.ok) throw new Error(`${style} ${text}: ${r.reason}`);
  return r.layout;
}

type P = [number, number];

/** The four corners of a glyph's ink box (with stroke), rotated. */
function corners(g: GlyphItem): P[] {
  const c = Math.cos(g.rot);
  const s = Math.sin(g.rot);
  return ([[-g.hw, -g.hh], [g.hw, -g.hh], [g.hw, g.hh], [-g.hw, g.hh]] as P[]).map(([x, y]) => [g.x + x * c - y * s, g.y + x * s + y * c]);
}

const EPS = 1e-9;

function inside(p: P, r: Region): boolean {
  const [x, y] = p;
  if (r.k === 'ellipse') return ((x - r.cx) / r.rx) ** 2 + ((y - r.cy) / r.ry) ** 2 <= 1 + EPS;
  if (r.k === 'band') {
    const d = Math.hypot(x - r.cx, y - r.cy);
    return d >= r.r0 - EPS && d <= r.r1 + EPS;
  }
  if (x < r.x - EPS || y < r.y - EPS || x > r.x + r.w + EPS || y > r.y + r.h + EPS) return false;
  // Rounded corners: a point in a corner square must be within r of that corner's centre.
  const qx = x < r.x + r.r ? r.x + r.r : x > r.x + r.w - r.r ? r.x + r.w - r.r : x;
  const qy = y < r.y + r.r ? r.y + r.r : y > r.y + r.h - r.r ? r.y + r.h - r.r : y;
  return Math.hypot(x - qx, y - qy) <= r.r + EPS;
}

function glyphInside(g: GlyphItem): boolean {
  const cs = corners(g);
  if (!cs.every((p) => inside(p, g.region))) return false;
  if (g.region.k === 'band') {
    // The box edge nearest the centre (its middle) must clear the inner ring too.
    const mid: P = [(cs[2]![0] + cs[3]![0]) / 2, (cs[2]![1] + cs[3]![1]) / 2];
    return inside(mid, g.region);
  }
  return true;
}

/** Separating-axis test of two (rotated) glyph boxes. */
function overlap(a: GlyphItem, b: GlyphItem): boolean {
  const pa = corners(a);
  const pb = corners(b);
  for (const poly of [pa, pb]) {
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = poly[i]!;
      const [x2, y2] = poly[(i + 1) % 4]!;
      const nx = y2 - y1;
      const ny = x1 - x2;
      const proj = (ps: P[]): [number, number] => {
        const v = ps.map(([x, y]) => x * nx + y * ny);
        return [Math.min(...v), Math.max(...v)];
      };
      const [a0, a1] = proj(pa);
      const [b0, b1] = proj(pb);
      if (a1 <= b0 + 1e-12 || b1 <= a0 + 1e-12) return false;
    }
  }
  return true;
}

const HANGUL = '홍길동김서윤박지민이도현최수아정하준강예린조민서';
const HANJA = '洪吉童金書允朴智敏李道賢崔秀雅鄭夏俊';
const LATIN = 'KIMLEEPARKjin2026';

const sample = (pool: string, n: number, from = 0): string => Array.from({ length: n }, (_, i) => Array.from(pool)[(from + i) % Array.from(pool).length]).join('');

describe('stamp-maker text rules (D4)', () => {
  it('NFC maps KS X 1001 compatibility ideographs to unified ones; whitespace dropped or collapsed', () => {
    expect(normalize('\uF900', false)).toBe('豈');
    expect(normalize('  홍 길\t동 ', false)).toBe('홍길동');
    expect(normalize('  문서딱   주식회사 ', true)).toBe('문서딱 주식회사');
    expect(graphemes('홍길동')).toEqual(['홍', '길', '동']);
    expect(graphemes('a\u0301b')).toEqual(['a\u0301', 'b']);
    expect(graphemes('홍길', null)).toEqual(['홍', '길']);
  });

  it('allowed: Hangul syllables, CJK unified, Latin, digits and · & ( ) - . ; emoji, lone jamo and others are named', () => {
    for (const ok of ['홍길동', '洪吉童', 'Kim 2', '(주)문서딱', 'A&B·C-D.', '豈']) expect(badChar(ok)).toBeNull();
    expect(badChar('홍\u{1F600}')).toBe('\u{1F600}');
    expect(badChar('ㄱ')).toBe('ㄱ');
    expect(badChar('\u1100')).toBe('\u1100');
    expect(badChar('홍*')).toBe('*');
    expect(badChar('e\u0301')).toBe('é');
    expect(badChar('\u{1F44D}\u{1F3FD}')).toBe('\u{1F44D}\u{1F3FD}');
    expect(badChar('가\u0300')).toBe('가\u0300');
  });

  it('script: all Hanja -> hanja; any Hangul or a mix -> hangul; Latin / digits only -> latin', () => {
    expect(scriptOf(graphemes('洪吉童'))).toBe('hanja');
    expect(scriptOf(graphemes('홍吉童'))).toBe('hangul');
    expect(scriptOf(graphemes('홍길동'))).toBe('hangul');
    expect(scriptOf(graphemes('KIM2'))).toBe('latin');
    expect(scriptOf(graphemes('.-'))).toBe('latin');
    expect(scriptOf(graphemes('(洪)'))).toBe('hanja');
  });

  it('suffix: 자동 adds 인 to 3 and 지인 to 2 (印 / 之印 for Hanja, none for Latin); 붙이지 않음 / 인 / 지인 as chosen', () => {
    const def = STYLES['square-seal'];
    const cases: Record<Suffix, (n: number, script: 'hangul' | 'hanja' | 'latin') => string[]> = {
      auto: (n, s) => (s === 'latin' ? [] : n === 3 ? (s === 'hanja' ? ['印'] : ['인']) : n === 2 ? (s === 'hanja' ? ['之', '印'] : ['지', '인']) : []),
      none: () => [],
      // Chosen explicitly it is always added; past the cell maximum the style says too-long (limits test).
      in: (_n, s) => (s === 'hanja' ? ['印'] : ['인']),
      jiin: (_n, s) => (s === 'hanja' ? ['之', '印'] : ['지', '인']),
    };
    for (let n = 1; n <= 9; n++) {
      for (const [script, pool] of [['hangul', HANGUL], ['hanja', HANJA], ['latin', 'KIMLEEPARK']] as const) {
        const gs = graphemes(sample(pool, n));
        for (const mode of ['auto', 'none', 'in', 'jiin'] as Suffix[]) expect(suffixFor(def, gs, mode), `${n} ${script} ${mode}`).toEqual(cases[mode](n, script));
      }
    }
    expect(suffixFor(STYLES.round, graphemes('홍길동'), 'in')).toEqual([]);
  });

  it('corp-square 자동: none when the count fills the grid, else 지인, or 인 when only one cell is left', () => {
    const def = STYLES['corp-square'];
    const at = (n: number): string => suffixFor(def, graphemes(sample(HANGUL, n)), 'auto').join('');
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 16].map(at)).toEqual(['', '지인', '인', '', '지인', '지인', '지인', '인', '', '지인', '인', '']);
    expect(suffixFor(def, graphemes('文書'), 'auto')).toEqual(['之', '印']);
  });

  it('per-glyph face: Hanja in a Nanum face is painted in its Noto counterpart (D5)', () => {
    expect(faceFor('myeongjo', '洪')).toBe('serif');
    expect(faceFor('gothic', '洪')).toBe('sans');
    expect(faceFor('myeongjo', '홍')).toBe('myeongjo');
    expect(faceFor('sans', '洪')).toBe('sans');
    const l = layout('round', '홍洪', { face: 'myeongjo' });
    expect(l.glyphs.map((g) => `${g.text}:${g.face}`)).toEqual(['홍:myeongjo', '洪:serif']);
  });

  it('limits: over the per-style maximum (or the cell maximum after the suffix) the style says too-long, never clips', () => {
    for (const id of STYLE_IDS) {
      const max = STYLES[id].max;
      const ok = layoutStamp(id, sample(HANGUL, max), O({ suffix: 'none' }), inkMeasure);
      expect(ok.ok, id).toBe(true);
      const over = layoutStamp(id, sample(HANGUL, max + 1), O({ suffix: 'none' }), inkMeasure);
      expect(over, id).toEqual({ ok: false, reason: 'too-long' });
    }
    expect(fits('square-seal', sample(HANGUL, 8), 'jiin')).toBe(false);
    expect(fits('square-seal', sample(HANGUL, 8), 'in')).toBe(true);
    expect(fits('round', sample(HANGUL, 7), 'auto')).toBe(false);
    expect(layoutStamp('round', '   ', O(), inkMeasure)).toEqual({ ok: false, reason: 'empty' });
  });

  it('dates: today local YYYY.MM.DD; input type=date values convert', () => {
    expect(todayDot(new Date(2026, 9, 5))).toBe('2026.10.05');
    expect(dotDate('2026-10-15')).toBe('2026.10.15');
    expect(dotDate('')).toBeNull();
  });
});

describe('stamp-maker grids (D3 / D4)', () => {
  it('line counts per style and n', () => {
    const v = (id: StyleId): number[] => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => lineCount(id, n, true));
    expect(v('round')).toEqual([1, 1, 1, 2, 3, 3, 3, 3, 3]);
    expect(v('oval')).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 2]);
    expect(v('square-seal')).toEqual([1, 2, 2, 2, 3, 3, 3, 3, 3]);
    expect([1, 4, 5, 9, 10, 16].map((n) => lineCount('corp-square', n, true))).toEqual([1, 2, 3, 3, 4, 4]);
    expect(distribute(7, 3)).toEqual([3, 2, 2]);
    expect(toLines(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']]);
  });

  it('사각 인감 홍길동 자동: 홍길동인, columns right->left, top->bottom', () => {
    const l = layout('square-seal', '홍길동');
    const at = Object.fromEntries(l.glyphs.map((g) => [g.text, g]));
    expect(l.glyphs.map((g) => g.text)).toEqual(['홍', '길', '동', '인']);
    expect(at['홍']!.x).toBeGreaterThan(at['동']!.x);
    expect(at['홍']!.x).toBeCloseTo(at['길']!.x, 9);
    expect(at['홍']!.y).toBeLessThan(at['길']!.y);
    expect(at['동']!.y).toBeLessThan(at['인']!.y);
    const none = layout('square-seal', '홍길동', { suffix: 'none' });
    expect(none.glyphs.map((g) => g.text)).toEqual(['홍', '길', '동']);
    // The single glyph of the left column is the tall one.
    const d = none.glyphs[2]!;
    expect(d.hh).toBeGreaterThan(none.glyphs[0]!.hh);
  });

  it('가로 toggle: rows top->bottom, left->right', () => {
    const l = layout('square-seal', '홍길동', { vertical: false });
    const [a, b, c, d] = l.glyphs;
    expect(a!.y).toBeCloseTo(b!.y, 9);
    expect(a!.x).toBeLessThan(b!.x);
    expect(c!.y).toBeGreaterThan(a!.y);
    expect(c!.x).toBeLessThan(d!.x);
    // Styles without the toggle keep their direction.
    const rv = layout('rect-v', '홍길동', { vertical: false });
    expect(rv.glyphs[0]!.x).toBeCloseTo(rv.glyphs[2]!.x, 9);
  });

  it('plain: the frame follows the text; vertical turns it', () => {
    const h = layout('plain', '홍길동');
    expect(h.w).toBe(1);
    expect(h.h).toBeLessThan(0.5);
    const v = layout('plain', '홍길동', { vertical: true });
    expect(v.h).toBe(1);
    expect(v.w).toBeCloseTo(h.h, 9);
    expect(layout('plain', '홍 길동').glyphs.map((g) => g.text)).toEqual(['홍', '길', '동']);
  });

  it('square-inverse cuts the text out of a filled square; date-round has two chords, label, date and name', () => {
    const inv = layout('square-inverse', '홍길동');
    expect(inv.cut).toBe(true);
    expect(inv.shapes[0]!.k).toBe('fill-rect');
    const d = layout('date-round', '홍길동', { label: '승인', date: '2026.10.15' });
    expect(d.shapes.filter((s) => s.k === 'line')).toHaveLength(2);
    expect(d.glyphs.map((g) => g.text)).toEqual(['승', '인', '2026.10.15', '홍', '길', '동']);
    const corp = layout('corp-round', '문서딱 주식회사');
    expect(corp.glyphs.map((g) => g.text).join('')).toBe('문서딱주식회사대표이사');
    expect(layout('corp-round', '문서딱', { center: '' }).glyphs).toHaveLength(3);
  });

  it('auto-fit: every glyph box inside its region and the frame, no two boxes overlap, stretch in [0.6, 1.6] — all 12 styles, n = 1…max, Hangul / Hanja / Latin, every weight and line', () => {
    const weights = ['light', 'regular', 'heavy'] as const;
    const lines = ['thin', 'normal', 'thick'] as const;
    let checked = 0;
    for (const id of STYLE_IDS) {
      const def = STYLES[id];
      for (let n = 1; n <= def.max; n++) {
        for (const [pool, from] of [[HANGUL, 0], [HANJA, 3], [LATIN, 1]] as const) {
          for (const vertical of def.orient ? [true, false] : [null]) {
            const i = (n + from) % 3;
            const l = layout(id, sample(pool, n, from), { weight: weights[i], line: lines[(i + 1) % 3], vertical, face: i === 1 ? 'myeongjo' : 'serif' });
            for (const g of l.glyphs) {
              expect(glyphInside(g), `${id} n=${n} ${g.text}`).toBe(true);
              for (const [x, y] of corners(g)) {
                expect(x >= -EPS && y >= -EPS && x <= l.w + EPS && y <= l.h + EPS, `${id} ${g.text} in frame`).toBe(true);
              }
              expect(g.sx / g.sy).toBeGreaterThanOrEqual(STRETCH_MIN - 1e-9);
              expect(g.sx / g.sy).toBeLessThanOrEqual(STRETCH_MAX + 1e-9);
            }
            for (let a = 0; a < l.glyphs.length; a++) {
              for (let b = a + 1; b < l.glyphs.length; b++) expect(overlap(l.glyphs[a]!, l.glyphs[b]!), `${id} n=${n} ${l.glyphs[a]!.text}/${l.glyphs[b]!.text}`).toBe(false);
            }
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('one scale per column: the glyphs of a name keep an even size', () => {
    const l = layout('rect-v', '홍길동');
    expect(new Set(l.glyphs.map((g) => g.sy)).size).toBe(1);
    expect(new Set(l.glyphs.map((g) => g.sx)).size).toBe(1);
  });

  it('arc (corp-round): neighbours never intersect for 3…20 glyphs, span ≤ 300°, centred on the top, tangent-rotated', () => {
    for (let n = 3; n <= 20; n++) {
      const l = layout('corp-round', sample(HANGUL, n), { center: '' });
      expect(l.glyphs).toHaveLength(n);
      for (let i = 0; i + 1 < n; i++) expect(overlap(l.glyphs[i]!, l.glyphs[i + 1]!), `n=${n} i=${i}`).toBe(false);
      expect(overlap(l.glyphs[0]!, l.glyphs[n - 1]!)).toBe(false);
      const ang = l.glyphs.map((g) => Math.atan2(g.y - 0.5, g.x - 0.5));
      const span = ((ang[n - 1]! - ang[0]!) * 180) / Math.PI;
      expect(span).toBeLessThanOrEqual(300);
      // Symmetric about the top.
      expect(l.glyphs[0]!.x - 0.5).toBeCloseTo(-(l.glyphs[n - 1]!.x - 0.5), 9);
      expect(l.glyphs[0]!.rot).toBeCloseTo(-l.glyphs[n - 1]!.rot, 9);
    }
  });

  it('em-box fallback (no actualBoundingBox*): the same layouts still fit', () => {
    for (const id of STYLE_IDS) {
      const l = layout(id, sample(HANGUL, Math.min(3, STYLES[id].max)), {}, emMeasure);
      expect(l.glyphs.length).toBeGreaterThan(0);
      for (const g of l.glyphs) expect(glyphInside(g), `${id} ${g.text}`).toBe(true);
    }
  });
});

describe('stamp-maker fonts (probe e)', () => {
  it('every KS X 1001 한자 (4,888) is allowed after normalize() and painted from a face that has it (Serif all; Sans all but \u9699 -> Serif)', () => {
    const dec = new TextDecoder('euc-kr');
    const hanja: string[] = [];
    for (let a = 0xca; a <= 0xfd; a++) for (let b = 0xa1; b <= 0xfe; b++) hanja.push(dec.decode(new Uint8Array([a, b])));
    expect(hanja).toHaveLength(4888);
    expect(hanja.filter((h) => /^[\uF900-\uFAFF]$/u.test(h)).length).toBe(268);
    const norm = hanja.map((h) => normalize(h, false));
    expect(norm.every((h) => badChar(h) === null && graphemes(h).length === 1)).toBe(true);
    // NFC alone would send \u90CE / \u96B8 to U+90CE / U+96B8, which neither face has.
    expect(normalize('\uF92C\u90CE\uF9B8', false)).toBe('\uF92C\uF92C\uF9B8');
    const slices = (pkg: string): { hasGlyphForCodePoint(cp: number): boolean }[] => {
      const dir = join('node_modules', '@fontsource', pkg, 'files');
      return readdirSync(dir)
        .filter((f) => /^[a-z-]+-\d+-700-normal\.woff$/.test(f))
        .map((f) => fontkit.create(readFileSync(join(dir, f)) as never) as unknown as { hasGlyphForCodePoint(cp: number): boolean });
    };
    const faces = { serif: slices('noto-serif-kr'), sans: slices('noto-sans-kr') };
    for (const face of ['serif', 'sans', 'myeongjo', 'gothic'] as const) {
      const missing = norm.filter((h) => {
        const f = faceFor(face, h);
        return !(f === 'sans' ? faces.sans : faces.serif).some((x) => x.hasGlyphForCodePoint(h.codePointAt(0)!));
      });
      expect(missing, face).toEqual([]);
    }
    expect(faceFor('sans', '\u9699')).toBe('serif');
  });
});

describe('stamp-maker 인주 질감 (D6)', () => {
  const painted = (): { data: Uint8ClampedArray; width: number; height: number } => {
    const c = createCanvas(120, 120);
    const x = c.getContext('2d');
    x.fillStyle = '#D0202E';
    x.beginPath();
    x.arc(60, 60, 50, 0, Math.PI * 2);
    x.fill();
    const img = x.getImageData(0, 0, 120, 120);
    return { data: new Uint8ClampedArray(img.data), width: 120, height: 120 };
  };

  it('mulberry32 is seeded and stable', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    const xs = Array.from({ length: 5 }, () => a());
    expect(xs).toEqual(Array.from({ length: 5 }, () => b()));
    expect(xs.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(mulberry32(2)()).not.toBe(xs[0]);
  });

  it('same seed -> identical alpha; another seed differs; alpha only reduced, colour untouched; holes ≤ 2 %', () => {
    const base = painted();
    const a = painted();
    const b = painted();
    const c = painted();
    applyInk(a, 1);
    applyInk(b, 1);
    applyInk(c, 2);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    expect(Buffer.from(a.data).equals(Buffer.from(c.data))).toBe(false);
    let reduced = 0;
    let zeroed = 0;
    let inked = 0;
    for (let i = 0; i < base.data.length; i += 4) {
      expect(a.data[i]).toBe(base.data[i]);
      expect(a.data[i + 1]).toBe(base.data[i + 1]);
      expect(a.data[i + 2]).toBe(base.data[i + 2]);
      expect(a.data[i + 3]!).toBeLessThanOrEqual(base.data[i + 3]!);
      if (base.data[i + 3] === 255) {
        inked++;
        if (a.data[i + 3]! < 255) reduced++;
        if (a.data[i + 3] === 0) zeroed++;
      }
    }
    expect(reduced).toBeGreaterThan(inked * 0.2);
    expect(zeroed / inked).toBeLessThanOrEqual(0.02 + 0.03); // holes plus the eaten edge layer
  });

  it('away from the edge and holes the alpha keeps at least 60 %', () => {
    const a = painted();
    applyInk(a, 7);
    const alphas: number[] = [];
    for (let y = 40; y < 80; y++) for (let x = 40; x < 80; x++) alphas.push(a.data[(y * 120 + x) * 4 + 3]!);
    const kept = alphas.filter((v) => v > 0);
    expect(Math.min(...kept)).toBeGreaterThanOrEqual(Math.floor(255 * INK_KEEP_MIN));
  });

  it('texture off -> the pixels are untouched (the controller never calls applyInk)', () => {
    const a = painted();
    const b = painted();
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  });
});

describe('stamp-maker PNG pHYs (D6)', () => {
  const png = (): Uint8Array => new Uint8Array(createCanvas(4, 3).encodeSync('png'));

  it('mm -> pixels at 1x (600 ppi) and 2x (1,200 ppi)', () => {
    expect(SIZES_MM.map((mm) => mmToPx(mm, PPI_1X))).toEqual([283, 354, 425, 496, 567, 709]);
    expect(SIZES_MM.map((mm) => mmToPx(mm, PPI_2X))).toEqual([567, 709, 850, 992, 1134, 1417]);
  });

  it('pHYs right after IHDR, CRC valid, 600 / 1,200 ppi round-trip; an existing pHYs is replaced', () => {
    for (const ppi of [PPI_1X, PPI_2X]) {
      const out = withPhys(png(), ppi);
      const p = readPhys(out)!;
      expect(p).toEqual({ x: ppiToPpm(ppi), y: ppiToPpm(ppi), unit: 1, crcOk: true, afterIhdr: true });
      expect(Math.round(p.x * 0.0254)).toBe(ppi);
      const again = withPhys(out, PPI_1X);
      expect(readPhys(again)!.x).toBe(23622);
      expect(again.length).toBe(out.length);
      // Still a PNG the decoder reads.
      expect(Array.from(out.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    }
    expect(ppiToPpm(600)).toBe(23622);
    expect(ppiToPpm(1200)).toBe(47244);
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082);
    expect(() => withPhys(new Uint8Array([1, 2, 3]), 600)).toThrow();
    expect(readPhys(png())).toBeNull();
  });
});
