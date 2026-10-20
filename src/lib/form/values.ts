// 양식 채우기 엔진 (FORM1020 D3 values.ts): what the visitor typed → the text the document gets. Pure. Every field is
// optional (D6: the blank form); a value is NFC, without control characters (a multiline field keeps its line
// breaks), within maxLines lines and maxLength code points. Runs on the page and again in the worker.
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

/** One field's value. Anything that is not a string is empty. */
export function normalizeField(field: FormField, raw: unknown): string {
  if (typeof raw !== 'string') return '';
  if (field.kind === 'date') return normalizeDate(raw);
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
