// Lossless JPEG metadata strip (brief Step 3 §2). Keeps what decoding needs and drops the rest:
// - before the first scan: JFIF APP0, the ICC profile (APP2), Adobe APP14, the coding tables and the frame
// - every scan: its SOS header and entropy-coded data, and the tables between scans (DHT, DQT, DRI, DAC, DNL)
// - dropped everywhere: EXIF/XMP (APP1), MPF and other APP2, APP3–APP15 other than Adobe, COM, and every
//   byte after EOI (MPF secondary images and vendor trailers can carry GPS)
// The file is walked segment by segment, including between the scans of a progressive JPEG, so metadata
// placed there is dropped too, and an FF D9 inside a segment payload is never taken for the end.
import { scanEnd, sniffImage } from './sniff';

export class JpegStripError extends Error {}

/** Coding tables and frame headers kept before the first SOS: DQT, DHT, DAC (arithmetic), DRI, every SOFn. */
function isHeaderTable(m: number): boolean {
  return m === 0xdb || m === 0xc4 || m === 0xcc || m === 0xdd || (m >= 0xc0 && m <= 0xcf && m !== 0xc8);
}

/** Tables allowed between scans: DQT, DHT, DAC, DRI and DNL. */
function isScanTable(m: number): boolean {
  return m === 0xdb || m === 0xc4 || m === 0xcc || m === 0xdd || m === 0xdc;
}

function hasPrefix(b: Uint8Array, at: number, text: string): boolean {
  if (at + text.length > b.length) return false;
  for (let k = 0; k < text.length; k++) if (b[at + k] !== text.charCodeAt(k)) return false;
  return true;
}

export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new JpegStripError('not a JPEG');
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  let scans = 0;
  let ended = false;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) throw new JpegStripError('marker expected');
    const m = bytes[i + 1]!;
    if (m === 0xff) {
      i++; // fill byte
      continue;
    }
    if (m === 0xd9) {
      if (!scans) throw new JpegStripError('no image data');
      parts.push(bytes.subarray(i, i + 2));
      ended = true;
      break;
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) throw new JpegStripError('unexpected standalone marker');
    if (i + 3 >= bytes.length) break;
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (len < 2 || i + 2 + len > bytes.length) throw new JpegStripError('segment overruns the file');
    const end = i + 2 + len;
    const body = i + 4;
    if (m === 0xda) {
      const data = scanEnd(bytes, end);
      if (data < 0) throw new JpegStripError('scan data runs to the end of the file');
      parts.push(bytes.subarray(i, data));
      scans++;
      i = data;
      continue;
    }
    const keep = scans
      ? isScanTable(m)
      : isHeaderTable(m) ||
        (m === 0xe0 && hasPrefix(bytes, body, 'JFIF\0')) ||
        (m === 0xe2 && hasPrefix(bytes, body, 'ICC_PROFILE\0')) ||
        (m === 0xee && hasPrefix(bytes, body, 'Adobe'));
    if (keep) parts.push(bytes.subarray(i, end));
    i = end;
  }
  if (!ended) throw new JpegStripError('no end of image');

  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  const before = sniffImage(bytes);
  const after = sniffImage(out);
  if (
    after.format !== 'jpeg' ||
    after.truncated ||
    after.width !== before.width ||
    after.height !== before.height ||
    after.hasExif ||
    after.hasXmp ||
    after.hasGps
  ) {
    throw new JpegStripError('stripped file does not re-sniff as the same, metadata-free JPEG');
  }
  return out;
}
