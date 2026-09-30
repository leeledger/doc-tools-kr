// Limits of 여권·증명사진 (brief Step 4 §3.4). One photo. Every message states the number and the reason.
// Low resolution is judged on the working bitmap: the 4,096 px working edge is ≥ 5× every output height.
import { MB, type Device } from '../../lib/ui/device';

export interface IdPhotoLimits {
  /** Bytes (hard). */
  maxFileBytes: number;
  /** Pixels (hard). */
  maxPixels: number;
  /** Long side in px (hard; the canvas maximum). */
  maxSide: number;
}

export const LIMITS: Record<Device, IdPhotoLimits> = {
  desktop: { maxFileBytes: 50 * MB, maxPixels: 150_000_000, maxSide: 32_767 },
  mobile: { maxFileBytes: 30 * MB, maxPixels: 64_000_000, maxSide: 16_384 },
};

/** The working long edge applied on decode (automatic and silent, desktop and mobile). */
export const WORKING_LONG_EDGE = 4096;

const n = (v: number): string => v.toLocaleString('ko-KR');

export function checkFileBytes(bytes: number, device: Device): string | null {
  const max = LIMITS[device].maxFileBytes;
  if (bytes <= max) return null;
  return `${device === 'mobile' ? '휴대폰에서는 ' : ''}${n(max / MB)} MB까지의 사진만 열 수 있습니다. 더 큰 사진은 기기 메모리가 부족해 브라우저가 멈출 수 있기 때문입니다.`;
}

export function checkDims(width: number, height: number, device: Device): string | null {
  const l = LIMITS[device];
  const where = device === 'mobile' ? '휴대폰에서는 ' : '';
  if (Math.max(width, height) > l.maxSide) {
    return `${where}긴 변이 ${n(l.maxSide)} px 이하인 사진만 열 수 있습니다. 브라우저가 그릴 수 있는 최대 크기이기 때문입니다.`;
  }
  if (width * height > l.maxPixels) {
    return `${where}${n(l.maxPixels / 1_000_000)} MP(${n(l.maxPixels / 10_000)}만 화소)까지의 사진만 열 수 있습니다. 기기 메모리가 부족해 브라우저가 멈출 수 있기 때문입니다.`;
  }
  return null;
}
