// Limits of 사진 배경 지우기 (Sprint C, C2; brief build order 6, the /id-photo/ numbers). One photo. Every message states
// the number and the reason. The work copy (and so the saved picture) is capped on decode: 4,096 px long edge on a PC,
// 2,048 px on a phone, halved for the tab after a crash (guard.ts). The FAQ states the output size.
import { MB, type Device } from '../../lib/ui/device';

export interface BgLimits {
  /** Bytes (hard). */
  maxFileBytes: number;
  /** Pixels of the photo as taken (hard): the phone decodes it once before the cap. */
  maxPixels: number;
  /** Long side in px (hard; the canvas maximum). */
  maxSide: number;
  /** Long edge of the work copy and of the saved picture. */
  workEdge: number;
  /** Upper bound of engine threads (WASM, when crossOriginIsolated). */
  maxThreads: number;
}

export const LIMITS: Record<Device, BgLimits> = {
  desktop: { maxFileBytes: 50 * MB, maxPixels: 150_000_000, maxSide: 32_767, workEdge: 4096, maxThreads: 8 },
  mobile: { maxFileBytes: 30 * MB, maxPixels: 64_000_000, maxSide: 16_384, workEdge: 2048, maxThreads: 4 },
};

/** navigator.deviceMemory below this adds the warning line to the consent panel (the user may still go on). */
export const LOW_DEVICE_MEMORY = 4;

const n = (v: number): string => v.toLocaleString('ko-KR');

export function checkFileBytes(bytes: number, device: Device): string | null {
  const max = LIMITS[device].maxFileBytes;
  if (bytes <= max) return null;
  return `${device === 'mobile' ? '휴대폰에서는 ' : ''}${n(max / MB)} MB까지의 사진만 열 수 있어요. 더 큰 사진은 이 기기에서 처리하기에 너무 커서 화면이 멈출 수 있어요.`;
}

export function checkDims(width: number, height: number, device: Device): string | null {
  const l = LIMITS[device];
  const where = device === 'mobile' ? '휴대폰에서는 ' : '';
  if (Math.max(width, height) > l.maxSide) {
    return `${where}긴 변이 ${n(l.maxSide)}픽셀 이하인 사진만 열 수 있어요. 이 기기에서 한 번에 그릴 수 있는 가장 큰 크기예요.`;
  }
  if (width * height > l.maxPixels) {
    return `${where}${n(l.maxPixels / 10_000)}만 화소(${n(l.maxPixels / 1_000_000)} MP)까지의 사진만 열 수 있어요. 더 큰 사진은 이 기기에서 처리하기에 너무 커서 화면이 멈출 수 있어요.`;
  }
  return null;
}
