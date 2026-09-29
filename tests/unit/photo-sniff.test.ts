// 사진 용량 줄이기: the sniffer (formats, sizes, orientation, metadata, animation, alpha, truncation) and the
// lossless JPEG metadata strip.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JpegStripError, stripJpegMetadata } from '../../src/lib/image/jpeg-strip';
import { HEAD_BYTES, TAIL_BYTES, orientedSize, scanEnd, sniffImage } from '../../src/lib/image/sniff';
import { seededBytes } from '../fixtures/build.mjs';
import { concat, exifApp1, gif, iccApp2, iccDisplayP3, insertSegments, pngChunk, pngRgba, segment } from '../helpers/image-writers';
import { nodeCodecs } from '../helpers/photo-deps';

const PHOTO = join(__dirname, '..', 'fixtures', 'photo');
const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(PHOTO, name)));
const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

async function smallJpeg(opts: { progressive?: boolean } = {}): Promise<Uint8Array> {
  const c = await nodeCodecs();
  const img = new ImageData(32, 16);
  for (let i = 0; i < img.data.length; i += 4) img.data.set([(i / 4) % 256, 90, 160, 255], i);
  return c.mozjpeg(img, 80, opts);
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function ihdr(w: number, h: number, colourType: number): Uint8Array {
  const d = new Uint8Array(13);
  const dv = new DataView(d.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  d.set([8, colourType, 0, 0, 0], 8);
  return pngChunk('IHDR', d);
}
const png = (...chunks: Uint8Array[]): Uint8Array => concat([Uint8Array.from(PNG_SIG), ...chunks]);
const empty = new Uint8Array(0);

function riff(chunks: [string, number[]][]): Uint8Array {
  const body: number[] = [...ascii('WEBP')];
  for (const [type, data] of chunks) {
    body.push(...ascii(type), data.length & 0xff, (data.length >> 8) & 0xff, (data.length >> 16) & 0xff, 0, ...data);
    if (data.length & 1) body.push(0);
  }
  return Uint8Array.from([...ascii('RIFF'), body.length & 0xff, (body.length >> 8) & 0xff, (body.length >> 16) & 0xff, 0, ...body]);
}
const vp8x = (flags: number, w: number, h: number): [string, number[]] => ['VP8X', [flags, 0, 0, 0, (w - 1) & 0xff, ((w - 1) >> 8) & 0xff, 0, (h - 1) & 0xff, ((h - 1) >> 8) & 0xff, 0]];

function ftyp(major: string, compat: string[], ispe?: [number, number][]): Uint8Array {
  const box = [0, 0, 0, 16 + compat.length * 4, ...ascii('ftyp'), ...ascii(major), 0, 0, 0, 0, ...compat.flatMap(ascii)];
  const be32 = (v: number): number[] => [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
  for (const [w, h] of ispe ?? []) box.push(0, 0, 0, 20, ...ascii('ispe'), 0, 0, 0, 0, ...be32(w), ...be32(h));
  return Uint8Array.from(box);
}

describe('sniffImage: formats and sizes (magic bytes only)', () => {
  it('JPEG: stored size from SOF', () => {
    const s = sniffImage(fixture('portrait_pd.jpg'));
    expect(s).toMatchObject({ format: 'jpeg', width: 1400, height: 1750, truncated: false, cmyk: false });
  });
  it('PNG: IHDR size; colour type 6 may carry alpha', () => {
    expect(sniffImage(fixture('alpha.png'))).toMatchObject({ format: 'png', width: 800, height: 600, alphaPossible: true, truncated: false, animated: false });
  });
  it('GIF: logical screen size', () => {
    expect(sniffImage(fixture('anim.gif'))).toMatchObject({ format: 'gif', width: 16, height: 16 });
  });
  it('WebP: VP8X, lossy VP8 and lossless VP8L sizes', () => {
    expect(sniffImage(riff([vp8x(0, 640, 480)]))).toMatchObject({ format: 'webp', width: 640, height: 480 });
    const vp8 = [0, 0, 0, 0x9d, 0x01, 0x2a, 300 & 0xff, 300 >> 8, 200 & 0xff, 200 >> 8];
    expect(sniffImage(riff([['VP8 ', vp8]]))).toMatchObject({ format: 'webp', width: 300, height: 200, alphaPossible: false });
    const v = (99 & 0x3fff) | ((49 & 0x3fff) << 14);
    const vp8l = [0x2f, v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
    expect(sniffImage(riff([['VP8L', vp8l]]))).toMatchObject({ format: 'webp', width: 100, height: 50, alphaPossible: true });
  });
  it('BMP: size from the info header; 32 bpp may carry alpha', () => {
    const b = new Uint8Array(54);
    b.set(ascii('BM'));
    const dv = new DataView(b.buffer);
    dv.setInt32(18, 120, true);
    dv.setInt32(22, -80, true);
    dv.setUint16(28, 32, true);
    expect(sniffImage(b)).toMatchObject({ format: 'bmp', width: 120, height: 80, alphaPossible: true });
  });
  it('HEIC and AVIF: brands, and the largest ispe', () => {
    for (const brand of ['heic', 'heix', 'hevc', 'hevx']) expect(sniffImage(ftyp(brand, ['mif1'])).format).toBe('heic');
    expect(sniffImage(ftyp('mif1', ['heic']))).toMatchObject({ format: 'heic' });
    expect(sniffImage(ftyp('msf1', ['msf1'])).format).toBe('heic');
    expect(sniffImage(ftyp('avif', ['mif1', 'miaf'])).format).toBe('avif');
    expect(sniffImage(ftyp('avis', ['msf1'])).format).toBe('avif');
    expect(sniffImage(ftyp('mif1', ['avif', 'miaf'])).format).toBe('avif');
    expect(sniffImage(ftyp('heic', ['mif1'], [[320, 240], [4032, 3024]]))).toMatchObject({ width: 4032, height: 3024 });
    expect(sniffImage(ftyp('isom', ['mp41'])).format).toBe('unknown');
  });
  it('TIFF in both byte orders', () => {
    expect(sniffImage(Uint8Array.from([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0])).format).toBe('tiff');
    expect(sniffImage(Uint8Array.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8])).format).toBe('tiff');
  });
  it('never trusts the extension: text is unknown', () => {
    expect(sniffImage(new TextEncoder().encode('이 파일은 사진이 아닙니다.')).format).toBe('unknown');
    expect(sniffImage(empty).format).toBe('unknown');
  });
});

describe('sniffImage: EXIF, metadata and colour', () => {
  it('orientation, GPS and EXIF in big-endian (MM)', () => {
    const s = sniffImage(fixture('exif6_gps.jpg'));
    expect(s).toMatchObject({ orientation: 6, hasGps: true, hasExif: true, width: 1200, height: 900 });
    expect(orientedSize(s)).toEqual({ width: 900, height: 1200 });
  });
  it('orientation in little-endian (II), without GPS', async () => {
    const s = sniffImage(insertSegments(await smallJpeg(), [exifApp1({ order: 'II', orientation: 3 })]));
    expect(s).toMatchObject({ orientation: 3, hasGps: false, hasExif: true });
    expect(orientedSize(s)).toEqual({ width: 32, height: 16 });
  });
  it('XMP is detected', async () => {
    const xmp = segment(0xe1, Uint8Array.from([...ascii('http://ns.adobe.com/xap/1.0/\0'), ...ascii('<x:xmpmeta/>')]));
    expect(sniffImage(insertSegments(await smallJpeg(), [xmp])).hasXmp).toBe(true);
  });
  it('CMYK (4 components) and progressive (SOF2)', async () => {
    expect(sniffImage(fixture('cmyk.jpg'))).toMatchObject({ cmyk: true, width: 400, height: 300 });
    expect(sniffImage(await smallJpeg({ progressive: true })).progressive).toBe(true);
    expect(sniffImage(await smallJpeg({ progressive: false })).progressive).toBe(false);
  });
  it('an ICC-tagged JPEG is still a plain JPEG', () => {
    const s = sniffImage(fixture('p3_patches.jpg'));
    expect(s).toMatchObject({ format: 'jpeg', width: 600, height: 400 });
    expect(s.orientation).toBeUndefined();
  });
});

describe('sniffImage: EXIF in PNG, WebP and HEIF containers', () => {
  const tiffGps = (): number[] => Array.from(exifApp1({ order: 'II', gps: { lat: 1, lon: 2 } }).subarray(10));
  it('PNG eXIf with GPS, and iTXt XMP', () => {
    const idat = pngChunk('IDAT', new Uint8Array(4));
    const iend = pngChunk('IEND', empty);
    const exif = pngChunk('eXIf', Uint8Array.from(tiffGps()));
    expect(sniffImage(png(ihdr(4, 4, 2), exif, idat, iend))).toMatchObject({ hasExif: true, hasGps: true });
    const xmp = pngChunk('iTXt', Uint8Array.from([...ascii('XML:com.adobe.xmp'), 0, 0, 0, 0, 0, ...ascii('<x/>')]));
    expect(sniffImage(png(ihdr(4, 4, 2), xmp, idat, iend)).hasXmp).toBe(true);
  });
  it('WebP EXIF chunk with GPS', () => {
    expect(sniffImage(riff([vp8x(0x08, 64, 64), ['EXIF', tiffGps()]]))).toMatchObject({ hasExif: true, hasGps: true });
  });
  it('HEIC/AVIF with an Exif item counts as EXIF', () => {
    const b = concat([ftyp('heic', ['mif1']), Uint8Array.from(ascii('iinf....infe....Exif'))]);
    expect(sniffImage(b).hasExif).toBe(true);
  });
});

describe('sniffImage: animation and alpha', () => {
  it('GIF: 2 frames animated, 1 frame not; a transparent colour may carry alpha', () => {
    expect(sniffImage(fixture('anim.gif')).animated).toBe(true);
    expect(sniffImage(gif(8, 8, [new Uint8Array(64)])).animated).toBe(false);
    const t = gif(8, 8, [new Uint8Array(64)]);
    const gce = t.findIndex((v, i) => v === 0x21 && t[i + 1] === 0xf9);
    t[gce + 3] = 1;
    expect(sniffImage(t).alphaPossible).toBe(true);
  });
  it('WebP: VP8X animation flag or an ANIM chunk; the alpha flag', () => {
    expect(sniffImage(riff([vp8x(0x02, 64, 64)])).animated).toBe(true);
    expect(sniffImage(riff([vp8x(0, 64, 64), ['ANIM', [0, 0, 0, 0, 0, 0]]])).animated).toBe(true);
    expect(sniffImage(riff([vp8x(0x10, 64, 64)]))).toMatchObject({ animated: false, alphaPossible: true });
  });
  it('APNG: acTL before IDAT is animated, after IDAT is not', () => {
    const actl = pngChunk('acTL', new Uint8Array(8));
    const idat = pngChunk('IDAT', new Uint8Array(4));
    const iend = pngChunk('IEND', empty);
    expect(sniffImage(png(ihdr(4, 4, 6), actl, idat, iend)).animated).toBe(true);
    expect(sniffImage(png(ihdr(4, 4, 6), idat, actl, iend)).animated).toBe(false);
  });
  it('PNG alpha: colour type 4/6 or tRNS; plain RGB has none', () => {
    const idat = pngChunk('IDAT', new Uint8Array(4));
    const iend = pngChunk('IEND', empty);
    expect(sniffImage(png(ihdr(4, 4, 2), idat, iend)).alphaPossible).toBe(false);
    expect(sniffImage(png(ihdr(4, 4, 2), pngChunk('tRNS', new Uint8Array(6)), idat, iend)).alphaPossible).toBe(true);
    expect(sniffImage(png(ihdr(4, 4, 4), idat, iend)).alphaPossible).toBe(true);
    expect(sniffImage(pngRgba(2, 2, new Uint8Array(16).fill(255))).alphaPossible).toBe(true);
  });
});

describe('sniffImage: truncation', () => {
  it('JPEG without EOI after SOS is truncated (whole file)', () => {
    const p = fixture('portrait_pd.jpg');
    expect(sniffImage(p.subarray(0, Math.floor(p.length * 0.6))).truncated).toBe(true);
    expect(sniffImage(p).truncated).toBe(false);
  });
  it('a partial view (head + tail) never calls a JPEG truncated: the worker decides on the whole file', () => {
    const p = fixture('portrait_pd.jpg');
    const cut = p.subarray(0, 300_000);
    expect(cut.length).toBeGreaterThan(HEAD_BYTES);
    const s = sniffImage(cut.subarray(0, HEAD_BYTES), { tail: cut.subarray(cut.length - TAIL_BYTES), size: cut.length });
    expect(s).toMatchObject({ format: 'jpeg', width: 1400, height: 1750, truncated: false });
  });
  it('a complete JPEG with a trailer after EOI is not truncated', () => {
    expect(sniffImage(fixture('exif6_gps.jpg')).truncated).toBe(false);
  });
  it('PNG without IEND is truncated, in whole and partial views', () => {
    const a = fixture('alpha.png');
    const cut = a.subarray(0, a.length - 12);
    expect(sniffImage(a).truncated).toBe(false);
    expect(sniffImage(cut).truncated).toBe(true);
    const big = concat([cut, new Uint8Array(HEAD_BYTES)]);
    expect(sniffImage(big.subarray(0, 1024), { tail: big.subarray(big.length - TAIL_BYTES), size: big.length }).truncated).toBe(true);
    const whole = concat([a, new Uint8Array(0)]);
    const padded = concat([new Uint8Array(0), whole]);
    expect(sniffImage(padded.subarray(0, 1024), { tail: padded.subarray(padded.length - TAIL_BYTES), size: padded.length }).truncated).toBe(false);
  });
});

describe('sniffImage: malformed input never throws', () => {
  it('random bytes, truncated headers and garbage lengths', () => {
    const inputs: Uint8Array[] = [
      Uint8Array.of(0xff, 0xd8, 0xff),
      Uint8Array.of(0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01),
      Uint8Array.of(0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, ...ascii('Exif\0\0II*\0'), 0xff, 0xff, 0xff, 0x7f),
      Uint8Array.from([...PNG_SIG, 0xff, 0xff, 0xff, 0xff, ...ascii('IHDR')]),
      Uint8Array.from(ascii('RIFF\xff\xff\xff\xffWEBPVP8X')),
      Uint8Array.from(ascii('GIF89a')),
      Uint8Array.from([0, 0, 0, 0xff, ...ascii('ftypheic')]),
    ];
    for (const f of ['portrait_pd.jpg', 'alpha.png', 'anim.gif', 'exif6_gps.jpg', 'cmyk.jpg']) {
      const b = fixture(f);
      for (let k = 1; k < 40; k++) inputs.push(b.subarray(0, Math.floor((b.length * k) / 40)));
      const noisy = b.slice(0, 4096);
      noisy.set(seededBytes(Math.max(0, noisy.length - 40), k0(f)), Math.min(40, noisy.length));
      inputs.push(noisy);
    }
    for (let seed = 1; seed < 50; seed++) inputs.push(seededBytes(512, seed));
    for (const b of inputs) {
      expect(() => sniffImage(b)).not.toThrow();
      expect(() => sniffImage(b, { tail: b.subarray(Math.max(0, b.length - 16)), size: b.length + 100_000 })).not.toThrow();
    }
  });
});

function k0(name: string): number {
  return [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
}

describe('stripJpegMetadata', () => {
  async function dirty(): Promise<{ bytes: Uint8Array; clean: Uint8Array }> {
    const clean = await smallJpeg();
    const segs = [
      exifApp1({ orientation: 1, gps: { lat: 37.5, lon: 127 } }),
      iccApp2(iccDisplayP3()),
      segment(0xe2, Uint8Array.from([...ascii('MPF\0'), 1, 2, 3, 4])),
      segment(0xed, Uint8Array.from(ascii('Photoshop 3.0\0GPS-IN-IPTC'))),
      segment(0xee, Uint8Array.from([...ascii('Adobe'), 0, 100, 0, 0, 0, 0, 1])),
      segment(0xfe, Uint8Array.from(ascii('camera comment'))),
    ];
    const trailer = Uint8Array.from([0xff, 0xd8, ...ascii('GPS-TRAILER'), 0xff, 0xd9]);
    return { bytes: concat([insertSegments(clean, segs), trailer]), clean };
  }
  const has = (b: Uint8Array, text: string): boolean => Buffer.from(b).includes(Buffer.from(text, 'latin1'));
  const scan = (b: Uint8Array): Uint8Array => {
    let i = 2;
    while (!(b[i] === 0xff && b[i + 1] === 0xda)) i += 2 + ((b[i + 2]! << 8) | b[i + 3]!);
    let e = i + 2;
    while (!(b[e] === 0xff && b[e + 1] === 0xd9)) e++;
    return b.subarray(i, e + 2);
  };

  it('drops APP1 (EXIF), APP13, MPF, COM and the trailer; keeps JFIF, ICC and Adobe', async () => {
    const { bytes } = await dirty();
    const out = stripJpegMetadata(bytes);
    for (const gone of ['Exif', 'MPF\0', 'Photoshop', 'camera comment', 'GPS-TRAILER', 'GPS-IN-IPTC']) expect(has(out, gone), gone).toBe(false);
    for (const kept of ['JFIF', 'ICC_PROFILE', 'Adobe']) expect(has(out, kept), kept).toBe(true);
    expect(out[out.length - 2]).toBe(0xff);
    expect(out[out.length - 1]).toBe(0xd9);
    expect(out.length).toBeLessThan(bytes.length);
  });
  it('keeps the size and the scan bytes identical', async () => {
    const { bytes } = await dirty();
    const out = stripJpegMetadata(bytes);
    const a = sniffImage(bytes);
    const b = sniffImage(out);
    expect([b.width, b.height, b.format, b.hasExif, b.hasGps]).toEqual([a.width, a.height, 'jpeg', false, false]);
    expect(Buffer.from(scan(out)).equals(Buffer.from(scan(bytes)))).toBe(true);
  });
  it('a real EXIF-6 photo loses its trailer and GPS', () => {
    const out = stripJpegMetadata(fixture('exif6_gps.jpg'));
    expect(has(out, 'GPS-TRAILER')).toBe(false);
    const s = sniffImage(out);
    expect(s).toMatchObject({ hasGps: false, hasExif: false, width: 1200, height: 900 });
    expect(s.orientation).toBeUndefined();
  });
  /** `seg` inserted right after the first scan's entropy data (progressive JPEGs have several scans). */
  const afterScan1 = (jpeg: Uint8Array, seg: Uint8Array): Uint8Array => {
    let i = 2;
    while (!(jpeg[i] === 0xff && jpeg[i + 1] === 0xda)) i += 2 + ((jpeg[i + 2]! << 8) | jpeg[i + 3]!);
    const end = scanEnd(jpeg, i + 2 + ((jpeg[i + 2]! << 8) | jpeg[i + 3]!));
    return concat([jpeg.subarray(0, end), seg, jpeg.subarray(end)]);
  };
  const progressive = (): Uint8Array => {
    const p = fixture('portrait_pd.jpg');
    expect(sniffImage(p).progressive).toBe(true);
    return p;
  };

  it('drops an APP1 with GPS placed between the scans of a progressive JPEG (and the sniffer sees it)', () => {
    const clean = progressive();
    const dirty = afterScan1(clean, exifApp1({ orientation: 1, gps: { lat: 37.5, lon: 127 } }));
    expect(sniffImage(dirty)).toMatchObject({ hasExif: true, hasGps: true, truncated: false });
    const out = stripJpegMetadata(dirty);
    expect(has(out, 'Exif')).toBe(false);
    expect(sniffImage(out)).toMatchObject({ hasExif: false, hasGps: false, truncated: false, width: 1400, height: 1750 });
    expect(out.length).toBeLessThan(dirty.length);
  });
  it('a COM holding FF D9 between scans is dropped whole, and every scan is kept (no early cut)', () => {
    const clean = progressive();
    const com = segment(0xfe, Uint8Array.from([0x41, 0xff, 0xd9, 0x42, 0xff, 0xd9]));
    const dirty = afterScan1(clean, com);
    expect(sniffImage(dirty).truncated).toBe(false);
    const out = stripJpegMetadata(dirty);
    // The clean original has JFIF + tables + scans only, so stripping the dirty file gives the same bytes.
    expect(Buffer.from(out).equals(Buffer.from(stripJpegMetadata(clean)))).toBe(true);
    expect(out.length).toBeGreaterThan(clean.length * 0.99);
  });
  it('the sniffer walks all scans: a truncated progressive JPEG and a trailer after EOI are told apart', () => {
    const p = progressive();
    expect(sniffImage(p.subarray(0, Math.floor(p.length * 0.9))).truncated).toBe(true);
    expect(sniffImage(concat([p, Uint8Array.from(ascii('trailer after EOI'))])).truncated).toBe(false);
  });
  it('refuses a truncated or non-JPEG input', () => {
    const p = fixture('portrait_pd.jpg');
    expect(() => stripJpegMetadata(p.subarray(0, 50_000))).toThrow(JpegStripError);
    expect(() => stripJpegMetadata(fixture('alpha.png'))).toThrow(JpegStripError);
  });
});
