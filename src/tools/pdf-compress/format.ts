import { baseName, formatMB, safeFileName } from '../../lib/ui/format';

/** Reduction in whole percent: floor(100 × (1 − out/in)), kept within 1–100 for a result we offer. */
export function reductionPercent(inBytes: number, outBytes: number): number {
  if (inBytes <= 0) return 1;
  return Math.min(100, Math.max(1, Math.floor(100 * (1 - outBytes / inBytes))));
}

/** "12.4 MB → 1.3 MB" */
export function sizeChange(inBytes: number, outBytes: number): string {
  return `${formatMB(inBytes)} → ${formatMB(outBytes)}`;
}

/** `{base}_압축.pdf`, or `{base}_이미지변환.pdf` for "이미지로 변환"; sanitized, at most 80 characters. */
export function compressedFileName(name: string, raster: boolean): string {
  return safeFileName(baseName(name), raster ? '_이미지변환.pdf' : '_압축.pdf');
}
