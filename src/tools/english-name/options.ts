// Choices, composition and warnings for /english-name/ (brief ROMANIZE1016 D3). Pure, no DOM. Spellings here are
// upper case; romanize.ts works in lower case.
import { GIVEN, SURNAMES } from './mofa';
import { joined, standalone } from './romanize';

export interface Choice {
  /** Upper case spelling. */
  readonly spelling: string;
  /** 외교부 통계 예시 비율 when the list has this spelling. */
  readonly pct?: number;
  /** The 국어의 로마자 표기법 result. */
  readonly rule: boolean;
}

const upper = (s: string): string => s.toUpperCase();

/** The 표기법 result of a surname: always one joined word (남궁 → NAMGUNG). */
export const ruleSurname = (surname: string): string => upper(joined([...surname]));

/**
 * Surname choices: the listed spellings (highest count first) when the surname is in the 외교부 list, then the 표기법
 * result when it is not already listed; otherwise the 표기법 result alone. The first is the default. 「직접 쓰기」 is the
 * page's extra choice (customSurname).
 */
export function surnameChoices(surname: string): Choice[] {
  const rule = ruleSurname(surname);
  const listed = SURNAMES[surname];
  if (!listed) return [{ spelling: rule, rule: true }];
  const out: Choice[] = [...listed.spellings].sort((a, b) => b.count - a.count).map((s) => ({ spelling: s.s, pct: s.pct, rule: s.s === rule }));
  if (!out.some((c) => c.rule)) out.push({ spelling: rule, rule: true });
  return out;
}

export const inSurnameList = (surname: string): boolean => Object.hasOwn(SURNAMES, surname);

/**
 * A given-name syllable's choices: the 표기법 spelling first (the default; with its 비율 when the list has it), then the
 * other listed spellings. null when the syllable is not in the list or the list adds nothing to the 표기법 spelling.
 */
export function syllableChoices(syllable: string): Choice[] | null {
  const listed = Object.hasOwn(GIVEN, syllable) ? GIVEN[syllable] : undefined;
  if (!listed) return null;
  const rule = upper(standalone(syllable));
  const same = listed.spellings.find((s) => s.s === rule);
  const others = [...listed.spellings].filter((s) => s.s !== rule).sort((a, b) => b.count - a.count);
  if (!others.length) return null;
  return [{ spelling: rule, rule: true, ...(same ? { pct: same.pct } : {}) }, ...others.map((s) => ({ spelling: s.s, pct: s.pct, rule: false }))];
}

/** 직접 쓰기: A-Z, space and hyphen, 1-30 characters after trimming; upper case. null when not valid. */
export function customSurname(text: string): string | null {
  const s = text.trim().replace(/\s+/g, ' ');
  return /^[A-Za-z][A-Za-z -]{0,29}$/.test(s) && /[A-Za-z]$/.test(s) ? upper(s) : null;
}

export interface Given {
  /** 붙여 쓰기. */
  readonly joined: string;
  /** 붙임표 넣기. */
  readonly hyphen: string;
  /** 빈칸 넣기. */
  readonly space: string;
  /** The per-syllable spellings (the hyphen / space segments). */
  readonly segments: readonly string[];
}

/** The given name in the three shapes; `picks[i]` is a listed spelling for syllable i (undefined = 표기법). */
export function composeGiven(given: string, picks: readonly (string | undefined)[] = []): Given {
  const syl = [...given];
  const lower = syl.map((_, i) => (picks[i] === undefined ? undefined : picks[i]!.toLowerCase()));
  const segments = syl.map((s, i) => upper(lower[i] ?? standalone(s)));
  return { joined: upper(joined(syl, lower)), hyphen: segments.join('-'), space: segments.join(' '), segments };
}

export type Shape = 'joined' | 'hyphen' | 'space';
export type Case = 'upper' | 'title';
export const SHAPES: readonly Shape[] = ['joined', 'hyphen', 'space'];

/** 첫 글자만 대문자: each space-separated word starts upper, the rest lower (Hong Gil-dong, Hong Gil Dong). */
const title = (s: string): string =>
  s
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** One row: surname, one space, the given name in that shape. */
export function formatName(surname: string, given: Given, shape: Shape, letterCase: Case): string {
  const s = `${surname} ${given[shape]}`;
  return letterCase === 'upper' ? s.toUpperCase() : title(s);
}

/**
 * Spellings 외교부 names as reading badly in English: menuPos=39 examples (S4) and the list's 「부정적 의미로 변경 가능」
 * marks (S5: GOO, KOOK). Exact matches only.
 */
export const NEGATIVE: ReadonlySet<string> = new Set(['GANG', 'SIN', 'SUCK', 'ILL', 'BUM', 'GUN', 'KILL', 'NO', 'BIN', 'DUCK', 'BARK', 'GOO', 'KOOK']);
/** S4: 「여권의 로마자 성 또는 이름의 스펠링이 A, I, O, U 등의 외자인 경우」. */
export const SINGLE: ReadonlySet<string> = new Set(['A', 'I', 'O', 'U']);

export interface Warnings {
  readonly negative: boolean;
  readonly single: boolean;
}

/** Warnings for a surname spelling and a composed given name (brief D3; no other heuristics). */
export function warningsFor(surname: string, given: Given): Warnings {
  const s = surname.toUpperCase();
  return {
    negative: NEGATIVE.has(s) || NEGATIVE.has(given.joined) || given.segments.some((x) => NEGATIVE.has(x)),
    single: SINGLE.has(s) || SINGLE.has(given.joined),
  };
}
