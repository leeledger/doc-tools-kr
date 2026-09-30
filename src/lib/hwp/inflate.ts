// Raw DEFLATE with an output cap (brief Step 5 §2: zip-bomb guard). fflate's streaming Inflate is fed in
// 4 KB input chunks and every output chunk is counted and handed on as it arrives; nothing is buffered here.
// DEFLATE expands at most ~1032:1, so one push emits at most ~4 MB and the cap is enforced within that
// margin, before the rest of the stream is inflated (Richard, Step 5 round 2, Should Fix 3).
import { Inflate } from 'fflate';

/** 512 MB (1,000,000-byte MB, as every limit of this tool): the desktop cap; see LIMITS.inflateCap. */
export const INFLATE_CAP = 512 * 1_000_000;
const CHUNK = 4 * 1024;

export class InflateCapError extends Error {
  constructor() {
    super('inflate output over the cap');
    this.name = 'InflateCapError';
  }
}

/**
 * Inflates raw DEFLATE data chunk by chunk into `onChunk` (the chunk is only valid during the call). Returns
 * the output size. Throws InflateCapError as soon as the output passes `cap`, and a plain Error when the
 * stream is invalid or truncated (the zlib `decompress(raw, -15)` failures of the spike scan).
 */
export function inflateRawStream(data: Uint8Array, cap: number, onChunk: (chunk: Uint8Array) => void): number {
  let total = 0;
  const inf = new Inflate((chunk) => {
    total += chunk.length;
    if (total > cap) throw new InflateCapError();
    onChunk(chunk);
  });
  if (data.length === 0) inf.push(new Uint8Array(0), true);
  for (let off = 0; off < data.length; off += CHUNK) inf.push(data.subarray(off, Math.min(off + CHUNK, data.length)), off + CHUNK >= data.length);
  return total;
}

/** inflateRawStream collected into one buffer (small entries only: the ZIP mimetype, tests). */
export function inflateRawCapped(data: Uint8Array, cap: number = INFLATE_CAP): Uint8Array {
  const parts: Uint8Array[] = [];
  const total = inflateRawStream(data, cap, (c) => parts.push(c.slice()));
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
