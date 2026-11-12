// Values for the form builder tests and the real-한글 gate (FORM1020 D12, npm run forms:hancom): a filled sample, the
// blank form, and the all-max cases that must still fit one page (every field at maxLength in the widest glyph; a
// multiline field also as maxLines lines of each length from 15 to 40, which wraps every line).
import type { FormSpec, FormValues } from '../../src/lib/form/spec';
import { pngRgba } from './image-writers';

// QUOTE1112: made-up 공급자 ○○상사 / 홍길동; three priced rows and one text-only row.
const QUOTE_SAMPLE: FormValues = {
  recvName: '△△주식회사 구매팀',
  recvBizNo: '000-00-00000',
  recvPhone: '02-000-0000',
  bizNo: '000-00-00000',
  bizName: '○○상사',
  ceo: '홍길동',
  address: '서울특별시 ○○구 ○○로 123',
  bizType: '도소매',
  bizItem: '사무용품',
  phone: '010-0000-0000',
  i1Name: '사무용 의자',
  i1Spec: '메시',
  i1Qty: '3',
  i1Price: '120,000',
  i2Name: 'A4 복사용지',
  i2Spec: '80g',
  i2Qty: '10',
  i2Price: '25,000',
  i3Name: '배송비',
  i3Qty: '1',
  i3Price: '30,000',
  i4Name: '설치 포함',
  vat: 'separate',
  note: '견적일로부터 30일 동안 유효합니다.',
  date: '2026-11-12',
};

export const SAMPLE_VALUES: Readonly<Record<string, FormValues>> = {
  'power-of-attorney': {
    giverName: '홍길동',
    giverBirth: '1960년 3월 1일',
    giverAddress: '서울특별시 종로구 세종대로 209, 101동 1001호',
    giverPhone: '010-1234-5678',
    agentName: '홍서연',
    agentBirth: '1990년 7월 15일',
    agentAddress: '경기도 성남시 분당구 판교역로 166',
    agentPhone: '010-9876-5432',
    agentRelation: '딸',
    submitTo: '종로구 행정복지센터',
    task: '주민등록표 등본 발급 신청과 수령\n관련 서류 제출',
    date: '2026-10-20',
  },
  'loan-note': {
    amount: '10,000,000',
    loanDate: '2026-10-22',
    dueDate: '2027-10-21',
    rate: '5',
    interestDay: '매달 25일',
    repayHow: '김철수 명의 계좌로 이체',
    terms: '원금은 갚을 날에 한꺼번에 갚는다.\n갚을 날을 넘기면 미리 연락한다.',
    lenderName: '김철수',
    lenderBirth: '1975년 5월 5일',
    lenderAddress: '서울특별시 종로구 세종대로 209',
    lenderPhone: '010-1111-2222',
    borrowerName: '홍길동',
    borrowerBirth: '1980년 3월 1일',
    borrowerAddress: '경기도 성남시 분당구 판교역로 166',
    borrowerPhone: '010-3333-4444',
    date: '2026-10-22',
  },
  'resignation-letter': {
    dept: '영업팀',
    position: '대리',
    name: '홍길동',
    birth: '1990년 3월 1일',
    phone: '010-1234-5678',
    joinDate: '2022-03-02',
    leaveDate: '2026-11-30',
    reason: '다른 회사로 옮기게 되어서',
    date: '2026-10-27',
    to: '○○ 주식회사 대표이사',
  },
  quotation: QUOTE_SAMPLE,
  'transaction-statement': QUOTE_SAMPLE,
};

/**
 * QUOTE1112: the widest quotation that still builds (every line and total under 100억 in every VAT mode): every text
 * field at maxLength in the widest glyph, and the item grid's widest cells — 999,999.99 (수량), 9,999,999,999 (단가),
 * an 8,000,000,000 line (10-digit 공급가액, 800,000,000 세액) — in all ITEM_ROWS rows.
 */
export function quoteMaxValues(spec: FormSpec, rows: number, vat: string): FormValues {
  const out = allMaxValues(spec);
  for (let n = 1; n <= rows; n++) {
    const [qty, price] = n === 1 ? ['999999.99', '1'] : n === 2 ? ['0.01', '9999999999'] : n === 3 ? ['1', '8000000000'] : ['1', '1'];
    out[`i${n}Qty`] = qty!;
    out[`i${n}Price`] = price!;
  }
  out.vat = vat;
  return out;
}

const WIDE = '가';

/** The longest document text of each kind: an amount of 12 digits (its 한글 the longest), a number of 3 + 2 digits. */
const MAX_OF: Partial<Record<FormSpec['fields'][number]['kind'], string>> = { date: '2026-12-31', amount: '999999999999', number: '999.99', quantity: '999999.99' };

/** Every field at maxLength (multiline: one line; dates, amounts and numbers at their longest). */
export function allMaxValues(spec: FormSpec): FormValues {
  const out: FormValues = {};
  for (const f of spec.fields) {
    if (f.kind === 'choice') out[f.id] = f.options?.[0]?.value ?? '';
    else if (f.kind === 'amount' && f.maxDigits !== undefined) out[f.id] = '9'.repeat(f.maxDigits);
    else out[f.id] = MAX_OF[f.kind] ?? WIDE.repeat(f.maxLength);
  }
  return out;
}

/** allMaxValues with every multiline field as up to maxLines lines of `lineLength` (within maxLength). */
export function allMaxLines(spec: FormSpec, lineLength: number): FormValues {
  const out = allMaxValues(spec);
  for (const f of spec.fields) {
    if (f.kind !== 'multiline') continue;
    const lines: string[] = [];
    let left = f.maxLength;
    for (let i = 0; i < (f.maxLines ?? 1); i++) {
      const n = Math.min(lineLength, left - (i ? 1 : 0));
      if (n <= 0) break;
      lines.push(WIDE.repeat(n));
      left -= n + (i ? 1 : 0);
    }
    out[f.id] = lines.join('\n');
  }
  return out;
}

export const LINE_LENGTHS: readonly number[] = Array.from({ length: 26 }, (_, i) => 15 + i);

/** QUOTE1112: a made-up red seal picture (PNG, w × h) for the sealed builds. */
export function sealPng(w = 120, h = 100): { bytes: Uint8Array; w: number; h: number; ext: 'png' } {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) rgba.set([200, 20, 20, 255], i * 4);
  return { bytes: pngRgba(w, h, rgba), w, h, ext: 'png' };
}
