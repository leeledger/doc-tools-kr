// 견적서 · 거래명세서 (QUOTE1112 Q3, Q6, Q7): our own general forms for small sellers (Q1: neither is a 법정 서식, and
// neither is a 세금계산서; no legal claim in the document). Two specs share one field list (`fields`, reference-equal)
// and differ only in the title, the closing line and the file name; the page's 「만들 서류」 radio picks the spec id.
// Amounts come from src/lib/form/ledger.ts (the items block and the `{=…}` slots). Everything after the first table
// is plain 10 pt (rhwp 0.8.6, src/lib/form/build.ts). Lengths and ITEM_ROWS keep the all-max form on 1 page in rhwp
// (tests/unit/quotation.test.ts; handoff/sources/quote1112/probe-a1.out.txt for the grid widths).
import { itemFieldIds, type FormBlock, type FormField, type FormSpec } from '../../lib/form/spec';

/** Q2 / Q10: the HWP download. Off only if the real-한글 gate fails and cannot be fixed (then PDF only). */
export const QUOTE_HWP = true;

/**
 * Q7: item rows on the form. 8, not 10 (the brief's cut): 10 rows fit one page only with 9-character 품명 and
 * 4-character 규격 (one line each at the widest glyph); 8 rows fit 18 and 8 (two lines each). A3 matrix, BUILD-LOG.
 */
export const ITEM_ROWS = 8;

/** Item text lengths (code points): at most two lines in the grid at the widest glyph (20 / 10 → 3 lines, 2 pages). */
export const ITEM_NAME_MAX = 18;
export const ITEM_SPEC_MAX = 8;
/** 단가: up to 10 digits (Q4). */
export const ITEM_PRICE_DIGITS = 10;

/** colWidths (HWPUNIT, 41,952 in all): section · label · value. */
const COLS = [5000, 8000, 28952];
const ROW = 1400;
/** The item grid (probe-a1 §6): 번호 · 품명 · 규격 · 수량 · 단가 · 공급가액 · 세액. */
const ITEM_COLS = [2400, 9200, 4252, 5700, 7100, 7100, 6200];

function itemFields(): FormField[] {
  const out: FormField[] = [];
  for (let n = 1; n <= ITEM_ROWS; n++) {
    const id = itemFieldIds(n);
    out.push(
      { id: id.name, label: '품명', kind: 'text', maxLength: ITEM_NAME_MAX },
      { id: id.spec, label: '규격', kind: 'text', maxLength: ITEM_SPEC_MAX },
      { id: id.qty, label: '수량', kind: 'quantity', maxLength: 12 },
      { id: id.price, label: '단가', kind: 'amount', maxLength: 16, allowZero: true, maxDigits: ITEM_PRICE_DIGITS },
    );
  }
  return out;
}

/** The one field list both specs use (Q3). */
export const QUOTE_FIELDS: FormField[] = [
  { id: 'recvName', label: '받는 곳 이름', docLabel: '상호(성명)', kind: 'text', maxLength: 30 },
  { id: 'recvBizNo', label: '사업자등록번호', docLabel: '등록번호', kind: 'text', maxLength: 14 },
  { id: 'recvPhone', label: '연락처', docLabel: '연락처', kind: 'text', maxLength: 20 },
  { id: 'bizNo', label: '사업자등록번호', docLabel: '등록번호', kind: 'text', maxLength: 14 },
  { id: 'bizName', label: '상호', docLabel: '상호', kind: 'text', maxLength: 30 },
  { id: 'ceo', label: '대표자', docLabel: '성명', kind: 'text', maxLength: 20 },
  { id: 'address', label: '주소', docLabel: '주소', kind: 'text', maxLength: 60 },
  { id: 'bizType', label: '업태', docLabel: '업태', kind: 'text', maxLength: 20 },
  { id: 'bizItem', label: '종목', docLabel: '종목', kind: 'text', maxLength: 20 },
  { id: 'phone', label: '연락처', docLabel: '연락처', kind: 'text', maxLength: 20 },
  ...itemFields(),
  {
    id: 'vat',
    label: '부가세',
    kind: 'choice',
    maxLength: 10,
    options: [
      { value: 'separate', label: '부가세 별도' },
      { value: 'included', label: '부가세 포함' },
      { value: 'none', label: '부가세 없음' },
    ],
  },
  {
    id: 'note',
    label: '비고',
    docLabel: '비고',
    kind: 'multiline',
    maxLength: 100,
    maxLines: 3,
    rowLines: 3,
    presets: [
      { chip: '30일 유효', fill: '견적일로부터 30일 동안 유효합니다.' },
      { chip: '배송비 별도', fill: '배송비 별도' },
      { chip: '30일 안에 지급', fill: '납품 후 30일 안에 지급' },
    ],
  },
  { id: 'date', label: '작성일', kind: 'date', maxLength: 10 },
];

/** Q6: the amount line. */
export const AMOUNT_LINE = '합계 금액  일금 {=totalHangul}원정 ({=totalDigits}원) {=vatNote}';

function blocks(title: string, closing: string): FormBlock[] {
  return [
    { type: 'title', doc: title, size: 20 },
    { type: 'gap', size: 10 },
    { type: 'table', docSection: '공급받는자', rows: ['recvName', 'recvBizNo', 'recvPhone'], colWidths: COLS, rowHeight: ROW },
    { type: 'gap', size: 10 },
    { type: 'table', docSection: '공급자', rows: ['bizNo', 'bizName', 'ceo', 'address', 'bizType', 'bizItem', 'phone'], colWidths: COLS, rowHeight: ROW },
    { type: 'gap', size: 10 },
    { type: 'para', doc: AMOUNT_LINE, align: 'left' },
    { type: 'items', rows: ITEM_ROWS, vatField: 'vat', colWidths: ITEM_COLS, rowHeight: ROW },
    { type: 'table', rows: ['note'], colWidths: [COLS[0]! + COLS[1]!, COLS[2]!], rowHeight: ROW },
    { type: 'gap', size: 10 },
    { type: 'para', doc: closing, align: 'center' },
    { type: 'dateLine', field: 'date', align: 'center' },
    { type: 'signLine', docLabel: '공급자', field: 'ceo', align: 'right', mark: '(인)', seal: true },
  ];
}

export const QUOTATION: FormSpec = { id: 'quotation', fileBase: '견적서', title: '견적서', fields: QUOTE_FIELDS, blocks: blocks('견 적 서', '위와 같이 견적합니다.') };

export const TRANSACTION_STATEMENT: FormSpec = {
  id: 'transaction-statement',
  fileBase: '거래명세서',
  title: '거래명세서',
  fields: QUOTE_FIELDS,
  blocks: blocks('거 래 명 세 서', '위와 같이 거래하였습니다.'),
};
