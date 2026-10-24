// 인화용 모아찍기 (brief handoff/ARCHITECT-BRIEF-PRINT1023.md, P9-P10): every visible string of the #idp-sheet block of
// /id-photo/. The block renders in the system font (.idp-sheet in src/styles/app.css) and SHEET_COPY is left out of the UI
// font (scripts/lib/ui-font-chars.mjs, stripComments), like PRINT_COPY. That strip ends at the first closing brace, so no
// value here may contain one: the count line, the how-to and the preview text are joined by concatenation
// (src/tools/id-photo/controller.ts). Never 편의점/키오스크 (unsourced), 업로드/서버/브라우저, a px/dpi number or an
// acceptance promise (tests/unit/print-sheet.test.ts).
export const SHEET_COPY = {
  lead: '집에서 종이 사진으로 뽑으려면, 이 사진을 4×6 크기 한 장에 여러 장 모아 저장할 수 있습니다.',
  make: '인화용 모아찍기 만들기',
  download: '모아찍기 내려받기',
  countA: ' 사진 ',
  countB: '장',
  altA: '모아찍기 미리보기: 같은 사진 ',
  altB: '장',
  howtoA: '사진 인화 앱이나 사진관에서 4×6 크기로, 사진이 잘리지 않게 뽑으세요. 뽑은 뒤 한 장을 자로 재어 ',
  howtoB: '인지 확인하고, 회색 선 안쪽을 따라 자르세요.',
  lowres: '원본 사진이 작아서 인화하면 흐릿할 수 있습니다.',
  error: '모아찍기를 만들지 못했습니다. 다시 눌러 주세요. 한 장짜리 사진은 위에서 그대로 내려받을 수 있습니다.',
  making: '모아찍기를 만드는 중입니다',
  made: '모아찍기를 만들었습니다',
} as const;
