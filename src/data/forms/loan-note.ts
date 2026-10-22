// 차용증 (LOAN1022 L-D5): our own general 금전 차용증 between people (L-D1: no 보증인, 공정증서 or 대부업 form); no legal
// claim in the document. Page labels are plain words in the core UI glyphs (L-D7: 「얼마를 빌렸나요」, 「돌려줄 날」 —
// 돈/액/갚 are not core glyphs); document text (doc / docLabel / docSection / docTemplate / docBlank / docZero) is
// drawn only in the document. Everything after the first table is plain 10 pt (rhwp 0.8.6, src/lib/form/build.ts).
// maxLength per field keeps the all-max form on 1 page in rhwp (tests/unit/loan-note.test.ts).
import type { FormSpec } from '../../lib/form/spec';

/** L-D3 / L-D12: the HWP download. Off only if the real-한글 gate fails and cannot be fixed (then PDF only). */
export const LOAN_HWP = true;

/** colWidths (HWPUNIT): section · label · value, 41,952 in all (the 위임장's). */
const COLS = [6000, 12000, 23952];
const ROW = 2268;

export const LOAN_NOTE: FormSpec = {
  id: 'loan-note',
  fileBase: '차용증',
  title: '차용증',
  fields: [
    { id: 'amount', label: '얼마를 빌렸나요', docLabel: '빌린 돈', kind: 'amount', maxLength: 20, docBlank: '금                원정 (                원)' },
    { id: 'loanDate', label: '빌린 날', docLabel: '빌린 날', kind: 'date', maxLength: 10 },
    { id: 'dueDate', label: '돌려줄 날', docLabel: '갚을 날', kind: 'date', maxLength: 10 },
    { id: 'rate', label: '1년 이자', docLabel: '이자', kind: 'number', maxLength: 8, docTemplate: '연 {v}%', docZero: '없음', docBlank: '연      %', hint: '이자가 없으면 0을 쓰세요.' },
    { id: 'interestDay', label: '이자를 내는 날', docLabel: '이자 내는 날', kind: 'text', maxLength: 20 },
    { id: 'repayHow', label: '돌려주는 방법', docLabel: '갚는 방법', kind: 'text', maxLength: 50 },
    { id: 'terms', label: '그 밖의 약속', docLabel: '그 밖의 약속', kind: 'multiline', maxLength: 120, maxLines: 4, rowLines: 3 },
    { id: 'lenderName', label: '이름', docLabel: '성명', kind: 'text', maxLength: 20 },
    { id: 'lenderBirth', label: '생년월일', docLabel: '생년월일', kind: 'text', maxLength: 20 },
    { id: 'lenderAddress', label: '주소', docLabel: '주소', kind: 'text', maxLength: 50 },
    { id: 'lenderPhone', label: '연락처', docLabel: '연락처', kind: 'text', maxLength: 20 },
    { id: 'borrowerName', label: '이름', docLabel: '성명', kind: 'text', maxLength: 20 },
    { id: 'borrowerBirth', label: '생년월일', docLabel: '생년월일', kind: 'text', maxLength: 20 },
    { id: 'borrowerAddress', label: '주소', docLabel: '주소', kind: 'text', maxLength: 50 },
    { id: 'borrowerPhone', label: '연락처', docLabel: '연락처', kind: 'text', maxLength: 20 },
    { id: 'date', label: '쓴 날', kind: 'date', maxLength: 10 },
  ],
  blocks: [
    { type: 'title', doc: '차 용 증', size: 20 },
    { type: 'gap', size: 10 },
    { type: 'table', docSection: '차용 내용', rows: ['amount', 'loanDate', 'dueDate', 'rate', 'interestDay', 'repayHow', 'terms'], colWidths: COLS, rowHeight: ROW },
    { type: 'gap', size: 10 },
    { type: 'table', docSection: '빌려준 사람(채권자)', rows: ['lenderName', 'lenderBirth', 'lenderAddress', 'lenderPhone'], colWidths: COLS, rowHeight: ROW },
    { type: 'gap', size: 10 },
    { type: 'table', docSection: '빌린 사람(채무자)', rows: ['borrowerName', 'borrowerBirth', 'borrowerAddress', 'borrowerPhone'], colWidths: COLS, rowHeight: ROW },
    { type: 'gap', size: 10 },
    { type: 'para', doc: '위 돈을 틀림없이 빌렸으며, 위에 적은 대로 갚겠습니다.', align: 'center' },
    { type: 'gap', size: 10 },
    { type: 'dateLine', field: 'date', align: 'center' },
    { type: 'gap', size: 10 },
    { type: 'signLine', docLabel: '채무자', field: 'borrowerName', align: 'right' },
    { type: 'gap', size: 10 },
    { type: 'signLine', docLabel: '채권자', field: 'lenderName', align: 'right' },
  ],
};
