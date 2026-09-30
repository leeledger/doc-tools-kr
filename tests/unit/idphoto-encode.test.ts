// 여권·증명사진 encoder (brief Step 4 Test map, "encode worker"): real MozJPEG in Node on portrait_pd.jpg.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRESETS, customPreset, type IdPreset } from '../../src/data/id-photo-presets';
import { readJfif } from '../../src/lib/image/jfif';
import { sniffImage } from '../../src/lib/image/sniff';
import { EncodeError, encodeIdPhoto, jpegMarkers, verifyOutput, type EncodeDeps, type EncodeSpec } from '../../src/lib/idphoto/encode';
import { EngineLoadError } from '../../src/lib/ui/engine-load';
import { nodeCodecs } from '../helpers/photo-deps';

const PORTRAIT = join(__dirname, '..', 'fixtures', 'photo', 'portrait_pd.jpg');

const spec = (p: IdPreset): EncodeSpec => ({ outW: p.outW, outH: p.outH, ...(p.limitBytes !== undefined ? { limitBytes: p.limitBytes } : {}), dpi: p.dpi });

/** The largest centred crop of the preset's aspect, resized (lanczos3) to the output size. */
async function outputPixels(p: { outW: number; outH: number }): Promise<ImageData> {
  const c = await nodeCodecs();
  const src = await c.decodeJpeg(new Uint8Array(readFileSync(PORTRAIT)));
  const aspect = p.outW / p.outH;
  const cw = Math.min(src.width, Math.round(src.height * aspect));
  const ch = Math.min(src.height, Math.round(cw / aspect));
  const x0 = Math.floor((src.width - cw) / 2);
  const y0 = Math.floor((src.height - ch) / 2);
  const crop = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) crop.set(src.data.subarray(((y0 + y) * src.width + x0) * 4, ((y0 + y) * src.width + x0 + cw) * 4), y * cw * 4);
  return c.resize(new ImageData(crop, cw, ch), p.outW, p.outH);
}

async function realDeps(): Promise<EncodeDeps<ImageData>> {
  const c = await nodeCodecs();
  return {
    mozjpeg: (img, q) => c.mozjpeg(img, q),
    canvas: () => Promise.reject(new Error('canvas not used')),
  };
}

describe('encodeIdPhoto with real MozJPEG', () => {
  it.each(PRESETS.map((p) => [p.id, p] as const))('%s: exact px, ≤ limit, JFIF dpi, SOF0, no APP1', async (_id, p) => {
    const r = await encodeIdPhoto(await outputPixels(p), spec(p), await realDeps());
    const s = sniffImage(r.bytes);
    expect([s.width, s.height]).toEqual([p.outW, p.outH]);
    if (p.limitBytes !== undefined) expect(r.bytes.length).toBeLessThanOrEqual(p.limitBytes);
    expect(readJfif(r.bytes)).toEqual({ units: 1, x: p.dpi, y: p.dpi });
    const markers = jpegMarkers(r.bytes);
    expect(markers.find((m) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)).toBe(0xc0);
    expect(markers).not.toContain(0xe1);
    expect(s.progressive).toBe(false);
    expect(r.fallback).toBe(false);
    expect(verifyOutput(r.bytes, spec(p))).toEqual([]);
    // Nothing after EOI.
    expect([r.bytes.at(-2), r.bytes.at(-1)]).toEqual([0xff, 0xd9]);
  });

  it('takes the largest integer q that fits (never downscales)', async () => {
    const p = { ...customPreset(413, 531, 40)! };
    const img = await outputPixels(p);
    const r = await encodeIdPhoto(img, spec(p), await realDeps());
    expect(r.bytes.length).toBeLessThanOrEqual(40_000);
    expect(r.q).toBeGreaterThanOrEqual(50);
    expect(r.q).toBeLessThan(95);
    const c = await nodeCodecs();
    const next = await c.mozjpeg(img, r.q + 1);
    expect(next.length + (readJfif(next) ? 0 : 18)).toBeGreaterThan(40_000);
  });

  it('a custom limit that cannot be reached is `unreachable`', async () => {
    const p = customPreset(2000, 2000, 10)!;
    const img = await outputPixels(p);
    await expect(encodeIdPhoto(img, spec(p), await realDeps())).rejects.toMatchObject({ code: 'unreachable' });
  });
});

describe('encodeIdPhoto guards', () => {
  const p = PRESETS[0]!;
  const small = { outW: 64, outH: 80, limitBytes: 500_000, dpi: 300 };

  it('discards a lying encoder (wrong size, progressive, APP1, over the limit)', async () => {
    const c = await nodeCodecs();
    const img = new ImageData(new Uint8ClampedArray(64 * 80 * 4).fill(180), 64, 80);
    const wrongSize = new ImageData(new Uint8ClampedArray(60 * 80 * 4).fill(180), 60, 80);
    const liars: [string, EncodeDeps['mozjpeg']][] = [
      ['size', () => c.mozjpeg(wrongSize, 80)],
      ['progressive', (i, q) => c.mozjpeg(i as ImageData, q, { progressive: true })],
      [
        'app1',
        async (i, q) => {
          const b = await c.mozjpeg(i as ImageData, q);
          const app1 = new Uint8Array([0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
          const outB = new Uint8Array(b.length + app1.length);
          outB.set(b.subarray(0, 2));
          outB.set(app1, 2);
          outB.set(b.subarray(2), 2 + app1.length);
          return outB;
        },
      ],
      ['not-jpeg', async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])],
    ];
    for (const [name, mozjpeg] of liars) {
      const err = await encodeIdPhoto(img, small, { mozjpeg, canvas: () => Promise.reject(new Error('no')) }).catch((e: unknown) => e);
      expect(err, name).toBeInstanceOf(EncodeError);
      expect((err as EncodeError).code, name).toBe('verify');
    }
    // An encoder that always ignores the limit: nothing fits, so nothing is handed out.
    const huge = async () => {
      const b = await c.mozjpeg(img, 90);
      const outB = new Uint8Array(600_000);
      outB.set(b.subarray(0, b.length - 2));
      outB.set([0xff, 0xd9], b.length - 2);
      return outB;
    };
    await expect(encodeIdPhoto(img, small, { mozjpeg: huge, canvas: () => Promise.reject(new Error('no')) })).rejects.toMatchObject({ code: 'unreachable' });
  });

  it('pixels of the wrong size are refused', async () => {
    const img = new ImageData(new Uint8ClampedArray(10 * 10 * 4), 10, 10);
    await expect(encodeIdPhoto(img, spec(p), await realDeps())).rejects.toMatchObject({ code: 'verify' });
  });

  it('falls back to the canvas encoder when MozJPEG cannot load, with the same verify', async () => {
    const c = await nodeCodecs();
    const img = new ImageData(new Uint8ClampedArray(64 * 80 * 4).fill(150), 64, 80);
    const qs: number[] = [];
    const r = await encodeIdPhoto(img, small, {
      mozjpeg: () => Promise.reject(new EngineLoadError('wasm did not load')),
      // The "canvas" is MozJPEG at the same quality (Node has no canvas).
      canvas: (i, q) => {
        qs.push(q);
        return c.mozjpeg(i as ImageData, Math.round(q * 100));
      },
    });
    expect(r.fallback).toBe(true);
    expect(qs[0]).toBeCloseTo(0.95, 9);
    expect(verifyOutput(r.bytes, small)).toEqual([]);
    // A canvas that cannot run either is an engine failure.
    await expect(
      encodeIdPhoto(img, small, { mozjpeg: () => Promise.reject(new EngineLoadError('x')), canvas: () => Promise.reject(new ReferenceError('OffscreenCanvas is not defined')) }),
    ).rejects.toMatchObject({ code: 'engine' });
  });

  it('a MozJPEG error that is not a load failure is not masked by the fallback', async () => {
    const img = new ImageData(new Uint8ClampedArray(64 * 80 * 4), 64, 80);
    await expect(encodeIdPhoto(img, small, { mozjpeg: () => Promise.reject(new Error('boom')), canvas: () => Promise.reject(new Error('no')) })).rejects.toMatchObject({
      code: 'verify',
    });
  });
});
