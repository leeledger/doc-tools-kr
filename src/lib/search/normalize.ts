// SEARCH1031 D6: text normalization for the site search. NFKC (fullwidth to ASCII), lower case, the punctuation
// people type or the names carry (· - _ / ( ) 「 」 . , and the like) to spaces, spaces collapsed.

// NFKC turns the compatibility jamo people type (ㅇㅁ, U+3131…) into conjoining jamo (U+1100…); these map them back.
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const PUNCT = /[\s·•\-_/\\()[\]{}「」『』《》<>〈〉.,:;!?~'"`|+*&^%$#@=→←↔]+/g;

function compatJamo(s: string): string {
  return s.replace(/[ᄀ-하-ᅵ]/g, (c) => {
    const cp = c.codePointAt(0)!;
    return cp <= 0x1112 ? CHO[cp - 0x1100]! : JUNG[cp - 0x1161]!;
  });
}

/** Normalized words joined by single spaces ('' for nothing searchable). */
export function clean(s: string): string {
  return compatJamo(s.normalize('NFKC').toLowerCase()).replace(PUNCT, ' ').trim();
}

/** clean() without the spaces. */
export function compact(s: string): string {
  return clean(s).replace(/ /g, '');
}
