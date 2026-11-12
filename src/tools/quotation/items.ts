// 품목 줄과 합계 상자 (QUOTE1112 Q5, Q8): /quotation/'s own part of the form tool controller (a FormHooks part, so the
// shared controller chunk of the other form tools does not carry it). The live totals box (공급가액 합계 · 부가세 · 합계 ·
// 「일금 …원정」) is computed by lib/form/ledger, the code the worker runs on the same normalized values, so the box
// equals the document. A ledger problem blocks a filled build: the rows' error line names it (pair: the row; tooBig: our
// 100억 limit), the row's inputs are marked and focus goes there. 모두 지우기 hides the rows past the first ones again.
import { amountHangul } from '../../lib/form/amount';
import { groupDigits } from '../../lib/form/digits';
import { computeLedger, type Ledger } from '../../lib/form/ledger';
import { itemFieldIds, type FormSpec } from '../../lib/form/spec';
import { normalizeValues } from '../../lib/form/values';
import type { FormHooks } from '../form-tool/controller';

export interface ItemsCopy {
  pair: (row: number) => string;
  tooBig: string;
  supply: string;
  tax: string;
  total: string;
  noTax: string;
}

const won = (d: string): string => `${groupDigits(d || '0')}원`;

/** The totals box lines for a ledger: [label, value] rows and the 「일금 …원정」 line ('' when nothing is priced). */
export function totalsText(l: Ledger, copy: ItemsCopy): { rows: [string, string][]; hangul: string } {
  const big = l.problems.some((x) => x.kind === 'tooBig');
  return {
    rows: [
      [copy.supply, won(l.supply)],
      [copy.tax, l.mode === 'none' ? copy.noTax : won(l.tax)],
      [copy.total, won(l.total)],
    ],
    hangul: l.priced && !big ? `일금 ${amountHangul(l.total)}원정` : '',
  };
}

/** Wires the item rows of `spec` (its items block) on the page of `prefix`. */
export function initItems(prefix: string, form: HTMLFormElement, spec: FormSpec, read: () => Record<string, string>, copy: ItemsCopy): Pick<FormHooks, 'input' | 'check' | 'reset'> {
  const block = spec.blocks.find((b) => b.type === 'items');
  const box = document.getElementById(`${prefix}-totals`);
  const error = document.getElementById(`${prefix}-items-error`);
  const addRow = document.getElementById(`${prefix}-add-row`);
  const rows = Array.from(form.querySelectorAll<HTMLFieldSetElement>('fieldset[data-item]'));
  const shownAtStart = rows.filter((r) => !r.hidden).length;
  if (!block || block.type !== 'items' || !box || !error) return {};
  const items = block;

  // The box: three label/value lines and the 한글 line, made once; later only their text changes.
  const values: HTMLElement[] = [];
  const labels: HTMLElement[] = [];
  for (let i = 0; i < 3; i++) {
    const p = document.createElement('p');
    const label = document.createElement('span');
    const value = document.createElement('strong');
    p.append(label, ' ', value);
    box.append(p);
    labels.push(label);
    values.push(value);
  }
  const hangul = document.createElement('p');
  hangul.className = 'pa-hangul';
  box.append(hangul);
  box.hidden = false;

  const ledger = (): Ledger => {
    const v = normalizeValues(spec, read());
    return computeLedger(v, items.rows, v[items.vatField]);
  };
  const set = (el: HTMLElement, t: string): void => {
    if (el.textContent !== t) el.textContent = t;
  };
  const show = (): void => {
    const t = totalsText(ledger(), copy);
    t.rows.forEach(([label, value], i) => {
      set(labels[i]!, label);
      set(values[i]!, value);
    });
    set(hangul, t.hangul);
  };
  const unmark = (): void => {
    for (const r of rows) for (const el of r.querySelectorAll('[data-field]')) el.removeAttribute('aria-invalid');
  };

  return {
    input(target) {
      show();
      if (error.textContent && target instanceof Node && rows.some((r) => r.contains(target))) {
        error.textContent = '';
        unmark();
      }
    },
    check() {
      const l = ledger();
      unmark();
      const pair = l.problems.find((x): x is Extract<typeof x, { kind: 'pair' }> => x.kind === 'pair');
      const big = l.problems.some((x) => x.kind === 'tooBig');
      error.textContent = pair ? copy.pair(pair.row) : big ? copy.tooBig : '';
      if (pair) {
        const id = itemFieldIds(pair.row);
        const qty = document.getElementById(`${prefix}-${id.qty}`) as HTMLInputElement | null;
        const price = document.getElementById(`${prefix}-${id.price}`) as HTMLInputElement | null;
        for (const el of [qty, price]) el?.setAttribute('aria-invalid', 'true');
        (qty?.value.trim() ? price : qty)?.focus();
      } else if (big) rows[0]?.querySelector<HTMLElement>('[data-field]')?.focus();
      return !l.problems.length;
    },
    reset() {
      rows.forEach((r, i) => (r.hidden = i >= shownAtStart));
      if (addRow) addRow.hidden = rows.length <= shownAtStart;
      error.textContent = '';
      unmark();
      show();
    },
  };
}
