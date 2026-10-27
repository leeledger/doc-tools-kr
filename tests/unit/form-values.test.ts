// LOAN1022 L-D3: the form engine's amount and number kinds — amountHangul, normalize, fieldProblem, docText — the lint
// rules for the new keys, and the UI glyph scan leaving the new document keys out. RESIGN1027 R5: the presets lint, a
// field placed only by a paragraph slot, and `fill` left out of the glyph scan.
import { describe, expect, it } from 'vitest';
import { amountHangul, groupDigits } from '../../src/lib/form/amount';
import { lintSpec, type FormField, type FormSpec } from '../../src/lib/form/spec';
import { BLANK_DATE, docText, fieldProblem, normalizeAmount, normalizeField, normalizeNumber } from '../../src/lib/form/values';
import { existsSync } from 'node:fs';
import { DOC_TEXT_PATHS, stripComments } from '../../scripts/lib/ui-font-chars.mjs';

const amount: FormField = { id: 'amount', label: '금액', docLabel: '빌린 돈', kind: 'amount', maxLength: 20 };
const rate: FormField = { id: 'rate', label: '이자', docLabel: '이자', kind: 'number', maxLength: 8, docTemplate: '연 {v}%', docZero: '없음', docBlank: '연      %' };

describe('amountHangul', () => {
  it.each([
    ['1', '일'],
    ['10', '일십'],
    ['11', '일십일'],
    ['20', '이십'],
    ['100', '일백'],
    ['1000', '일천'],
    ['10000', '일만'],
    ['10001', '일만일'],
    ['100000', '일십만'],
    ['1000010', '일백만일십'],
    ['10000000', '일천만'],
    ['12345000', '일천이백삼십사만오천'],
    ['100000000', '일억'],
    ['100010000', '일억일만'],
    ['100000001', '일억일'],
    ['250000000', '이억오천만'],
    ['300000', '삼십만'],
    ['999999999999', '구천구백구십구억구천구백구십구만구천구백구십구'],
    ['0', '영'],
    ['0010', '일십'],
  ])('%s → %s', (d, h) => expect(amountHangul(d)).toBe(h));
  it('throws on anything but digits', () => {
    for (const bad of ['', '1a', '-1', '1.5', '12345678901234567']) expect(() => amountHangul(bad)).toThrow(RangeError);
  });
  it('groupDigits', () => {
    expect(groupDigits('1')).toBe('1');
    expect(groupDigits('1000')).toBe('1,000');
    expect(groupDigits('10000000')).toBe('10,000,000');
    expect(groupDigits('999999999999')).toBe('999,999,999,999');
  });
});

describe('amount and number normalize', () => {
  it('amount: NFKC, commas, spaces and a trailing 원 dropped; leading zeros stripped; zero or not digits → empty', () => {
    expect(normalizeAmount('10,000,000')).toBe('10000000');
    expect(normalizeAmount(' 10 000 000 원')).toBe('10000000');
    expect(normalizeAmount('１０００')).toBe('1000');
    expect(normalizeAmount('007')).toBe('7');
    expect(normalizeAmount('999,999,999,999원')).toBe('999999999999');
    for (const bad of ['', '0', '000', '1천만', '10만원정', '1.5', '-5', '₩1000', '1000원원', '1,000,000,000,000']) expect(normalizeAmount(bad)).toBe('');
  });
  it('number: up to 3 digits and 2 decimals; % and spaces dropped; written plainly', () => {
    expect(normalizeNumber('5')).toBe('5');
    expect(normalizeNumber('5 %')).toBe('5');
    expect(normalizeNumber('４．５％')).toBe('4.5');
    expect(normalizeNumber('12.50')).toBe('12.5');
    expect(normalizeNumber('0')).toBe('0');
    expect(normalizeNumber('000')).toBe('0');
    expect(normalizeNumber('100')).toBe('100');
    for (const bad of ['', '연 5', '5.555', 'abc', '1000', '.5', '5.', '-1', '5%%']) expect(normalizeNumber(bad)).toBe('');
  });
  it('normalizeField routes the kinds; maxLength does not cut a number', () => {
    expect(normalizeField(amount, '1,234,567,890,123')).toBe('');
    expect(normalizeField(amount, '1,234,567,890')).toBe('1234567890');
    expect(normalizeField(rate, '20')).toBe('20');
    expect(normalizeField(amount, 5)).toBe('');
  });
});

describe('fieldProblem', () => {
  it('nothing typed or a good value: no problem', () => {
    for (const ok of ['', '   ', '10,000,000원', '１００']) expect(fieldProblem(amount, ok)).toBeNull();
    for (const ok of ['', '0', '4.5%']) expect(fieldProblem(rate, ok)).toBeNull();
  });
  it('typed but not a number: number; more than 12 digits: tooBig', () => {
    for (const bad of ['1천만', '10만원정', 'abc', '1.5']) expect(fieldProblem(amount, bad)).toBe('number');
    // An amount of zeros only is a number but no amount: its own line, never taken as empty.
    for (const z of ['0', '00', '0원', ' 0 ', '０']) expect(fieldProblem(amount, z), z).toBe('zero');
    expect(fieldProblem(rate, '0')).toBeNull();
    expect(fieldProblem(amount, '1,000,000,000,000')).toBe('tooBig');
    expect(fieldProblem(amount, '0001000000000000')).toBe('tooBig');
    for (const bad of ['연 5', '5.555', 'abc']) expect(fieldProblem(rate, bad)).toBe('number');
  });
  it('other kinds never have one', () => {
    expect(fieldProblem({ id: 't', label: 't', kind: 'text', maxLength: 5 }, 'abc')).toBeNull();
    expect(fieldProblem({ id: 'd', label: 'd', kind: 'date', maxLength: 10 }, 'x')).toBeNull();
  });
});

describe('docText', () => {
  it('amount: 「금 …원정 (…원)」; empty → docBlank or empty', () => {
    expect(docText(amount, '10000000')).toBe('금 일천만원정 (10,000,000원)');
    expect(docText(amount, '1234567')).toBe('금 일백이십삼만사천오백육십칠원정 (1,234,567원)');
    expect(docText(amount, '')).toBe('');
    expect(docText({ ...amount, docBlank: '금 원정' }, '')).toBe('금 원정');
  });
  it('number: template, zero, blank', () => {
    expect(docText(rate, '5')).toBe('연 5%');
    expect(docText(rate, '4.5')).toBe('연 4.5%');
    expect(docText(rate, '0')).toBe('없음');
    expect(docText(rate, '')).toBe('연      %');
    const plain: FormField = { id: 'n', label: 'n', kind: 'number', maxLength: 6 };
    expect(docText(plain, '0')).toBe('0');
    expect(docText(plain, '3')).toBe('3');
    expect(docText(plain, '')).toBe('');
  });
  it('date: formatted; empty → the blank date (or docBlank)', () => {
    const d: FormField = { id: 'd', label: 'd', kind: 'date', maxLength: 10 };
    expect(docText(d, '2026-10-22')).toBe('2026년 10월 22일');
    expect(docText(d, '')).toBe(BLANK_DATE);
    expect(docText({ ...d, docBlank: '날짜' }, '')).toBe('날짜');
  });
  it('text and multiline: as they are', () => {
    expect(docText({ id: 't', label: 't', kind: 'text', maxLength: 5 }, '홍길동')).toBe('홍길동');
    expect(docText({ id: 'm', label: 'm', kind: 'multiline', maxLength: 50, maxLines: 2 }, 'a\nb')).toBe('a\nb');
    expect(docText({ id: 't', label: 't', kind: 'text', maxLength: 5 }, '')).toBe('');
  });
});

describe('spec lint (LOAN1022 keys)', () => {
  const base = (fields: FormField[]): FormSpec => ({
    id: 'x',
    fileBase: 'x',
    title: 'x',
    fields,
    blocks: [{ type: 'table', rows: fields.map((f) => f.id), colWidths: [1, 2], rowHeight: 1 }],
  });
  it('a date, an amount and a number in table rows are fine', () => {
    expect(lintSpec(base([{ id: 'd', label: 'd', docLabel: 'd', kind: 'date', maxLength: 10, docBlank: '  ' }, amount, rate]))).toEqual([]);
  });
  it('docTemplate needs {v}; docTemplate/docZero only on number; docBlank only on amount/number/date', () => {
    const p = lintSpec(
      base([
        { ...rate, id: 'r1', docTemplate: '연 %' },
        { id: 't1', label: 't', docLabel: 't', kind: 'text', maxLength: 5, docZero: '없음' },
        { id: 't2', label: 't', docLabel: 't', kind: 'text', maxLength: 5, docTemplate: '{v}' },
        { id: 't3', label: 't', docLabel: 't', kind: 'multiline', maxLength: 5, maxLines: 1, docBlank: ' ' },
      ]),
    ).join('\n');
    for (const s of ['r1: docTemplate needs {v}', 't1: docTemplate and docZero are for number fields', 't2: docTemplate and docZero are for number fields', 't3: docBlank is for amount, number and date fields']) expect(p).toContain(s);
  });
  it('a dateLine still needs a date field', () => {
    const spec: FormSpec = { id: 'x', fileBase: 'x', title: 'x', fields: [{ id: 't', label: 't', kind: 'text', maxLength: 5 }], blocks: [{ type: 'dateLine', field: 't' }] };
    expect(lintSpec(spec).join('\n')).toContain('t: dateLine needs a date field');
  });
});

describe('UI font', () => {
  it('docTemplate, docBlank and docZero are document text, left out of the glyph sets', () => {
    const src = "{ id: 'rate', label: '이자', docTemplate: '연 {v}퍼', docZero: '없음', docBlank: '빈칸' }";
    const kept = stripComments(src);
    expect(kept).toContain('이자');
    for (const s of ['퍼', '없음', '빈칸']) expect(kept).not.toContain(s);
  });
  it('the 금액 한글 module is document text only: in neither UI glyph set', () => {
    expect(DOC_TEXT_PATHS).toContain('lib/form/amount.ts');
    for (const p of DOC_TEXT_PATHS) expect(existsSync(`src/${p}`)).toBe(true);
  });
});

describe('spec lint (RESIGN1027 presets and a slot-only field)', () => {
  const spec = (fields: FormField[], doc = 'x'): FormSpec => ({
    id: 'x',
    fileBase: 'x',
    title: 'x',
    fields,
    blocks: [
      { type: 'table', rows: fields.filter((f) => f.docLabel).map((f) => f.id), colWidths: [1, 2], rowHeight: 1 },
      { type: 'para', doc },
    ],
  });
  const reason = (presets: FormField['presets']): FormField => ({ id: 'r', label: 'r', docLabel: 'r', kind: 'multiline', maxLength: 10, maxLines: 2, presets });
  it('presets within maxLength and maxLines on a text or multiline field are fine', () => {
    expect(lintSpec(spec([reason([{ chip: 'a', fill: '가나다' }, { chip: 'b', fill: '가\n나' }]), { id: 't', label: 't', docLabel: 't', kind: 'text', maxLength: 3, presets: [{ chip: 'c', fill: '가나다' }] }]))).toEqual([]);
  });
  it('names each presets problem', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ chip: `c${i}`, fill: 'f' }));
    const p = lintSpec(
      spec([
        { ...reason([{ chip: 'long', fill: '가'.repeat(11) }, { chip: 'lines', fill: 'a\nb\nc' }, { chip: ' ', fill: 'x' }]), id: 'r1' },
        { ...reason([]), id: 'r2' },
        { ...reason(many), id: 'r3' },
        { id: 'd', label: 'd', docLabel: 'd', kind: 'date', maxLength: 10, presets: [{ chip: 'c', fill: '2026-10-27' }] },
        { id: 't', label: 't', docLabel: 't', kind: 'text', maxLength: 5, presets: [{ chip: 'two', fill: 'a\nb' }, { chip: 'empty', fill: '' }] },
      ]),
    ).join('\n');
    for (const s of [
      'r1: preset long is longer than maxLength',
      'r1: preset lines has more than 2 lines',
      'r1: preset chip and fill must not be empty',
      'r2: 1–8 presets',
      'r3: 1–8 presets',
      'd: presets are for text and multiline fields',
      't: preset two has more than 1 lines',
      't: preset chip and fill must not be empty',
    ])
      expect(p).toContain(s);
  });
  it('a field with no table row or date line is placed by exactly one paragraph slot; two slots or none fail', () => {
    const to: FormField = { id: 'to', label: 'to', kind: 'text', maxLength: 5 };
    const t: FormField = { id: 't', label: 't', docLabel: 't', kind: 'text', maxLength: 5 };
    expect(lintSpec(spec([t, to], '{to} 귀하'))).toEqual([]);
    expect(lintSpec(spec([t, to], '{to} {to}'))).toContain('to: placed 2 times');
    expect(lintSpec(spec([t, to], 'x'))).toContain('to: placed 0 times');
    // A table field also in a slot stays placed once (사직서 「{leaveDate}자로」).
    expect(lintSpec(spec([t, to], '{t} {to}'))).toEqual([]);
  });
});

describe('UI font (RESIGN1027 R10)', () => {
  it('a preset fill is document and input text, left out of the glyph sets; its chip stays', () => {
    const kept = stripComments("{ chip: '건강', fill: '회복(치료)' }");
    expect(kept).toContain('건강');
    for (const s of ['회복', '치료']) expect(kept).not.toContain(s);
  });
});
