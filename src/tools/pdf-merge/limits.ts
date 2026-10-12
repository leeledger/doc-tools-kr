// Device limits for PDF 합치기. Basis: spike S7 (75 MB / 845쪽 took 6.5–10.8 s and about +351 MB of memory on desktop).
import { MB, type Device } from '../../lib/ui/device';

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

/** The limit messages of one language (the tool catalog's `limits` entry, EN0); sizes in bytes. */
export interface LimitCopy {
  /** More than `max` files: `over` of them were not added. */
  tooMany: (max: number, over: number) => string;
  /** The total passed the hard limit: some files were not added. */
  tooBig: (hardBytes: number, device: Device) => string;
  softBytes: (softBytes: number) => string;
  softPages: (softPages: number) => string;
}

/** Checks whether `fileCount` more files may be added to a list that already has `current` files. */
export function checkFileCount(current: number, adding: number, copy: LimitCopy): LimitCheck {
  if (current + adding <= MAX_FILES) return { level: 'ok' };
  return { level: 'hard', message: copy.tooMany(MAX_FILES, current + adding - MAX_FILES) };
}

/** Checks a total size before adding (hard limit only). */
export function checkAddBytes(totalBytes: number, device: Device, copy: LimitCopy): LimitCheck {
  const lim = LIMITS[device];
  if (totalBytes <= lim.hardBytes) return { level: 'ok' };
  return { level: 'hard', message: copy.tooBig(lim.hardBytes, device) };
}

/** Checks the whole job before merging. */
export function checkMerge(totalBytes: number, totalPages: number, device: Device, copy: LimitCopy): LimitCheck {
  const lim = LIMITS[device];
  if (totalBytes > lim.hardBytes) return checkAddBytes(totalBytes, device, copy);
  if (totalBytes > lim.softBytes) return { level: 'soft', message: copy.softBytes(lim.softBytes) };
  if (totalPages > lim.softPages) return { level: 'soft', message: copy.softPages(lim.softPages) };
  return { level: 'ok' };
}
