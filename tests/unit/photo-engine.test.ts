// 사진 용량 줄이기: the size search (fit.ts) and the engine (kept rule, flatten, modes, fallbacks, post-checks),
// with fake encoders, plus one run with the real Node codecs on portrait_pd.jpg.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compressPhoto, targetBytes, type PhotoDeps, type PhotoOptions } from '../../src/lib/image/engine';
import { MIN_LONG_EDGE, Q_FLOOR, downscaleFactor, finalSearch, fitToTarget, type ProbeSession } from '../../src/lib/image/fit';
import { PhotoError, photoErrorCode } from '../../src/lib/image/messages';
import { sniffImage, type Sniff } from '../../src/lib/image/sniff';
import { exifApp1, insertSegments } from '../helpers/image-writers';
import { nodePhotoDeps } from '../helpers/photo-deps';

const PHOTO = join(__dirname, '..', 'fixtures', 'photo');

/** Fake encoded size: area × (0.05 + 2 q²) bytes. */
const model = (w: number, h: number, q: number): number => Math.round(w * h * (0.05 + 2 * q * q));
const probeOf =
  (log: { w: number; h: number; q: number }[] = []) =>
  async (w: number, h: number): Promise<ProbeSession> => ({
    encode: async (q) => {
      log.push({ w, h, q });
      return new Uint8Array(model(w, h, q));
    },
    release: () => undefined,
  });

describe('fitToTarget', () => {
  it('always fits the target, and never goes below the q floor above the minimum edge', async () => {
    for (const target of [2_000_000, 500_000, 200_000, 50_000, 5_000]) {
      const log: { w: number; h: number; q: number }[] = [];
      const r = await fitToTarget({ width: 1600, height: 1200 }, target, { probe: probeOf(log) });
      expect(r, String(target)).not.toBeNull();
      expect(r!.bytes.length).toBeLessThanOrEqual(target);
      if (Math.max(r!.w, r!.h) > MIN_LONG_EDGE) expect(r!.q).toBeGreaterThanOrEqual(Q_FLOOR);
    }
  });
  it('keeps full resolution when the floor fits, and takes qMax when it fits', async () => {
    const r = await fitToTarget({ width: 100, height: 100 }, 10_000_000, { probe: probeOf() });
    expect(r).toMatchObject({ q: 0.92, w: 100, h: 100, scale: 1, rounds: 1 });
    const mid = await fitToTarget({ width: 1000, height: 1000 }, model(1000, 1000, 0.7), { probe: probeOf() });
    expect(mid).toMatchObject({ w: 1000, scale: 1, q: 0.7 });
  });
  it('downscales by min(0.9, √(target/lowSize)·0.97)', async () => {
    const log: { w: number; h: number; q: number }[] = [];
    const target = 100_000;
    await fitToTarget({ width: 2000, height: 1000 }, target, { probe: probeOf(log) });
    const second = log.find((e) => e.w !== 2000)!;
    const low = model(2000, 1000, Q_FLOOR);
    expect(second.w).toBe(Math.round(2000 * downscaleFactor(target, low)));
    expect(downscaleFactor(100, 100)).toBe(0.9);
    expect(downscaleFactor(25, 100)).toBeCloseTo(0.485, 6);
  });
  it('at the minimum edge it searches below the floor; an impossible target gives null', async () => {
    const tiny = model(64, 48, 0.2);
    const r = await fitToTarget({ width: 1600, height: 1200 }, tiny, { probe: probeOf() });
    expect(r).not.toBeNull();
    expect(Math.max(r!.w, r!.h)).toBe(64);
    expect(r!.q).toBeLessThan(Q_FLOOR);
    expect(r!.bytes.length).toBeLessThanOrEqual(tiny);
    expect(await fitToTarget({ width: 1600, height: 1200 }, 10, { probe: probeOf() })).toBeNull();
  });
  it('allowDownscale false returns null instead of scaling (Step 4)', async () => {
    const r = await fitToTarget({ width: 1600, height: 1200 }, 50_000, { probe: probeOf(), allowDownscale: false });
    expect(r).toBeNull();
    const ok = await fitToTarget({ width: 413, height: 531 }, 500_000, { probe: probeOf(), allowDownscale: false });
    expect(ok).toMatchObject({ w: 413, h: 531, scale: 1 });
  });
});

describe('finalSearch', () => {
  const enc = async (_p: null, q: number): Promise<Uint8Array> => new Uint8Array(q * 1000);
  it('picks the largest integer q that fits', async () => {
    expect(await finalSearch(null, 57_500, { encode: enc, lo: 50, hi: 95 })).toMatchObject({ q: 57 });
    expect(await finalSearch(null, 95_000, { encode: enc, lo: 50, hi: 95 })).toMatchObject({ q: 95, tries: 1 });
    expect(await finalSearch(null, 50_000, { encode: enc, lo: 50, hi: 95 })).toMatchObject({ q: 50 });
    expect(await finalSearch(null, 57_500, { encode: enc, lo: 50, hi: 95, lowFirst: true })).toMatchObject({ q: 57 });
    expect(await finalSearch(null, 49_999, { encode: enc, lo: 50, hi: 95, lowFirst: true })).toBeNull();
  });
  it('returns null when even lo is too big, or the range is empty', async () => {
    expect(await finalSearch(null, 49_999, { encode: enc, lo: 50, hi: 95 })).toBeNull();
    expect(await finalSearch(null, 1e9, { encode: enc, lo: 60, hi: 55 })).toBeNull();
  });
});

// ---------- engine with fakes ----------

interface Src {
  w: number;
  h: number;
  transparent: boolean;
}
interface Cv {
  w: number;
  h: number;
  flatten: boolean;
  transparent: boolean;
}

const JPEG_SNIFF = (over: Partial<Sniff> = {}): Sniff => ({
  format: 'jpeg',
  width: 2000,
  height: 1500,
  hasGps: true,
  hasExif: true,
  hasXmp: false,
  cmyk: false,
  progressive: false,
  animated: false,
  alphaPossible: false,
  truncated: false,
  ...over,
});

interface Calls {
  decode: number;
  canvas: number[];
  moz: number[];
  webp: number[];
  flattened: boolean[];
}

function fakeDeps(opts: { transparent?: boolean; mozjpeg?: 'ok' | 'throw' | 'huge'; score?: (width: number) => number; measure?: (w: number, h: number) => { width: number; height: number }; canvasJpeg?: PhotoDeps<Src, Cv>['canvasJpeg'] } = {}): { deps: PhotoDeps<Src, Cv>; calls: Calls } {
  const calls: Calls = { decode: 0, canvas: [], moz: [], webp: [], flattened: [] };
  const widths = new WeakMap<Uint8Array, [number, number]>();
  let lastW = 0;
  let lastH = 0;
  const px = (w: number, h: number, transparent: boolean): ImageData => {
    const d = new ImageData(w, h);
    d.data.fill(255);
    if (transparent) d.data[3] = 0;
    return d;
  };
  const deps: PhotoDeps<Src, Cv> = {
    async decode(_b, s) {
      calls.decode++;
      const w = s.orientation && s.orientation >= 5 ? s.height! : s.width!;
      const h = s.orientation && s.orientation >= 5 ? s.width! : s.height!;
      const src: Src = { w, h, transparent: opts.transparent ?? false };
      return { src, width: w, height: h, sourceWidth: w, sourceHeight: h, capped: false, close: () => undefined };
    },
    toCanvas: (src, w, h, o) => {
      calls.flattened.push(o.flatten);
      return { w, h, flatten: o.flatten, transparent: src.transparent && !o.flatten };
    },
    // Real width and height, a small pixel buffer (only the alpha scan reads it).
    pixels: (c) => ({ data: px(8, 8, c.transparent).data, width: c.w, height: c.h, colorSpace: 'srgb' }) as ImageData,
    release: () => undefined,
    canvasJpeg:
      opts.canvasJpeg ??
      (async (c, q) => {
        calls.canvas.push(q);
        lastW = c.w;
        lastH = c.h;
        return new Uint8Array(model(c.w, c.h, q));
      }),
    // The size of the bytes given when a fake encoder recorded it, else of the last encode.
    measure: async (bytes) => {
      const [w, h] = widths.get(bytes) ?? [lastW, lastH];
      return opts.measure ? opts.measure(w, h) : { width: w, height: h };
    },
    async mozjpeg(img, q) {
      calls.moz.push(q);
      if (opts.mozjpeg === 'throw') throw new Error('wasm 404');
      lastW = img.width;
      lastH = img.height;
      const out = new Uint8Array(opts.mozjpeg === 'huge' ? 1e9 : Math.round(model(img.width, img.height, q / 100) * 0.9));
      widths.set(out, [img.width, img.height]);
      return out;
    },
    ...(opts.score ? { quickScore: async (_src: Src, bytes: Uint8Array) => opts.score!(widths.get(bytes)![0]) } : {}),
    async resize(_img, w, h) {
      lastW = w;
      lastH = h;
      return new ImageData(w, h);
    },
    async webp(img, q) {
      calls.webp.push(q);
      lastW = img.width;
      lastH = img.height;
      return new Uint8Array(Math.round(model(img.width, img.height, q / 100) * 0.8));
    },
  };
  return { deps, calls };
}

const input = (size: number, sniff: Sniff): { bytes: Uint8Array; sniff: Sniff } => ({ bytes: new Uint8Array(size), sniff });
const T = (kb: number, over: Partial<PhotoOptions> = {}): PhotoOptions => ({ mode: 'target', targetBytes: kb * 1000, format: 'jpeg', fast: false, ...over });

describe('compressPhoto: kept rule', () => {
  it('target mode: an upright JPEG within the target with nothing to remove is kept as it is, not decoded', async () => {
    const jpeg = new Uint8Array(readFileSync(join(PHOTO, 'portrait_pd.jpg')));
    const { deps, calls } = fakeDeps();
    const r = await compressPhoto({ bytes: jpeg, sniff: sniffImage(jpeg) }, T(500), deps);
    expect(calls.decode).toBe(0);
    expect(r.bytes).toBeNull();
    expect(r.report).toMatchObject({ encoder: 'original', kept: true, outBytes: jpeg.length });
  });
  it('target mode: an upright JPEG within the target with EXIF/GPS is stripped losslessly, not decoded', async () => {
    const plain = new Uint8Array(readFileSync(join(PHOTO, 'portrait_pd.jpg')));
    const jpeg = insertSegments(plain, [exifApp1({ orientation: 1, gps: { lat: 37, lon: 127 } })]);
    const { deps, calls } = fakeDeps();
    const r = await compressPhoto({ bytes: jpeg, sniff: sniffImage(jpeg) }, T(500), deps);
    expect(calls.decode).toBe(0);
    expect(r.report).toMatchObject({ encoder: 'stripped', outW: 1400, outH: 1750, kept: false, resaved: false, gpsRemoved: true });
    expect(r.bytes!.length).toBe(plain.length);
  });
  it('target mode: within the target but rotated (EXIF 6), CMYK, or over the max long edge → the pipeline runs', async () => {
    for (const [sniff, extra] of [
      [JPEG_SNIFF({ orientation: 6 }), {}],
      [JPEG_SNIFF({ cmyk: true }), {}],
      [JPEG_SNIFF(), { maxLongEdge: 800 }],
    ] as const) {
      const { deps, calls } = fakeDeps();
      const r = await compressPhoto(input(100_000, sniff), T(500, extra), deps);
      expect(calls.decode).toBe(1);
      expect(r.report.encoder).not.toBe('stripped');
      // Re-saved to drop EXIF/GPS or apply the orientation: noted, and never above the target.
      expect(r.report.resaved).toBe(true);
      expect(r.bytes!.length).toBeLessThanOrEqual(500_000);
    }
  });
  it('target mode: a CMYK JPEG within the target without metadata is converted, not flagged as a privacy re-save', async () => {
    const { deps } = fakeDeps();
    const cmyk = JPEG_SNIFF({ cmyk: true, hasGps: false, hasExif: false, width: 100, height: 100 });
    const r = await compressPhoto(input(1000, cmyk), T(500), deps);
    expect(r.report).toMatchObject({ resaved: false, kept: false, cmykConverted: true });
    expect(r.bytes!.length).toBeLessThanOrEqual(500_000);
  });
  it('target mode: a PNG within the target without metadata is re-encoded without the re-saved note', async () => {
    const { deps } = fakeDeps();
    const png = JPEG_SNIFF({ format: 'png', hasGps: false, hasExif: false, width: 100, height: 100 });
    const r = await compressPhoto(input(1000, png), T(500), deps);
    expect(r.report).toMatchObject({ resaved: false, kept: false });
  });
  it('quality mode: a result ≥ 99 % of the input returns the stripped original for an upright JPEG with EXIF', async () => {
    const plain = new Uint8Array(readFileSync(join(PHOTO, 'portrait_pd.jpg')));
    const jpeg = insertSegments(plain, [exifApp1({ orientation: 1, gps: { lat: 37, lon: 127 } })]);
    const { deps } = fakeDeps();
    const r = await compressPhoto({ bytes: jpeg, sniff: sniffImage(jpeg) }, { mode: 'quality', quality: 95, format: 'jpeg', fast: false }, deps);
    expect(r.report).toMatchObject({ encoder: 'stripped', kept: false });
    expect(r.bytes!.length).toBe(plain.length);
  });
  it('quality mode: an upright JPEG with nothing to remove and no gain is kept ("원본을 그대로 쓰세요")', async () => {
    const plain = new Uint8Array(readFileSync(join(PHOTO, 'portrait_pd.jpg')));
    const r = await compressPhoto({ bytes: plain, sniff: sniffImage(plain) }, { mode: 'quality', quality: 95, format: 'jpeg', fast: false }, fakeDeps().deps);
    expect(r.bytes).toBeNull();
    expect(r.report.kept).toBe(true);
  });
  it('quality mode, privacy first: no gain but EXIF/GPS or a rotation → the re-encoded file is offered with the note', async () => {
    for (const sniff of [
      JPEG_SNIFF({ orientation: 6, width: 100, height: 100 }),
      JPEG_SNIFF({ format: 'png', hasExif: true, hasGps: true, width: 100, height: 100 }),
    ]) {
      const r = await compressPhoto(input(1000, sniff), { mode: 'quality', quality: 90, format: 'jpeg', fast: false }, fakeDeps().deps);
      expect(r.bytes).not.toBeNull();
      expect(r.report).toMatchObject({ kept: false, resaved: true });
    }
  });
  it('quality mode: a PNG whose result is not smaller is kept (no download)', async () => {
    const { deps } = fakeDeps();
    const png = JPEG_SNIFF({ format: 'png', hasGps: false, hasExif: false, width: 100, height: 100 });
    const r = await compressPhoto(input(1000, png), { mode: 'quality', quality: 90, format: 'jpeg', fast: false }, deps);
    expect(r.bytes).toBeNull();
    expect(r.report.kept).toBe(true);
  });
  it('percent mode never keeps (the target is below the input)', async () => {
    const { deps } = fakeDeps();
    const r = await compressPhoto(input(3_000_000, JPEG_SNIFF()), { mode: 'percent', percent: 90, format: 'jpeg', fast: false }, deps);
    expect(r.report.kept).toBe(false);
    expect(r.bytes!.length).toBeLessThanOrEqual(2_700_000);
  });
});

describe('compressPhoto: targets, modes and encoders', () => {
  it('percent target = floor(in × p / 100); KB targets are × 1000', () => {
    expect(targetBytes({ mode: 'percent', percent: 50, format: 'jpeg', fast: false }, 1001)).toBe(500);
    expect(targetBytes({ mode: 'percent', percent: 10, format: 'jpeg', fast: false }, 99)).toBe(9);
    expect(targetBytes(T(200), 1)).toBe(200_000);
    expect(targetBytes({ mode: 'quality', quality: 80, format: 'jpeg', fast: false }, 1)).toBeNull();
  });
  it('target mode: MozJPEG final within [max(50, qc − 5), min(95, qc + 20)], output ≤ target', async () => {
    const { deps, calls } = fakeDeps();
    const r = await compressPhoto(input(3_000_000, JPEG_SNIFF()), T(500), deps);
    expect(r.report.encoder).toBe('mozjpeg');
    expect(r.bytes!.length).toBeLessThanOrEqual(500_000);
    const qc = Math.round(calls.canvas.at(-1)! * 100);
    expect(calls.moz.length).toBeGreaterThan(0);
    for (const q of calls.moz) {
      expect(q).toBeGreaterThanOrEqual(Math.max(50, qc - 5));
      expect(q).toBeLessThanOrEqual(Math.min(95, qc + 20));
    }
    expect(r.report.q).toBeGreaterThanOrEqual(50);
    expect(r.report).toMatchObject({ gpsRemoved: true, exifRemoved: true, mozjpegFallback: false });
  });
  it('fast mode: the canvas probe result is final (no MozJPEG)', async () => {
    const { deps, calls } = fakeDeps();
    const r = await compressPhoto(input(3_000_000, JPEG_SNIFF()), T(200, { fast: true }), deps);
    expect(calls.moz).toEqual([]);
    expect(r.report.encoder).toBe('canvas');
    expect(r.bytes!.length).toBeLessThanOrEqual(200_000);
  });
  it('quality mode: one MozJPEG encode at q, at the max-long-edge size', async () => {
    const { deps, calls } = fakeDeps();
    const r = await compressPhoto(input(30_000_000, JPEG_SNIFF()), { mode: 'quality', quality: 80, maxLongEdge: 800, format: 'jpeg', fast: false }, deps);
    expect(calls.moz).toEqual([80]);
    expect(calls.canvas).toEqual([]);
    expect(r.report).toMatchObject({ encoder: 'mozjpeg', q: 80, outW: 800, outH: 600, scaled: false });
  });
  it('quality mode in fast mode: one canvas encode at q/100', async () => {
    const { deps, calls } = fakeDeps();
    await compressPhoto(input(30_000_000, JPEG_SNIFF()), { mode: 'quality', quality: 70, format: 'jpeg', fast: true }, deps);
    expect(calls.canvas).toEqual([0.7]);
  });
  it('MozJPEG failing (wasm 404) falls back to the canvas result with the note', async () => {
    const { deps } = fakeDeps({ mozjpeg: 'throw' });
    const r = await compressPhoto(input(3_000_000, JPEG_SNIFF()), T(200), deps);
    expect(r.report).toMatchObject({ encoder: 'canvas', mozjpegFallback: true });
    expect(r.bytes!.length).toBeLessThanOrEqual(200_000);
    const q = await compressPhoto(input(30_000_000, JPEG_SNIFF()), { mode: 'quality', quality: 80, format: 'jpeg', fast: false }, fakeDeps({ mozjpeg: 'throw' }).deps);
    expect(q.report).toMatchObject({ encoder: 'canvas', mozjpegFallback: true, q: 0.8 });
  });
  it('scale re-search: when the canvas probe downscales but MozJPEG fits the full size at q ≥ 50, the full size wins', async () => {
    const { deps } = fakeDeps();
    // Canvas at q 0.50: 2000×1500 × 0.55 = 1.65 MB; MozJPEG q50 is 0.9 × that = 1.485 MB.
    const r = await compressPhoto(input(30_000_000, JPEG_SNIFF()), { mode: 'target', targetBytes: 1_600_000, format: 'jpeg', fast: false }, deps);
    expect(r.report).toMatchObject({ encoder: 'mozjpeg', outW: 2000, outH: 1500, scaled: false });
    expect(r.report.q).toBeGreaterThanOrEqual(50);
    expect(r.bytes!.length).toBeLessThanOrEqual(1_600_000);
    // Fast mode keeps the canvas decision.
    const f = await compressPhoto(input(30_000_000, JPEG_SNIFF()), { mode: 'target', targetBytes: 1_600_000, format: 'jpeg', fast: true }, fakeDeps().deps);
    expect(f.report.scaled).toBe(true);
  });
  describe('scale re-search scoring (full size vs downscaled, SSIM at 1024 px)', () => {
    const run = (score: (width: number) => number) =>
      compressPhoto(input(30_000_000, JPEG_SNIFF()), { mode: 'target', targetBytes: 1_600_000, format: 'jpeg', fast: false }, fakeDeps({ score }).deps);
    it('keeps the downscaled result when it scores higher by more than 0.002', async () => {
      const r = await run((w) => (w === 2000 ? 0.9 : 0.91));
      expect(r.report.outW).toBeLessThan(2000);
      expect(r.report.scaled).toBe(true);
      expect(r.bytes!.length).toBeLessThanOrEqual(1_600_000);
    });
    it('takes the full size on a tie within 0.002', async () => {
      const r = await run((w) => (w === 2000 ? 0.9 : 0.9019));
      expect(r.report).toMatchObject({ outW: 2000, outH: 1500, scaled: false });
    });
    it('a failing scorer keeps the full-size MozJPEG result, with no fast-method note', async () => {
      const { deps } = fakeDeps({ score: () => 0 });
      deps.quickScore = async () => {
        throw new Error('createImageBitmap failed');
      };
      const r = await compressPhoto(input(30_000_000, JPEG_SNIFF()), { mode: 'target', targetBytes: 1_600_000, format: 'jpeg', fast: false }, deps);
      expect(r.report).toMatchObject({ encoder: 'mozjpeg', outW: 2000, scaled: false, mozjpegFallback: false });
    });
    it('takes the full size when it scores higher', async () => {
      const r = await run((w) => (w === 2000 ? 0.95 : 0.9));
      expect(r.report).toMatchObject({ outW: 2000, scaled: false });
    });
  });
  it('re-search score with the real codecs: a JPEG scores higher against its own source than a heavily downscaled one', async () => {
    const deps = await nodePhotoDeps();
    const bytes = new Uint8Array(readFileSync(join(PHOTO, 'portrait_pd.jpg')));
    const src = (await deps.decode(bytes, sniffImage(bytes), { maxLongEdge: null })).src;
    const good = await deps.mozjpeg!(src, 90);
    const small = await deps.mozjpeg!(await deps.resize!(src, 280, 350, { premultiply: false }), 90);
    const [a, b] = [await deps.quickScore!(src, good), await deps.quickScore!(src, small)];
    expect(a).toBeGreaterThan(b);
    expect(a).toBeLessThanOrEqual(1);
  });
  it('MozJPEG unable to fit at q ≥ the lower bound gives the canvas result without a note', async () => {
    const { deps } = fakeDeps({ mozjpeg: 'huge' });
    const r = await compressPhoto(input(3_000_000, JPEG_SNIFF()), T(200), deps);
    expect(r.report).toMatchObject({ encoder: 'canvas', mozjpegFallback: false });
  });
  it('a target reachable only by scaling reports scaled', async () => {
    const { deps } = fakeDeps();
    const r = await compressPhoto(input(3_000_000, JPEG_SNIFF()), T(100), deps);
    expect(r.report.scaled).toBe(true);
    expect(r.report.outW).toBeLessThan(2000);
  });
  it('an impossible target is target-unreachable', async () => {
    const { deps } = fakeDeps();
    await expect(compressPhoto(input(3_000_000, JPEG_SNIFF()), { mode: 'target', targetBytes: 10, format: 'jpeg', fast: false }, deps)).rejects.toMatchObject({ code: 'target-unreachable' });
  });
});

describe('compressPhoto: transparency', () => {
  const PNG = JPEG_SNIFF({ format: 'png', hasGps: false, hasExif: false, alphaPossible: true, width: 800, height: 600 });
  it('JPG output: a transparent PNG is flattened onto white', async () => {
    const { deps, calls } = fakeDeps({ transparent: true });
    const r = await compressPhoto(input(3_000_000, PNG), T(100), deps);
    expect(r.report.flattened).toBe(true);
    expect(calls.flattened.at(-1)).toBe(true);
  });
  it('JPG output: an opaque RGBA PNG is not flattened (no note)', async () => {
    const { deps } = fakeDeps({ transparent: false });
    expect((await compressPhoto(input(3_000_000, PNG), T(100), deps)).report.flattened).toBe(false);
  });
  it('WebP output keeps alpha: never flattened, encoded by jSquash WebP', async () => {
    const { deps, calls } = fakeDeps({ transparent: true });
    const r = await compressPhoto(input(3_000_000, PNG), T(100, { format: 'webp' }), deps);
    expect(r.mime).toBe('image/webp');
    expect(r.report).toMatchObject({ flattened: false, encoder: 'webp' });
    expect(calls.flattened.every((f) => !f)).toBe(true);
    expect(calls.webp.every((q) => q >= 50 && q <= 95)).toBe(true);
    expect(r.bytes!.length).toBeLessThanOrEqual(100_000);
  });
  it('a failing WebP codec is an unknown row error', async () => {
    const { deps } = fakeDeps();
    deps.webp = async () => {
      throw new Error('webp wasm failed');
    };
    const err = await compressPhoto(input(3_000_000, PNG), T(100, { format: 'webp' }), deps).catch((e: unknown) => e);
    expect(photoErrorCode(err)).toBe('unknown');
  });
});

describe('compressPhoto: post-checks', () => {
  it('an encoder whose bytes end up over the target is discarded (unknown), never offered', async () => {
    // A lying encoder: every result is a view of one shared, resizable buffer, so a later, larger encode
    // silently grows the result the search accepted earlier.
    const shared = new ArrayBuffer(0, { maxByteLength: 50_000_000 });
    const lying: PhotoDeps<Src, Cv>['canvasJpeg'] = async (c, q) => {
      shared.resize(model(c.w, c.h, q));
      return new Uint8Array(shared);
    };
    const { deps } = fakeDeps({ canvasJpeg: lying });
    // Only q 0.50 fits at full size, so every later probe is larger and grows the accepted result.
    const target = model(2000, 1500, 0.5) + 1;
    const err = await compressPhoto(input(30_000_000, JPEG_SNIFF()), { mode: 'target', targetBytes: target, format: 'jpeg', fast: true }, deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PhotoError);
    expect((err as PhotoError).code).toBe('unknown');
  });
  it('a result whose decoded size differs from the planned size is a verify error', async () => {
    const { deps } = fakeDeps({ measure: (w, h) => ({ width: w + 1, height: h }) });
    await expect(compressPhoto(input(3_000_000, JPEG_SNIFF()), T(200), deps)).rejects.toMatchObject({ code: 'verify' });
  });
  it('OOM surfaces as oom', () => {
    expect(photoErrorCode(new RangeError('Array buffer allocation failed'))).toBe('oom');
    expect(photoErrorCode(new Error('x'))).toBe('unknown');
  });
});

describe('compressPhoto with the real Node codecs (MozJPEG + lanczos3) on portrait_pd.jpg', () => {
  it.each([100, 200])('%i KB: output ≤ target, final q ≥ 50, scaled when needed, baseline JPEG', async (kb) => {
    const bytes = new Uint8Array(readFileSync(join(PHOTO, 'portrait_pd.jpg')));
    const deps = await nodePhotoDeps();
    const r = await compressPhoto({ bytes, sniff: sniffImage(bytes) }, T(kb), deps);
    expect(r.bytes!.length).toBeLessThanOrEqual(kb * 1000);
    expect(r.report.encoder).toBe('mozjpeg');
    expect(r.report.q).toBeGreaterThanOrEqual(50);
    const out = sniffImage(r.bytes!);
    expect(out).toMatchObject({ format: 'jpeg', progressive: false, width: r.report.outW, height: r.report.outH, hasExif: false });
    if (r.report.outW < 1400) expect(r.report.scaled).toBe(true);
    expect(r.bytes!.length / (kb * 1000)).toBeGreaterThan(0.8);
  });
});
