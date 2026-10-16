// ROMANIZE1016 R1: the name romanization engine (romanize.ts) and the choices / composition / warnings (options.ts),
// brief D2, D3 and Test map. Oracle: the 28 outputs of 외교부 「추천 로마자 성명 검색」 (S8), test-only.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SURNAMES } from '../../src/tools/english-name/mofa';
import {
  composeGiven,
  customSurname,
  formatName,
  inSurnameList,
  ruleSurname,
  surnameChoices,
  syllableChoices,
  warningsFor,
  type Given,
} from '../../src/tools/english-name/options';
import { GIVEN_MAX, joined, normalizeName, SURNAME_MAX, standalone, validPart } from '../../src/tools/english-name/romanize';

const J = (s: string): string => joined([...s]).toUpperCase();
const H = (s: string): string => composeGiven(s).hyphen;
const S = (s: string): string => composeGiven(s).space;
/** A syllable from its jamo indexes (initial 0-18, vowel 0-20, final 0-27). */
const syl = (l: number, v: number, t: number): string => String.fromCharCode(0xac00 + l * 588 + v * 28 + t);

describe('letters (S1 제2장)', () => {
  it('every initial before ㅏ', () => {
    const want = ['ga', 'kka', 'na', 'da', 'tta', 'ra', 'ma', 'ba', 'ppa', 'sa', 'ssa', 'a', 'ja', 'jja', 'cha', 'ka', 'ta', 'pa', 'ha'];
    want.forEach((w, l) => expect(standalone(syl(l, 0, 0)), w).toBe(w));
  });
  it('every vowel after ㅇ (ㅢ is ui)', () => {
    const want = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
    want.forEach((w, v) => expect(standalone(syl(11, v, 0)), w).toBe(w));
    expect(J('의')).toBe('UI');
    expect(J('희')).toBe('HUI');
    expect(J('영희')).toBe('YEONGHUI');
    expect(J('의성')).toBe('UISEONG');
  });
});

// Finals 1-27 on 가: [jamo, standalone, joined before 아, joined before 나].
const FINALS: [string, string, string, string][] = [
  ['ㄱ', 'gak', 'gaga', 'gakna'],
  ['ㄲ', 'gak', 'gakka', 'gakna'],
  ['ㄳ', 'gak', 'gaksa', 'gakna'],
  ['ㄴ', 'gan', 'gana', 'ganna'],
  ['ㄵ', 'gan', 'ganja', 'ganna'],
  ['ㄶ', 'gan', 'ganha', 'ganna'],
  ['ㄷ', 'gat', 'gada', 'gatna'],
  ['ㄹ', 'gal', 'gara', 'galna'],
  ['ㄺ', 'gak', 'galga', 'gakna'],
  ['ㄻ', 'gam', 'galma', 'gamna'],
  ['ㄼ', 'gal', 'galba', 'galna'],
  ['ㄽ', 'gal', 'galsa', 'galna'],
  ['ㄾ', 'gal', 'galta', 'galna'],
  ['ㄿ', 'gap', 'galpa', 'gapna'],
  ['ㅀ', 'gal', 'galha', 'galna'],
  ['ㅁ', 'gam', 'gama', 'gamna'],
  ['ㅂ', 'gap', 'gaba', 'gapna'],
  ['ㅄ', 'gap', 'gapsa', 'gapna'],
  ['ㅅ', 'gat', 'gasa', 'gatna'],
  ['ㅆ', 'gat', 'gassa', 'gatna'],
  ['ㅇ', 'gang', 'ganga', 'gangna'],
  ['ㅈ', 'gat', 'gaja', 'gatna'],
  ['ㅊ', 'gat', 'gacha', 'gatna'],
  ['ㅋ', 'gak', 'gaka', 'gakna'],
  ['ㅌ', 'gat', 'gata', 'gatna'],
  ['ㅍ', 'gap', 'gapa', 'gapna'],
  ['ㅎ', 'gat', 'gaha', 'gatna'],
];

describe('finals (each 받침: standalone, before ㅇ, before a consonant, end; 표준 발음법 제9-11항 + S1 [붙임 1]·[붙임 2])', () => {
  it('27 finals', () => expect(FINALS).toHaveLength(27));
  FINALS.forEach(([name, alone, beforeVowel, beforeConsonant], i) => {
    const t = i + 1;
    it(`받침 ${name}`, () => {
      const ga = syl(0, 0, t);
      // End of the part and the hyphen / space shapes: the representative value.
      expect(standalone(ga)).toBe(alone);
      expect(joined([ga])).toBe(alone);
      expect(H(`${ga}아`).toLowerCase()).toBe(`${alone}-a`);
      expect(S(`${ga}아`).toLowerCase()).toBe(`${alone} a`);
      // Joined, before ㅇ: liaison (a double final keeps its first letter).
      expect(joined([ga, '아'])).toBe(beforeVowel);
      // Joined, before a consonant: the representative value, the next initial unchanged (no assimilation).
      expect(joined([ga, '나'])).toBe(beforeConsonant);
    });
  });
  it('ㄹ + ㄹ → ll joined, l-r apart; ㄹ + ㅇ → r', () => {
    expect(J('설리')).toBe('SEOLLI');
    expect(H('설리')).toBe('SEOL-RI');
    expect(S('설리')).toBe('SEOL RI');
    expect(J('설아')).toBe('SEORA');
    expect(J('똘똘')).toBe('TTOLTTOL');
  });
});

describe('no sound change inside a name (S1 제3장 제4항 1)', () => {
  const cases: [string, string][] = [
    ['복남', 'BOKNAM'], ['빛나', 'BITNA'], ['종로', 'JONGRO'], ['석렬', 'SEOKRYEOL'], ['선영', 'SEONYEONG'], ['정연', 'JEONGYEON'],
    ['윤복', 'YUNBOK'], ['한별', 'HANBYEOL'], ['국민', 'GUKMIN'], ['신라', 'SINRA'], ['백마', 'BAEKMA'], ['같이', 'GATI'],
  ];
  for (const [k, r] of cases) it(`${k} → ${r}`, () => expect(J(k)).toBe(r));
});

describe('liaison inside a part', () => {
  const cases: [string, string][] = [['석우', 'SEOGU'], ['덕인', 'DEOGIN'], ['갑을', 'GABEUL'], ['설아', 'SEORA'], ['낳은', 'NAHEUN']];
  for (const [k, r] of cases) it(`${k} → ${r}`, () => expect(J(k)).toBe(r));
});

describe('double consonants', () => {
  const cases: [string, string][] = [['꺽정', 'KKEOKJEONG'], ['똘똘', 'TTOLTTOL'], ['쌍', 'SSANG'], ['빠', 'PPA'], ['짜', 'JJA']];
  for (const [k, r] of cases) it(`${k} → ${r}`, () => expect(J(k)).toBe(r));
});

describe('shapes (S1 제3장 제4항, S2)', () => {
  it('joined, hyphen, space', () => {
    expect(composeGiven('복남')).toEqual({ joined: 'BOKNAM', hyphen: 'BOK-NAM', space: 'BOK NAM', segments: ['BOK', 'NAM'] });
    expect(H('석우')).toBe('SEOK-U');
    expect(composeGiven('길동')).toMatchObject({ joined: 'GILDONG', hyphen: 'GIL-DONG', space: 'GIL DONG' });
  });
  it('surnames are one joined word; 표기법 surnames', () => {
    expect(ruleSurname('남궁')).toBe('NAMGUNG');
    expect(ruleSurname('선우')).toBe('SEONU');
    expect(ruleSurname('황보')).toBe('HWANGBO');
    expect(['김', '이', '박', '최', '노', '강'].map(ruleSurname)).toEqual(['GIM', 'I', 'BAK', 'CHOE', 'NO', 'GANG']);
  });
  it('case toggle: all upper, or first letters (S1 style, lower after a hyphen)', () => {
    const g = composeGiven('길동');
    expect(formatName('HONG', g, 'joined', 'upper')).toBe('HONG GILDONG');
    expect(formatName('HONG', g, 'hyphen', 'upper')).toBe('HONG GIL-DONG');
    expect(formatName('HONG', g, 'space', 'upper')).toBe('HONG GIL DONG');
    expect(formatName('HONG', g, 'joined', 'title')).toBe('Hong Gildong');
    expect(formatName('HONG', g, 'hyphen', 'title')).toBe('Hong Gil-dong');
    expect(formatName('HONG', g, 'space', 'title')).toBe('Hong Gil Dong');
  });
  it('all 11,172 syllables romanize to lower-case Latin letters on their own', () => {
    for (let c = 0xac00; c <= 0xd7a3; c++) {
      const r = standalone(String.fromCharCode(c));
      if (!/^[a-z]+$/.test(r)) throw new Error(`${String.fromCharCode(c)} → ${r}`);
    }
  });
});

describe('input', () => {
  it('NFC and inner white space removed', () => {
    expect(normalizeName(' 홍 길　동 ')).toBe('홍길동');
    expect(normalizeName('길동'.normalize('NFD'))).toBe('길동');
    expect(validPart(normalizeName('길동'.normalize('NFD')), 1, GIVEN_MAX)).toBe(true);
  });
  it('only precomposed syllables, within the length', () => {
    for (const bad of ['ㄱㄴ', 'ㅎ', 'Kim', '홍1', '洪', '길😀', 'ᄀ', '']) expect(validPart(bad, 1, GIVEN_MAX), bad).toBe(false);
    expect(validPart('남궁', 1, SURNAME_MAX)).toBe(true);
    expect(validPart('남궁민', 1, SURNAME_MAX)).toBe(false);
    expect(validPart('가'.repeat(10), 1, GIVEN_MAX)).toBe(true);
    expect(validPart('가'.repeat(11), 1, GIVEN_MAX)).toBe(false);
  });
});

describe('choices (D3)', () => {
  it('a listed surname: its spellings by count, the 표기법 result added only when not listed', () => {
    expect(surnameChoices('김')).toEqual([{ spelling: 'KIM', pct: 99.55, rule: false }, { spelling: 'GIM', pct: 0.42, rule: true }]);
    expect(surnameChoices('강').map((c) => c.spelling)).toEqual(['KANG', 'GANG']);
    expect(surnameChoices('강')[1]).toEqual({ spelling: 'GANG', rule: true });
    expect(surnameChoices('이').map((c) => c.spelling)).toEqual(['LEE', 'YI', 'I']);
    expect(surnameChoices('최').map((c) => c.spelling)).toEqual(['CHOI', 'CHOE']);
    expect(surnameChoices('정').map((c) => c.spelling)).toEqual(['JUNG', 'JEONG', 'CHUNG', 'JOUNG', 'CHEONG']);
    expect(inSurnameList('김')).toBe(true);
  });
  it('a surname not in the list: the 표기법 result only', () => {
    expect(surnameChoices('홍')).toEqual([{ spelling: 'HONG', rule: true }]);
    expect(surnameChoices('남궁')).toEqual([{ spelling: 'NAMGUNG', rule: true }]);
    expect(inSurnameList('홍')).toBe(false);
    expect(inSurnameList('constructor')).toBe(false);
  });
  it('every listed surname: default = highest count', () => {
    for (const [h, e] of Object.entries(SURNAMES)) expect(surnameChoices(h)[0]!.spelling, h).toBe([...e.spellings].sort((a, b) => b.count - a.count)[0]!.s);
  });
  it('직접 쓰기: A-Z, space, hyphen, 1-30, upper case', () => {
    expect(customSurname('rhee')).toBe('RHEE');
    expect(customSurname('  Nam  Koong ')).toBe('NAM KOONG');
    expect(customSurname('A')).toBe('A');
    expect(customSurname('A'.repeat(30))).toBe('A'.repeat(30));
    for (const bad of ['', ' ', 'A'.repeat(31), '이', 'K1M', 'KIM-', '-KIM', 'KIM.', 'É']) expect(customSurname(bad), bad).toBeNull();
  });
  it('given syllables: 표기법 first (with its 비율 when listed), then the other spellings; none when the list adds nothing', () => {
    expect(syllableChoices('영')).toEqual([
      { spelling: 'YEONG', rule: true, pct: 18.65 },
      { spelling: 'YOUNG', pct: 79.67, rule: false },
      { spelling: 'YUNG', pct: 1.02, rule: false },
    ]);
    expect(syllableChoices('희')!.map((c) => c.spelling)).toEqual(['HUI', 'HEE', 'HI', 'HEUI']);
    expect(syllableChoices('민')).toBeNull();
    expect(syllableChoices('늘')).toBeNull();
    expect(syllableChoices('toString')).toBeNull();
  });
  it('a picked spelling is verbatim; liaison only between two 표기법 syllables', () => {
    expect(composeGiven('영희', ['YOUNG', undefined]).joined).toBe('YOUNGHUI');
    expect(composeGiven('석우').joined).toBe('SEOGU');
    expect(composeGiven('석우', [undefined, 'WOO'])).toMatchObject({ joined: 'SEOKWOO', hyphen: 'SEOK-WOO' });
    expect(composeGiven('석우', ['SUK', undefined]).joined).toBe('SUKU');
    expect(composeGiven('설리', ['SUL' as string, undefined]).joined).toBe('SULRI');
    expect(composeGiven('석우석우', [undefined, undefined, 'SUK', undefined]).joined).toBe('SEOGUSUKU');
  });
});

describe('warnings (D3; S4 examples and S5 marks, exact match only)', () => {
  const g = (s: string, picks: (string | undefined)[] = []): Given => composeGiven(s, picks);
  it('negative spellings', () => {
    expect(warningsFor('GANG', g('하늘')).negative).toBe(true);
    expect(warningsFor('NO', g('하늘')).negative).toBe(true);
    expect(warningsFor('SIN', g('하늘')).negative).toBe(true);
    expect(warningsFor('KANG', g('길')).negative).toBe(false);
    expect(warningsFor('KANG', { joined: 'GUNWOO', hyphen: 'GUNWOO', space: 'GUNWOO', segments: ['GUNWOO'] }).negative).toBe(false);
    expect(warningsFor('KANG', g('건우', ['GUN', 'WOO'])).negative).toBe(true);
    expect(warningsFor('KANG', g('구', ['GOO'])).negative).toBe(true);
    expect(warningsFor('KANG', g('국', ['KOOK'])).negative).toBe(true);
    expect(warningsFor('kang', g('하늘')).negative).toBe(false);
  });
  it('single letters', () => {
    expect(warningsFor('KIM', g('아')).single).toBe(true);
    expect(warningsFor(ruleSurname('이'), g('하늘')).single).toBe(true);
    expect(warningsFor(ruleSurname('오'), g('하늘')).single).toBe(true);
    expect(warningsFor('KIM', g('아', ['AH'])).single).toBe(false);
    expect(warningsFor('KIM', g('아이')).single).toBe(false);
  });
});

// ---------- oracle: 외교부 「추천 로마자 성명 검색」 (S8), 2026-10-16 ----------
const ORACLE = readFileSync(join(process.cwd(), 'handoff', 'sources', 'romanize1016', 'mofa-search-oracle.txt'), 'utf8');
/** Their spellings that the 표기법 does not give and we do not mimic (brief D2, logged). */
const GIVEN_DEVIATIONS: Record<string, string> = { 최의: 'EUI', 김옥: 'OCK' };
/** Their surname spellings that the 외교부 list (S5) does not hold for a listed surname (logged, never offered). */
const SURNAME_NOT_IN_LIST: Record<string, string[]> = { 배: ['PAE'] };
const TWO_SYLLABLE_SURNAMES = ['남궁'];

describe('oracle: 28 outputs of the 외교부 search tool (test only)', () => {
  const rows = [...ORACLE.matchAll(/([가-힣]+): ([A-Z |]+?)(?=[가-힣]|$|\r?\n)/g)].map((m) => ({ name: m[1]!, outs: m[2]!.trim().split(' | ').map((s) => s.trim()) }));
  it('28 rows', () => expect(rows).toHaveLength(28));
  for (const { name, outs } of rows) {
    it(name, () => {
      // 황보 is searched as one word: their HWANGBO is the joined surname, HWANG BO the 황 + 보 split.
      if (name === '황보') {
        expect(outs).toEqual(['HWANGBO', 'HWANG BO']);
        expect(ruleSurname('황보')).toBe('HWANGBO');
        expect(`${surnameChoices('황')[0]!.spelling} ${composeGiven('보').joined}`).toBe('HWANG BO');
        return;
      }
      const sn = TWO_SYLLABLE_SURNAMES.find((s) => name.startsWith(s)) ?? name[0]!;
      const given = name.slice(sn.length);
      // 남궁민수's 「NAM GUNGMINSU」 (a 남 + 궁민수 split) is ignored.
      const pairs = outs.map((o) => o.split(' ')).filter((p) => p.length === 2 && !(sn === '남궁' && p[0] === 'NAM'));
      expect(pairs.length).toBeGreaterThan(0);
      const theirGiven = new Set(pairs.map((p) => p[1]));
      expect(theirGiven.size, 'one given-name spelling').toBe(1);
      const ours = composeGiven(given).joined;
      const theirs = [...theirGiven][0]!;
      if (GIVEN_DEVIATIONS[name]) {
        expect(theirs).toBe(GIVEN_DEVIATIONS[name]);
        expect(ours).not.toBe(theirs);
      } else expect(ours).toBe(theirs);
      const ourSurnames = surnameChoices(sn).map((c) => c.spelling);
      const theirSurnames = pairs.map((p) => p[0]!);
      if (inSurnameList(sn)) {
        const listed = new Set(SURNAMES[sn]!.spellings.map((s) => s.s));
        for (const s of theirSurnames) {
          if (listed.has(s)) expect(ourSurnames, s).toContain(s);
          else expect(SURNAME_NOT_IN_LIST[sn] ?? [], `${sn} ${s} not in the list and not logged`).toContain(s);
        }
      } else {
        expect(theirSurnames, 'our 표기법 surname is one of theirs').toContain(ourSurnames[0]);
        expect(ourSurnames).toHaveLength(1);
      }
    });
  }
  it('the deviations are offered only where the 외교부 list has them (OCK yes, EUI never)', () => {
    expect(syllableChoices('옥')!.map((c) => c.spelling)).toContain('OCK');
    expect(syllableChoices('의')).toBeNull();
  });
});
