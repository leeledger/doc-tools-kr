// 국어의 로마자 표기법 for names (brief ROMANIZE1016 D2; 국립국어원, 문화체육관광부 고시 제2014-42호). Pure, no DOM.
// A name part (surname or given name) is romanized syllable by syllable with no sound change (제3장 제4항 1), except
// what the letter tables themselves prescribe inside a part when the syllables are written together:
//   - a final before a syllable that starts with ㅇ moves to it (제2장 제2항 [붙임 1]·[붙임 2] 「모음 앞에서는」);
//     a double final keeps its first letter and moves the second; ㅇ stays ng;
//   - ㄹ final + ㄹ initial → ll ([붙임 2] 「단, ‘ㄹㄹ’은 ‘ll’로 적는다.」).
// Everywhere else a final takes its representative value (standalone; 표준 발음법 제9-11항, logged in BUILD-LOG) and
// the next initial is written as is: no nasalization, ㄴ/ㄹ insertion, palatalization, aspiration or tensing.

const BASE = 0xac00;
const LAST = 0xd7a3;
/** Initial jamo order of U+AC00-D7A3: ㄱ ㄲ ㄴ ㄷ ㄸ ㄹ ㅁ ㅂ ㅃ ㅅ ㅆ ㅇ ㅈ ㅉ ㅊ ㅋ ㅌ ㅍ ㅎ. */
const INITIAL = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const IEUNG = 11;
const RIEUL = 5;
/** 제2장 제1항: ㅏ ㅐ ㅑ ㅒ ㅓ ㅔ ㅕ ㅖ ㅗ ㅘ ㅙ ㅚ ㅛ ㅜ ㅝ ㅞ ㅟ ㅠ ㅡ ㅢ ㅣ (ㅢ is ui always, [붙임 1]). */
const VOWEL = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
/**
 * Finals (index 1-27): ㄱ ㄲ ㄳ ㄴ ㄵ ㄶ ㄷ ㄹ ㄺ ㄻ ㄼ ㄽ ㄾ ㄿ ㅀ ㅁ ㅂ ㅄ ㅅ ㅆ ㅇ ㅈ ㅊ ㅋ ㅌ ㅍ ㅎ.
 * STANDALONE: end of a part, before a consonant, or in the hyphen / space shapes.
 */
const STANDALONE = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
/** Before a syllable starting with ㅇ: [what stays as the final, what becomes the next initial]. ㅇ (21) never moves. */
const LIAISON: readonly (readonly [string, string] | null)[] = [
  null,
  ['', 'g'], ['', 'kk'], ['k', 's'], ['', 'n'], ['n', 'j'], ['n', 'h'], ['', 'd'], ['', 'r'],
  ['l', 'g'], ['l', 'm'], ['l', 'b'], ['l', 's'], ['l', 't'], ['l', 'p'], ['l', 'h'],
  ['', 'm'], ['', 'b'], ['p', 's'], ['', 's'], ['', 'ss'], null, ['', 'j'], ['', 'ch'], ['', 'k'], ['', 't'], ['', 'p'], ['', 'h'],
];

interface Jamo {
  readonly l: number;
  readonly v: number;
  readonly t: number;
}

export const isSyllable = (ch: string): boolean => {
  const c = ch.codePointAt(0) ?? 0;
  return ch.length === 1 && c >= BASE && c <= LAST;
};

const jamo = (ch: string): Jamo => {
  const i = ch.charCodeAt(0) - BASE;
  return { l: Math.floor(i / 588), v: Math.floor((i % 588) / 28), t: i % 28 };
};

/** One syllable on its own (lower case): the hyphen and space shapes, and a syllable next to a picked spelling. */
export function standalone(syllable: string): string {
  const { l, v, t } = jamo(syllable);
  return INITIAL[l]! + VOWEL[v]! + STANDALONE[t]!;
}

/**
 * A run of a name part (lower case). `spellings[i]` (lower case, verbatim) replaces syllable i when given; the joined
 * rules apply only between two neighbouring syllables that both use the 표기법 spelling (brief D3).
 */
export function joined(syllables: readonly string[], spellings: readonly (string | undefined)[] = []): string {
  let out = '';
  let carried: string | null = null;
  syllables.forEach((syl, i) => {
    const pick = spellings[i];
    if (pick !== undefined) {
      out += pick;
      carried = null;
      return;
    }
    const { l, v, t } = jamo(syl);
    const head: string = carried ?? INITIAL[l]!;
    carried = null;
    const next = syllables[i + 1];
    const nextRule = next !== undefined && spellings[i + 1] === undefined ? jamo(next) : null;
    let tail = STANDALONE[t]!;
    if (nextRule && nextRule.l === IEUNG && LIAISON[t]) {
      [tail, carried] = LIAISON[t]!;
    } else if (nextRule && nextRule.l === RIEUL && tail === 'l') {
      carried = 'l';
    }
    out += head + VOWEL[v]! + tail;
  });
  return out;
}

/** NFC, then every white space removed (inputs drop inner spaces; brief D2 Input). */
export const normalizeName = (s: string): string => s.normalize('NFC').replace(/\s+/gu, '');

/** True when every character is a precomposed Hangul syllable and the length is in [min, max]. */
export function validPart(s: string, min: number, max: number): boolean {
  const chars = [...s];
  return chars.length >= min && chars.length <= max && chars.every(isSyllable);
}

export const SURNAME_MAX = 2;
export const GIVEN_MAX = 10;
