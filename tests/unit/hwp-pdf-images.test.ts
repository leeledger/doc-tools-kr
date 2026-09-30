// Page images → PDF XObjects (SPIKE-HWP-DIRECT §6.3 "Images", §6.9). The canvas work is a spy.
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { ImageCache, filterLut, jpegInfo, type Recode } from '../../src/lib/hwp/pdf/images';

const jpeg = (w: number, h: number): Uint8Array => {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a6';
  ctx.fillRect(0, 0, w, h);
  return new Uint8Array(c.toBuffer('image/jpeg', 80));
};
const dataUrl = (b: Uint8Array, mime = 'image/jpeg'): string => `data:${mime};base64,${Buffer.from(b).toString('base64')}`;
/** A copy whose SOF says 4 components (CMYK). */
const asCmyk = (b: Uint8Array): Uint8Array => {
  const out = b.slice();
  for (let i = 2; i + 9 < out.length; ) {
    const mk = out[i + 1]!;
    if (mk >= 0xc0 && mk <= 0xc2) {
      out[i + 9] = 4;
      return out;
    }
    i += 2 + ((out[i + 2]! << 8) | out[i + 3]!);
  }
  throw new Error('no SOF');
};

describe('ImageCache', () => {
  it('a JPEG that needs nothing is embedded as is (no decode)', async () => {
    const doc = await PDFDocument.create();
    const recode = vi.fn<Recode>();
    const cache = new ImageCache(doc, recode);
    const src = jpeg(40, 30);
    const img = await cache.get(dataUrl(src), 40, 30, null);
    expect(img).toMatchObject({ width: 40, height: 30 });
    expect(recode).not.toHaveBeenCalled();
    expect(cache.stats).toMatchObject({ passthrough: 1, reencoded: 0 });
  });

  it('a CMYK JPEG always goes through the canvas', async () => {
    const doc = await PDFDocument.create();
    const rgb = jpeg(40, 30);
    const cmyk = asCmyk(rgb);
    expect(jpegInfo(cmyk)?.comps).toBe(4);
    const recode = vi.fn<Recode>(async () => ({ bytes: rgb, jpeg: true }));
    const cache = new ImageCache(doc, recode);
    expect(await cache.get(dataUrl(cmyk), 40, 30, null)).not.toBeNull();
    expect(recode).toHaveBeenCalledTimes(1);
    expect(cache.stats.reencoded).toBe(1);
  });

  it('two <image>s with the same href are one XObject; an undecodable one is null', async () => {
    const doc = await PDFDocument.create();
    const cache = new ImageCache(doc, async () => null);
    const url = dataUrl(jpeg(20, 20));
    const [a, b] = await Promise.all([cache.get(url, 20, 20, null), cache.get(url, 20, 20, null)]);
    expect(a!.ref).toBe(b!.ref);
    expect(cache.stats.images).toBe(1);
    expect(await cache.get(dataUrl(new Uint8Array([1, 2, 3]), 'image/png'), 20, 20, null)).toBeNull();
  });

  it('a filtered image goes through the canvas with per-channel lookup tables', async () => {
    const doc = await PDFDocument.create();
    const src = jpeg(20, 20);
    const recode = vi.fn<Recode>(async () => ({ bytes: src, jpeg: true }));
    const cache = new ImageCache(doc, recode);
    await cache.get(dataUrl(src), 20, 20, { id: 'f', slope: [1, 1, 1], intercept: [0.2, 0.2, 0.2] });
    expect(recode.mock.calls[0]![0].lut).toHaveLength(3);
  });
});

describe('filterLut (feFuncX linear in linearRGB)', () => {
  it('slope 1, intercept 0.2: sRGB 0 → 124, 128 → 173, 255 → 255 (±1)', () => {
    const lut = filterLut(1, 0.2);
    expect(Math.abs(lut[0]! - 124)).toBeLessThanOrEqual(1);
    expect(Math.abs(lut[128]! - 173)).toBeLessThanOrEqual(1);
    expect(lut[255]).toBe(255);
  });

  it('identity is the identity', () => {
    const lut = filterLut(1, 0);
    for (const v of [0, 1, 50, 128, 254, 255]) expect(lut[v]).toBe(v);
  });
});
