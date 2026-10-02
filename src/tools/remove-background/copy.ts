// User-facing copy of 사진 배경 지우기 (Sprint C, C2). The brief's lines are kept word for word in 해요체 (docs/COPY.md
// exception, as /hwp-viewer/), and the tool's own status lines follow them. Plain words: no 업로드/서버/브라우저/메모리.
// Pure: the page, the controller and the unit tests share it.
import { formatMB } from '../../lib/ui/format';
import { josa } from '../../lib/ui/josa';

/**
 * Brief "Slug, title, SEO": above the picker, not only in the FAQ. C2 round 2 (Arch): no 증명사진 (외교부 refuses
 * photos whose background was removed by editing software); the positioning is product, profile, documents, slides.
 */
export const FIT_LINE = '상품·프로필 사진·반려동물처럼 하나가 크게 나온 사진을 문서나 발표 자료에 넣을 때 잘 맞아요. 유리나 투명한 물건, 여러 사람이 함께 나온 사진, 복잡한 배경은 잘 안 될 수 있어요.';
/**
 * Arch C2 round 2, in the limits list. Source: 외교부 여권안내 "제출 불가한 사진파일 안내",
 * https://www.passport.go.kr/home/kor/contents.do?menuPos=12 (fetched 2026-10-02):
 * "배경이 흰색이 아니거나, 배경색을 사진 편집 프로그램으로 제거하여 사진이 변형된 경우"
 */
export const NOT_FOR_ID = '여권·증명사진 제출용으로는 쓰지 마세요. 외교부는 편집 프로그램으로 배경을 지운 사진을 받지 않아요.';
export const NOT_FOR_ID_SOURCE = 'https://www.passport.go.kr/home/kor/contents.do?menuPos=12';
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
  /** Arch (C2 review, Should Fix 1): the possible WASM fallback download is stated up front; no second consent. */
  consentExtra: (bytes: number) => `고속 처리가 안 되는 기기에서는 ${josa(formatMB(bytes), '을/를')} 더 받을 수 있어요.`,
  /** Shown when the fallback happens, in its own line (progress text never overwrites it). */
  fallbackNote: (bytes: number) => `이 기기에서는 고속 처리가 안 돼서 다른 방식으로 바꿔요. 필요한 파일 ${josa(formatMB(bytes), '을/를')} 더 받아요.`,
  lowDevice: '이 기기는 한 번에 처리할 수 있는 양이 적어서 큰 사진은 창이 멈출 수 있어요. 그래도 해 볼 수 있어요.',
  downloading: (loaded: number, total: number) => `받는 중이에요: ${formatMB(loaded)} / ${formatMB(total)}`,
  noStore: '이 기기에 남길 자리가 모자라서 다음에 또 받아야 해요.',
  preparing: '배경을 지우는 프로그램을 준비하는 중이에요',
  working: '배경을 지우는 중이에요',
  finishing: '가장자리를 정리하는 중이에요',
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
 * The solid backgrounds, generic (products, profiles, slides; never framed for ID photos: Arch C2 round 2). Blue is
 * the brief's #3D6FD6 (design choice, BUILD-LOG C2).
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
