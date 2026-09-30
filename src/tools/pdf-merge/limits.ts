// Device limits for PDF 합치기. Basis: spike S7 (75 MB / 845쪽 took 6.5–10.8 s and about +351 MB of memory on desktop).
import { MB, type Device } from '../../lib/ui/device';
import { josa } from '../../lib/ui/josa';

export const MAX_FILES = 50;

export interface DeviceLimits {
  /** Above this total the user is warned and asked to confirm. */
  softBytes: number;
  /** Above this page total the user is warned and asked to confirm. */
  softPages: number;
  /** Above this total the merge is blocked. */
  hardBytes: number;
}

export const LIMITS: Record<Device, DeviceLimits> = {
  desktop: { softBytes: 200 * MB, softPages: 1500, hardBytes: 500 * MB },
  mobile: { softBytes: 50 * MB, softPages: Number.POSITIVE_INFINITY, hardBytes: 150 * MB },
};

export type LimitCheck = { level: 'ok' } | { level: 'soft' | 'hard'; message: string };

const mbText = (bytes: number): string => `${Math.round(bytes / MB).toLocaleString('ko-KR')} MB`;

/** Checks whether `fileCount` more files may be added to a list that already has `current` files. */
export function checkFileCount(current: number, adding: number): LimitCheck {
  if (current + adding <= MAX_FILES) return { level: 'ok' };
  return {
    level: 'hard',
    message: `한 번에 최대 ${MAX_FILES}개 파일까지 합칠 수 있어 ${current + adding - MAX_FILES}개 파일은 추가하지 않았습니다. 나머지는 나눠서 합쳐 주세요.`,
  };
}

/** Checks a total size before adding (hard limit only). */
export function checkAddBytes(totalBytes: number, device: Device): LimitCheck {
  const lim = LIMITS[device];
  if (totalBytes <= lim.hardBytes) return { level: 'ok' };
  const where = device === 'mobile' ? '휴대폰' : '이 기기';
  return {
    level: 'hard',
    message: `파일 합계가 ${josa(mbText(lim.hardBytes), '을/를')} 넘으면 ${where}에서 한 번에 합칠 수 없어 일부 파일을 추가하지 않았습니다. 파일을 나눠서 합쳐 주세요.`,
  };
}

/** Checks the whole job before merging. */
export function checkMerge(totalBytes: number, totalPages: number, device: Device): LimitCheck {
  const lim = LIMITS[device];
  if (totalBytes > lim.hardBytes) return checkAddBytes(totalBytes, device);
  if (totalBytes > lim.softBytes) {
    return {
      level: 'soft',
      message: `파일 합계가 ${josa(mbText(lim.softBytes), '을/를')} 넘습니다. 처리할 양이 많아 오래 걸리거나 화면이 멈출 수 있습니다. 계속 합칠까요?`,
    };
  }
  if (totalPages > lim.softPages) {
    return {
      level: 'soft',
      message: `모두 ${lim.softPages.toLocaleString('ko-KR')}쪽이 넘습니다. 처리할 양이 많아 오래 걸리거나 화면이 멈출 수 있습니다. 계속 합칠까요?`,
    };
  }
  return { level: 'ok' };
}
