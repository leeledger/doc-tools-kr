// Device limits for PDF JPG 변환 (brief TOOLS4 T3). The FAQ and the guides' tool facts read these numbers.
import { MB, type Device } from '../../lib/ui/device';
import type { CanvasCaps } from './scale';

/** 선명도: the resolution each page is drawn at (pixels per inch of the page). */
export const PPI = { p96: 96, p150: 150, p300: 300 } as const;
export type PpiLevel = keyof typeof PPI;
export const DEFAULT_PPI: PpiLevel = 'p150';

export interface DeviceLimits {
  maxFileBytes: number;
  /** Pages in one run. */
  maxPages: number;
  /** Pages in one run at 선명 (300 ppi). */
  maxPagesSharp: number;
  /** The largest canvas a page is drawn on (iOS canvas limits on phones). */
  caps: CanvasCaps;
}

export const LIMITS: Record<Device, DeviceLimits> = {
  desktop: { maxFileBytes: 200 * MB, maxPages: 500, maxPagesSharp: 500, caps: { maxArea: 36_000_000, maxEdge: 8192 } },
  mobile: { maxFileBytes: 50 * MB, maxPages: 100, maxPagesSharp: 50, caps: { maxArea: 16_000_000, maxEdge: 4096 } },
};

const n = (x: number): string => x.toLocaleString('ko-KR');
const where = (device: Device): string => (device === 'mobile' ? '휴대폰' : '이 기기');

/** Why a file of `size` bytes cannot be opened on `device`, or null. */
export function fileLimitMessage(size: number, device: Device): string | null {
  const max = LIMITS[device].maxFileBytes;
  if (size <= max) return null;
  return `${where(device)}에서는 ${n(max / MB)} MB까지의 PDF만 변환할 수 있습니다. 더 작은 파일을 고르거나 PC에서 이용해 주세요.`;
}

/** The page cap of one run at `ppi` on `device`. */
export const pageCap = (ppi: PpiLevel, device: Device): number => (ppi === 'p300' ? LIMITS[device].maxPagesSharp : LIMITS[device].maxPages);

/** Why `pages` pages cannot be converted in one run, with the numbers and a request for a range; or null. */
export function runLimitMessage(pages: number, ppi: PpiLevel, device: Device): string | null {
  const cap = pageCap(ppi, device);
  if (pages <= cap) return null;
  const sharp = ppi === 'p300' && cap < LIMITS[device].maxPages ? '선명으로는 ' : '';
  return `${where(device)}에서는 ${sharp}한 번에 ${n(cap)}쪽까지 변환할 수 있습니다. 고른 쪽은 ${n(pages)}쪽입니다. 변환할 쪽에 「1-${n(cap)}」처럼 나눠 입력해 주세요.`;
}
