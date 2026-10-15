// 글자수 세기 (TOOLS1015 C1): the counts, pure (no DOM). A character is what the reader sees as one (a grapheme
// cluster: an emoji family or a decomposed 한글 syllable is 1) where Intl.Segmenter exists, else one code point.

export interface Counts {
  /** 공백 포함: every character, a line break is 1. */
  withSpace: number;
  /** 공백 제외: characters that are not white space (space, tab, line break, NBSP, U+3000 …). */
  noSpace: number;
  /** 한글 2바이트로 셀 때: U+0000–U+007F is 1 byte, anything else 2. */
  bytes2: number;
  /** 한글 3바이트로 셀 때: the UTF-8 length. */
  bytes3: number;
  /** 0 for empty text, else the number of `\n`-separated lines (a trailing line break starts a line). */
  lines: number;
  /** Non-blank blocks separated by at least one blank (or white-space-only) line. */
  paragraphs: number;
}

/** The goal basis (also the usage `basis` value). */
export type Basis = 'space' | 'nospace' | 'byte2' | 'byte3';
export const BASES: readonly Basis[] = ['space', 'nospace', 'byte2', 'byte3'];

export const GOAL_MIN = 1;
export const GOAL_MAX = 100_000;

/** The part of Intl.Segmenter this file uses. */
export interface GraphemeSegmenter {
  segment(input: string): Iterable<{ segment: string }>;
}

/** The Korean grapheme segmenter, or null where the API is missing (the code-point fallback is used then). */
export function defaultSegmenter(): GraphemeSegmenter | null {
  const S = (globalThis.Intl as { Segmenter?: new (locale: string, opts: { granularity: 'grapheme' }) => GraphemeSegmenter }).Segmenter;
  return typeof S === 'function' ? new S('ko', { granularity: 'grapheme' }) : null;
}

/** `\r\n` and a lone `\r` become `\n`. */
export const normalize = (s: string): string => s.replace(/\r\n?/g, '\n');

const SPACE_RE = /^\s+$/u;
/**
 * Code points that never join a neighbour into one grapheme: every BMP code point except combining marks, the
 * joiners and variation selectors, Hangul jamo (and the two Hangul fillers) and the surrogate halves. A line made only
 * of these has one grapheme per UTF-16 unit, so the segmenter is skipped (a pasted 100,000-character 자소서 stays fast).
 */
const SIMPLE_RE = /^[^\p{M}\u200c\u200d\ufe00-\ufe0f\u1100-\u11ff\ua960-\ua97f\ud7b0-\ud7ff\ud800-\udfff\u3164\uffa0]*$/u;

export function count(raw: string, segmenter: GraphemeSegmenter | null = defaultSegmenter()): Counts {
  const text = normalize(raw);
  const c: Counts = { withSpace: 0, noSpace: 0, bytes2: 0, bytes3: 0, lines: 0, paragraphs: 0 };
  if (text.length === 0) return c;
  // A line break is always a grapheme boundary, so each line is counted on its own: only a line holding a joining
  // character pays for the segmenter. The line breaks themselves: 1 in 공백 포함, 1 byte in both byte counts.
  const lines = text.split('\n');
  const breaks = lines.length - 1;
  c.withSpace = breaks;
  c.bytes2 = breaks;
  c.bytes3 = breaks;
  c.lines = lines.length;
  let inBlock = false;
  for (const line of lines) {
    if (segmenter === null) {
      for (const ch of line) {
        c.withSpace++;
        if (!SPACE_RE.test(ch)) c.noSpace++;
      }
    } else if (SIMPLE_RE.test(line)) {
      c.withSpace += line.length;
      for (let i = 0; i < line.length; i++) if (!SPACE_RE.test(line[i]!)) c.noSpace++;
    } else {
      for (const { segment } of segmenter.segment(line)) {
        c.withSpace++;
        if (!SPACE_RE.test(segment)) c.noSpace++;
      }
    }
    // Bytes per code point (a lone surrogate half counts 3 in UTF-8, as TextEncoder writes U+FFFD for it).
    for (const ch of line) {
      const cp = ch.codePointAt(0)!;
      c.bytes2 += cp < 0x80 ? 1 : 2;
      c.bytes3 += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    }
    const blank = line.length === 0 || SPACE_RE.test(line);
    if (!blank && !inBlock) c.paragraphs++;
    inBlock = !blank;
  }
  return c;
}

/** The number a goal is measured in. */
export function valueOf(c: Counts, basis: Basis): number {
  if (basis === 'nospace') return c.noSpace;
  if (basis === 'byte2') return c.bytes2;
  if (basis === 'byte3') return c.bytes3;
  return c.withSpace;
}

/** A goal from the number field: a whole number in GOAL_MIN..GOAL_MAX, else null (no goal). */
export function parseGoal(raw: string): number | null {
  const s = raw.replace(/[,\s]/g, '');
  if (!/^\d{1,6}$/.test(s)) return null;
  const n = Number(s);
  return n >= GOAL_MIN && n <= GOAL_MAX ? n : null;
}

const fmt = (n: number): string => n.toLocaleString('ko-KR');

/** 「N자 남았어요」 / 「N자 넘었어요」 (바이트 for the byte bases); `over` once the value passes the goal. */
export function goalStatus(value: number, goal: number, basis: Basis): { text: string; over: boolean } {
  const unit = basis === 'byte2' || basis === 'byte3' ? '바이트' : '자';
  const over = value > goal;
  return { text: over ? `${fmt(value - goal)}${unit} 넘었어요` : `${fmt(goal - value)}${unit} 남았어요`, over };
}
