// TOOLS5 U0: shared ZIP (StoredZip + unique names), canvas caps (fitWithinCaps) and the page thumbnail size.
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { fitWithinCaps, fitsCaps } from '../../src/lib/image/caps';
import { thumbCssWidth } from '../../src/lib/pdf/inspect';
import { dedupeNames } from '../../src/lib/zip/names';
import { StoredZip } from '../../src/lib/zip/stored';

describe('StoredZip + dedupeNames', () => {
  it('a ZIP of names made unique first (case-insensitive) holds every entry as given', async () => {
    const names = dedupeNames(['IMG_0001.jpg', 'img_0001.JPG', 'IMG_0001.jpg']);
    expect(names).toEqual(['IMG_0001.jpg', 'img_0001_2.JPG', 'IMG_0001_3.jpg']);
    const zip = new StoredZip();
    const parts = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]), new Uint8Array([6])];
    names.forEach((n, i) => zip.add(n, parts[i]!));
    const files = unzipSync(new Uint8Array(await (await zip.finish()).arrayBuffer()));
    expect(Object.keys(files)).toEqual(names);
    expect(files['img_0001_2.JPG']).toEqual(parts[1]);
  });
});

describe('fitWithinCaps', () => {
  const phone = { maxArea: 16_000_000, maxEdge: 8_192 };

  it('fitsCaps: on the caps is inside, one pixel over is outside', () => {
    expect(fitsCaps(8_192, 1_953, phone)).toBe(true);
    expect(fitsCaps(8_193, 100, phone)).toBe(false);
    expect(fitsCaps(4_000, 4_000, phone)).toBe(true);
    expect(fitsCaps(4_001, 4_000, phone)).toBe(false);
  });

  it('the edge cap wins for a long strip, the area cap for a big square; never past a cap', () => {
    const strip = fitWithinCaps(20_000, 1_000, phone);
    expect(strip).toMatchObject({ width: 8_192, height: 409 });
    const square = fitWithinCaps(8_000, 6_000, phone);
    expect(square.width * square.height).toBeLessThanOrEqual(phone.maxArea);
    expect(square.width).toBe(4_618);
    for (const [w, h] of [[8_064, 6_048], [12_000, 9_000], [9_000, 100], [100, 9_000], [4_001, 4_001]] as const) {
      const f = fitWithinCaps(w, h, phone);
      expect(fitsCaps(f.width, f.height, phone)).toBe(true);
      expect(f.scale).toBeLessThan(1);
    }
  });
});

describe('thumbCssWidth', () => {
  it('without a height limit the page is maxW wide (PDF 합치기 thumbnails, unchanged)', () => {
    expect(thumbCssWidth(595.28, 841.89, 160)).toBe(160);
    expect(thumbCssWidth(841.89, 595.28, 160)).toBe(160);
  });

  it('with a height limit the long edge is at most the limit, aspect kept', () => {
    expect(thumbCssWidth(841.89, 595.28, 160, 160)).toBe(160);
    expect(thumbCssWidth(595.28, 841.89, 160, 160)).toBeCloseTo(113.13, 2);
    expect(thumbCssWidth(100, 100, 160, 160)).toBe(160);
  });
});
