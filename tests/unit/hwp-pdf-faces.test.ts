// Face resolution for the PDF fonts (SPIKE-HWP-DIRECT §6.2, §6.9).
import { describe, expect, it } from 'vitest';
import { FaceTable, isPua, parseRanges, unpackFaces, type FaceDef, type LoadedFace } from '../../src/lib/hwp/pdf/faces';
import { FAMILY } from '../../src/lib/hwp/svg-string';

/** A fake face that has exactly `cps`. */
const fake = (cps: number[]) => async (def: FaceDef): Promise<LoadedFace> => ({
  def,
  woff: new Uint8Array(),
  sfnt: new Uint8Array(),
  font: { unitsPerEm: 1000, ascent: 800, descent: -200, numGlyphs: cps.length, hasGlyphForCodePoint: (cp) => cps.includes(cp) },
});

describe('parseRanges', () => {
  it('single, range, wildcard, null = everything', () => {
    expect(parseRanges('U+20')).toEqual([[0x20, 0x20]]);
    expect(parseRanges('U+AC00-D7A3, U+3131')).toEqual([[0xac00, 0xd7a3], [0x3131, 0x3131]]);
    expect(parseRanges('U+4??')).toEqual([[0x400, 0x4ff]]);
    expect(parseRanges(null)).toEqual([[0, 0x10ffff]]);
  });

  it('unpackFaces expands the build list', () => {
    expect(unpackFaces({ families: ['A'], dirs: ['/fonts/hwp/a@1/'], ranges: ['U+20'], faces: [[0, 400, 0, 'x.woff', 0], [0, 700, 0, 'y.woff', -1]] })).toEqual([
      { family: 'A', weight: 400, url: '/fonts/hwp/a@1/x.woff', range: 'U+20' },
      { family: 'A', weight: 700, url: '/fonts/hwp/a@1/y.woff', range: null },
    ]);
  });
});

describe('FaceTable.resolve', () => {
  const defs: FaceDef[] = [
    { family: FAMILY.serif, weight: 400, url: 'serif-400', range: 'U+AC00-D7A3' },
    { family: FAMILY.serif, weight: 700, url: 'serif-700', range: 'U+AC00-D7A3' },
    { family: FAMILY.sans, weight: 400, url: 'sans-400', range: 'U+0-FF, U+AC00-D7A3' },
    { family: FAMILY.fallback, weight: 400, url: 'fb', range: 'U+2000-206F' },
  ];
  const table = (): FaceTable => new FaceTable(defs, (d) => fake(d.url === 'fb' ? [0x2024] : d.url.startsWith('sans') ? [0x41, 0xac00] : [0xac00])(d));

  it('the chain first, the wanted weight within a family', async () => {
    const t = table();
    expect((await t.resolve(`'${FAMILY.serif}','${FAMILY.fallback}',serif`, 400, 0xac00))?.face.def.url).toBe('serif-400');
    expect((await t.resolve(`'${FAMILY.serif}','${FAMILY.fallback}',serif`, 700, 0xac00))?.face.def.url).toBe('serif-700');
    expect((await t.resolve('serif', 600, 0xac00))?.face.def.url).toBe('serif-700');
  });

  it('then Fallback, then Sans, then Serif (a glyph the chain lacks)', async () => {
    const t = table();
    expect((await t.resolve(`'${FAMILY.serif}'`, 400, 0x2024))?.face.def.url).toBe('fb');
    expect((await t.resolve(`'${FAMILY.serif}'`, 400, 0x41))?.face.def.url).toBe('sans-400');
  });

  it('a family without the wanted weight still resolves (the 100–900 regression) and synthesises bold', async () => {
    const t = table();
    const r = await t.resolve(`'${FAMILY.sans}'`, 700, 0x41);
    expect(r?.face.def.url).toBe('sans-400');
    expect(r?.synthBold).toBe(true);
    expect((await t.resolve(`'${FAMILY.fallback}'`, 700, 0x2024))?.synthBold).toBe(true);
  });

  it('PUA → null without counting missing; a glyph nobody has is missing', async () => {
    const t = table();
    expect(isPua(0xf0124)).toBe(true);
    expect(await t.resolve('serif', 400, 0xf0124)).toBeNull();
    expect(t.missing.size).toBe(0);
    expect(await t.resolve('serif', 400, 0x2550)).toBeNull();
    expect(t.missing.get(0x2550)).toBe(1);
  });

  it('a chain naming none of our families goes through pick() (바탕 → Serif, 맑은 고딕 → Pretendard)', () => {
    const t = new FaceTable([...defs, { family: FAMILY.pretendard, weight: 400, url: 'p', range: null }], fake([]));
    expect(t.families('바탕, serif')).toEqual([FAMILY.serif, FAMILY.fallback]);
    expect(t.families("'맑은 고딕'")).toEqual([FAMILY.pretendard, FAMILY.fallback, FAMILY.sans]);
  });

  it('a face that fails to load is skipped, never thrown', async () => {
    const t = new FaceTable(defs, async (d) => {
      if (d.url === 'serif-400') throw new Error('offline');
      return fake([0xac00])(d);
    });
    expect((await t.resolve(`'${FAMILY.serif}'`, 400, 0xac00))?.face.def.url).toBe('sans-400');
  });
});
