// 견적서·거래명세서 계산 (QUOTE1112 Q5): the item rows of a form with an items block → 공급가액, 세액 and 합계. Pure, own
// code, BigInt (exact past 2^53). Runs on the page (the totals box) and again in the worker (the document), on values
// already normalized by ./values, so both sides print the same numbers.
//   q = 수량 in hundredths, p = 단가 in 원; line = floor(q × p / 100).
//   separate (부가세 별도): supply = line, tax = floor(supply / 10).
//   included (부가세 포함): tax = floor(line / 11), supply = line − tax.
//   none (부가세 없음): supply = line, tax 0 (the tax cells stay empty).
// Totals are the sums of the rows; total = supply sum + tax sum. A row with only 품명/규격 is text (amounts empty, adds
// nothing); a row with exactly one of 수량/단가 is the `pair` problem; a line or a total of more than LEDGER_MAX_DIGITS
// digits is the `tooBig` problem. Rows are compacted: the filled rows in order, numbered 1…k.
import { itemFieldIds, type FormSpec, type FormValues } from './spec';

export type VatMode = 'separate' | 'included' | 'none';
export const VAT_MODES: readonly VatMode[] = ['separate', 'included', 'none'];

/** Our own limit: under 100억 원 (10 digits) for every line and total. */
export const LEDGER_MAX_DIGITS = 10;
const LIMIT = 10n ** BigInt(LEDGER_MAX_DIGITS);

export interface LedgerRow {
  /** 1…k after compaction. */
  n: number;
  /** The row's place on the page (1-based), for the problem lines. */
  source: number;
  name: string;
  spec: string;
  /** Normalized 수량 / 단가 ('' when the row is text only). */
  qty: string;
  price: string;
  /** Digits, '' when the row is text only; tax also '' in `none` mode. */
  supply: string;
  tax: string;
}

export type LedgerProblem = { kind: 'pair'; row: number } | { kind: 'tooBig' };

export interface Ledger {
  mode: VatMode;
  rows: LedgerRow[];
  /** At least one row with an amount. */
  priced: boolean;
  /** Digits ('' when no row is priced; tax '' in `none` mode). */
  supply: string;
  tax: string;
  total: string;
  problems: LedgerProblem[];
}

/** 「2.5」 → 250n (hundredths). `q`: a normalized quantity. */
const hundredths = (q: string): bigint => {
  const [int, dec = ''] = q.split('.');
  return BigInt(int!) * 100n + BigInt(dec.padEnd(2, '0') || '0');
};

export const vatModeOf = (v: string | undefined): VatMode => (VAT_MODES.includes(v as VatMode) ? (v as VatMode) : 'separate');

/** The ledger of `rows` item rows of `values` (normalized) with the VAT mode `vat`. */
export function computeLedger(values: FormValues, rows: number, vat: string | undefined): Ledger {
  const mode = vatModeOf(vat);
  const out: LedgerRow[] = [];
  const problems: LedgerProblem[] = [];
  let supply = 0n;
  let tax = 0n;
  let priced = false;
  let tooBig = false;
  for (let i = 1; i <= rows; i++) {
    const id = itemFieldIds(i);
    const name = values[id.name] ?? '';
    const spec = values[id.spec] ?? '';
    const qty = values[id.qty] ?? '';
    const price = values[id.price] ?? '';
    if (!name && !spec && !qty && !price) continue;
    const row: LedgerRow = { n: out.length + 1, source: i, name, spec, qty, price, supply: '', tax: '' };
    if (qty && price) {
      const line = (hundredths(qty) * BigInt(price)) / 100n;
      const t = mode === 'separate' ? line / 10n : mode === 'included' ? line / 11n : 0n;
      const s = mode === 'included' ? line - t : line;
      if (line >= LIMIT || s + t >= LIMIT) tooBig = true;
      row.supply = s.toString();
      row.tax = mode === 'none' ? '' : t.toString();
      supply += s;
      tax += t;
      priced = true;
    } else if (qty || price) problems.push({ kind: 'pair', row: i });
    out.push(row);
  }
  const total = supply + tax;
  if (total >= LIMIT) tooBig = true;
  if (tooBig) problems.push({ kind: 'tooBig' });
  return {
    mode,
    rows: out,
    priced,
    supply: priced ? supply.toString() : '',
    tax: priced && mode !== 'none' ? tax.toString() : '',
    total: priced ? total.toString() : '',
    problems,
  };
}

/** The ledger of a spec's items block (null without one). */
export function specLedger(spec: FormSpec, values: FormValues): Ledger | null {
  const b = spec.blocks.find((x) => x.type === 'items');
  return b && b.type === 'items' ? computeLedger(values, b.rows, values[b.vatField]) : null;
}
