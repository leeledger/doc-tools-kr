// ROMANIZE1016 R0: the 외교부 list (src/tools/english-name/mofa.ts) against its evidence text, and the tool's sources
// in the source watch (brief D3, D8, Test map "mofa.ts").
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseToolSources, readGuides, readPresets, readToolSources, watchList } from '../../scripts/ops/lib/guides.mjs';
import { GIVEN, MOFA_LIST, SURNAMES, type Entry } from '../../src/tools/english-name/mofa';
import { PASSPORT_CHANGE_URL, ROMANIZATION_URL, SOURCES_RETRIEVED, TOOL_SOURCES } from '../../src/tools/english-name/sources';

const EVIDENCE = readFileSync(join(process.cwd(), 'handoff', 'sources', 'romanize1016', 'mofa-list-2024-10-31.txt'), 'utf8');
const SHA = readFileSync(join(process.cwd(), 'handoff', 'sources', 'romanize1016', 'pdf-sha256.txt'), 'utf8');
const all = (): [string, Entry][] => [...Object.entries(SURNAMES), ...Object.entries(GIVEN)];

describe('외교부 list transcription (S5)', () => {
  it('20 surnames and 100 given-name syllables in PDF order', () => {
    expect(Object.keys(SURNAMES).join('')).toBe('강권김박배백서송신오유윤이임장전정조최한');
    expect(Object.keys(GIVEN)).toHaveLength(100);
    const heads = [...EVIDENCE.matchAll(/\(([가-힣])\) 사용자 수 비율/g)].map((m) => m[1]);
    expect(heads).toEqual([...Object.keys(SURNAMES), ...Object.keys(GIVEN)]);
  });

  it('every printed spelling row and every 합계 of the evidence is in the data, and nothing else', () => {
    const rows = [...EVIDENCE.matchAll(/\b([A-Z]+) ([\d,]+)\s+(\d+\.\d\d)%/g)].map((m) => `${m[1]} ${m[2]!.replace(/,/g, '')} ${m[3]}`).sort();
    const data = all().flatMap(([, e]) => e.spellings.map((s) => `${s.s} ${s.count} ${s.pct.toFixed(2)}`)).sort();
    expect(data).toEqual(rows);
    expect(rows).toHaveLength(282);
    const totals = [...EVIDENCE.matchAll(/합계 ([\d,]+)\s+100%/g)].map((m) => Number(m[1]!.replace(/,/g, '')));
    expect(all().map(([, e]) => e.total)).toEqual(totals);
  });

  it('each 비율 equals 사용자 수 / 합계 (±0.01), counts never exceed the 합계, highest count first, spellings A-Z', () => {
    for (const [h, e] of all()) {
      let sum = 0;
      e.spellings.forEach((s, i) => {
        expect(Math.abs((s.count / e.total) * 100 - s.pct), `${h} ${s.s}`).toBeLessThanOrEqual(0.01);
        expect(s.s, h).toMatch(/^[A-Z]+$/);
        if (i) expect(s.count, `${h} ${s.s}`).toBeLessThanOrEqual(e.spellings[i - 1]!.count);
        sum += s.count;
      });
      expect(sum, h).toBeLessThanOrEqual(e.total);
      expect(new Set(e.spellings.map((s) => s.s)).size, h).toBe(e.spellings.length);
    }
  });

  it('negative marks exactly where the list prints 「부정적 의미로 변경 가능」', () => {
    const neg = (list: Record<string, Entry>) => Object.entries(list).flatMap(([h, e]) => e.spellings.filter((s) => s.negative).map((s) => `${h} ${s.s}`));
    expect(neg(SURNAMES)).toEqual(['신 SIN']);
    expect(neg(GIVEN).sort()).toEqual(['건 GUN', '구 GOO', '국 KOOK', '근 GUN', '덕 DUCK', '범 BUM', '석 SUCK', '신 SIN', '일 ILL'].sort());
    expect([...EVIDENCE.matchAll(/\*([A-Z]+)[은는]\s*부정적/g)]).toHaveLength(10);
  });

  it('spot checks from the brief and the e2e cases', () => {
    expect(SURNAMES['김']!.spellings.map((s) => [s.s, s.pct])).toEqual([['KIM', 99.55], ['GIM', 0.42]]);
    expect(SURNAMES['정']!.spellings.map((s) => s.s)).toEqual(['JUNG', 'JEONG', 'CHUNG', 'JOUNG', 'CHEONG']);
    expect(SURNAMES['최']!.spellings.map((s) => s.s)).toEqual(['CHOI', 'CHOE']);
    expect(GIVEN['영']!.spellings[0]).toEqual({ s: 'YOUNG', count: 2628441, pct: 79.67 });
    expect(GIVEN['희']!.spellings[0]!.s).toBe('HEE');
    expect(GIVEN['지']!.spellings.map((s) => s.s)).toEqual(['JI', 'JEE', 'GI']);
  });

  it('the list metadata and the PDF hash', () => {
    expect(MOFA_LIST).toMatchObject({ asOf: '2024-10-31', retrieved: SOURCES_RETRIEVED, pageUrl: PASSPORT_CHANGE_URL });
    expect(SHA).toContain(`${MOFA_LIST.sha256} list.pdf`);
  });
});

describe('tool sources in the source watch (D8)', () => {
  it('the watch parses sources.ts into the same entries as the module', () => {
    const [tool] = readToolSources();
    expect(tool!.page).toBe('/english-name/');
    expect(tool!.sources).toEqual(TOOL_SOURCES.map((s) => ({ id: s.id, urls: [s.url], quote: s.quote, ...(s.via ? { via: s.via } : {}) })));
    expect(tool!.sources.map((s: { id: string }) => s.id)).toEqual(['kornorms-romanization', 'passport-basic', 'passport-system', 'passport-change', 'mofa-list']);
    expect(tool!.sources[0]!.urls).toEqual([ROMANIZATION_URL]);
    expect(tool!.sources.filter((s: { via?: string }) => s.via === 'browser').map((s: { id: string }) => s.id)).toEqual(['mofa-list']);
  });

  it('the watch list carries the tool page; the PDF is a manual (browser) row', () => {
    const list = watchList(readGuides(), readPresets(), readToolSources());
    const mine = list.filter((e: { pages: string[] }) => e.pages.includes('/english-name/'));
    expect(mine).toHaveLength(5);
    expect(mine.filter((e: { via?: string }) => e.via === 'browser')).toHaveLength(1);
  });

  it('parseToolSources resolves URL constants and quoted URLs, skips incomplete entries', () => {
    const ts = ["export const A_URL = 'https://a';", 'export const X = [', '  {', "    id: 'x',", '    url: A_URL,', "    quote: 'it\\'s',", '  },', '  {', "    id: 'y',", "    url: 'https://b',", "    quote: 'q',", "    via: 'browser',", '  },', '  {', "    id: 'z',", "    url: 'https://c',", '  },', '];'].join('\n');
    expect(parseToolSources(ts)).toEqual([
      { id: 'x', urls: ['https://a'], quote: "it's" },
      { id: 'y', urls: ['https://b'], quote: 'q', via: 'browser' },
    ]);
  });
});

describe('guide passport-english-name (R4): the 성 table is the 외교부 list', () => {
  const md = readFileSync(join(process.cwd(), 'src', 'content', 'guides', 'passport-english-name.md'), 'utf8');
  const fmt = (n: number): string => n.toLocaleString('en-US');
  it('one row per surname, in PDF order, with every listed spelling, 사용자 수 and 비율', () => {
    const rows = [...md.matchAll(/^\| (.) \| ([\d,]+)명 \| (.+) \|$/gm)].map((m) => [m[1], m[2], m[3]]);
    expect(rows.map((r) => r[0])).toEqual(Object.keys(SURNAMES));
    for (const [h, total, cells] of rows) {
      const e = SURNAMES[h!]!;
      expect(total, h).toBe(fmt(e.total));
      expect(cells, h).toBe(e.spellings.map((s) => `${s.s} ${fmt(s.count)}명(${s.pct.toFixed(2)}%)`).join(' · '));
    }
  });
});
