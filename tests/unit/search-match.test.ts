// SEARCH1031: the site search matcher (src/lib/search/*). Golden queries on an index built from every tool (release
// flags on) and every published guide and hub, the negatives, and the pure helpers.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { ADDR_EN_TOOL, BG_REMOVE_TOOL, ID_CAMERA_TOOL, TOOLS } from '../../src/data/tools';
import { isVisibleGuide } from '../../src/data/guide-schema';
import { guideEntry, searchIndex, toolEntry } from '../../src/lib/search/build';
import { foldWord, search, stripParticle, tokenize, type SearchIndex } from '../../src/lib/search/match';
import { clean, compact } from '../../src/lib/search/normalize';
import { choseong, distance, fuzzyBudget, isChoseongQuery, toJamo } from '../../src/lib/search/hangul';
import { ALIASES, CONCEPTS, POPULAR } from '../../src/lib/search/synonyms';

const ROOT = join(import.meta.dirname, '..', '..');
const front = (file: string): Record<string, unknown> => parseYaml(/^---\n([\s\S]*?)\n---/.exec(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'))![1]!);
const dir = (d: string): string[] => readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.md')).map((f) => join(ROOT, d, f));
const slugOf = (f: string): string => f.replace(/^.*[\\/]/, '').replace(/\.md$/, '');

const ALL_TOOLS = [...new Map([...TOOLS, BG_REMOVE_TOOL, ADDR_EN_TOOL, ID_CAMERA_TOOL].map((t) => [t.slug, t])).values()].filter((t) => t.status === 'live');
const guides = dir('src/content/guides')
  .map((f) => [slugOf(f), front(f)] as const)
  .filter(([, d]) => isVisibleGuide({ ...(d as { draft?: boolean }), draft: (d.draft as boolean | undefined) ?? false }, true, true))
  .map(([s, d]) => guideEntry(s, d as { title: string; query: string; category: string }));
const hubList = dir('src/content/hubs').map((f) => guideEntry(slugOf(f), { title: front(f).title as string }));
const INDEX: SearchIndex = searchIndex(ALL_TOOLS.map(toolEntry), [...hubList, ...guides]);

// The concept table of a build with every release flag on (vitest builds with PUBLIC_BG_REMOVE and PUBLIC_ADDR_EN off,
// so synonyms.ts leaves their tools out; check-dist checks the flag-on module names them).
const FLAG_TOOLS: Record<string, string[]> = { bg: ['remove-background'], 'addr-en': ['english-address'] };
const ALL_ON = CONCEPTS.map((c) => (FLAG_TOOLS[c.id] ? { ...c, tools: FLAG_TOOLS[c.id]! } : c));
const toolSlugs = (q: string, index = INDEX): string[] => search(index, q, ALL_ON).tools.map((t) => t.u.slice(1, -1));
const guideSlugs = (q: string): string[] => search(INDEX, q, ALL_ON).guides.map((g) => g.u.replace(/^\/guide\/|\/$/g, ''));

describe('SEARCH1031 golden queries (top-1 unless noted)', () => {
  const top1: [string, string][] = [
    ['사진 작게', 'photo-compress'],
    ['사진 용량 줄이기', 'photo-compress'],
    ['한글 파일 열기', 'hwp-viewer'],
    ['hwp 열기', 'hwp-viewer'],
    ['배경 없애기', 'remove-background'],
    ['누끼', 'remove-background'],
    ['pdf 붙이기', 'pdf-merge'],
    ['pdf합치기', 'pdf-merge'],
    ['병합', 'pdf-merge'],
    ['합치가', 'pdf-merge'],
    ['큐알', 'qr-code'],
    ['QR', 'qr-code'],
    ['heic', 'image-to-jpg'],
    ['hwpx', 'hwpx-to-hwp'],
    ['pdf 용량', 'pdf-compress'],
    ['증명사진', 'id-photo'],
    ['여권사진', 'id-photo'],
    ['반명함', 'id-photo'],
    ['pdf 비밀번호 풀기', 'pdf-password'],
    ['글자수', 'char-count'],
    ['글자 수', 'char-count'],
    ['자소서 글자', 'char-count'],
    ['신분증 사본', 'id-copy'],
    ['영어 이름', 'english-name'],
    ['영문 주소', 'english-address'],
    ['사진 pdf로', 'jpg-to-pdf'],
    ['한글 pdf 변환', 'hwp-to-pdf'],
    ['pdf 쪽 빼기', 'pdf-split'],
    ['위임장', 'power-of-attorney'],
    ['차용증', 'loan-note'],
    ['퇴사', 'resignation-letter'],
    ['명함', 'business-card'],
    ['ㅇㅁㅇㄹ', 'english-name'],
    // Spellings around the brief's (D7 aliases, fullwidth, particles).
    ['ＰＤＦ 합치기', 'pdf-merge'],
    ['피디에프 합치기', 'pdf-merge'],
    ['사진을 작게', 'photo-compress'],
    ['아래아한글 열기', 'hwp-viewer'],
  ];
  it.each(top1)('%s -> %s', (q, slug) => {
    expect(toolSlugs(q)[0]).toBe(slug);
  });
  it('서명: top-3 includes pdf-sign and stamp-signature', () => {
    expect(toolSlugs('서명').slice(0, 3)).toEqual(expect.arrayContaining(['pdf-sign', 'stamp-signature']));
  });
  it('도장: top-3 includes stamp-maker and stamp-signature', () => {
    expect(toolSlugs('도장').slice(0, 3)).toEqual(expect.arrayContaining(['stamp-maker', 'stamp-signature']));
  });
  it('jpg: top-3 includes image-to-jpg and pdf-to-jpg', () => {
    expect(toolSlugs('jpg').slice(0, 3)).toEqual(expect.arrayContaining(['image-to-jpg', 'pdf-to-jpg']));
  });
  it('용량: top-2 = pdf-compress, photo-compress', () => {
    expect(toolSlugs('용량').slice(0, 2).sort()).toEqual(['pdf-compress', 'photo-compress']);
  });
  it('pdf: ties go to the 많이 찾는 도구 order (top-2 = pdf-merge, pdf-compress)', () => {
    expect(toolSlugs('pdf').slice(0, 2)).toEqual(['pdf-merge', 'pdf-compress']);
  });
  it('이력서 사진: tools include id-photo, guides include resume-photo', () => {
    expect(toolSlugs('이력서 사진')).toContain('id-photo');
    expect(guideSlugs('이력서 사진')).toContain('resume-photo');
  });
  it('at most 6 tools and 4 guides', () => {
    const r = search(INDEX, '사진', ALL_ON);
    expect(r.tools.length).toBeLessThanOrEqual(6);
    expect(r.guides.length).toBeLessThanOrEqual(4);
  });
});

describe('SEARCH1031 negatives', () => {
  const popular = POPULAR.map((s) => `/${s}/`);
  it('사진 never puts resignation-letter in the top 6', () => {
    expect(toolSlugs('사진')).not.toContain('resignation-letter');
  });
  it.each(['asdfgh', 'ㅁㄴㅇㄹㅁㄴㅇㄹ'])('%s -> none + popular', (q) => {
    const r = search(INDEX, q, ALL_ON);
    expect(r.tools).toEqual([]);
    expect(r.guides).toEqual([]);
    expect(r.popular.map((t) => t.u)).toEqual(popular);
  });
  it.each(['', '   ', '파일 방법'])('empty or stopwords only (%j) -> popular', (q) => {
    const r = search(INDEX, q, ALL_ON);
    expect(r.tools).toEqual([]);
    expect(r.popular.map((t) => t.u)).toEqual(popular);
  });
  it('a 300-character query returns in under 50 ms without throwing', () => {
    search(INDEX, 'warm up');
    const q = '사진 용량 줄이기 피디에프 합치기 '.repeat(20).slice(0, 300);
    const t0 = performance.now();
    expect(() => search(INDEX, q)).not.toThrow();
    expect(performance.now() - t0).toBeLessThan(50);
    const long = '가나다라마바사아자차카타파하'.repeat(22).slice(0, 300);
    const t1 = performance.now();
    expect(() => search(INDEX, long)).not.toThrow();
    expect(performance.now() - t1).toBeLessThan(50);
  });
  it('a flag-off tool named by a concept is skipped (index without remove-background)', () => {
    const off = searchIndex(INDEX.t.filter((t) => t.u !== '/remove-background/'), INDEX.g);
    expect(toolSlugs('누끼', off)).not.toContain('remove-background');
    expect(() => search(off, '배경 없애기', ALL_ON)).not.toThrow();
  });
  it('popular skips a slug missing from the index', () => {
    const off = searchIndex(INDEX.t.filter((t) => t.u !== '/pdf-merge/'), INDEX.g);
    expect(search(off, '', ALL_ON).popular.map((t) => t.u)).toEqual(popular.filter((u) => u !== '/pdf-merge/'));
  });
});

describe('SEARCH1031 helpers', () => {
  it('normalize: spaces, fullwidth, case, punctuation, typed jamo', () => {
    expect(clean('  ＰＤＦ   합치기 ')).toBe('pdf 합치기');
    expect(clean('여권·증명사진 (규격)「맞추기」')).toBe('여권 증명사진 규격 맞추기');
    expect(compact('HWP·HWPX 파일 보기')).toBe('hwphwpx파일보기');
    expect(clean('ㅇㅁㅇㄹ')).toBe('ㅇㅁㅇㄹ');
  });
  it('jamo and choseong', () => {
    expect(toJamo('합치기')).toBe('ㅎㅏㅂㅊㅣㄱㅣ');
    expect(choseong('영문 이름 변환기')).toBe('ㅇㅁㅇㄹㅂㅎㄱ');
    expect(isChoseongQuery('ㅇㅁ')).toBe(true);
    expect(isChoseongQuery('ㅇ')).toBe(false);
    expect(isChoseongQuery('ㅇ문')).toBe(false);
  });
  it('distance bounds', () => {
    expect(distance(toJamo('합치가'), toJamo('합치기'), 1)).toBe(1);
    expect(distance('abcd', 'abdc', 1)).toBe(1);
    expect(distance('abcdef', 'ghijkl', 2)).toBe(3);
    expect(distance('a', 'abcd', 1)).toBe(2);
    expect([fuzzyBudget(5), fuzzyBudget(6), fuzzyBudget(11), fuzzyBudget(12)]).toEqual([0, 1, 1, 2]);
    // 사진 (5 jamo) gets no allowance, so it never reaches 사직.
    expect(fuzzyBudget([...toJamo('사진')].length)).toBe(0);
  });
  it('stopwords and particles', () => {
    expect(tokenize('한글 파일 여는 방법').tokens.map((t) => t.forms.at(-1))).toEqual(['hwp', '여는']);
    expect(stripParticle('사진을')).toBe('사진');
    expect(stripParticle('사진으로')).toBe('사진');
    expect(stripParticle('누끼')).toBe('누끼');
    expect(stripParticle('종이')).toBe('종이');
  });
  it('alias folding: whole-word aliases stay inside other words', () => {
    expect(foldWord('큐알코드')).toBe('qr');
    expect(foldWord('피디에프합치기')).toBe('pdf합치기');
    expect(foldWord('한글파일')).toBe('hwp');
    expect(foldWord('사인')).toBe('서명');
    expect(foldWord('디자인')).toBe('디자인');
  });
  it('every synonym slug is a tool (TOOLS + flag tools); every alias key is lower case', () => {
    const slugs = new Set([...TOOLS, BG_REMOVE_TOOL, ADDR_EN_TOOL, ID_CAMERA_TOOL].map((t) => t.slug));
    for (const c of ALL_ON) for (const s of c.tools) expect(slugs, `${c.id}: ${s}`).toContain(s);
    for (const s of POPULAR) expect(slugs).toContain(s);
    for (const a of ALIASES) expect(a.key).toBe(a.key.toLowerCase());
  });
  it('a flag-off build names no flag-gated tool in the concept table', () => {
    expect(CONCEPTS.find((c) => c.id === 'bg')?.tools).toEqual([]);
    expect(CONCEPTS.find((c) => c.id === 'addr-en')?.tools).toEqual([]);
    expect(Object.keys(FLAG_TOOLS).every((id) => CONCEPTS.some((c) => c.id === id))).toBe(true);
  });
});
