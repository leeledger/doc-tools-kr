// A normalized form value as the document writes it (FORM1020 / LOAN1022 docText; its own module since QUOTE1112, so
// the pages' shared form chunk, which only normalizes, does not carry the 금액 한글 code). Document text only.
import { amountHangul } from './amount';
import { groupDigits } from './digits';
import type { FormField } from './spec';
import { BLANK_DATE, formatDate } from './values';

/** 「1,000」 / 「2.5」 for a normalized quantity. */
export function groupQuantity(q: string): string {
  const [int, dec] = q.split('.');
  return dec ? `${groupDigits(int!)}.${dec}` : groupDigits(int!);
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
