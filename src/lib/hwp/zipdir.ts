// Read-only ZIP directory for HWPX (brief Step 5 §2). Pure. EOCD plus central directory; entries are read
// through their local header. ZIP64 is refused (UnsupportedError): a file that needs it is far over every
// cap. Structural damage is a CorruptError; an entry over the inflate cap is a CorruptError too.
import { CorruptError, UnsupportedError } from './errors';
import { INFLATE_CAP, InflateCapError, inflateRawCapped } from './inflate';

export interface ZipEntry {
  name: string;
  compressedSize: number;
  size: number;
  method: number;
  offset: number;
}

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;
const EOCD_MIN = 22;
const utf8 = new TextDecoder('utf-8');

function view(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

export function readZipDir(bytes: Uint8Array): ZipEntry[] {
  const dv = view(bytes);
  if (bytes.length < EOCD_MIN) throw new CorruptError('zip: too short');
  let eocd = -1;
  const stop = Math.max(0, bytes.length - EOCD_MIN - 0xffff);
  for (let i = bytes.length - EOCD_MIN; i >= stop; i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new CorruptError('zip: no end of central directory');
  if (eocd >= 20 && dv.getUint32(eocd - 20, true) === EOCD64_LOCATOR_SIG) throw new UnsupportedError('zip: ZIP64');
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new UnsupportedError('zip: ZIP64');
  if (cdOffset + cdSize > eocd) throw new CorruptError('zip: central directory outside the file');
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > eocd || dv.getUint32(p, true) !== CEN_SIG) throw new CorruptError('zip: bad central directory entry');
    const method = dv.getUint16(p + 10, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    if (compressedSize === 0xffffffff || size === 0xffffffff || offset === 0xffffffff) throw new UnsupportedError('zip: ZIP64');
    if (p + 46 + nameLen > eocd) throw new CorruptError('zip: entry name outside the directory');
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, compressedSize, size, method, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** The entry's data, inflated (method 8) or stored (method 0), at most `cap` bytes. */
export function readEntry(bytes: Uint8Array, e: ZipEntry, cap: number = INFLATE_CAP): Uint8Array {
  const dv = view(bytes);
  if (e.offset + 30 > bytes.length || dv.getUint32(e.offset, true) !== LOC_SIG) throw new CorruptError(`zip: bad local header for ${e.name}`);
  const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
  const end = start + e.compressedSize;
  if (end > bytes.length) throw new CorruptError(`zip: ${e.name} runs past the end of the file`);
  const data = bytes.subarray(start, end);
  if (e.method === 0) {
    if (data.length > cap) throw new CorruptError(`zip: ${e.name} over the size cap`);
    return data;
  }
  if (e.method !== 8) throw new CorruptError(`zip: ${e.name} uses compression method ${e.method}`);
  try {
    return inflateRawCapped(data, cap);
  } catch (err) {
    if (err instanceof InflateCapError) throw new CorruptError(`zip: ${e.name} inflates past the cap`);
    throw new CorruptError(`zip: ${e.name} does not inflate`);
  }
}
