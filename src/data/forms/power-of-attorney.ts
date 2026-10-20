// 위임장 (FORM1020 D5): our own general layout, not an agency's form (D1); no legal claim in the document. Page labels
// are plain words in the core UI glyphs; document text (doc / docLabel / docSection) is drawn only in the document.
// maxLength per field keeps the all-max form on 1 page in rhwp and in 한글 (tests/unit/form-build.test.ts, npm run
// forms:hancom).
import type { FormSpec } from '../../lib/form/spec';

/** D12: the HWP download. Off only if the real-한글 gate fails and cannot be fixed (then PDF only). */
export const FORM_HWP = true;

/** colWidths (HWPUNIT): section · label · value, 41,952 in all (the template's default table width). */
const COLS = [6000, 12000, 23952];
const ROW = 2268;

export const POWER_OF_ATTORNEY: FormSpec = {
  id: 'power-of-attorney',
  fileBase: '위임장',
  title: '위임장',
  fields: [
    { id: 'giverName', label: '이름', docLabel: '성명', kind: 'text', maxLength: 20 },
    { id: 'giverBirth', label: '생년월일', docLabel: '생년월일(주민등록번호)', kind: 'text', maxLength: 20 },
    { id: 'giverAddress', label: '주소', docLabel: '주소', kind: 'text', maxLength: 50 },
    { id: 'giverPhone', label: '연락처', docLabel: '연락처', kind: 'text', maxLength: 20 },
    { id: 'agentName', label: '이름', docLabel: '성명', kind: 'text', maxLength: 20 },
    { id: 'agentBirth', label: '생년월일', docLabel: '생년월일(주민등록번호)', kind: 'text', maxLength: 20 },
    { id: 'agentAddress', label: '주소', docLabel: '주소', kind: 'text', maxLength: 50 },
    { id: 'agentPhone', label: '연락처', docLabel: '연락처', kind: 'text', maxLength: 20 },
    { id: 'agentRelation', label: '관계', docLabel: '위임인과의 관계', kind: 'text', maxLength: 20 },
    { id: 'submitTo', label: '서류를 낼 곳', docLabel: '제출할 곳', kind: 'text', maxLength: 30 },
    { id: 'task', label: '부탁할 일', docLabel: '맡기는 일', kind: 'multiline', maxLength: 120, maxLines: 6, rowLines: 4 },
    { id: 'date', label: '날짜', kind: 'date', maxLength: 10 },
  ],
  blocks: [
    { type: 'title', doc: '위 임 장', size: 20 },
    { type: 'gap', size: 10 },
    { type: 'table', docSection: '위임인', rows: ['giverName', 'giverBirth', 'giverAddress', 'giverPhone'], colWidths: COLS, rowHeight: ROW },
    { type: 'gap', size: 10 },
    { type: 'table', docSection: '대리인', rows: ['agentName', 'agentBirth', 'agentAddress', 'agentPhone', 'agentRelation'], colWidths: COLS, rowHeight: ROW },
    { type: 'gap', size: 10 },
    { type: 'table', docSection: '위임 내용', rows: ['submitTo', 'task'], colWidths: COLS, rowHeight: ROW },
    { type: 'gap', size: 10 },
    { type: 'para', doc: '위 사람에게 위 내용에 관한 권한을 위임합니다.', align: 'center' },
    { type: 'gap', size: 10 },
    { type: 'dateLine', field: 'date', align: 'center' },
    { type: 'gap', size: 10 },
    { type: 'signLine', docLabel: '위임인', field: 'giverName', align: 'right' },
    { type: 'gap', size: 10 },
    { type: 'para', doc: '{submitTo} 귀중', align: 'left', onlyIf: 'submitTo' },
  ],
};
