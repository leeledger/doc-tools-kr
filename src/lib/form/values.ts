// 양식 채우기 엔진 (FORM1020 D3 values.ts): what the visitor typed → the text the document gets. Pure. Every field is
// optional (D6: the blank form); a value is NFC, without control characters (a multiline field keeps its line
// breaks), within maxLines lines and maxLength code points. Runs on the page and again in the worker.
// LOAN1022 L-D3: an amount is whole 원 as 1–12 digits and a number a decimal (NFKC first, so full-width digits count;
// commas, spaces and a trailing 원 / % are dropped). Anything else is empty, and fieldProblem() names it so the page
// blocks the build instead of dropping what was typed. docText() is a value's text in the document.
import { amountHangul, groupDigits } from './amount';
import type { FormField, FormSpec, FormValues } from './spec';

// C0 and C1 controls except the line feed (kept for multiline, turned into a space otherwise).
const CONTROLS = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The first `n` code points of `s`. */
const cut = (s: string, n: number): string => {
  const cps = [...s];
  return cps.length > n ? cps.slice(0, n).join('') : s;
};

/** A valid calendar date YYYY-MM-DD (years 1900–2999) or ''. */
export function normalizeDate(raw: string): string {
  const m = ISO_DATE.exec(raw.trim());
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2999 || mo < 1 || mo > 12 || d < 1) return '';
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= days ? m[0] : '';
}

/** 「2026년 10월 20일」 for a normalized date; '' for ''. */
export function formatDate(iso: string): string {
  const m = ISO_DATE.exec(iso);
  return m ? `${Number(m[1])}년 ${Number(m[2])}월 ${Number(m[3])}일` : '';
}

/** The most digits an amount may have (under 1조 원). */
export const AMOUNT_MAX_DIGITS = 12;

/** NFKC without commas and white space, and without one trailing `unit`. */
const numeric = (raw: string, unit: string): string => {
  const s = raw.normalize('NFKC').replace(/[,\s]/g, '');
  return s.endsWith(unit) ? s.slice(0, -unit.length) : s;
};

/** Whole 원 as digits without leading zeros (1–12 digits), or '' (zero, or anything that is not an amount). */
export function normalizeAmount(raw: string): string {
  const s = numeric(raw, '원');
  if (!/^\d+$/.test(s)) return '';
  const d = s.replace(/^0+/, '');
  return d.length <= AMOUNT_MAX_DIGITS ? d : '';
}

/** A decimal of up to 3 digits and 2 decimals, written plainly (「5」, 「4.5」, 「0」), or ''. */
export function normalizeNumber(raw: string): string {
  const s = numeric(raw, '%');
  return /^\d{1,3}(\.\d{1,2})?$/.test(s) ? String(Number(s)) : '';
}

export type FieldProblem = 'number' | 'tooBig';

/**
 * What is wrong with what the visitor typed in an amount or number field: something that is not a number (`number`),
 * or an amount of more than 12 digits (`tooBig`); null when it is fine or empty. Other kinds never have a problem.
 */
export function fieldProblem(field: FormField, raw: string): FieldProblem | null {
  if (field.kind !== 'amount' && field.kind !== 'number') return null;
  if (!raw.trim() || normalizeField(field, raw)) return null;
  if (field.kind === 'amount') {
    const s = numeric(raw, '원');
    if (/^\d+$/.test(s) && s.replace(/^0+/, '').length > AMOUNT_MAX_DIGITS) return 'tooBig';
  }
  return 'number';
}

/**
 * A normalized value as the document writes it: a date 「2026년 10월 20일」 (empty 「     년     월     일」); an amount
 * 「금 일천만원정 (10,000,000원)」; a number through docTemplate (`{v}`; 0 → docZero when set); any empty value →
 * docBlank when set, else ''. Text and multiline values as they are.
 */
export function docText(field: FormField, value: string): string {
  if (field.kind === 'date') return formatDate(value) || (field.docBlank ?? BLANK_DATE);
  if (!value) return field.docBlank ?? '';
  if (field.kind === 'amount') return `금 ${amountHangul(value)}원정 (${groupDigits(value)}원)`;
  if (field.kind === 'number') {
    if (Number(value) === 0 && field.docZero !== undefined) return field.docZero;
    return field.docTemplate ? field.docTemplate.replace('{v}', value) : value;
  }
  return value;
}

/** The date of the blank form (D5). */
export const BLANK_DATE = '     년     월     일';

/** One field's value. Anything that is not a string is empty. */
export function normalizeField(field: FormField, raw: unknown): string {
  if (typeof raw !== 'string') return '';
  if (field.kind === 'date') return normalizeDate(raw);
  if (field.kind === 'amount') return normalizeAmount(raw);
  if (field.kind === 'number') return normalizeNumber(raw);
  let s = raw.normalize('NFC').replace(LONE_SURROGATE, '').replace(/\r\n?|[\u2028\u2029]/g, '\n').replace(/\t/g, ' ').replace(CONTROLS, '');
  if (field.kind === 'multiline') {
    const lines = s.split('\n').map((l) => l.trimEnd());
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    while (lines.length && !lines[0]!.trim()) lines.shift();
    s = lines.slice(0, Math.max(1, field.maxLines ?? 1)).join('\n');
  } else s = s.replace(/\n/g, ' ').trim();
  return cut(s, field.maxLength).trimEnd();
}

/** Every field of `spec` normalized (unknown keys dropped, missing ones empty). */
export function normalizeValues(spec: FormSpec, raw: Readonly<Record<string, unknown>>): FormValues {
  const out: FormValues = {};
  for (const f of spec.fields) out[f.id] = normalizeField(f, Object.prototype.hasOwnProperty.call(raw, f.id) ? raw[f.id] : '');
  return out;
}

/** All fields empty: the blank form (D6). */
export const blankValues = (spec: FormSpec): FormValues => normalizeValues(spec, {});
