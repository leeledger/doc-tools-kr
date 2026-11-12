// QUOTE1112 A2 (test map "lint", "values", "ledger.ts"): the engine's new kinds (quantity, choice), amount allowZero /
// maxDigits, the items block and computed-slot lint, and the BigInt ledger — 3 VAT modes × a table of cases, the 포함
// invariant over random rows, compaction, the pair and tooBig problems.
import { describe, expect, it } from 'vitest';
import { LEDGER_MAX_DIGITS, computeLedger, vatModeOf } from '../../src/lib/form/ledger';
import { lintSpec, type FormField, type FormSpec } from '../../src/lib/form/spec';
import { docText, fieldProblem, groupQuantity, normalizeField, normalizeQuantity } from '../../src/lib/form/values';

const qty: FormField = { id: 'q', label: 'q', kind: 'quantity', maxLength: 12 };
const price: FormField = { id: 'p', label: 'p', kind: 'amount', maxLength: 16, allowZero: true, maxDigits: 10 };
const plain: FormField = { id: 'a', label: 'a', kind: 'amount', maxLength: 20 };
const choice: FormField = { id: 'c', label: 'c', kind: 'choice', maxLength: 10, options: [{ value: 'x', label: 'X', doc: 'DX' }, { value: 'y', label: 'Y' }] };

describe('values: quantity, allowZero / maxDigits, choice', () => {
  it('quantity: NFKC, commas and spaces dropped, 6 digits + 2 decimals, 0 allowed, written plainly', () => {
    expect(normalizeQuantity('１,０００')).toBe('1000');
    expect(normalizeQuantity(' 2.50 ')).toBe('2.5');
    expect(normalizeQuantity('2.0')).toBe('2');
    expect(normalizeQuantity('0')).toBe('0');
    expect(normalizeQuantity('007')).toBe('7');
    expect(normalizeQuantity('0.05')).toBe('0.05');
    expect(normalizeQuantity('999,999.99')).toBe('999999.99');
    expect(normalizeQuantity('1.234')).toBe('');
    expect(normalizeQuantity('1234567')).toBe('');
    expect(normalizeQuantity('-1')).toBe('');
    expect(normalizeQuantity('1e3')).toBe('');
    expect(normalizeQuantity('.5')).toBe('');
    expect(normalizeQuantity('')).toBe('');
  });
  it('quantity problems: 7 digits tooBig, 3 decimals or words number', () => {
    expect(fieldProblem(qty, '1234567')).toBe('tooBig');
    expect(fieldProblem(qty, '1.234')).toBe('number');
    expect(fieldProblem(qty, '세 개')).toBe('number');
    expect(fieldProblem(qty, '0')).toBeNull();
    expect(fieldProblem(qty, '')).toBeNull();
  });
  it('quantity document text is grouped', () => {
    expect(groupQuantity('1000')).toBe('1,000');
    expect(groupQuantity('1234567.5')).toBe('1,234,567.5');
    expect(docText(qty, '2.5')).toBe('2.5');
    expect(docText(qty, '1000')).toBe('1,000');
  });
  it('amount allowZero takes 0; maxDigits caps the digits (tooBig past it)', () => {
    expect(normalizeField(price, '0')).toBe('0');
    expect(normalizeField(price, '000')).toBe('0');
    expect(normalizeField(price, '9,999,999,999')).toBe('9999999999');
    expect(normalizeField(price, '10000000000')).toBe('');
    expect(fieldProblem(price, '10000000000')).toBe('tooBig');
    expect(fieldProblem(price, '0')).toBeNull();
    expect(normalizeField(plain, '0')).toBe('');
    expect(fieldProblem(plain, '0')).toBe('zero');
    expect(normalizeField(plain, '999999999999')).toBe('999999999999');
  });
  it('choice: one of the options, anything else (or nothing) the first', () => {
    expect(normalizeField(choice, 'y')).toBe('y');
    expect(normalizeField(choice, 'z')).toBe('x');
    expect(normalizeField(choice, '')).toBe('x');
    expect(normalizeField(choice, undefined)).toBe('x');
    expect(normalizeField(choice, '__proto__')).toBe('x');
    expect(docText(choice, 'x')).toBe('DX');
    expect(docText(choice, 'y')).toBe('');
    expect(fieldProblem(choice, 'z')).toBeNull();
  });
});

describe('lint: the QUOTE1112 rules', () => {
  const base = (fields: FormField[], blocks: FormSpec['blocks']): FormSpec => ({ id: 'x', fileBase: 'x', title: 'x', fields, blocks });
  const items = (n: number): FormField[] => {
    const out: FormField[] = [];
    for (let i = 1; i <= n; i++) out.push({ id: `i${i}Name`, label: 'n', kind: 'text', maxLength: 5 }, { id: `i${i}Spec`, label: 's', kind: 'text', maxLength: 5 }, { id: `i${i}Qty`, label: 'q', kind: 'quantity', maxLength: 12 }, { id: `i${i}Price`, label: 'p', kind: 'amount', maxLength: 16 });
    return out;
  };
  const W7 = [1, 1, 1, 1, 1, 1, 1];
  it('a valid items spec lints clean', () => {
    expect(lintSpec(base([...items(2), choice], [{ type: 'para', doc: '{=totalHangul} {=totalDigits} {=vatNote}' }, { type: 'items', rows: 2, vatField: 'c', colWidths: W7, rowHeight: 1 }]))).toEqual([]);
  });
  it('names each broken rule', () => {
    const p = lintSpec(
      base(
        [
          ...items(1),
          { id: 't', label: 't', docLabel: 't', kind: 'text', maxLength: 5, allowZero: true, maxDigits: 3 },
          { id: 'a', label: 'a', docLabel: 'a', kind: 'amount', maxLength: 5, maxDigits: 13 },
          { id: 'c1', label: 'c', kind: 'choice', maxLength: 5, options: [{ value: 'x', label: 'X' }] },
          { id: 'c2', label: 'c', kind: 'choice', maxLength: 5, options: [{ value: 'x', label: 'X' }, { value: 'x', label: 'Y' }, { value: '', label: 'Z' }, { value: 'w', label: 'W' }, { value: 'v', label: 'V' }] },
          { id: 'o', label: 'o', docLabel: 'o', kind: 'text', maxLength: 5, options: [] },
          { id: 'i2Name', label: 'n', kind: 'quantity', maxLength: 5 },
        ],
        [
          { type: 'table', rows: ['t', 'a', 'o'], colWidths: [1, 1], rowHeight: 1 },
          { type: 'para', doc: '{=nope} {c2}' },
          { type: 'items', rows: 1, vatField: 'c1', colWidths: [1, 1], rowHeight: 1 },
          { type: 'signLine', docLabel: 'x', field: 't', mark: ' ', seal: true },
          { type: 'signLine', docLabel: 'y', field: 't', seal: true },
          { type: 'para', doc: '{i2Name}' },
        ],
      ),
    ).join('\n');
    for (const s of [
      't: allowZero and maxDigits are for amount fields',
      'a: maxDigits 1–12',
      'c1: 2–4 options',
      'c2: 2–4 options',
      'c2: option value and label must not be empty',
      'c2: option values must be unique',
      'o: options are for choice fields',
      '{=nope}: unknown computed slot',
      'items: 2 widths for 7 columns',
      'at most one sign line with a seal',
      't: sign mark must not be empty',
    ])
      expect(p).toContain(s);
    // A choice as vatField is fine; a text field as an item price is not.
    expect(lintSpec(base([...items(1).map((f) => (f.id === 'i1Price' ? { ...f, kind: 'text' as const } : f)), choice], [{ type: 'items', rows: 1, vatField: 'c', colWidths: W7, rowHeight: 1 }]))).toContain('i1Price: an item price needs a amount field');
    expect(lintSpec(base([...items(1), { id: 'v', label: 'v', kind: 'text', maxLength: 5 }], [{ type: 'items', rows: 1, vatField: 'v', colWidths: W7, rowHeight: 1 }]))).toContain('v: vatField needs a choice field');
  });
  it('computed slots need an items block; two items blocks are one too many', () => {
    expect(lintSpec(base([{ id: 't', label: 't', kind: 'text', maxLength: 5 }], [{ type: 'para', doc: '{t} {=totalDigits}' }]))).toContain('{=totalDigits}: computed slots need an items block');
    expect(lintSpec(base([...items(1), choice], [{ type: 'items', rows: 1, vatField: 'c', colWidths: W7, rowHeight: 1 }, { type: 'items', rows: 1, vatField: 'c', colWidths: W7, rowHeight: 1 }]))).toContain('at most one items block');
  });
});

/** values for computeLedger: rows of [name, spec, qty, price] (normalized). */
const rowsOf = (rows: [string, string, string, string][]): Record<string, string> => {
  const v: Record<string, string> = {};
  rows.forEach(([n, s, q, p], i) => Object.assign(v, { [`i${i + 1}Name`]: n, [`i${i + 1}Spec`]: s, [`i${i + 1}Qty`]: q, [`i${i + 1}Price`]: p }));
  return v;
};

describe('ledger.ts', () => {
  it('the brief table: 1 × 11,000 포함 → 10,000 / 1,000; 3 × 333 별도 → 999 / 99; 2.5 × 1,001 별도 → 2,502 / 250', () => {
    const one = (q: string, p: string, vat: string) => computeLedger(rowsOf([['a', '', q, p]]), 1, vat);
    expect(one('1', '11000', 'included')).toMatchObject({ supply: '10000', tax: '1000', total: '11000' });
    expect(one('3', '333', 'separate')).toMatchObject({ supply: '999', tax: '99', total: '1098' });
    expect(one('2.5', '1001', 'separate')).toMatchObject({ supply: '2502', tax: '250', total: '2752' });
    expect(one('2.5', '1001', 'none')).toMatchObject({ supply: '2502', tax: '', total: '2502' });
    expect(one('0.01', '1', 'separate')).toMatchObject({ supply: '0', tax: '0', total: '0', priced: true });
    expect(one('0', '5000', 'included')).toMatchObject({ supply: '0', tax: '0' });
    expect(one('1', '10', 'included')).toMatchObject({ supply: '10', tax: '0' });
    expect(one('1', '11', 'included')).toMatchObject({ supply: '10', tax: '1' });
  });
  it('line-level rounding, totals are sums', () => {
    const l = computeLedger(rowsOf([['a', '', '1', '15'], ['b', '', '1', '15']]), 2, 'separate');
    expect(l.rows.map((r) => r.tax)).toEqual(['1', '1']);
    expect(l).toMatchObject({ supply: '30', tax: '2', total: '32' });
  });
  it('exact past 2^53: 999,999.99 × 10,000 and a 10-digit price', () => {
    const l = computeLedger(rowsOf([['a', '', '999999.99', '9999']]), 1, 'none');
    expect(l.supply).toBe('9998999900');
    expect(l.problems).toEqual([]);
    const big = computeLedger(rowsOf([['a', '', '999999.99', '9999999999']]), 1, 'separate');
    expect(big.rows[0]!.supply).toBe('9999999899000000');
    expect(big.problems).toEqual([{ kind: 'tooBig' }]);
  });
  it('포함 invariant: supply + tax = line, tax = floor(line / 11), over 2,000 random rows', () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 48271) % 2147483647) % n);
    for (let i = 0; i < 2000; i++) {
      const q = `${rnd(1000)}.${String(rnd(100)).padStart(2, '0')}`;
      const p = String(rnd(10_000_000));
      const l = computeLedger(rowsOf([['a', '', q.replace(/\.?0+$/, '') || '0', p]]), 1, 'included');
      const line = (BigInt(Math.round(Number(q) * 100)) * BigInt(p)) / 100n;
      expect(BigInt(l.supply) + BigInt(l.tax)).toBe(line);
      expect(BigInt(l.tax)).toBe(line / 11n);
    }
  });
  it('compaction: filled rows on top, numbered 1…k, text-only rows add nothing', () => {
    const v = { ...rowsOf([['', '', '', ''], ['a', '', '2', '100'], ['', '', '', ''], ['', '규격만', '', ''], ['b', 'x', '1', '50']]) };
    const l = computeLedger(v, 5, 'separate');
    expect(l.rows.map((r) => [r.n, r.source, r.name, r.spec, r.supply])).toEqual([
      [1, 2, 'a', '', '200'],
      [2, 4, '', '규격만', ''],
      [3, 5, 'b', 'x', '50'],
    ]);
    expect(l).toMatchObject({ supply: '250', tax: '25', total: '275', priced: true, problems: [] });
  });
  it('pair: exactly one of 수량 / 단가 names the row; no priced row → empty totals', () => {
    const l = computeLedger(rowsOf([['a', '', '1', ''], ['b', '', '', ''], ['c', '', '', '500']]), 3, 'separate');
    expect(l.problems).toEqual([{ kind: 'pair', row: 1 }, { kind: 'pair', row: 3 }]);
    expect(l).toMatchObject({ priced: false, supply: '', tax: '', total: '' });
    expect(computeLedger({}, 8, undefined)).toMatchObject({ mode: 'separate', rows: [], priced: false, problems: [] });
  });
  it('tooBig: a line or a total of more than 10 digits', () => {
    expect(LEDGER_MAX_DIGITS).toBe(10);
    expect(computeLedger(rowsOf([['a', '', '1', '9999999999']]), 1, 'none').problems).toEqual([]);
    expect(computeLedger(rowsOf([['a', '', '1', '9999999999']]), 1, 'separate').problems).toEqual([{ kind: 'tooBig' }]);
    expect(computeLedger(rowsOf([['a', '', '1', '5000000000'], ['b', '', '1', '5000000000']]), 2, 'none').problems).toEqual([{ kind: 'tooBig' }]);
    expect(computeLedger(rowsOf([['a', '', '1', '9999999999']]), 1, 'included').problems).toEqual([]);
  });
  it('an unknown VAT mode is 별도', () => {
    expect(vatModeOf('x')).toBe('separate');
    expect(vatModeOf(undefined)).toBe('separate');
    expect(vatModeOf('none')).toBe('none');
  });
});
