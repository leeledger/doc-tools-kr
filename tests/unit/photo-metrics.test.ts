// regress:photo metrics module (scripts/regress/photo-metrics.mjs).
import { describe, expect, it } from 'vitest';
import { blockiness, evalDims, psnr, ssim } from '../../scripts/regress/photo-metrics.mjs';

function image(w: number, h: number, px: (x: number, y: number) => number): ImageData {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = px(x, y);
      d.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return new ImageData(d, w, h);
}

const gradient = image(64, 48, (x, y) => (x * 3 + y * 2) % 256);
/** The gradient with a deterministic ±12 ripple. */
const rippled = image(64, 48, (x, y) => ((x * 3 + y * 2) % 256) + (((x * 7 + y * 13) % 5) - 2) * 6);

describe('photo metrics', () => {
  it('SSIM of an image with itself is 1; PSNR of identical images is 99', () => {
    expect(ssim(gradient, gradient)).toBeCloseTo(1, 6);
    expect(psnr(gradient, gradient)).toBe(99);
  });
  it('a known pair matches the checked-in vector (± 1e-6)', () => {
    expect(ssim(gradient, rippled)).toBeCloseTo(KNOWN.ssim, 6);
    expect(psnr(gradient, rippled)).toBeCloseTo(KNOWN.psnr, 6);
  });
  it('an 8×8 checker is blockier than a smooth gradient', () => {
    const checker = image(64, 64, (x, y) => ((Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 180 : 60));
    const smooth = image(64, 64, (x, y) => x * 2 + y);
    expect(blockiness(checker)).toBeGreaterThan(10);
    expect(blockiness(checker)).toBeGreaterThan(blockiness(smooth));
    expect(blockiness(smooth)).toBeCloseTo(1, 1);
  });
  it('evaluation size caps the long edge at 2048', () => {
    expect(evalDims(4000, 3000)).toEqual([2048, 1536]);
    expect(evalDims(1000, 800)).toEqual([1000, 800]);
  });
});

/** Computed once with this module (2026-09-29) and checked in; a change means the metric changed. */
const KNOWN = { ssim: 0.632680984, psnr: 29.607858582 };
