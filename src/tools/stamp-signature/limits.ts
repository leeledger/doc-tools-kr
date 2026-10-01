// Limits of 전자서명·도장 이미지 (Sprint C, C1; the /id-photo/ pattern). One photo. Every message states the number
// and the reason. The work copy is capped on decode: 2,400 px long edge on a PC, 1,600 px on a phone (brief Flow).
import { MB, type Device } from '../../lib/ui/device';

export interface InkLimits {
  /** Bytes (hard). */
  maxFileBytes: number;
  /** Pixels of the photo as taken (hard): a phone decodes the whole photo once before the cap. */
  maxPixels: number;
  /** Long side in px (hard; the canvas maximum). */
  maxSide: number;
  /** Long edge of the work copy. */
  workEdge: number;
}

export const LIMITS: Record<Device, InkLimits> = {
  desktop: { maxFileBytes: 50 * MB, maxPixels: 100_000_000, maxSide: 32_767, workEdge: 2400 },
  mobile: { maxFileBytes: 30 * MB, maxPixels: 40_000_000, maxSide: 16_384, workEdge: 1600 },
};

const n = (v: number): string => v.toLocaleString('ko-KR');

export function checkFileBytes(bytes: number, device: Device): string | null {
  const max = LIMITS[device].maxFileBytes;
  if (bytes <= max) return null;
  return `${device === 'mobile' ? '휴대폰에서는 ' : ''}${n(max / MB)} MB까지의 사진만 열 수 있습니다. 더 큰 사진은 이 기기에서 처리하기에 너무 커서 화면이 멈출 수 있기 때문입니다.`;
}

export function checkDims(width: number, height: number, device: Device): string | null {
  const l = LIMITS[device];
  const where = device === 'mobile' ? '휴대폰에서는 ' : '';
  if (Math.max(width, height) > l.maxSide) {
    return `${where}긴 변이 ${n(l.maxSide)}픽셀 이하인 사진만 열 수 있습니다. 이 기기에서 한 번에 그릴 수 있는 가장 큰 크기이기 때문입니다.`;
  }
  if (width * height > l.maxPixels) {
    return `${where}${n(l.maxPixels / 10_000)}만 화소(${n(l.maxPixels / 1_000_000)} MP)까지의 사진만 열 수 있습니다. 더 큰 사진은 이 기기에서 처리하기에 너무 커서 화면이 멈출 수 있기 때문입니다.`;
  }
  return null;
}
