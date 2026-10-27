// 사직서 (RESIGN1027 R3): our own general 사직서 from an employee to the company (R1: no 법정 서식 exists; no legal claim
// in the document). 「처리하여 주시기 바랍니다」, not 「허락」: the document does not imply the company's consent is needed.
// Page labels are plain words in the core UI glyphs (R10: 「그만두는 날」 — 퇴 is not a core glyph; the 가족 돌봄 chip
// reads 「식구 돌보기」 — 족/봄 are not); document text (doc / docLabel / docSection / docBlank) and the presets' fill are
// drawn only in the document and the input. Everything after the first table is plain 10 pt (rhwp 0.8.6,
// src/lib/form/build.ts). maxLength per field keeps the all-max form on 1 page in rhwp
// (tests/unit/resignation-letter.test.ts). 받는 사람 has no table row: its only place is the 「{to} 귀하」 line.
import type { FormSpec } from '../../lib/form/spec';

/** R7 / R13: the HWP download. Off only if the real-한글 gate fails and cannot be fixed (then PDF only). */
export const RESIGN_HWP = true;

/** colWidths (HWPUNIT): section · label · value, 41,952 in all (the 위임장's). */
const COLS = [6000, 12000, 23952];
const ROW = 2268;

export const RESIGNATION_LETTER: FormSpec = {
  id: 'resignation-letter',
  fileBase: '사직서',
  title: '사직서',
  fields: [
    { id: 'dept', label: '부서', docLabel: '소속', kind: 'text', maxLength: 30 },
    { id: 'position', label: '직위', docLabel: '직위', kind: 'text', maxLength: 20 },
    { id: 'name', label: '이름', docLabel: '성명', kind: 'text', maxLength: 20 },
    { id: 'birth', label: '생년월일', docLabel: '생년월일', kind: 'text', maxLength: 20 },
    { id: 'phone', label: '연락처', docLabel: '연락처', kind: 'text', maxLength: 20 },
    { id: 'joinDate', label: '입사일', docLabel: '입사일', kind: 'date', maxLength: 10 },
    { id: 'leaveDate', label: '그만두는 날', docLabel: '퇴사 예정일', kind: 'date', maxLength: 10 },
    {
      id: 'reason',
      label: '그만두는 이유',
      docLabel: '사직 사유',
      kind: 'multiline',
      maxLength: 100,
      maxLines: 3,
      rowLines: 3,
      presets: [
        { chip: '개인 사정', fill: '개인 사정' },
        { chip: '이직', fill: '다른 회사로 옮기게 되어서' },
        { chip: '건강', fill: '건강 문제(치료와 회복)' },
        { chip: '학업', fill: '학업(진학)' },
        { chip: '식구 돌보기', fill: '가족 돌봄' },
        { chip: '계약 끝', fill: '근로계약 기간 만료' },
        { chip: '회사 권고', fill: '회사의 권고에 따른 퇴사(권고사직)' },
      ],
    },
    { id: 'date', label: '내는 날', kind: 'date', maxLength: 10 },
    { id: 'to', label: '받는 사람', kind: 'text', maxLength: 30, hint: '예: 한빛 주식회사 대표이사' },
  ],
  blocks: [
    { type: 'title', doc: '사 직 서', size: 20 },
    { type: 'gap', size: 10 },
    { type: 'table', docSection: '인적 사항', rows: ['dept', 'position', 'name', 'birth', 'phone'], colWidths: COLS, rowHeight: ROW },
    { type: 'gap', size: 10 },
    { type: 'table', docSection: '재직 사항', rows: ['joinDate', 'leaveDate', 'reason'], colWidths: COLS, rowHeight: ROW },
    { type: 'gap', size: 10 },
    { type: 'para', doc: '본인은 위와 같은 사유로 {leaveDate}자로 사직하고자 하오니 처리하여 주시기 바랍니다.', align: 'center' },
    { type: 'gap', size: 10 },
    { type: 'dateLine', field: 'date', align: 'center' },
    { type: 'gap', size: 10 },
    { type: 'signLine', docLabel: '성명', field: 'name', align: 'right' },
    { type: 'gap', size: 10 },
    { type: 'para', doc: '{to} 귀하', align: 'left' },
  ],
};
