// Korean particle choice (UX-AUDIT-2 P1-6): 은/는, 이/가, 을/를, 과/와 and 으로/로 after any word, file name
// or number. The choice follows how the last sound is read aloud:
// - Hangul: the final consonant (받침) of the last syllable; ㄹ counts as "no 받침" for 으로/로.
// - Digits: the Korean reading of the number's tail (1518 → 팔 → 로; 20 → 이십 → 으로; 1000 → 천 → 은).
// - Latin letters: the Korean letter name (L 엘, M 엠, N 엔 and R 알 end in a consonant; "txt" → 티 → 는).
// Trailing closing marks and spaces (」, ), ", ') are skipped: the particle follows the word they close.

export type Josa = '은/는' | '이/가' | '을/를' | '과/와' | '으로/로';

type Final = 'none' | 'rieul' | 'other';

const CLOSERS = /[\s)\]}」』"'’”>]+$/u;

/** Korean reading of a digit (0–9): does it end in a consonant? 영 일 이 삼 사 오 육 칠 팔 구. */
const DIGIT_FINAL: readonly Final[] = ['other', 'rieul', 'none', 'other', 'none', 'none', 'other', 'rieul', 'rieul', 'none'];

/** Letter names ending in a consonant: L 엘, M 엠, N 엔, R 알. */
const LETTER_FINAL: Readonly<Record<string, Final>> = { l: 'rieul', m: 'other', n: 'other', r: 'rieul' };

function numberFinal(digits: string): Final {
  // A trailing zero is read as 영 or as a unit (십 ㅂ, 백 ㄱ, 천 ㄴ, 만 ㄴ, 억 ㄱ): always a consonant, never ㄹ.
  return DIGIT_FINAL[Number(digits[digits.length - 1])]!;
}

/** How the last sound of `word` ends. */
export function finalSound(word: string): Final {
  const w = word.replace(CLOSERS, '');
  if (!w) return 'none';
  const digits = /(\d+)(?:[.,]\d+)*$/.exec(w);
  if (digits) {
    // "1.5" is read 일 점 오: the last group decides. "1,518" is one number: drop the separators.
    const m = /[.](\d+)$/.exec(w);
    if (m) return DIGIT_FINAL[Number(m[1]![m[1]!.length - 1])]!;
    return numberFinal(digits[0].replace(/,/g, ''));
  }
  const ch = w[w.length - 1]!;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    if (jong === 0) return 'none';
    return jong === 8 ? 'rieul' : 'other';
  }
  if (/[a-z]/i.test(ch)) return LETTER_FINAL[ch.toLowerCase()] ?? 'none';
  return 'none';
}

/** The particle alone. */
export function particle(word: string, josa: Josa): string {
  const f = finalSound(word);
  const [withFinal, withoutFinal] = josa.split('/') as [string, string];
  if (josa === '으로/로') return f === 'other' ? withFinal : withoutFinal;
  return f === 'none' ? withoutFinal : withFinal;
}

/** The word followed by its particle: josa('1518', '으로/로') → "1518로". */
export function josa(word: string, j: Josa): string {
  return `${word}${particle(word, j)}`;
}
