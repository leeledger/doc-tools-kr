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
  return unit && s.endsWith(unit) ? s.slice(0, -unit.length) : s;
};

/**
 * Whole 원 as digits without leading zeros (1–maxDigits digits), or '' (zero, or anything that is not an amount).
 * allowZero (QUOTE1112 Q4): zeros only are the amount 「0」.
 */
export function normalizeAmount(raw: string, maxDigits: number = AMOUNT_MAX_DIGITS, allowZero = false): string {
  const s = numeric(raw, '원');
  if (!/^\d+$/.test(s)) return '';
  const d = s.replace(/^0+/, '');
  if (!d) return allowZero ? '0' : '';
  return d.length <= Math.min(maxDigits, AMOUNT_MAX_DIGITS) ? d : '';
}

/** QUOTE1112 Q4: the most integer and decimal digits of a quantity. */
export const QUANTITY_INT_DIGITS = 6;
export const QUANTITY_DECIMALS = 2;
const QUANTITY = new RegExp(`^(\\d+)(?:\\.(\\d{1,${QUANTITY_DECIMALS}}))?$`);

/** A quantity of up to 6 digits and 2 decimals, 0 allowed, written plainly (「1000」, 「2.5」, 「0」), or ''. */
export function normalizeQuantity(raw: string): string {
  const m = QUANTITY.exec(numeric(raw, ''));
  if (!m) return '';
  const int = m[1]!.replace(/^0+(?=\d)/, '');
  if (int.length > QUANTITY_INT_DIGITS) return '';
  const dec = (m[2] ?? '').replace(/0+$/, '');
  return dec ? `${int}.${dec}` : int;
}

/** 「1,000」 / 「2.5」 for a normalized quantity. */
export function groupQuantity(q: string): string {
  const [int, dec] = q.split('.');
  return dec ? `${groupDigits(int!)}.${dec}` : groupDigits(int!);
}

/** QUOTE1112 Q4: a choice's value when it is one of the options, else the first option's (or '' without options). */
export function normalizeChoice(field: FormField, raw: string): string {
  const o = field.options ?? [];
  return o.find((x) => x.value === raw)?.value ?? o[0]?.value ?? '';
}

/** A decimal of up to 3 digits and 2 decimals, written plainly (「5」, 「4.5」, 「0」), or ''. */
export function normalizeNumber(raw: string): string {
  const s = numeric(raw, '%');
  return /^\d{1,3}(\.\d{1,2})?$/.test(s) ? String(Number(s)) : '';
}

export type FieldProblem = 'number' | 'tooBig' | 'zero';

/**
 * What is wrong with what the visitor typed in an amount or number field: something that is not a number (`number`),
 * an amount of more than 12 digits (`tooBig`) or an amount of zeros only (`zero`: a number, but no amount; never
 * taken as empty); null when it is fine or empty. Other kinds never have a problem.
 */
export function fieldProblem(field: FormField, raw: string): FieldProblem | null {
  if (field.kind !== 'amount' && field.kind !== 'number' && field.kind !== 'quantity') return null;
  if (!raw.trim() || normalizeField(field, raw)) return null;
  if (field.kind === 'amount') {
    const s = numeric(raw, '원');
    if (/^0+$/.test(s)) return 'zero';
    if (/^\d+$/.test(s) && s.replace(/^0+/, '').length > Math.min(field.maxDigits ?? AMOUNT_MAX_DIGITS, AMOUNT_MAX_DIGITS)) return 'tooBig';
  }
  // QUOTE1112 Q4: a quantity with more than 6 whole digits is too big; anything else is not a number.
  if (field.kind === 'quantity' && /^\d+(\.\d+)?$/.test(numeric(raw, '')) && numeric(raw, '').split('.')[0]!.replace(/^0+/, '').length > QUANTITY_INT_DIGITS) return 'tooBig';
  return 'number';
}

/**
 * A normalized value as the document writes it: a date 「2026년 10월 20일」 (empty 「     년     월     일」); an amount
 * 「금 일천만원정 (10,000,000원)」; a number through docTemplate (`{v}`; 0 → docZero when set); any empty value →
 * docBlank when set, else ''. Text and multiline values as they are. QUOTE1112: a quantity grouped (「1,000」,
 * 「2.5」); a choice its option's doc (or '').
 */
export function docText(field: FormField, value: string): string {
  if (field.kind === 'date') return formatDate(value) || (field.docBlank ?? BLANK_DATE);
  if (field.kind === 'choice') return field.options?.find((x) => x.value === value)?.doc ?? '';
  if (!value) return field.docBlank ?? '';
  if (field.kind === 'quantity') return groupQuantity(value);
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
  if (typeof raw !== 'string') return field.kind === 'choice' ? normalizeChoice(field, '') : '';
  if (field.kind === 'date') return normalizeDate(raw);
  if (field.kind === 'amount') return normalizeAmount(raw, field.maxDigits, field.allowZero);
  if (field.kind === 'number') return normalizeNumber(raw);
  if (field.kind === 'quantity') return normalizeQuantity(raw);
  if (field.kind === 'choice') return normalizeChoice(field, raw);
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
