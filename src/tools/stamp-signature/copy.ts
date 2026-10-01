// User-facing copy of 전자서명·도장 이미지 (Sprint C, C1). Plain words (docs/COPY.md): no 업로드/서버/브라우저, no px.
// Pure: the page, the controllers and the unit tests share it.
import type { InkStatus, InkSize } from '../../lib/ink/key';

export const COPY = {
  opening: '사진을 여는 중입니다',
  keying: '배경을 지우는 중입니다',
  /** Area check (brief Flow): no download in either case. */
  noink: '도장이나 서명을 찾지 못했습니다. 진하기를 높이거나, 환한 곳에서 종이를 가까이 다시 찍어 주세요.',
  allpaper: '종이 전체를 도장이나 서명으로 읽었습니다. 종이만 나오게 환한 곳에서 다시 찍어 주세요.',
  animated: '움직이는 이미지는 쓸 수 없습니다. 사진 파일을 선택해 주세요.',
  /** The ink worker stopped after the photo was loaded (out of memory or a crash): 다시 시도 runs it again. */
  crashed: '배경을 지우다 멈췄습니다. 다시 시도하거나 더 작은 사진을 골라 주세요.',
  /** canvas.toBlob gave nothing twice (the next smaller size was tried once). */
  encode: 'PNG 파일을 만들지 못했습니다. 더 작은 크기를 골라 다시 내려받아 주세요.',
  padEmpty: '서명을 먼저 그려 주세요.',
  saved: (name: string) => `${name} 파일을 내려받습니다.`,
  ready: (w: number, h: number) => `배경을 지웠습니다. ${dims(w, h)}`,
} as const;

/** "600×450픽셀" (docs/COPY.md: pixel counts as 413×531픽셀). */
export function dims(w: number, h: number): string {
  return `${w.toLocaleString('ko-KR')}×${h.toLocaleString('ko-KR')}픽셀`;
}

/** The area-check message of a run, or null when there is ink to download. */
export function areaMessage(status: InkStatus): string | null {
  return status === 'noink' ? COPY.noink : status === 'allpaper' ? COPY.allpaper : null;
}

/** 진하기 steps -2..2 (key.ts INK.strengthMin..Max). */
export const STRENGTH_LABELS: Readonly<Record<string, string>> = {
  '-2': '아주 연하게',
  '-1': '연하게',
  '0': '보통',
  '1': '진하게',
  '2': '아주 진하게',
};

export function strengthLabel(step: number): string {
  return STRENGTH_LABELS[String(step)] ?? STRENGTH_LABELS['0']!;
}

/** The 크기 choices (key.ts INK_SIZES): null = the crop as it is. */
export function sizeLabel(size: InkSize): string {
  return size === null ? '원본 크기' : `긴 변 ${size.toLocaleString('ko-KR')}픽셀`;
}
