// In-tool lines of 견적서·거래명세서 만들기 (QUOTE1112; the form tools' lines for this page): late copy (해요체; docs/COPY.md
// exception for in-tool status lines). 「서류」 stands for whichever of the two the radio picked. Page copy (labels, steps,
// FAQ) lives in the page and src/data/tools.ts.
import type { FormCopy } from '../form-tool/controller';
import type { FieldProblem } from '../../lib/form/values';
import type { ItemsCopy } from './items';

export const QT_COPY: FormCopy = {
  engine: (pct: number): string => `처음 한 번만 문서 만드는 프로그램을 받는 중 · ${pct}%`,
  building: '서류를 만드는 중',
  ready: '서류를 만들었어요. 아래에서 미리 보고 「한글(HWP)로 받기」나 「PDF로 받기」를 누르세요.',
  readyBlank: '빈 서류를 만들었어요. 받아서 인쇄한 뒤 손으로 쓰세요.',
  readyPdfOnly: '서류를 만들었어요. 아래에서 미리 보고 「PDF로 받기」를 누르세요.',
  stale: '고친 내용으로 다시 만들어 주세요. 만들기 버튼을 누르면 새로 만들어요.',
  pdfBuilding: 'PDF를 만드는 중',
  downloaded: (name: string): string => `「${name}」를 내려받았어요. 「다운로드」 폴더를 확인하세요.`,
  rasterPage: '글꼴에 없는 글자가 있어 PDF의 그 쪽은 그림으로 넣었어요.',
  failed: '서류를 만들지 못했어요. 다시 해 보세요.',
  oom: '이 기기에서 서류를 만들지 못했어요. 다른 앱을 닫고 다시 해 보세요.',
  timeout: '서류를 만드는 데 너무 오래 걸려 멈췄어요. 다시 해 보세요.',
  retry: '다시 해 보기',
  hwpExport: '한글(HWP) 파일을 만들지 못했어요. PDF로는 받을 수 있어요.',
  hwpUnverified: '만든 한글(HWP) 파일을 다시 열어 확인하지 못해 내려받지 않았어요. PDF로는 받을 수 있어요.',
  pdfFailed: 'PDF를 만들지 못했어요. 한글(HWP)로 받거나 다시 해 보세요.',
  pageFailed: '이 쪽은 미리 보여 주지 못했어요.',
};

/** Q5, Q8: the rows' error line and the totals box. */
export const ITEMS_COPY: ItemsCopy = {
  pair: (row: number): string => `품목 ${row}: 수량과 단가를 함께 넣어 주세요.`,
  tooBig: '100억 원 이상인 금액은 만들 수 없어요.',
  supply: '공급가액 합계',
  tax: '부가세',
  total: '합계',
  noTax: '없음',
};

/** The field error lines of 수량 and 단가 (Q4). */
export const QT_PROBLEMS: Readonly<Record<FieldProblem, string>> = {
  number: '숫자로 써 주세요. 수량은 소수점 아래 두 자리까지 돼요.',
  tooBig: '너무 큰 수예요. 수량은 999,999까지, 단가는 열 자리까지 써 주세요.',
  zero: '0보다 큰 수를 써 주세요.',
};

/** Q9: the seal picture lines. */
export const SEAL_COPY = {
  notImage: 'PNG나 JPG 그림만 넣을 수 있어요.',
  tooLarge: '2MB 넘는 그림은 넣을 수 없어요. 더 작은 그림을 골라 주세요.',
  unreadable: '이 그림을 읽지 못했어요. 다른 그림을 골라 주세요.',
  added: '직인 그림을 넣었어요. 만들기를 누르면 서류의 공급자 이름 옆에 찍혀요.',
  removed: '직인 그림을 뺐어요.',
  arrived: (from: string): string => `${from}에서 만든 그림을 가져왔습니다.`,
} as const;
