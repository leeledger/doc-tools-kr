// JFIF density (brief Step 4 §2). Pure. `setJfifDpi` writes units = 1 (dots per inch) and X = Y = dpi into
// the APP0 JFIF segment, or inserts a 16-byte JFIF APP0 right after SOI when the file has none. The pixel
// data is never touched, so the image dimensions stay the same. Idempotent; throws on a non-JPEG.

export class JfifError extends Error {}

const isJpeg = (b: Uint8Array): boolean => b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** Offset of the APP0 JFIF segment's marker (FF E0), or -1. Only segments before the first SOS are walked. */
function findJfif(b: Uint8Array): number {
  let i = 2;
  while (i + 3 < b.length && b[i] === 0xff) {
    const m = b[i + 1]!;
    if (m === 0xda || m === 0xd9) return -1;
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    if (len < 2) return -1;
    if (m === 0xe0 && len >= 16 && i + 2 + len <= b.length && b[i + 4] === 0x4a && b[i + 5] === 0x46 && b[i + 6] === 0x49 && b[i + 7] === 0x46 && b[i + 8] === 0) {
      return i;
    }
    i += 2 + len;
  }
  return -1;
}

export function readJfif(bytes: Uint8Array): { units: number; x: number; y: number } | null {
  if (!isJpeg(bytes)) throw new JfifError('not a JPEG');
  const i = findJfif(bytes);
  if (i < 0) return null;
  return { units: bytes[i + 11]!, x: (bytes[i + 12]! << 8) | bytes[i + 13]!, y: (bytes[i + 14]! << 8) | bytes[i + 15]! };
}

export function setJfifDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  if (!isJpeg(bytes)) throw new JfifError('not a JPEG');
  if (!Number.isInteger(dpi) || dpi < 1 || dpi > 0xffff) throw new JfifError(`invalid dpi ${dpi}`);
  const i = findJfif(bytes);
  if (i >= 0) {
    const out = bytes.slice();
    out[i + 11] = 1;
    out[i + 12] = dpi >> 8;
    out[i + 13] = dpi & 0xff;
    out[i + 14] = dpi >> 8;
    out[i + 15] = dpi & 0xff;
    return out;
  }
  // FF E0, length 16, "JFIF\0", version 1.01, units 1, X, Y, no thumbnail.
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, dpi >> 8, dpi & 0xff, dpi >> 8, dpi & 0xff, 0x00, 0x00];
  const out = new Uint8Array(bytes.length + app0.length);
  out.set(bytes.subarray(0, 2), 0);
  out.set(app0, 2);
  out.set(bytes.subarray(2), 2 + app0.length);
  return out;
}
