// 도장 만들기 (STAMP1015 D6): the PNG carries its pixel density in a pHYs chunk (pixels per metre), inserted right after
// IHDR with its CRC; an existing pHYs is replaced. Pure bytes in, bytes out.

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let table: Uint32Array | null = null;

/** CRC-32 (ISO-HDLC, as PNG uses) of `bytes`. */
export function crc32(bytes: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = table[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Pixels per metre of `ppi` (600 -> 23,622). */
export function ppiToPpm(ppi: number): number {
  return Math.round(ppi / 0.0254);
}

function isPng(b: Uint8Array): boolean {
  return b.length >= 33 && SIGNATURE.every((v, i) => b[i] === v) && String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!) === 'IHDR';
}

interface Chunk {
  type: string;
  start: number;
  end: number;
}

function chunks(b: Uint8Array): Chunk[] {
  const out: Chunk[] = [];
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 8;
  while (at + 12 <= b.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(b[at + 4]!, b[at + 5]!, b[at + 6]!, b[at + 7]!);
    const end = at + 12 + len;
    if (end > b.length) break;
    out.push({ type, start: at, end });
    at = end;
    if (type === 'IEND') break;
  }
  return out;
}

/** `png` with a pHYs chunk of `ppi` (both axes, unit metre) right after IHDR. Throws on bytes that are not a PNG. */
export function withPhys(png: Uint8Array, ppi: number): Uint8Array {
  if (!isPng(png)) throw new Error('not a PNG');
  const ppm = ppiToPpm(ppi);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const kept = chunks(png).filter((c) => c.type !== 'pHYs');
  const ihdr = kept[0]!;
  const parts: Uint8Array[] = [png.subarray(0, ihdr.end), chunk, ...kept.slice(1).map((c) => png.subarray(c.start, c.end))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The pHYs of a PNG: pixels per unit on both axes and the unit (1 = metre), or null when there is none. */
export function readPhys(png: Uint8Array): { x: number; y: number; unit: number; crcOk: boolean; afterIhdr: boolean } | null {
  if (!isPng(png)) return null;
  const list = chunks(png);
  const i = list.findIndex((c) => c.type === 'pHYs');
  if (i < 0) return null;
  const c = list[i]!;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const crc = view.getUint32(c.end - 4);
  return {
    x: view.getUint32(c.start + 8),
    y: view.getUint32(c.start + 12),
    unit: png[c.start + 16]!,
    crcOk: crc === crc32(png.subarray(c.start + 4, c.end - 4)),
    afterIhdr: i === 1,
  };
}
