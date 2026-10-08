// Device limits for PDF 서명·도장 넣기 (TOOLS5 U3): the PDF limits of PDF 나누기·쪽 편집 (one file; phones lower than
// PDF 합치기, the save holds the file several times over), and the signature picture: file size and the long edge it is
// drawn at (a signature needs no more; a big photo of a 도장 is scaled down before it goes into the PDF).
import { MB, type Device } from '../../lib/ui/device';
import { LIMITS as SPLIT_LIMITS } from '../pdf-split/limits';

export interface DeviceLimits {
  /** The largest PDF that is opened. */
  maxFileBytes: number;
  /** The largest picture file that is read. */
  maxImageBytes: number;
}

/** The picture goes into the PDF at most this many pixels on its long edge (PNG). */
export const IMAGE_EDGE = 2000;

export const LIMITS: Record<Device, DeviceLimits> = {
  desktop: { maxFileBytes: SPLIT_LIMITS.desktop.maxFileBytes, maxImageBytes: 50 * MB },
  mobile: { maxFileBytes: SPLIT_LIMITS.mobile.maxFileBytes, maxImageBytes: 30 * MB },
};

const n = (x: number): string => x.toLocaleString('ko-KR');
const where = (device: Device): string => (device === 'mobile' ? '휴대폰' : '이 기기');

/** Why a PDF of `size` bytes cannot be opened on `device`, or null. */
export function fileLimitMessage(size: number, device: Device): string | null {
  const max = LIMITS[device].maxFileBytes;
  if (size <= max) return null;
  return `${where(device)}에서는 ${n(max / MB)} MB까지의 PDF만 열 수 있습니다. 더 작은 파일을 고르거나 PC에서 이용해 주세요.`;
}

/** Why a picture of `size` bytes is not read on `device`, or null. */
export function imageLimitMessage(size: number, device: Device): string | null {
  const max = LIMITS[device].maxImageBytes;
  if (size <= max) return null;
  return `${where(device)}에서는 ${n(max / MB)} MB까지의 그림만 쓸 수 있습니다. 더 작은 그림을 골라 주세요.`;
}
