// Pure image sniffer (brief Step 3 §2): format from magic bytes only, header dimensions, EXIF orientation,
// metadata flags, animation, alpha and truncation. Bounds-checked everywhere; it never throws.
// The main thread passes the first HEAD_BYTES plus a tail slice (never the whole file); the worker passes
// the whole file, where every answer is exact.

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'bmp' | 'avif' | 'heic' | 'tiff' | 'unknown';

export interface Sniff {
  format: ImageFormat;
  /** Stored (not oriented) pixel size from the header; undefined when the header has none. */
  width?: number;
  height?: number;
  /** EXIF IFD0 orientation 1–8 (JPEG only); undefined when absent. */
  orientation?: number;
  hasGps: boolean;
  hasExif: boolean;
  hasXmp: boolean;
  /** JPEG frame with 4 components. */
  cmyk: boolean;
  /** Progressive JPEG (SOF2 and its differential/arithmetic variants). */
  progressive: boolean;
  animated: boolean;
  /** The format can carry transparency here; the pixels decide (hasTransparency). */
  alphaPossible: boolean;
  /** JPEG without EOI after the first SOS, or PNG without IEND. */
  truncated: boolean;
}

/** Bytes the main thread reads from the start of a file, and from its end. */
export const HEAD_BYTES = 256 * 1024;
export const TAIL_BYTES = 64 * 1024;

/** A partial view: `bytes` is the head, `tail` the last bytes, `size` the whole file size. */
export interface SniffPart {
  tail: Uint8Array;
  size: number;
}

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

const empty = (format: ImageFormat): Sniff => ({
  format,
  hasGps: false,
  hasExif: false,
  hasXmp: false,
  cmyk: false,
  progressive: false,
  animated: false,
  alphaPossible: false,
  truncated: false,
});

const u16be = (b: Uint8Array, i: number): number => (i + 1 < b.length ? (b[i]! << 8) | b[i + 1]! : -1);
const u16le = (b: Uint8Array, i: number): number => (i + 1 < b.length ? b[i]! | (b[i + 1]! << 8) : -1);
const u24le = (b: Uint8Array, i: number): number => (i + 2 < b.length ? b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) : -1);
const u32be = (b: Uint8Array, i: number): number => (i + 3 < b.length ? ((b[i]! << 24) >>> 0) + ((b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) : -1);
const u32le = (b: Uint8Array, i: number): number => (i + 3 < b.length ? ((b[i + 3]! << 24) >>> 0) + ((b[i + 2]! << 16) | (b[i + 1]! << 8) | b[i]!) : -1);
const i32le = (b: Uint8Array, i: number): number => (i + 3 < b.length ? b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24) : 0);

function ascii(b: Uint8Array, i: number, n: number): string {
  if (i < 0 || i + n > b.length) return '';
  let s = '';
  for (let k = 0; k < n; k++) s += String.fromCharCode(b[i + k]!);
  return s;
}

function startsWith(b: Uint8Array, i: number, sig: readonly number[]): boolean {
  if (i + sig.length > b.length) return false;
  return sig.every((v, k) => b[i + k] === v);
}


function indexOfAscii(b: Uint8Array, text: string, from = 0): number {
  const first = text.charCodeAt(0);
  outer: for (let i = Math.max(0, from); i + text.length <= b.length; i++) {
    if (b[i] !== first) continue;
    for (let k = 1; k < text.length; k++) if (b[i + k] !== text.charCodeAt(k)) continue outer;
    return i;
  }
  return -1;
}

export function sniffImage(bytes: Uint8Array, part?: SniffPart): Sniff {
  try {
    // A part that covers the whole file is the whole file.
    const whole = !part || part.size <= bytes.length;
    const tail = whole ? null : part!.tail;
    if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return sniffJpeg(bytes, whole);
    if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return sniffPng(bytes, whole, tail);
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return sniffWebp(bytes);
    if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return sniffGif(bytes);
    if (ascii(bytes, 0, 2) === 'BM' && bytes.length >= 30) return sniffBmp(bytes);
    if (ascii(bytes, 4, 4) === 'ftyp') return sniffIsoBmff(bytes);
    if (startsWith(bytes, 0, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a])) return empty('tiff');
    return empty('unknown');
  } catch {
    return empty('unknown');
  }
}

// ---------- JPEG ----------

function isSof(m: number): boolean {
  return m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
}

/**
 * End of the entropy-coded data that starts at `from`: the index of the next marker's FF. Stuffed FF 00,
 * restart markers FF D0–D7 and fill bytes belong to the data. Returns -1 when the bytes end first.
 */
export function scanEnd(b: Uint8Array, from: number): number {
  let j = from;
  while (j + 1 < b.length) {
    if (b[j] !== 0xff) {
      j++;
      continue;
    }
    const n = b[j + 1]!;
    if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) j += 2;
    else if (n === 0xff) j++;
    else return j;
  }
  return -1;
}

/**
 * Walks every segment, including those between the scans of a progressive JPEG (APPn/COM may sit there),
 * up to the first EOI. A partial view stops where the head ends and never calls the file truncated: a
 * complete file may end in a large trailer after its EOI (a motion-photo video), so only the worker, which
 * reads the whole file, decides.
 */
function sniffJpeg(b: Uint8Array, whole: boolean): Sniff {
  const s = empty('jpeg');
  let i = 2;
  let sawEoi = false;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) break; // not a marker where one must be: stop parsing
    let m = b[i + 1]!;
    while (m === 0xff && i + 2 < b.length) {
      i++; // fill bytes
      m = b[i + 1]!;
    }
    if (m === 0xd9) {
      sawEoi = true;
      break;
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = u16be(b, i + 2);
    if (len < 2) break;
    const body = i + 4;
    if (m === 0xe1) readApp1(b, body, len - 2, s);
    else if (isSof(m) && body + 5 < b.length) {
      s.height = u16be(b, body + 1);
      s.width = u16be(b, body + 3);
      s.cmyk = b[body + 5] === 4;
      s.progressive = m === 0xc2 || m === 0xc6 || m === 0xca || m === 0xce;
    }
    i += 2 + len;
    if (m === 0xda) {
      const next = scanEnd(b, i);
      if (next < 0) break;
      i = next;
    }
  }
  if (whole && !sawEoi) s.truncated = true;
  return s;
}

/** APP1: EXIF (orientation, GPS) or XMP. */
function readApp1(b: Uint8Array, start: number, len: number, s: Sniff): void {
  const end = Math.min(b.length, start + len);
  if (ascii(b, start, 6) === 'Exif\0\0') {
    s.hasExif = true;
    readTiff(b, start + 6, end, s);
  } else if (ascii(b, start, 29) === 'http://ns.adobe.com/xap/1.0/\0') {
    s.hasXmp = true;
  }
}

function readTiff(b: Uint8Array, t: number, end: number, s: Sniff, orientation = true): void {
  const order = ascii(b, t, 2);
  if (order !== 'II' && order !== 'MM') return;
  const le = order === 'II';
  const r16 = (o: number): number => (o + 1 < end ? (le ? u16le(b, o) : u16be(b, o)) : -1);
  const r32 = (o: number): number => (o + 3 < end ? (le ? u32le(b, o) : u32be(b, o)) : -1);
  if (r16(t + 2) !== 42) return;
  const ifd = r32(t + 4);
  if (ifd < 8) return;
  const n = r16(t + ifd);
  if (n < 0) return;
  for (let k = 0; k < n && k < 1000; k++) {
    const e = t + ifd + 2 + k * 12;
    if (e + 12 > end) break;
    const tag = r16(e);
    if (tag === 0x0112) {
      if (!orientation) continue;
      const v = r16(e + 8);
      if (v >= 1 && v <= 8) s.orientation = v;
    } else if (tag === 0x8825) {
      s.hasGps = true;
    }
  }
}

// ---------- PNG ----------

function sniffPng(b: Uint8Array, whole: boolean, tail: Uint8Array | null): Sniff {
  const s = empty('png');
  if (ascii(b, 12, 4) === 'IHDR') {
    s.width = u32be(b, 16);
    s.height = u32be(b, 20);
    const colourType = b[25];
    if (colourType === 4 || colourType === 6) s.alphaPossible = true;
  }
  let i = 8;
  let sawIdat = false;
  let sawEnd = false;
  while (i + 8 <= b.length) {
    const len = u32be(b, i);
    const type = ascii(b, i + 4, 4);
    if (len < 0 || !/^[A-Za-z]{4}$/.test(type)) break;
    if (type === 'IDAT') sawIdat = true;
    else if (type === 'acTL' && !sawIdat) s.animated = true;
    else if (type === 'tRNS') s.alphaPossible = true;
    else if (type === 'eXIf') {
      // EXIF in PNG (GPS included). Orientation is left to the decoder; it is re-encoded anyway.
      s.hasExif = true;
      readTiff(b, i + 8, Math.min(b.length, i + 8 + len), s, false);
    } else if (type === 'iTXt' && ascii(b, i + 8, 17) === 'XML:com.adobe.xmp') s.hasXmp = true;
    else if (type === 'IEND') {
      sawEnd = true;
      break;
    }
    i += 12 + len;
  }
  if (whole) s.truncated = !sawEnd;
  else s.truncated = indexOfAscii(tail!, 'IEND') < 0;
  return s;
}

// ---------- WebP ----------

function sniffWebp(b: Uint8Array): Sniff {
  const s = empty('webp');
  let i = 12;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const len = u32le(b, i + 4);
    if (len < 0) break;
    const d = i + 8;
    if (type === 'VP8X') {
      const flags = b[d] ?? 0;
      if (flags & 0x10) s.alphaPossible = true;
      if (flags & 0x02) s.animated = true;
      if (flags & 0x08) s.hasExif = true;
      if (flags & 0x04) s.hasXmp = true;
      const w = u24le(b, d + 4);
      const h = u24le(b, d + 7);
      if (w >= 0 && h >= 0) {
        s.width = w + 1;
        s.height = h + 1;
      }
    } else if (type === 'VP8 ') {
      if (s.width === undefined && b[d + 3] === 0x9d && b[d + 4] === 0x01 && b[d + 5] === 0x2a) {
        s.width = u16le(b, d + 6) & 0x3fff;
        s.height = u16le(b, d + 8) & 0x3fff;
      }
    } else if (type === 'VP8L') {
      s.alphaPossible = true;
      if (s.width === undefined && b[d] === 0x2f && d + 4 < b.length) {
        const v = u32le(b, d + 1);
        s.width = (v & 0x3fff) + 1;
        s.height = ((v >>> 14) & 0x3fff) + 1;
      }
    } else if (type === 'ANIM' || type === 'ANMF') {
      s.animated = true;
    } else if (type === 'ALPH') {
      s.alphaPossible = true;
    } else if (type === 'EXIF') {
      s.hasExif = true;
      const t = ascii(b, d, 6) === 'Exif\0\0' ? d + 6 : d;
      readTiff(b, t, Math.min(b.length, d + len), s, false);
    } else if (type === 'XMP ') {
      s.hasXmp = true;
    }
    i = d + len + (len & 1);
  }
  return s;
}

// ---------- GIF ----------

function sniffGif(b: Uint8Array): Sniff {
  const s = empty('gif');
  s.width = u16le(b, 6);
  s.height = u16le(b, 8);
  const packed = b[10] ?? 0;
  let i = 13;
  if (packed & 0x80) i += 3 * (1 << ((packed & 7) + 1));
  let images = 0;
  const skipSubBlocks = (p: number): number => {
    while (p < b.length) {
      const n = b[p]!;
      p += 1;
      if (n === 0) return p;
      p += n;
    }
    return -1;
  };
  while (i < b.length) {
    const block = b[i]!;
    if (block === 0x2c) {
      images++;
      if (images > 1) break;
      const flags = b[i + 9] ?? 0;
      i += 10;
      if (flags & 0x80) i += 3 * (1 << ((flags & 7) + 1));
      i += 1; // LZW minimum code size
      i = skipSubBlocks(i);
      if (i < 0) break;
    } else if (block === 0x21) {
      // Graphic control extension: bit 0 of its packed byte = a transparent colour index.
      if (b[i + 1] === 0xf9 && ((b[i + 3] ?? 0) & 1)) s.alphaPossible = true;
      i = skipSubBlocks(i + 2);
      if (i < 0) break;
    } else {
      break; // 0x3B trailer or garbage
    }
  }
  s.animated = images > 1;
  return s;
}

// ---------- BMP ----------

function sniffBmp(b: Uint8Array): Sniff {
  const s = empty('bmp');
  s.width = Math.abs(i32le(b, 18));
  s.height = Math.abs(i32le(b, 22));
  if (u16le(b, 28) === 32) s.alphaPossible = true;
  return s;
}

// ---------- HEIC / AVIF (ISOBMFF) ----------

function sniffIsoBmff(b: Uint8Array): Sniff {
  const boxSize = u32be(b, 0);
  const brands: string[] = [ascii(b, 8, 4)];
  for (let o = 16; o + 4 <= Math.min(b.length, boxSize); o += 4) brands.push(ascii(b, o, 4));
  const major = brands[0]!;
  let format: ImageFormat;
  if (AVIF_BRANDS.has(major)) format = 'avif';
  else if (HEIC_BRANDS.has(major) && major !== 'mif1' && major !== 'msf1') format = 'heic';
  else if (brands.some((x) => AVIF_BRANDS.has(x))) format = 'avif';
  else if (brands.some((x) => HEIC_BRANDS.has(x))) format = 'heic';
  else return empty('unknown');
  const s = empty(format);
  // The largest 'ispe' (image spatial extents) is the primary image; thumbnails are smaller.
  let at = indexOfAscii(b, 'ispe');
  let best = 0;
  while (at >= 0) {
    const w = u32be(b, at + 8);
    const h = u32be(b, at + 12);
    if (w > 0 && h > 0 && w * h > best) {
      best = w * h;
      s.width = w;
      s.height = h;
    }
    at = indexOfAscii(b, 'ispe', at + 4);
  }
  // Either may hold an alpha plane (an auxiliary image); the pixel scan decides.
  s.alphaPossible = true;
  // An 'Exif' item (item type in iinf) may carry GPS: count it as EXIF (privacy first; it is re-encoded).
  if (indexOfAscii(b, 'Exif') >= 0) s.hasExif = true;
  return s;
}

/** Stored dims swapped for EXIF orientations 5–8 (the image is displayed rotated by 90°). */
export function orientedSize(s: Sniff): { width: number; height: number } | null {
  if (!s.width || !s.height) return null;
  return s.orientation && s.orientation >= 5 ? { width: s.height, height: s.width } : { width: s.width, height: s.height };
}
