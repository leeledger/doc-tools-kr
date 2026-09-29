// Compression levels and constants (spike §3.2, brief Step 2 §3). Framework-free.
import { MB } from '../../ui/device';

export type LevelName = 'high' | 'recommended' | 'strong';

export interface Level {
  /** Images above this effective ppi are downsampled… */
  triggerPpi: number;
  /** …to this ppi (Lanczos3). */
  targetPpi: number;
  /** MozJPEG quality. */
  q: number;
  /** Minimum luma SSIM between the (resized) source and the decoded JPEG; one retry at q + 10. */
  minSsim: number;
  /** Images whose stream is smaller than this are left alone. */
  minBytes: number;
  /** Images with fewer pixels than this are left alone. */
  minPixels: number;
  /** A replacement must be at least this much smaller than the original stream. */
  minGain: number;
}

const COMMON = { minBytes: 6144, minPixels: 96 * 96, minGain: 0.1 } as const;

export const LEVELS: Record<LevelName, Level> = {
  high: { triggerPpi: 260, targetPpi: 200, q: 85, minSsim: 0.96, ...COMMON },
  recommended: { triggerPpi: 190, targetPpi: 150, q: 75, minSsim: 0.92, ...COMMON },
  strong: { triggerPpi: 130, targetPpi: 110, q: 55, minSsim: 0.85, ...COMMON },
};

/** "이미지로 변환": every page rendered at 150 dpi (long side capped) and stored as JPEG q70. */
export const RASTER = { dpi: 150, q: 70, maxLongPx: 3000 } as const;

/** Render scale (1 = 72 dpi) for a raster page of `ptW × ptH` points: 150 dpi, long side ≤ 3000 px. */
export function rasterScale(ptW: number, ptH: number, dpi: number = RASTER.dpi, maxLongPx: number = RASTER.maxLongPx): number {
  const long = Math.max(ptW, ptH);
  return long > 0 ? Math.min(dpi / 72, maxLongPx / long) : dpi / 72;
}

/** An output of at least 99 % of the input is not offered; the original is kept. */
export const KEEP_ORIGINAL_RATIO = 0.99;

/** Above this input size the final qpdf pass uses Flate level 6 instead of 9 (spike §3.4 hotspot). */
export const FLATE6_ABOVE = 30 * MB;
