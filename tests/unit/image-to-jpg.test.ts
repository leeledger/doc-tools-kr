// 사진 JPG 변환 (TOOLS5 U1): accepted formats, strip-only rule, names, quality, canvas caps, limits, the once-per-batch
// usage rule, and the canvas runner end to end on @napi-rs/canvas (transparency, WebP fallback, caps, strip path).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageData as NapiImageData, createCanvas, loadImage, type Canvas as NapiCanvas } from '@napi-rs/canvas';
import { describe, expect, it, vi } from 'vitest';
import { getTool } from '../../src/data/tools';
import { TOOL_FACTS } from '../../src/data/tool-facts';
import type { Decoded } from '../../src/lib/image/engine';
import { stripJpegMetadata } from '../../src/lib/image/jpeg-strip';
import { sniffImage, type ImageFormat, type Sniff } from '../../src/lib/image/sniff';
import { MB } from '../../src/lib/ui/device';
import { dedupeNames } from '../../src/lib/zip/names';
import {
  ACCEPTED_FORMATS,
  ConvertError,
  QUALITY,
  canStripOnly,
  convertImage,
  decodeEdge,
  drawSize,
  encodeQuality,
  noteText,
  oncePerCode,
  outputName,
  zipName,
  type ConvertDeps,
  type Ctx2D,
  type Target,
} from '../../src/tools/image-to-jpg/convert';
import { LIMITS, planAdd } from '../../src/tools/image-to-jpg/limits';
import { LIMITS as JPG_PDF_LIMITS } from '../../src/tools/jpg-to-pdf/limits';
import { exifApp1, insertSegments, pngRgba, segment } from '../helpers/image-writers';

const PHOTO = join(__dirname, '..', 'fixtures', 'photo');
const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(PHOTO, name)));

describe('accepted formats (by sniff, not extension)', () => {
  it('JPG, PNG, WebP, HEIC, AVIF, GIF, BMP in; TIFF and unknown out', () => {
    for (const f of ['jpeg', 'png', 'webp', 'heic', 'avif', 'gif', 'bmp'] as ImageFormat[]) expect(ACCEPTED_FORMATS, f).toContain(f);
    for (const f of ['tiff', 'unknown'] as ImageFormat[]) expect(ACCEPTED_FORMATS, f).not.toContain(f);
  });
});

describe('canStripOnly (the canEmbedRaw rule shape)', () => {
  const jpeg = { format: 'jpeg' as const, orientation: undefined, cmyk: false, truncated: false };
  it('JPEG to JPG at 높음, upright, not CMYK, not cut short: strip only', () => {
    expect(canStripOnly(jpeg, 'jpg', 'high')).toBe(true);
    expect(canStripOnly({ ...jpeg, orientation: 1 }, 'jpg', 'high')).toBe(true);
  });
  it('anything else is drawn and re-encoded', () => {
    for (const o of [2, 3, 6, 8]) expect(canStripOnly({ ...jpeg, orientation: o }, 'jpg', 'high'), `orientation ${o}`).toBe(false);
    expect(canStripOnly({ ...jpeg, cmyk: true }, 'jpg', 'high')).toBe(false);
    expect(canStripOnly({ ...jpeg, truncated: true }, 'jpg', 'high')).toBe(false);
    for (const q of ['normal', 'small'] as const) expect(canStripOnly(jpeg, 'jpg', q), q).toBe(false);
    for (const t of ['png', 'webp'] as Target[]) expect(canStripOnly(jpeg, t, 'high'), t).toBe(false);
    for (const f of ['png', 'webp', 'heic', 'gif'] as const) expect(canStripOnly({ ...jpeg, format: f }, 'jpg', 'high'), f).toBe(false);
  });
});

describe('quality and names', () => {
  it('높음 0.92, 보통 0.82, 작게 0.70 for JPG and WebP; PNG has none', () => {
    expect(QUALITY).toEqual({ high: 0.92, normal: 0.82, small: 0.7 });
    expect(encodeQuality('jpg', 'normal')).toBe(0.82);
    expect(encodeQuality('webp', 'small')).toBe(0.7);
    expect(encodeQuality('png', 'small')).toBeUndefined();
  });
  it('{base}.{ext}; ZIP {first base}_{ext}.zip; unsafe characters removed', () => {
    expect(outputName('IMG_0001.HEIC', 'jpg')).toBe('IMG_0001.jpg');
    expect(outputName('로고.png', 'webp')).toBe('로고.webp');
    expect(outputName('a.b.png', 'jpg')).toBe('a.b.jpg');
    expect(outputName('noext', 'png')).toBe('noext.png');
    expect(outputName('a:b?.webp', 'jpg')).toBe('ab.jpg');
    expect(zipName('IMG_0001.HEIC', 'jpg')).toBe('IMG_0001_jpg.zip');
    expect(zipName('사진.png', 'webp')).toBe('사진_webp.zip');
  });
  it('two IMG_0001 from different folders get unique names in the ZIP', () => {
    const names = ['IMG_0001.HEIC', 'IMG_0001.heic', 'IMG_0001.png'].map((n) => outputName(n, 'jpg'));
    expect(dedupeNames(names)).toEqual(['IMG_0001.jpg', 'IMG_0001_2.jpg', 'IMG_0001_3.jpg']);
  });
});

describe('canvas caps (phone 16,000,000 px / 8,192; PC 50,000,000 / 16,384)', () => {
  it('limits', () => {
    expect(LIMITS.mobile.caps).toEqual({ maxArea: 16_000_000, maxEdge: 8_192 });
    expect(LIMITS.desktop.caps).toEqual({ maxArea: 50_000_000, maxEdge: 16_384 });
  });
  it('a 48 MP photo (8,064 × 6,048) is drawn smaller on a phone, as is on a PC', () => {
    const phone = drawSize(8_064, 6_048, LIMITS.mobile.caps);
    expect(phone.scaled).toBe(true);
    expect(phone.width * phone.height).toBeLessThanOrEqual(16_000_000);
    expect(drawSize(8_064, 6_048, LIMITS.desktop.caps)).toEqual({ width: 8_064, height: 6_048, scaled: false });
  });
  it('decodeEdge: the long edge to decode at when the header is over the caps (oriented size), else null', () => {
    const s = (width: number, height: number, orientation?: number): Sniff => ({ ...sniffImage(new Uint8Array(0)), format: 'jpeg', width, height, orientation });
    expect(decodeEdge(s(4_000, 3_000), LIMITS.mobile.caps)).toBeNull();
    expect(decodeEdge(s(20_000, 1_000), LIMITS.mobile.caps)).toBe(8_192);
    expect(decodeEdge(s(8_064, 6_048, 6), LIMITS.mobile.caps)).toBe(drawSize(6_048, 8_064, LIMITS.mobile.caps).height);
    expect(decodeEdge({ ...s(1, 1), width: undefined, height: undefined }, LIMITS.mobile.caps)).toBeNull();
  });
  it('the row notes say what happened, with numbers', () => {
    expect(noteText({ kind: 'scaled', width: 4_618, height: 3_464 })).toBe('4,618×3,464픽셀로 줄여 저장했습니다.');
    expect(noteText({ kind: 'transparent' })).toBe('투명한 부분은 흰색으로 바뀝니다.');
    expect(noteText({ kind: 'first-frame' })).toBe('움직이는 사진은 첫 장면만 저장했습니다.');
  });
});

describe('planAdd (사진 PDF 변환 numbers)', () => {
  it('same count and byte limits as 사진 PDF 변환', () => {
    for (const d of ['desktop', 'mobile'] as const) {
      expect(LIMITS[d].maxImages).toBe(JPG_PDF_LIMITS[d].maxImages);
      expect(LIMITS[d].maxFileBytes).toBe(JPG_PDF_LIMITS[d].maxFileBytes);
      expect(LIMITS[d].maxTotalBytes).toBe(JPG_PDF_LIMITS[d].maxTotalBytes);
    }
  });
  it('phone: 50 images, 50 MB each, 150 MB in total; messages with numbers and usage codes', () => {
    const many = planAdd(Array(53).fill(MB), 0, 0, 'mobile');
    expect(many.accepted).toHaveLength(50);
    expect(many.messages[0]).toBe('한 번에 최대 50장까지 바꿀 수 있어 3장은 추가하지 않았습니다. 나머지는 나눠서 바꿔 주세요.');
    expect(many.codes).toEqual(['too-many']);
    const big = planAdd([51 * MB, MB], 0, 0, 'mobile');
    expect(big.accepted).toEqual([1]);
    expect(big.messages[0]).toBe('사진 한 장은 휴대폰에서 50 MB까지 넣을 수 있어 1장은 추가하지 않았습니다.');
    const total = planAdd([40 * MB, 40 * MB], 2, 100 * MB, 'mobile');
    expect(total.accepted).toEqual([0]);
    expect(total.messages[0]).toBe('사진 합계가 150 MB를 넘으면 휴대폰에서 한 번에 바꿀 수 없어 1장은 추가하지 않았습니다. 나눠서 바꿔 주세요.');
    expect(total.codes).toEqual(['too-big']);
  });
  it('PC: 200 images, 100 MB each, 500 MB in total', () => {
    expect(planAdd(Array(201).fill(1), 0, 0, 'desktop').accepted).toHaveLength(200);
    expect(planAdd([101 * MB], 0, 0, 'desktop').accepted).toEqual([]);
    expect(planAdd([100 * MB], 0, 450 * MB, 'desktop').accepted).toEqual([]);
  });
});

describe('oncePerCode (brief decision 7)', () => {
  it('a batch of three undecodable HEIC and two non-images sends heic once and not-image once', () => {
    const send = vi.fn();
    const once = oncePerCode(send);
    for (const c of ['heic', 'heic', 'not-image', 'heic', 'not-image']) once(c);
    expect(send.mock.calls).toEqual([['heic'], ['not-image']]);
    // A new batch reports again.
    const next = oncePerCode(send);
    next('heic');
    expect(send).toHaveBeenCalledTimes(3);
  });
});

// ---------- the runner on @napi-rs/canvas ----------

type Img = Awaited<ReturnType<typeof loadImage>>;

const ENC: Record<string, 'jpeg' | 'png' | 'webp'> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };

function nodeDeps(bytes: Uint8Array, over: Partial<ConvertDeps<Img, NapiCanvas>> = {}): ConvertDeps<Img, NapiCanvas> {
  return {
    readBytes: async () => bytes,
    strip: stripJpegMetadata,
    async decode(): Promise<Decoded<Img>> {
      const img = await loadImage(Buffer.from(bytes));
      return { src: img, width: img.width, height: img.height, sourceWidth: img.width, sourceHeight: img.height, capped: false, close: () => undefined };
    },
    surface(width, height) {
      const canvas = createCanvas(width, height);
      return { canvas, ctx: canvas.getContext('2d') as unknown as Ctx2D, release: () => undefined };
    },
    async encode(canvas, mime, quality) {
      const kind = ENC[mime]!;
      const buf = kind === 'png' ? await canvas.encode('png') : await canvas.encode(kind, Math.round((quality ?? 0.92) * 100));
      return new Blob([new Uint8Array(buf)], { type: mime });
    },
    async webp(img, quality) {
      const c = createCanvas(img.width, img.height);
      c.getContext('2d').putImageData(img as unknown as NapiImageData, 0, 0);
      return new Uint8Array(await c.encode('webp', quality));
    },
    ...over,
  };
}

const sniffOf = (bytes: Uint8Array): Sniff => sniffImage(bytes);

async function pixels(blob: Blob): Promise<{ w: number; h: number; at(x: number, y: number): number[] }> {
  const img = await loadImage(Buffer.from(await blob.arrayBuffer()));
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data;
  return { w: img.width, h: img.height, at: (x, y) => Array.from(d.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)) };
}

/** 40 × 30 RGBA: left half transparent, right half opaque red. */
function halfClearPng(): Uint8Array {
  const W = 40;
  const H = 30;
  const px = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = W / 2; x < W; x++) px.set([255, 0, 0, 255], (y * W + x) * 4);
  return pngRgba(W, H, px);
}

const caps = LIMITS.desktop.caps;

describe('convertImage', () => {
  it('PNG with transparency -> JPG: white underneath (corner pixel), a JPEG (SOI), the note', async () => {
    const png = halfClearPng();
    const r = await convertImage(sniffOf(png), { to: 'jpg', quality: 'high', caps }, nodeDeps(png));
    expect(r.blob.type).toBe('image/jpeg');
    const head = new Uint8Array(await r.blob.arrayBuffer());
    expect([head[0], head[1]]).toEqual([0xff, 0xd8]);
    const p = await pixels(r.blob);
    for (const v of p.at(1, 1).slice(0, 3)) expect(v).toBeGreaterThan(245);
    expect(p.at(35, 15)[0]).toBeGreaterThan(200);
    expect(r.notes).toEqual([{ kind: 'transparent' }]);
  });

  it('PNG with transparency -> PNG and -> WebP: alpha kept, no note', async () => {
    const png = halfClearPng();
    for (const to of ['png', 'webp'] as const) {
      const r = await convertImage(sniffOf(png), { to, quality: 'high', caps }, nodeDeps(png));
      expect(r.blob.type).toBe(`image/${to}`);
      expect((await pixels(r.blob)).at(1, 1)[3], to).toBe(0);
      expect(r.notes).toEqual([]);
    }
  });

  it('WebP when the browser encoder gives PNG instead (Safari): the fallback encoder runs and the bytes are RIFF/WEBP', async () => {
    const png = halfClearPng();
    const webp = vi.fn(nodeDeps(png).webp);
    const pngInstead: ConvertDeps<Img, NapiCanvas>['encode'] = async (canvas) => new Blob([new Uint8Array(await canvas.encode('png'))], { type: 'image/png' });
    const r = await convertImage(sniffOf(png), { to: 'webp', quality: 'normal', caps }, nodeDeps(png, { encode: pngInstead, webp }));
    expect(webp).toHaveBeenCalledTimes(1);
    expect(webp.mock.calls[0]![1]).toBe(82);
    const b = new Uint8Array(await r.blob.arrayBuffer());
    expect(String.fromCharCode(...b.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...b.subarray(8, 12))).toBe('WEBP');
    expect(r.blob.type).toBe('image/webp');
  });

  it('WebP fallback failing, or an encoder giving the wrong type: ConvertError encoder (never a mislabelled file)', async () => {
    const png = halfClearPng();
    const pngInstead: ConvertDeps<Img, NapiCanvas>['encode'] = async () => new Blob([new Uint8Array([1])], { type: 'image/png' });
    const failing = async (): Promise<Uint8Array> => {
      throw new Error('wasm did not load');
    };
    await expect(convertImage(sniffOf(png), { to: 'webp', quality: 'high', caps }, nodeDeps(png, { encode: pngInstead, webp: failing }))).rejects.toMatchObject({ code: 'encoder' });
    await expect(convertImage(sniffOf(png), { to: 'jpg', quality: 'high', caps }, nodeDeps(png, { encode: pngInstead }))).rejects.toBeInstanceOf(ConvertError);
    await expect(convertImage(sniffOf(png), { to: 'jpg', quality: 'high', caps }, nodeDeps(png, { encode: async () => null }))).rejects.toMatchObject({ code: 'encoder' });
  });

  it('no 2d context: ConvertError canvas', async () => {
    const png = halfClearPng();
    const none: ConvertDeps<Img, NapiCanvas>['surface'] = (w, h) => ({ canvas: createCanvas(w, h), ctx: null, release: () => undefined });
    await expect(convertImage(sniffOf(png), { to: 'jpg', quality: 'high', caps }, nodeDeps(png, { surface: none }))).rejects.toMatchObject({ code: 'canvas' });
  });

  it('over the caps: drawn within them, with the size in the note', async () => {
    const png = halfClearPng();
    const small = { maxArea: 300, maxEdge: 30 };
    const r = await convertImage(sniffOf(png), { to: 'png', quality: 'high', caps: small }, nodeDeps(png));
    const p = await pixels(r.blob);
    expect(p.w * p.h).toBeLessThanOrEqual(300);
    expect(r.notes).toEqual([{ kind: 'scaled', width: p.w, height: p.h }]);
  });

  it('an animated GIF: the first-frame note', async () => {
    const gif = fixture('anim.gif');
    const r = await convertImage(sniffOf(gif), { to: 'png', quality: 'high', caps }, nodeDeps(gif));
    expect(r.notes).toContainEqual({ kind: 'first-frame' });
  });

  it('JPEG -> JPG at 높음, upright: the strip path (no decode), EXIF/GPS and comments gone, scan data unchanged', async () => {
    const plain = fixture('portrait_pd.jpg');
    const tagged = insertSegments(plain, [exifApp1({ orientation: 1, gps: { lat: 35.1, lon: 129.04 } }), segment(0xfe, new TextEncoder().encode('camera comment'))]);
    const decode = vi.fn();
    const r = await convertImage(sniffOf(tagged), { to: 'jpg', quality: 'high', caps }, nodeDeps(tagged, { decode }));
    expect(r.stripped).toBe(true);
    expect(decode).not.toHaveBeenCalled();
    const out = new Uint8Array(await r.blob.arrayBuffer());
    const s = sniffImage(out);
    expect([s.hasExif, s.hasGps, s.hasXmp]).toEqual([false, false, false]);
    expect(Buffer.from(out).toString('latin1')).not.toContain('camera comment');
    expect(out.length).toBeLessThan(tagged.length);
  });

  it('JPEG with orientation 6 (and GPS) -> JPG: re-drawn (not stripped), so it comes out with no EXIF at all', async () => {
    const exif6 = fixture('exif6_gps.jpg');
    const r = await convertImage(sniffOf(exif6), { to: 'jpg', quality: 'high', caps }, nodeDeps(exif6));
    expect(r.stripped).toBe(false);
    const s = sniffImage(new Uint8Array(await r.blob.arrayBuffer()));
    expect([s.hasExif, s.hasGps]).toEqual([false, false]);
  });

  it('a JPEG the strip cannot walk is re-encoded instead of failing', async () => {
    const plain = fixture('portrait_pd.jpg');
    const broken = (): Uint8Array => {
      throw new (class extends Error {})('other');
    };
    // Any non-strip error propagates.
    await expect(convertImage(sniffOf(plain), { to: 'jpg', quality: 'high', caps }, nodeDeps(plain, { strip: broken }))).rejects.toThrow('other');
    const { JpegStripError } = await import('../../src/lib/image/jpeg-strip');
    const walkFails = (): Uint8Array => {
      throw new JpegStripError('marker expected');
    };
    const r = await convertImage(sniffOf(plain), { to: 'jpg', quality: 'high', caps }, nodeDeps(plain, { strip: walkFails }));
    expect(r.stripped).toBe(false);
    expect(r.blob.type).toBe('image/jpeg');
  });
});

describe('page copy and facts', () => {
  const tool = getTool('image-to-jpg');
  it('name = h1; description 40–80 characters; FAQ numbers read from the limits', () => {
    expect(tool.h1).toBe(tool.name);
    const n = [...tool.description].length;
    expect(n).toBeGreaterThanOrEqual(40);
    expect(n).toBeLessThanOrEqual(80);
    const faq = tool.faq.map((f) => `${f.q} ${f.a}`).join(' ');
    for (const s of ['200장', '50장', '100 MB', '50 MB', '500 MB', '150 MB']) expect(faq, s).toContain(s);
    expect(faq).toContain('「높은 호환성」');
    expect(faq).toContain('흰색');
  });
  it('tool facts', () => {
    expect(TOOL_FACTS['image-to-jpg.maxImages.desktop'].value).toBe(200);
    expect(TOOL_FACTS['image-to-jpg.maxImages.mobile'].value).toBe(50);
    expect(TOOL_FACTS['image-to-jpg.maxFileMb.desktop']).toEqual({ value: 100, unit: 'MB' });
    expect(TOOL_FACTS['image-to-jpg.maxFileMb.mobile']).toEqual({ value: 50, unit: 'MB' });
  });
});
