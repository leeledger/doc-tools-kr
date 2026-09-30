// Device limits for PDF 용량 줄이기. Basis: spike §3.4 (40.7 MB → +709 MB peak memory; 74 MB → +1.5 GB).
// Byte limits are checked when the file is picked; page limits after inspection and when the level changes.
import { MB, type Device } from '../../lib/ui/device';
import { josa } from '../../lib/ui/josa';

export interface CompressLimits {
  /** Above these the user is asked to confirm. */
  softBytes: number;
  softPages: number;
  /** Above this the file is not accepted. */
  hardBytes: number;
  /** "이미지로 변환": confirm above, block above. */
  rasterSoftPages: number;
  rasterHardPages: number;
}

export const LIMITS: Record<Device, CompressLimits> = {
  desktop: { softBytes: 40 * MB, softPages: 1000, hardBytes: 100 * MB, rasterSoftPages: 200, rasterHardPages: 500 },
  mobile: { softBytes: 20 * MB, softPages: 300, hardBytes: 50 * MB, rasterSoftPages: 30, rasterHardPages: 100 },
};

export type LimitCheck = { level: 'ok' } | { level: 'soft' | 'hard'; message: string };

const mbText = (bytes: number): string => `${Math.round(bytes / MB).toLocaleString('ko-KR')} MB`;
const pagesText = (n: number): string => `${n.toLocaleString('ko-KR')}쪽`;
const where = (device: Device): string => (device === 'mobile' ? '휴대폰에서는' : '이 기기에서는');
const MEMORY = '이 기기에서 처리하기에 너무 커서 화면이 멈출 수 있기 때문입니다.';
const SLOW = '처리할 양이 많아 오래 걸리거나 화면이 멈출 수 있습니다.';

/** At pick time: the hard byte limit. */
export function checkFileBytes(bytes: number, device: Device): LimitCheck {
  const lim = LIMITS[device];
  if (bytes <= lim.hardBytes) return { level: 'ok' };
  return { level: 'hard', message: `${where(device)} ${mbText(lim.hardBytes)}까지 줄일 수 있습니다. ${MEMORY}` };
}

/** After inspection and on level change: the hard page limit (only "이미지로 변환" has one). */
export function checkPages(pages: number, raster: boolean, device: Device): LimitCheck {
  const lim = LIMITS[device];
  if (!raster || pages <= lim.rasterHardPages) return { level: 'ok' };
  return {
    level: 'hard',
    message: `이미지로 변환은 ${where(device)} ${pagesText(lim.rasterHardPages)}까지 할 수 있습니다. 쪽마다 큰 이미지를 만들어 ${MEMORY}`,
  };
}

/** Before a run: hard limits, then the soft limits that need a confirmation. */
export function checkRun(bytes: number, pages: number, raster: boolean, device: Device): LimitCheck {
  const hard = checkFileBytes(bytes, device);
  if (hard.level !== 'ok') return hard;
  const hardPages = checkPages(pages, raster, device);
  if (hardPages.level !== 'ok') return hardPages;
  const lim = LIMITS[device];
  if (raster && pages > lim.rasterSoftPages) {
    return { level: 'soft', message: `${josa(pagesText(lim.rasterSoftPages), '이/가')} 넘는 파일을 이미지로 바꾸면 ${SLOW} 계속 줄일까요?` };
  }
  if (bytes > lim.softBytes) {
    return { level: 'soft', message: `${josa(mbText(lim.softBytes), '이/가')} 넘는 파일은 ${SLOW} 계속 줄일까요?` };
  }
  if (pages > lim.softPages) {
    return { level: 'soft', message: `${josa(pagesText(lim.softPages), '이/가')} 넘는 파일은 ${SLOW} 계속 줄일까요?` };
  }
  return { level: 'ok' };
}
