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
};

const WIDE = '가';

/** Every field at maxLength (multiline: one line). */
export function allMaxValues(spec: FormSpec): FormValues {
  const out: FormValues = {};
  for (const f of spec.fields) out[f.id] = f.kind === 'date' ? '2026-12-31' : WIDE.repeat(f.maxLength);
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
