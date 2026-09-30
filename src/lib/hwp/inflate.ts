// Raw DEFLATE with an output cap (brief Step 5 §2: zip-bomb guard). fflate's streaming Inflate is fed in
// 64 KB chunks and the output is counted as it arrives, so a hostile stream is stopped at the cap instead
// of after it has filled memory.
import { Inflate } from 'fflate';

/** 512 MB (1,000,000-byte MB, as every limit of this tool). */
export const INFLATE_CAP = 512 * 1_000_000;
const CHUNK = 64 * 1024;

export class InflateCapError extends Error {
  constructor() {
    super('inflate output over the cap');
    this.name = 'InflateCapError';
  }
}

/**
 * Inflates raw DEFLATE data. Throws InflateCapError past `cap` output bytes, and a plain Error when the
 * stream is invalid or truncated (the zlib `decompress(raw, -15)` failures of the spike scan).
 */
export function inflateRawCapped(data: Uint8Array, cap: number = INFLATE_CAP): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;
  const inf = new Inflate((chunk) => {
    total += chunk.length;
    if (total > cap) throw new InflateCapError();
    parts.push(chunk);
  });
  if (data.length === 0) inf.push(new Uint8Array(0), true);
  for (let off = 0; off < data.length; off += CHUNK) inf.push(data.subarray(off, Math.min(off + CHUNK, data.length)), off + CHUNK >= data.length);
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
