// Values for the form builder tests and the real-한글 gate (FORM1020 D12, npm run forms:hancom): a filled sample, the
// blank form, and the all-max cases that must still fit one page (every field at maxLength in the widest glyph; a
// multiline field also as maxLines lines of each length from 15 to 40, which wraps every line).
import type { FormSpec, FormValues } from '../../src/lib/form/spec';

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
};

const WIDE = '가';

/** The longest document text of each kind: an amount of 12 digits (its 한글 the longest), a number of 3 + 2 digits. */
const MAX_OF: Partial<Record<FormSpec['fields'][number]['kind'], string>> = { date: '2026-12-31', amount: '999999999999', number: '999.99' };

/** Every field at maxLength (multiline: one line; dates, amounts and numbers at their longest). */
export function allMaxValues(spec: FormSpec): FormValues {
  const out: FormValues = {};
  for (const f of spec.fields) out[f.id] = MAX_OF[f.kind] ?? WIDE.repeat(f.maxLength);
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
