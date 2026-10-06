// Device limits for 사진 PDF 변환 (brief TOOLS4 T2). The FAQ and the guides' tool facts read these numbers.
import { MB, type Device } from '../../lib/ui/device';
import { josa } from '../../lib/ui/josa';

export interface DeviceLimits {
  maxImages: number;
  /** One photo. */
  maxFileBytes: number;
  /** All photos together. */
  maxTotalBytes: number;
  /** Long edge a re-drawn photo is decoded at, at most (canvas limits; 4,096 on phones). */
  maxEdge: number;
}

export const LIMITS: Record<Device, DeviceLimits> = {
  desktop: { maxImages: 200, maxFileBytes: 100 * MB, maxTotalBytes: 500 * MB, maxEdge: 8192 },
  mobile: { maxImages: 50, maxFileBytes: 50 * MB, maxTotalBytes: 150 * MB, maxEdge: 4096 },
};

/** 사진 크기 「줄이기」: the long edge of every photo, in pixels. */
export const REDUCE_EDGE = 2000;

const mbText = (bytes: number): string => `${Math.round(bytes / MB).toLocaleString('ko-KR')} MB`;
const where = (device: Device): string => (device === 'mobile' ? '휴대폰' : '이 기기');

export interface AddPlan {
  /** Indexes (into the picked files) that may be added, in order. */
  accepted: number[];
  /** One message per limit that left photos out, with the numbers. */
  messages: string[];
  /** Usage codes of those limits (too-many, too-big). */
  codes: ('too-many' | 'too-big')[];
}

/**
 * Which of the picked files (sizes in bytes) fit next to `current` photos totalling `currentBytes`. Files over a limit
 * are not added; the rest keep their order.
 */
export function planAdd(sizes: readonly number[], current: number, currentBytes: number, device: Device): AddPlan {
  const lim = LIMITS[device];
  const accepted: number[] = [];
  let overCount = 0;
  let overFile = 0;
  let overTotal = 0;
  let total = currentBytes;
  sizes.forEach((size, i) => {
    if (size > lim.maxFileBytes) overFile++;
    else if (current + accepted.length >= lim.maxImages) overCount++;
    else if (total + size > lim.maxTotalBytes) overTotal++;
    else {
      accepted.push(i);
      total += size;
    }
  });
  const messages: string[] = [];
  const codes: AddPlan['codes'] = [];
  if (overCount) {
    messages.push(`한 번에 최대 ${lim.maxImages.toLocaleString('ko-KR')}장까지 넣을 수 있어 ${overCount.toLocaleString('ko-KR')}장은 추가하지 않았습니다. 나머지는 나눠서 만들어 주세요.`);
    codes.push('too-many');
  }
  if (overFile) {
    messages.push(`사진 한 장은 ${where(device)}에서 ${mbText(lim.maxFileBytes)}까지 넣을 수 있어 ${overFile.toLocaleString('ko-KR')}장은 추가하지 않았습니다.`);
    codes.push('too-big');
  }
  if (overTotal) {
    messages.push(`사진 합계가 ${josa(mbText(lim.maxTotalBytes), '을/를')} 넘으면 ${where(device)}에서 한 번에 만들 수 없어 ${overTotal.toLocaleString('ko-KR')}장은 추가하지 않았습니다. 나눠서 만들어 주세요.`);
    if (!codes.includes('too-big')) codes.push('too-big');
  }
  return { accepted, messages, codes };
}
