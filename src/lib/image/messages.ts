// Error codes and the user-facing copy of 사진 용량 줄이기 (brief Step 3 §3.2). Step 4 reuses the heic,
// corrupt and animated copy.
import { isEngineLoadFailure } from '../ui/engine-load';

export type PhotoErrorCode =
  | 'heic'
  | 'animated'
  | 'not-image'
  | 'unsupported'
  | 'corrupt'
  | 'truncated'
  | 'target-unreachable'
  | 'too-large'
  | 'oom'
  | 'unknown'
  | 'verify'
  /** A codec or chunk failed to load (not the file's fault; the page shows the engine-error banner). */
  | 'engine';

export class PhotoError extends Error {
  constructor(
    readonly code: PhotoErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'PhotoError';
  }
}

/** Any thrown value → an error code (OOM surfaces as RangeError or an allocation message). */
export function photoErrorCode(err: unknown): PhotoErrorCode {
  if (err instanceof PhotoError) return err.code;
  // A chunk or codec that did not load is never the photo's fault (Polish P.1).
  if (isEngineLoadFailure(err)) return 'engine';
  const msg = String((err as { message?: unknown })?.message ?? err);
  if (err instanceof RangeError || /out of memory|allocation failed|memory access out of bounds/i.test(msg)) return 'oom';
  return 'unknown';
}

export const ERRORS = {
  heic: '아이폰 사진 형식(HEIC)은 이 브라우저에서 열 수 없습니다. 아이폰 설정 > 카메라 > 포맷에서 「높은 호환성」을 고르거나 사진을 JPG로 내보낸 뒤 다시 선택해 주세요.',
  animated: '움직이는 이미지(GIF·WebP·PNG)는 아직 줄일 수 없습니다. 움직이지 않는 사진 파일을 선택해 주세요.',
  'not-image': '사진 파일이 아닙니다. JPG·PNG·WebP 파일을 선택해 주세요.',
  corrupt: '사진 파일을 열 수 없습니다. 파일이 손상되었을 수 있으니 원본을 다시 저장해 선택해 주세요.',
  truncated: '파일이 중간에 끊겨 있습니다. 사진 파일을 열 수 없습니다. 파일이 손상되었을 수 있으니 원본을 다시 저장해 선택해 주세요.',
  oom: '기기 메모리가 부족합니다. 더 작은 사진으로 시도하거나 PC에서 이용해 주세요.',
  unknown: '처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.',
  verify: '결과 사진을 검증하지 못해 내려받기를 막았습니다. 다른 설정으로 다시 시도해 주세요.',
  zip: 'ZIP 파일을 만들지 못했습니다. 한 장씩 내려받아 주세요.',
} as const;

const FORMAT_NAMES: Record<string, string> = { tiff: 'TIFF', heic: 'HEIC', avif: 'AVIF', bmp: 'BMP', gif: 'GIF', unknown: '알 수 없는 형식' };

export function unsupportedMessage(format: string): string {
  return `이 형식(${FORMAT_NAMES[format] ?? format.toUpperCase()})은 아직 지원하지 않습니다. JPG·PNG·WebP로 바꾼 뒤 다시 선택해 주세요.`;
}

export function unreachableMessage(targetKb: number): string {
  return `${targetKb.toLocaleString('ko-KR')} KB로는 이 사진을 줄일 수 없습니다. 목표 용량을 조금 높여 주세요.`;
}

export const NOTES = {
  scaled: (w: number, h: number) => `목표 용량에 맞추려고 크기를 ${w}×${h}으로 줄였습니다.`,
  flattened: '투명한 부분은 흰색으로 채웠습니다. 투명 배경이 필요하면 저장 형식에서 WebP를 고르세요.',
  cmyk: '인쇄용 색상(CMYK) 사진을 화면용 색상으로 바꿨습니다. 색이 조금 달라 보일 수 있습니다.',
  stripped: '이미 목표보다 작아 화질은 그대로 두고 사진 정보(EXIF)만 지웠습니다.',
  mobileCapped: '휴대폰에서는 긴 변 4,096 px까지 줄여서 처리합니다.',
  mozjpegFallback: '빠른 방식으로 처리했습니다. 같은 용량에서 화질이 조금 낮을 수 있습니다.',
  kept: '더 줄일 수 없는 사진입니다. 원본을 그대로 쓰세요.',
  resaved: '위치 정보 등 개인정보를 지우고 방향을 바로잡느라 파일을 다시 저장했습니다.',
  /**
   * A result larger than its input replaces the size and percent lines (never "0 % 줄었습니다"). The reason
   * depends on why it was re-saved: privacy/orientation (`resaved`), or only the conversion to JPG
   * (a clean PNG/BMP/GIF or a CMYK JPEG; Arch round 3).
   */
  grown: (before: string, after: string, withinTarget: boolean, resaved: boolean) =>
    `${before} → ${after} (늘어남) — ${
      resaved
        ? '위치 정보 등 개인정보를 지우고 방향을 바로잡느라 다시 저장했습니다.'
        : 'JPG로 바꾸느라 용량이 늘었습니다. 제출처가 원래 형식을 받는다면 원본을 쓰셔도 됩니다.'
    }${withinTarget ? ' 목표 용량 안입니다.' : ''}`,
  gpsBefore: '위치 정보 있음',
  gpsRemoved: '위치 정보 지움',
} as const;
