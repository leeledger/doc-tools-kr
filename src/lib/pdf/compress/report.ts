// What a compression run reports to the UI. No file names, no passwords, no qpdf logs.
import type { SkipReason } from './images';
import type { LevelName } from './levels';

export type Phase = 'normalize' | 'images' | 'optimize' | 'verify';

export interface Progress {
  phase: Phase;
  done: number;
  total: number;
}

export interface CompressReport {
  level: LevelName | 'raster';
  inBytes: number;
  outBytes: number;
  keptOriginal: boolean;
  /** Why the original was kept: no worthwhile gain (normal levels) or the raster output was larger. */
  keptReason?: 'no-gain' | 'raster-larger';
  pages: number;
  imagesSeen: number;
  imagesReplaced: number;
  skipped: Partial<Record<SkipReason, number>>;
  /** Lowest gate SSIM among replaced images; null when none was replaced. */
  minImageSsim: number | null;
  /** Set when qpdf could not read the file and pdf-lib's linear parse repaired it first. */
  repairedBy?: 'pdf-lib';
  signed: boolean;
  ownerRestrictionRemoved: boolean;
  /** Milliseconds per phase. */
  ms: Partial<Record<Phase | 'raster', number>>;
}
