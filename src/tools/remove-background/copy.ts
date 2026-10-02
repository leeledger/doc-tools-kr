// User-facing copy of 사진 배경 지우기 (Sprint C, C2). The brief's lines are kept word for word in 해요체 (docs/COPY.md
// exception, as /hwp-viewer/), and the tool's own status lines follow them. Plain words: no 업로드/서버/브라우저/메모리.
// Pure: the page, the controller and the unit tests share it.
import { formatMB } from '../../lib/ui/format';
import { josa } from '../../lib/ui/josa';

/** Brief "Slug, title, SEO": above the picker, not only in the FAQ. */
export const FIT_LINE = '증명사진·상품·반려동물·자동차 사진에 잘 맞아요. 유리나 투명한 물건, 여러 사람이 함께 나온 사진, 복잡한 배경은 잘 안 될 수 있어요.';
export const STAMP_LINK_TEXT = '서명·도장은 여기서 더 잘 돼요';

/** "약 110 MB": rounded to 10 MB for the static page line. */
export function aboutMB(bytes: number): string {
  return `약 ${(Math.max(1, Math.round(bytes / (1024 * 1024) / 10)) * 10).toLocaleString('ko-KR')} MB`;
}

export const COPY = {
  firstTime: (bytes: number) => `처음 한 번 ${josa(aboutMB(bytes), '을/를')} 받아요.`,
  opening: '사진을 여는 중이에요',
  consent: (bytes: number) => `배경을 지우는 프로그램 ${josa(formatMB(bytes), '을/를')} 한 번 받아요 (와이파이 권장).`,
  consentKeep: '한 번 받으면 이 기기에 남아서 다음부터는 바로 시작해요.',
  lowDevice: '이 기기는 한 번에 처리할 수 있는 양이 적어서 큰 사진은 창이 멈출 수 있어요. 그래도 해 볼 수 있어요.',
  downloading: (loaded: number, total: number) => `받는 중이에요: ${formatMB(loaded)} / ${formatMB(total)}`,
  noStore: '이 기기에 남길 자리가 모자라서 다음에 또 받아야 해요.',
  preparing: '배경을 지우는 프로그램을 준비하는 중이에요',
  working: '배경을 지우는 중이에요',
  finishing: '가장자리를 정리하는 중이에요',
  fallback: '다른 방식으로 다시 하는 중이에요. 조금 더 걸려요.',
  done: '배경을 지웠어요',
  doneSay: (w: number, h: number) => `배경을 지웠어요. ${dims(w, h)}`,
  /** Brief Flow, word for word, plus the Arch C2.0 ruling's pointer to /stamp-signature/. */
  nosubject: '사진에서 피사체를 찾지 못했어요. 피사체가 크게, 배경이 단순하게 나온 사진으로 해 보세요.',
  nosubjectPaper: (toolName: string) => `종이에 찍힌 도장·서명·로고라면 ${josa(toolName, '을/를')} 써 보세요.`,
  /** Brief failure rows. */
  corrupt: '받은 파일이 손상되었어요. 다시 시도해 주세요.',
  network: '받는 중에 연결이 끊겼어요. 다시 시도해 주세요. 다 받은 부분은 남아 있어요.',
  engine: '배경을 지우는 프로그램을 실행하지 못했어요. 페이지를 새로고침한 뒤 다시 해 보세요.',
  crashed: '배경을 지우다 멈췄어요. 다시 시도하거나 더 작은 사진을 골라 주세요.',
  /** Guard (brief build order 5); "메모리가 부족해" is said in plain words (docs/COPY.md). */
  crashBefore: '이 기기에서 한 번에 처리하기에 너무 커서 창이 멈췄을 수 있어요. 이번에는 사진을 줄여서 해요.',
  encode: '사진 파일을 만들지 못했어요. 다시 내려받아 주세요.',
  animated: '움직이는 이미지는 쓸 수 없어요. 사진 파일을 선택해 주세요.',
  cancelled: '받기를 멈췄어요.',
  saved: (name: string) => `${name} 파일을 내려받아요.`,
} as const;

/** "600×450픽셀" (docs/COPY.md). */
export function dims(w: number, h: number): string {
  return `${w.toLocaleString('ko-KR')}×${h.toLocaleString('ko-KR')}픽셀`;
}

export type BgChoice = 'transparent' | 'white' | 'blue';
export type SaveFormat = 'jpeg' | 'png';

/**
 * The solid backgrounds. Blue: no blue exists in src/lib/idphoto/ (the id-photo tool keeps the photo's own
 * background), so the brief's fallback #3D6FD6 is used (design choice, BUILD-LOG C2).
 */
export const BG_COLORS: Record<Exclude<BgChoice, 'transparent'>, string> = { white: '#FFFFFF', blue: '#3D6FD6' };

/** Saved file name (brief Flow: 누끼.png, 누끼-흰배경.jpg). */
export function fileName(bg: BgChoice, format: SaveFormat): string {
  if (bg === 'transparent') return '누끼.png';
  return `누끼-${bg === 'white' ? '흰배경' : '파란배경'}.${format === 'png' ? 'png' : 'jpg'}`;
}

/** The download button label. */
export function saveLabel(bg: BgChoice, format: SaveFormat): string {
  return bg === 'transparent' || format === 'png' ? 'PNG로 내려받기' : 'JPG로 내려받기';
}
