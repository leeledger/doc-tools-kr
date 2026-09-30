// WOFF 1.0 → SFNT (TrueType) in pure JS (zlib per table, via fflate). Shared by the harness and Node checks.
import { unzlibSync } from 'fflate';
export function woffToSfnt(w) {
  const v = new DataView(w.buffer, w.byteOffset, w.byteLength);
  if (v.getUint32(0) !== 0x774f4646) throw new Error('not WOFF');
  const flavor = v.getUint32(4);
  const n = v.getUint16(12);
  const tables = [];
  for (let i = 0; i < n; i++) {
    const o = 44 + i * 20;
    const tag = v.getUint32(o), off = v.getUint32(o + 4), comp = v.getUint32(o + 8), orig = v.getUint32(o + 12), sum = v.getUint32(o + 16);
    const raw = w.subarray(off, off + comp);
    tables.push({ tag, data: comp < orig ? unzlibSync(raw) : raw, sum });
  }
  let size = 12 + 16 * n;
  for (const t of tables) size += (t.data.length + 3) & ~3;
  const out = new Uint8Array(size);
  const o = new DataView(out.buffer);
  let es = 0;
  while (1 << (es + 1) <= n) es++;
  o.setUint32(0, flavor); o.setUint16(4, n); o.setUint16(6, (1 << es) * 16); o.setUint16(8, es); o.setUint16(10, n * 16 - (1 << es) * 16);
  let off = 12 + 16 * n;
  tables.forEach((t, i) => {
    o.setUint32(12 + i * 16, t.tag); o.setUint32(16 + i * 16, t.sum); o.setUint32(20 + i * 16, off); o.setUint32(24 + i * 16, t.data.length);
    out.set(t.data, off);
    off += (t.data.length + 3) & ~3;
  });
  return out;
}
