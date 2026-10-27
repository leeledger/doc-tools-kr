// In-tool lines of 사직서 만들기 (RESIGN1027; the 위임장's FORM1020 lines for this form): late copy (해요체; docs/COPY.md
// exception for in-tool status lines). Page copy (labels, steps, FAQ) lives in the page and src/data/tools.ts.
import type { FormCopy } from '../form-tool/controller';

export const RS_COPY: FormCopy = {
  engine: (pct: number): string => `처음 한 번만 문서 만드는 프로그램을 받는 중 · ${pct}%`,
  building: '사직서를 만드는 중',
  ready: '사직서를 만들었어요. 아래에서 미리 보고 「한글(HWP)로 받기」나 「PDF로 받기」를 누르세요.',
  readyBlank: '빈 사직서를 만들었어요. 받아서 인쇄한 뒤 손으로 쓰세요.',
  readyPdfOnly: '사직서를 만들었어요. 아래에서 미리 보고 「PDF로 받기」를 누르세요.',
  stale: '고친 내용으로 다시 만들어 주세요. 「사직서 만들기」를 누르면 새로 만들어요.',
  pdfBuilding: 'PDF를 만드는 중',
  downloaded: (name: string): string => `「${name}」를 내려받았어요. 「다운로드」 폴더를 확인하세요.`,
  rasterPage: '글꼴에 없는 글자가 있어 PDF의 그 쪽은 그림으로 넣었어요.',
  failed: '사직서를 만들지 못했어요. 다시 해 보세요.',
  oom: '이 기기에서 사직서를 만들지 못했어요. 다른 앱을 닫고 다시 해 보세요.',
  timeout: '사직서를 만드는 데 너무 오래 걸려 멈췄어요. 다시 해 보세요.',
  retry: '다시 해 보기',
  hwpExport: '한글(HWP) 파일을 만들지 못했어요. PDF로는 받을 수 있어요.',
  hwpUnverified: '만든 한글(HWP) 파일을 다시 열어 확인하지 못해 내려받지 않았어요. PDF로는 받을 수 있어요.',
  pdfFailed: 'PDF를 만들지 못했어요. 한글(HWP)로 받거나 다시 해 보세요.',
  pageFailed: '이 쪽은 미리 보여 주지 못했어요.',
};

