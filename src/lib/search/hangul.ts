// SEARCH1031 D6: Hangul helpers for the site search: syllables to jamo, the initial-consonant (choseong) string and a
// bounded Damerau-Levenshtein distance (optimal string alignment) on jamo for typo tolerance.

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const BASE = 0xac00;
const LAST = 0xd7a3;

/** Each Hangul syllable split into its jamo (compatibility letters); anything else kept as is. */
export function toJamo(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < BASE || cp > LAST) {
      out += ch;
      continue;
    }
    const i = cp - BASE;
    out += CHO[Math.floor(i / 588)]! + JUNG[Math.floor((i % 588) / 28)]! + JONG[i % 28]!;
  }
  return out;
}

/** The initial consonant of every Hangul syllable (영문 이름 -> ㅇㅁㅇㄹ); other characters are dropped. */
export function choseong(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp >= BASE && cp <= LAST) out += CHO[Math.floor((cp - BASE) / 588)];
    else if (CHO.includes(ch)) out += ch;
  }
  return out;
}

/** True for a word of two or more initial consonants only (ㅇㅁㅇㄹ): the choseong search mode (D8). */
export function isChoseongQuery(s: string): boolean {
  return s.length >= 2 && [...s].every((ch) => CHO.includes(ch));
}

/**
 * Damerau-Levenshtein distance (optimal string alignment) between a and b when it is at most max, else max + 1.
 * Stops as soon as a whole row exceeds max, so a long query costs little.
 */
export function distance(a: string, b: string, max: number): number {
  const x = [...a];
  const y = [...b];
  if (Math.abs(x.length - y.length) > max) return max + 1;
  if (!x.length || !y.length) return Math.max(x.length, y.length);
  let prev2: number[] = [];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return Math.min(prev[y.length]!, max + 1);
}

/** The fuzzy allowance for a word of n jamo (D8): none below 6, 1 for 6-11, 2 from 12. */
export function fuzzyBudget(n: number): number {
  return n < 6 ? 0 : n < 12 ? 1 : 2;
}
