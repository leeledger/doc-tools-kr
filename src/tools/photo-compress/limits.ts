// Limits of 사진 용량 줄이기 (brief Step 3 §3.4). Every message states the number and the reason.
import { MB, type Device } from '../../lib/ui/device';
import { josa } from '../../lib/ui/josa';

export interface PhotoLimits {
  /** Photos per run (hard; extra files are not added). */
  maxFiles: number;
  /** Bytes per file (hard, row error above). */
  maxFileBytes: number;
  /** Total bytes (soft, confirm above). */
  softTotalBytes: number;
  /** Pixels (soft, confirm above); null = none. */
  softPixels: number | null;
  /** Pixels (hard, row error above). */
  maxPixels: number;
  /** Long side in px (hard, row error above; the canvas maximum). */
  maxSide: number;
  /** Working long edge applied on decode; null = none. */
  workingLongEdge: number | null;
}

export const LIMITS: Record<Device, PhotoLimits> = {
  desktop: {
    maxFiles: 50,
    maxFileBytes: 100 * MB,
    softTotalBytes: 500 * MB,
    softPixels: 50_000_000,
    maxPixels: 150_000_000,
    maxSide: 32_767,
    workingLongEdge: null,
  },
  mobile: {
    maxFiles: 20,
    maxFileBytes: 50 * MB,
    softTotalBytes: 150 * MB,
    softPixels: null,
    maxPixels: 64_000_000,
    maxSide: 16_384,
    workingLongEdge: 4096,
  },
};

const n = (v: number): string => v.toLocaleString('ko-KR');
/** 150_000_000 → "1억 5,000만 화소(150 MP)". */
function megapixels(px: number): string {
  const man = px / 10_000;
  const eok = Math.floor(man / 10_000);
  const rest = man % 10_000;
  const kr = `${eok ? `${eok}억${rest ? ' ' : ''}` : ''}${rest ? `${n(rest)}만` : ''}`;
  return `${kr} 화소(${n(px / 1_000_000)} MP)`;
}

/** How many of `incoming` files fit next to `existing` rows; a message when some are left out. */
export function checkCount(existing: number, incoming: number, device: Device): { accept: number; message: string | null } {
  const max = LIMITS[device].maxFiles;
  const accept = Math.max(0, Math.min(incoming, max - existing));
  if (accept === incoming) return { accept, message: null };
  const where = device === 'mobile' ? '휴대폰에서는' : '이 기기에서는';
  return {
    accept,
    message: `${where} 한 번에 ${n(max)}장까지 줄일 수 있습니다. 나머지 ${n(incoming - accept)}장은 추가하지 않았으니 이번 작업을 마친 뒤 선택해 주세요.`,
  };
}

/** A per-file byte error, or null. */
export function checkFileBytes(bytes: number, device: Device): string | null {
  const max = LIMITS[device].maxFileBytes;
  if (bytes <= max) return null;
  return device === 'mobile'
    ? `휴대폰에서는 ${n(max / MB)} MB까지의 사진만 줄일 수 있습니다. 더 큰 사진은 휴대폰에서 처리하기에 너무 커서 화면이 멈출 수 있기 때문입니다.`
    : `${n(max / MB)} MB까지의 사진만 줄일 수 있습니다. 더 큰 사진은 이 기기에서 처리하기에 너무 커서 화면이 멈출 수 있기 때문입니다.`;
}

export type DimsCheck = { level: 'ok' } | { level: 'soft' | 'hard'; message: string };

/** Oriented or stored pixel size against the megapixel and side limits. */
export function checkDims(width: number, height: number, device: Device): DimsCheck {
  const l = LIMITS[device];
  const mobile = device === 'mobile';
  if (Math.max(width, height) > l.maxSide) {
    return {
      level: 'hard',
      message: `${mobile ? '휴대폰에서는 ' : ''}긴 변이 ${n(l.maxSide)}픽셀 이하인 사진만 줄일 수 있습니다. ${mobile ? '휴대폰' : '이 기기'}에서 한 번에 그릴 수 있는 가장 큰 크기이기 때문입니다.`,
    };
  }
  const px = width * height;
  if (px > l.maxPixels) {
    return {
      level: 'hard',
      message: `${mobile ? '휴대폰에서는 ' : ''}${megapixels(l.maxPixels)}까지 줄일 수 있습니다. 더 큰 사진은 처리하기에 너무 커서 화면이 멈출 수 있기 때문입니다.`,
    };
  }
  if (l.softPixels !== null && px > l.softPixels) {
    return {
      level: 'soft',
      message: `${josa(megapixels(l.softPixels), '이/가')} 넘는 사진이 있어 시간이 오래 걸리고 화면이 느려질 수 있습니다. 계속할까요?`,
    };
  }
  return { level: 'ok' };
}

/** The soft confirmation before a run: total bytes, then any soft-pixel row. Null = no question. */
export function checkRun(totalBytes: number, anySoftPixels: boolean, device: Device): string | null {
  const l = LIMITS[device];
  if (totalBytes > l.softTotalBytes) {
    return `사진 합계가 ${josa(`${n(l.softTotalBytes / MB)} MB`, '을/를')} 넘어 ${device === 'mobile' ? '휴대폰에서 한 번에 처리하기 어렵거나 ' : ''}시간이 오래 걸릴 수 있습니다. 계속할까요?`;
  }
  if (anySoftPixels && l.softPixels !== null) {
    return `${josa(megapixels(l.softPixels), '이/가')} 넘는 사진이 있어 시간이 오래 걸리고 화면이 느려질 수 있습니다. 계속할까요?`;
  }
  return null;
}
