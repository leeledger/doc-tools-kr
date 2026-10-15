// 글자수 세기 (TOOLS1015 C1): count() with and without Intl.Segmenter, the byte rules, lines and paragraphs, the goal
// parse and wording, the 100,000-character paste, and the tools.ts entry (copy rules, FAQ, no deep link).
import { describe, expect, it } from 'vitest';
import { BASES, GOAL_MAX, count, defaultSegmenter, goalStatus, normalize, parseGoal, valueOf } from '../../src/tools/char-count/count';
import { getTool } from '../../src/data/tools';

const seg = defaultSegmenter();

describe('count()', () => {
  it('Intl.Segmenter exists in Node (the fallback is tested by passing null)', () => {
    expect(seg).not.toBeNull();
  });

  it('empty text: all zero, 0 lines, 0 paragraphs', () => {
    expect(count('', seg)).toEqual({ withSpace: 0, noSpace: 0, bytes2: 0, bytes3: 0, lines: 0, paragraphs: 0 });
    expect(count('', null)).toEqual({ withSpace: 0, noSpace: 0, bytes2: 0, bytes3: 0, lines: 0, paragraphs: 0 });
  });

  it('ASCII: 1 byte each in both rules', () => {
    expect(count('Hello, world', seg)).toEqual({ withSpace: 12, noSpace: 11, bytes2: 12, bytes3: 12, lines: 1, paragraphs: 1 });
  });

  it('Hangul: 2 bytes / 3 bytes per syllable', () => {
    expect(count('안녕하세요 문서딱', seg)).toEqual({ withSpace: 9, noSpace: 8, bytes2: 17, bytes3: 25, lines: 1, paragraphs: 1 });
  });

  it('mixed Hangul, Latin, digits and punctuation', () => {
    const c = count('저는 Team 2024년!', seg);
    expect(c.withSpace).toBe(14);
    expect(c.noSpace).toBe(12);
    expect(c.bytes2).toBe(3 * 2 + 11);
    expect(c.bytes3).toBe(3 * 3 + 11);
  });

  it('CRLF and lone CR become one line break: 1 character, 1 byte, not in 공백 제외', () => {
    expect(normalize('a\r\nb\rc')).toBe('a\nb\nc');
    for (const t of ['가\r\n나', '가\r나', '가\n나']) {
      expect(count(t, seg)).toEqual({ withSpace: 3, noSpace: 2, bytes2: 5, bytes3: 7, lines: 2, paragraphs: 1 });
    }
  });

  it('tab, NBSP and U+3000 are white space (공백 제외 leaves them out)', () => {
    const c = count('가\t나\u00a0다\u3000라', seg);
    expect(c.withSpace).toBe(7);
    expect(c.noSpace).toBe(4);
    expect(c.bytes2).toBe(4 * 2 + 1 + 2 + 2);
    expect(c.bytes3).toBe(4 * 3 + 1 + 2 + 3);
  });

  it('an emoji ZWJ family is one character with the segmenter; the code-point fallback counts its parts', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    expect(count(family, seg).withSpace).toBe(1);
    expect(count(family, seg).noSpace).toBe(1);
    expect(count(family, null).withSpace).toBe(5);
    // Bytes count code points either way: 3 emoji (4 bytes in UTF-8) and 2 joiners (3 bytes).
    expect(count(family, seg).bytes3).toBe(3 * 4 + 2 * 3);
    expect(count(family, seg).bytes2).toBe(5 * 2);
  });

  it('decomposed jamo (NFD 한) is one character with the segmenter', () => {
    const nfd = '한'.normalize('NFD');
    expect([...nfd]).toHaveLength(3);
    expect(count(nfd, seg).withSpace).toBe(1);
    expect(count(nfd, null).withSpace).toBe(3);
    expect(count(nfd, seg).bytes3).toBe(9);
  });

  it('a joining character only on one line does not change the other lines', () => {
    const c = count(`abc\n${'한'.normalize('NFD')}\n가나`, seg);
    expect(c.withSpace).toBe(3 + 1 + 1 + 1 + 2);
    expect(c.lines).toBe(3);
  });

  it('lines: a trailing line break starts a line; paragraphs: blocks between blank (or white-space-only) lines', () => {
    expect(count('첫 줄\n', seg).lines).toBe(2);
    expect(count('첫 줄\n', seg).paragraphs).toBe(1);
    expect(count('가\n나\n\n다', seg)).toMatchObject({ lines: 4, paragraphs: 2 });
    expect(count('가\n\n\n\n나\n \t\n다\n', seg)).toMatchObject({ lines: 8, paragraphs: 3 });
    expect(count('\n\n', seg)).toMatchObject({ withSpace: 2, noSpace: 0, lines: 3, paragraphs: 0 });
    expect(count('   ', seg)).toMatchObject({ withSpace: 3, noSpace: 0, lines: 1, paragraphs: 0 });
  });

  it('a lone surrogate half counts 3 bytes in the UTF-8 rule (TextEncoder writes U+FFFD)', () => {
    const lone = 'a\ud800b';
    expect(count(lone, seg).bytes3).toBe(new TextEncoder().encode(lone).length);
  });

  it('the UTF-8 rule equals TextEncoder on mixed text', () => {
    const t = '자소서 Résumé 2024 — ✓ \u{1F600}\n둘째 줄\t끝';
    expect(count(t, seg).bytes3).toBe(new TextEncoder().encode(normalize(t)).length);
    expect(count(t, null).bytes3).toBe(new TextEncoder().encode(normalize(t)).length);
  });

  it('100,000 pasted characters count in under 50 ms', () => {
    const text = '저는 문제를 끝까지 해결하는 사람입니다. Team project 2024!\n\n'.repeat(2500).slice(0, 100_000);
    count(text, seg);
    const t0 = performance.now();
    const c = count(text, seg);
    const ms = performance.now() - t0;
    expect(c.withSpace).toBe(100_000);
    expect(ms).toBeLessThan(50);
  });
});

describe('goal', () => {
  const c = count('가나다 abc', seg);

  it('valueOf reads the chosen basis', () => {
    expect(BASES).toEqual(['space', 'nospace', 'byte2', 'byte3']);
    expect(valueOf(c, 'space')).toBe(7);
    expect(valueOf(c, 'nospace')).toBe(6);
    expect(valueOf(c, 'byte2')).toBe(10);
    expect(valueOf(c, 'byte3')).toBe(13);
  });

  it('parseGoal: whole numbers 1..100,000 (commas allowed), else no goal', () => {
    expect(parseGoal('1000')).toBe(1000);
    expect(parseGoal('1,500')).toBe(1500);
    expect(parseGoal(' 700 ')).toBe(700);
    expect(parseGoal(String(GOAL_MAX))).toBe(100_000);
    for (const bad of ['', '0', '-5', '1.5', '100001', 'abc', '1e3']) expect(parseGoal(bad), bad).toBeNull();
  });

  it('goalStatus: 「N자 남았어요」 / 「N자 넘었어요」, 바이트 for the byte bases, thousands commas', () => {
    expect(goalStatus(990, 1000, 'space')).toEqual({ text: '10자 남았어요', over: false });
    expect(goalStatus(1000, 1000, 'nospace')).toEqual({ text: '0자 남았어요', over: false });
    expect(goalStatus(2234, 1000, 'space')).toEqual({ text: '1,234자 넘었어요', over: true });
    expect(goalStatus(5, 10, 'byte2')).toEqual({ text: '5바이트 남았어요', over: false });
    expect(goalStatus(11, 10, 'byte3')).toEqual({ text: '1바이트 넘었어요', over: true });
  });
});

describe('tools.ts entry', () => {
  const tool = getTool('char-count');

  it('name = h1, title ≤ 40, description 40–80, 5 FAQ, no jargon, 문서딱 only', () => {
    expect(tool.name).toBe('글자수 세기');
    expect(tool.h1).toBe(tool.name);
    expect([...tool.title].length).toBeLessThanOrEqual(40);
    expect([...tool.description].length).toBeGreaterThanOrEqual(40);
    expect([...tool.description].length).toBeLessThanOrEqual(80);
    expect(tool.faq).toHaveLength(5);
    const all = [tool.title, tool.description, tool.summary, ...tool.faq.flatMap((f) => [f.q, f.a])].join(' ');
    expect(all).not.toMatch(/업로드|서버|브라우저|네트워크|메모리|UTF-8|EUC-KR/);
  });

  it('the FAQ says the text is not saved and links the 사람인 / 잡코리아 presets', () => {
    expect(tool.faq.find((f) => f.q.includes('저장'))!.a).toContain('저장하지 않습니다');
    const links = tool.faq.flatMap((f) => f.links ?? []).map((l) => l.href);
    expect(links).toEqual(expect.arrayContaining(['/id-photo/?preset=saramin', '/id-photo/?preset=jobkorea', '/guide/resume-photo/']));
  });
});

describe('fast path equals the segmenter (round 2, Richard r1)', () => {
  const fc = (...cps: number[]): string => String.fromCodePoint(...cps);
  const segCount = (s: string): number => {
    let n = 0;
    for (const line of normalize(s).split(String.fromCharCode(10))) n += [...seg!.segment(line)].length;
    return n + normalize(s).split(String.fromCharCode(10)).length - 1;
  };

  it('single emoji, emoji with skin tone, flag, CJK Ext. B, Thai SARA AM, halfwidth sound mark: as the segmenter', () => {
    const cases = [
      fc(0x1f600), // 😀
      '안녕' + fc(0x1f600),
      fc(0x1f44d, 0x1f3fb), // 👍🏻
      fc(0x1f1f0, 0x1f1f7), // 🇰🇷
      fc(0x20000), // 𠀀
      'ก' + fc(0x0e33), // กำ
      fc(0xff76, 0xff9e), // ｶﾞ
      fc(0x0600) + 'a', // Arabic Prepend
    ];
    for (const s of cases) {
      const want = [...seg!.segment(s)].length;
      expect(count(s, seg).withSpace, s).toBe(want);
      expect(count(s, seg).noSpace, s).toBe(want);
    }
    expect(count(fc(0x1f600), seg).withSpace).toBe(1);
    expect(count('안녕' + fc(0x1f600), seg).withSpace).toBe(3);
  });

  it('every BMP code point next to a, 가 and ก: count() equals a segmenter-only count', () => {
    const bad: string[] = [];
    for (let cp = 0; cp <= 0xffff; cp++) {
      if (cp === 10 || cp === 13 || (cp >= 0xd800 && cp <= 0xdfff)) continue;
      const ch = String.fromCharCode(cp);
      for (const s of ['a' + ch, ch + 'a', '가' + ch, 'ก' + ch]) {
        if (count(s, seg).withSpace !== segCount(s)) bad.push(cp.toString(16));
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });
});
