// Byte writers for the photo fixtures (tests/fixtures/build-photo.mjs, unit and e2e tests). Dev only, never
// shipped. Step 4 reuses the EXIF, ICC and GIF writers.
import { deflateSync } from 'node:zlib';

// ---------- JPEG segments ----------

/** A JPEG marker segment: FF <marker> <length> <payload>. */
export function segment(marker: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + payload.length);
  out[0] = 0xff;
  out[1] = marker;
  out[2] = (payload.length + 2) >> 8;
  out[3] = (payload.length + 2) & 0xff;
  out.set(payload, 4);
  return out;
}

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));

/** Inserts segments after SOI and a leading JFIF APP0 (if any). */
export function insertSegments(jpeg: Uint8Array, segments: readonly Uint8Array[]): Uint8Array {
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + ((jpeg[4]! << 8) | jpeg[5]!);
  return concat([jpeg.subarray(0, at), ...segments, jpeg.subarray(at)]);
}

// ---------- EXIF ----------

export interface ExifSpec {
  order?: 'II' | 'MM';
  orientation?: number;
  /** Degrees; writes a GPS IFD (GPSLatitudeRef/GPSLatitude/GPSLongitudeRef/GPSLongitude). */
  gps?: { lat: number; lon: number };
}

/** An EXIF APP1 segment (Orientation and an optional GPS IFD) in either byte order. */
export function exifApp1(spec: ExifSpec): Uint8Array {
  const le = (spec.order ?? 'II') === 'II';
  const buf: number[] = [];
  const u16 = (v: number): void => void (le ? buf.push(v & 0xff, v >> 8) : buf.push(v >> 8, v & 0xff));
  const u32 = (v: number): void => void (le ? buf.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24) : buf.push(v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff));
  const entry = (tag: number, type: number, count: number, value: () => void): void => {
    u16(tag);
    u16(type);
    u32(count);
    value();
  };
  const ifd0 = [spec.orientation !== undefined, spec.gps !== undefined].filter(Boolean).length;
  const ifd0Size = 2 + ifd0 * 12 + 4;
  const gpsOffset = 8 + ifd0Size;
  const gpsSize = 2 + 4 * 12 + 4;
  const dataOffset = gpsOffset + gpsSize;

  buf.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]));
  u16(42);
  u32(8);
  u16(ifd0);
  if (spec.orientation !== undefined) {
    entry(0x0112, 3, 1, () => {
      u16(spec.orientation!);
      u16(0);
    });
  }
  if (spec.gps) entry(0x8825, 4, 1, () => u32(gpsOffset));
  u32(0);
  if (spec.gps) {
    const dms = (deg: number): number[] => {
      const a = Math.abs(deg);
      const d = Math.floor(a);
      const m = Math.floor((a - d) * 60);
      const s = Math.round(((a - d) * 60 - m) * 60 * 100);
      return [d, 1, m, 1, s, 100];
    };
    u16(4);
    entry(0x0001, 2, 2, () => buf.push(spec.gps!.lat >= 0 ? 0x4e : 0x53, 0, 0, 0));
    entry(0x0002, 5, 3, () => u32(dataOffset));
    entry(0x0003, 2, 2, () => buf.push(spec.gps!.lon >= 0 ? 0x45 : 0x57, 0, 0, 0));
    entry(0x0004, 5, 3, () => u32(dataOffset + 24));
    u32(0);
    for (const v of [...dms(spec.gps.lat), ...dms(spec.gps.lon)]) u32(v);
  }
  return segment(0xe1, concat([ascii('Exif\0\0'), Uint8Array.from(buf)]));
}

/** Rewrites the EXIF Orientation value in place (the first 0x0112 entry found in APP1). */
export function patchOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
  const out = jpeg.slice();
  for (let i = 2; i + 12 < out.length; i++) {
    const le = out[i] === 0x12 && out[i + 1] === 0x01 && out[i + 2] === 3 && out[i + 3] === 0;
    const be = out[i] === 0x01 && out[i + 1] === 0x12 && out[i + 2] === 0 && out[i + 3] === 3;
    if (le) {
      out[i + 8] = orientation;
      return out;
    }
    if (be) {
      out[i + 9] = orientation;
      return out;
    }
  }
  throw new Error('no orientation tag');
}

// ---------- ICC (v2 matrix/TRC, Display P3) ----------

type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

const mul = (a: Mat3, b: Mat3): Mat3 => a.map((r) => [0, 1, 2].map((j) => r[0] * b[0][j]! + r[1] * b[1][j]! + r[2] * b[2][j]!)) as Mat3;
const apply = (m: Mat3, v: Vec3): Vec3 => m.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]) as Vec3;
function inv(m: Mat3): Mat3 {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}
const xyz = (x: number, y: number): Vec3 => [x / y, 1, (1 - x - y) / y];

/** RGB → XYZ matrix from xy primaries and the white point (columns = the primaries' XYZ). */
function rgbToXyz(r: [number, number], g: [number, number], b: [number, number], w: [number, number]): Mat3 {
  const P: Mat3 = [0, 1, 2].map((k) => [xyz(...r)[k]!, xyz(...g)[k]!, xyz(...b)[k]!]) as Mat3;
  const S = apply(inv(P), xyz(...w));
  return P.map((row) => [row[0] * S[0], row[1] * S[1], row[2] * S[2]]) as Mat3;
}

const D65: [number, number] = [0.3127, 0.329];
export const P3_TO_XYZ = rgbToXyz([0.68, 0.32], [0.265, 0.69], [0.15, 0.06], D65);
export const SRGB_TO_XYZ = rgbToXyz([0.64, 0.33], [0.3, 0.6], [0.15, 0.06], D65);
const BRADFORD: Mat3 = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296],
];
const D50_XYZ: Vec3 = [0.9642, 1, 0.8249];

function adaptD65toD50(): Mat3 {
  const src = apply(BRADFORD, xyz(...D65));
  const dst = apply(BRADFORD, D50_XYZ);
  const scale: Mat3 = [
    [dst[0] / src[0], 0, 0],
    [0, dst[1] / src[1], 0],
    [0, 0, dst[2] / src[2]],
  ];
  return mul(inv(BRADFORD), mul(scale, BRADFORD));
}

export const srgbDecode = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export const srgbEncode = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** The sRGB value a colour-managed decoder produces for a Display-P3 pixel (both use the sRGB TRC). */
export function p3ToSrgb(rgb: Vec3): Vec3 {
  const lin = rgb.map((v) => srgbDecode(v / 255)) as Vec3;
  const out = apply(inv(SRGB_TO_XYZ), apply(P3_TO_XYZ, lin));
  return out.map((v) => Math.round(255 * srgbEncode(Math.min(1, Math.max(0, v))))) as Vec3;
}

/** An ICC v2 display profile: Display-P3 primaries (Bradford-adapted to D50) with a 1024-entry sRGB curve. */
export function iccDisplayP3(): Uint8Array {
  const be32 = (v: number): number[] => [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
  const s15 = (v: number): number[] => be32(Math.round(v * 65536) >>> 0);
  const xyzTag = (v: Vec3): number[] => [...ascii('XYZ '), 0, 0, 0, 0, ...s15(v[0]), ...s15(v[1]), ...s15(v[2])];
  const curve: number[] = [...ascii('curv'), 0, 0, 0, 0, ...be32(1024)];
  for (let i = 0; i < 1024; i++) {
    const v = Math.round(srgbDecode(i / 1023) * 65535);
    curve.push(v >> 8, v & 0xff);
  }
  const text = 'Display P3 (anolim test fixture)';
  const desc: number[] = [...ascii('desc'), 0, 0, 0, 0, ...be32(text.length + 1), ...ascii(text), 0, ...be32(0), ...be32(0), 0, 0, 0, ...new Array(67).fill(0)];
  const cprt: number[] = [...ascii('text'), 0, 0, 0, 0, ...ascii('No copyright, use freely'), 0];
  const cols = mul(adaptD65toD50(), P3_TO_XYZ);
  const col = (k: number): Vec3 => [cols[0][k]!, cols[1][k]!, cols[2][k]!];
  const tags: [string, number[]][] = [
    ['desc', desc],
    ['cprt', cprt],
    ['wtpt', xyzTag(D50_XYZ)],
    ['rXYZ', xyzTag(col(0))],
    ['gXYZ', xyzTag(col(1))],
    ['bXYZ', xyzTag(col(2))],
    ['rTRC', curve],
  ];
  const shared: [string, string][] = [
    ['gTRC', 'rTRC'],
    ['bTRC', 'rTRC'],
  ];
  const count = tags.length + shared.length;
  let offset = 128 + 4 + count * 12;
  const table: number[] = [...be32(count)];
  const data: number[] = [];
  const where = new Map<string, [number, number]>();
  for (const [sig, bytes] of tags) {
    while (offset % 4) {
      data.push(0);
      offset++;
    }
    where.set(sig, [offset, bytes.length]);
    table.push(...ascii(sig), ...be32(offset), ...be32(bytes.length));
    data.push(...bytes);
    offset += bytes.length;
  }
  for (const [sig, same] of shared) table.push(...ascii(sig), ...be32(where.get(same)![0]), ...be32(where.get(same)![1]));
  const size = 128 + table.length + data.length;
  const header = new Uint8Array(128);
  header.set(be32(size), 0);
  header.set(be32(0x02100000), 8);
  header.set(ascii('mntrRGB XYZ '), 12);
  header.set([0x07, 0xea, 0, 9, 0, 29, 0, 0, 0, 0, 0, 0], 24);
  header.set(ascii('acsp'), 36);
  header.set([...s15(D50_XYZ[0]), ...s15(D50_XYZ[1]), ...s15(D50_XYZ[2])], 68);
  return concat([header, Uint8Array.from(table), Uint8Array.from(data)]);
}

/** One APP2 ICC_PROFILE segment (profiles up to ~64 KB). */
export function iccApp2(icc: Uint8Array): Uint8Array {
  return segment(0xe2, concat([ascii('ICC_PROFILE\0'), Uint8Array.of(1, 1), icc]));
}

// ---------- GIF ----------

/**
 * A GIF89a with 2-colour frames (each frame: palette indices, width × height). The LZW stream sends a
 * clear code before every two pixels, so the code size never grows (valid, tiny for test images).
 */
export function gif(width: number, height: number, frames: readonly Uint8Array[], palette: readonly Vec3[] = [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 0, 255]]): Uint8Array {
  const out: number[] = [...ascii('GIF89a'), width & 0xff, width >> 8, height & 0xff, height >> 8, 0xf1, 0, 0];
  for (const c of palette.slice(0, 4)) out.push(...c);
  for (let k = palette.length; k < 4; k++) out.push(0, 0, 0);
  if (frames.length > 1) out.push(0x21, 0xff, 11, ...ascii('NETSCAPE2.0'), 3, 1, 0, 0, 0);
  for (const f of frames) {
    out.push(0x21, 0xf9, 4, 0, 10, 0, 0, 0); // graphic control: 0.1 s, no transparency
    out.push(0x2c, 0, 0, 0, 0, width & 0xff, width >> 8, height & 0xff, height >> 8, 0);
    const minCode = 2;
    const clear = 1 << minCode;
    const eoi = clear + 1;
    const bits: number[] = [];
    const emit = (code: number): void => {
      for (let b = 0; b < 3; b++) bits.push((code >> b) & 1);
    };
    for (let i = 0; i < f.length; i++) {
      if (i % 2 === 0) emit(clear);
      emit(f[i]! & 3);
    }
    emit(eoi);
    const bytes: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0;
      for (let b = 0; b < 8 && i + b < bits.length; b++) v |= bits[i + b]! << b;
      bytes.push(v);
    }
    out.push(minCode);
    for (let i = 0; i < bytes.length; i += 255) {
      const chunk = bytes.slice(i, i + 255);
      out.push(chunk.length, ...chunk);
    }
    out.push(0);
  }
  out.push(0x3b);
  return Uint8Array.from(out);
}

// ---------- PNG ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const v of b) c = CRC_TABLE[(c ^ v) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const td = concat([ascii(type), data]);
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(td, 4);
  dv.setUint32(8 + data.length, crc32(td));
  return out;
}

/** An 8-bit PNG of colour type 6 (RGBA) from raw RGBA pixels. `extra` chunks go before IDAT. */
export function pngRgba(width: number, height: number, rgba: Uint8Array, extra: readonly [string, Uint8Array][] = []): Uint8Array {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1);
  return concat([
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    chunk('IHDR', ihdr),
    ...extra.map(([t, d]) => chunk(t, d)),
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

export { chunk as pngChunk };
