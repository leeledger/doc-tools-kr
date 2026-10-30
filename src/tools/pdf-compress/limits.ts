// Device limits for PDF 용량 줄이기. Basis: spike §3.4 (40.7 MB → +709 MB peak memory; 74 MB → +1.5 GB).
// Byte limits are checked when the file is picked; page limits after inspection and when the level changes.
import { MB, type Device } from '../../lib/ui/device';
import { LIMITS as SPLIT_LIMITS } from '../pdf-split/limits';

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

/** `split`: over the hard byte limit, but PDF 나누기 opens the file on this device (FAIL1030 B). */
export type LimitCheck = { level: 'ok' } | { level: 'soft' | 'hard'; message: string; split?: boolean };

/** The limit messages of one language (the tool catalog's `limits` entry, EN0); sizes in bytes. */
export interface LimitCopy {
  /** The file is over the hard byte limit. */
  fileBytes: (hardBytes: number, device: Device) => string;
  /** "이미지로 변환" on more pages than its hard limit. */
  rasterPages: (hardPages: number, device: Device) => string;
  /** Confirmations: "이미지로 변환" pages, bytes, pages. */
  softRaster: (pages: number) => string;
  softBytes: (bytes: number) => string;
  softPages: (pages: number) => string;
  /**
   * FAIL1030 B: the next step for a file over the hard byte limit that PDF 나누기 can open; absent where that page has
   * no twin (English).
   */
  split?: { fileBytes: (hardBytes: number, device: Device) => string; button: string };
}

/** At pick time: the hard byte limit; a file PDF 나누기 can still open gets that next step (copy.split). */
export function checkFileBytes(bytes: number, device: Device, copy: LimitCopy): LimitCheck {
  const lim = LIMITS[device];
  if (bytes <= lim.hardBytes) return { level: 'ok' };
  if (copy.split && bytes <= SPLIT_LIMITS[device].maxFileBytes) return { level: 'hard', message: copy.split.fileBytes(lim.hardBytes, device), split: true };
  return { level: 'hard', message: copy.fileBytes(lim.hardBytes, device) };
}

/** After inspection and on level change: the hard page limit (only "이미지로 변환" has one). */
export function checkPages(pages: number, raster: boolean, device: Device, copy: LimitCopy): LimitCheck {
  const lim = LIMITS[device];
  if (!raster || pages <= lim.rasterHardPages) return { level: 'ok' };
  return { level: 'hard', message: copy.rasterPages(lim.rasterHardPages, device) };
}

/** Before a run: hard limits, then the soft limits that need a confirmation. */
export function checkRun(bytes: number, pages: number, raster: boolean, device: Device, copy: LimitCopy): LimitCheck {
  const hard = checkFileBytes(bytes, device, copy);
  if (hard.level !== 'ok') return hard;
  const hardPages = checkPages(pages, raster, device, copy);
  if (hardPages.level !== 'ok') return hardPages;
  const lim = LIMITS[device];
  if (raster && pages > lim.rasterSoftPages) return { level: 'soft', message: copy.softRaster(lim.rasterSoftPages) };
  if (bytes > lim.softBytes) return { level: 'soft', message: copy.softBytes(lim.softBytes) };
  if (pages > lim.softPages) return { level: 'soft', message: copy.softPages(lim.softPages) };
  return { level: 'ok' };
}
