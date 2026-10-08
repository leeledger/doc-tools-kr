// Device limits for PDF 나누기·쪽 편집 (brief TOOLS5 decision 9): the PDF 합치기 limits for one file (phones: lower, see
// MOBILE_MAX_FILE_BYTES), the page count up to which page pictures are drawn, and the number of files one split may make.
// The FAQ reads these numbers.
import { MB, type Device } from '../../lib/ui/device';
import { LIMITS as MERGE_LIMITS } from '../pdf-merge/limits';

export interface DeviceLimits {
  /** The largest PDF that is opened (PDF 합치기 hard limit on PCs; MOBILE_MAX_FILE_BYTES on phones). */
  maxFileBytes: number;
  /** Above this many pages the list shows page numbers only, no page pictures. */
  maxThumbPages: number;
  /** The most PDF files one split makes (one ZIP). */
  maxParts: number;
}

/**
 * Phones open at most 100 MB here, below PDF 합치기's 150 MB (SEO-LENGTH round 2, orchestrator): saving holds the file
 * several times over (main thread, the pdf.js worker, a copy per output in merge.worker, pdf-lib's parse, the output).
 * Measured peak while saving, Pixel 7 emulation: about 6–7× the file size in the renderer (141 MB file: 0.86–1.03 GB).
 */
export const MOBILE_MAX_FILE_BYTES = 100 * MB;

export const LIMITS: Record<Device, DeviceLimits> = {
  desktop: { maxFileBytes: MERGE_LIMITS.desktop.hardBytes, maxThumbPages: 500, maxParts: 500 },
  mobile: { maxFileBytes: MOBILE_MAX_FILE_BYTES, maxThumbPages: 200, maxParts: 100 },
};

const n = (x: number): string => x.toLocaleString('ko-KR');
const where = (device: Device): string => (device === 'mobile' ? '휴대폰' : '이 기기');

/** Why a file of `size` bytes cannot be opened on `device`, or null. */
export function fileLimitMessage(size: number, device: Device): string | null {
  const max = LIMITS[device].maxFileBytes;
  if (size <= max) return null;
  return `${where(device)}에서는 ${n(max / MB)} MB까지의 PDF만 열 수 있습니다. 더 작은 파일을 고르거나 PC에서 이용해 주세요.`;
}

/** Why `parts` files are too many for one split on `device`, with the numbers; or null. */
export function partsLimitMessage(parts: number, device: Device): string | null {
  const max = LIMITS[device].maxParts;
  if (parts <= max) return null;
  return `${where(device)}에서는 한 번에 PDF ${n(max)}개까지 나눌 수 있습니다. 지금 나누면 ${n(parts)}개가 됩니다. 범위를 줄이거나 쪽 수를 늘려 주세요.`;
}

/** The PDF 합치기 size / page warning for the whole file: above its soft limits the person is asked first. */
export function softLimitMessage(bytes: number, pages: number, device: Device): string | null {
  const lim = MERGE_LIMITS[device];
  if (bytes > lim.softBytes) return `파일이 ${n(lim.softBytes / MB)} MB가 넘습니다. 처리할 양이 많아 오래 걸리거나 화면이 멈출 수 있습니다. 계속할까요?`;
  if (pages > lim.softPages) return `${n(lim.softPages)}쪽이 넘는 파일입니다. 처리할 양이 많아 오래 걸리거나 화면이 멈출 수 있습니다. 계속할까요?`;
  return null;
}
