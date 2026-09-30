// WOFF 1.0 → SFNT (SPIKE-HWP-DIRECT §6.2). The PDF path embeds fonts through @cantoo/fontkit, whose subsetter
// writes broken glyphs from a WOFF2 source (measured in the spike: every glyph a box or invisible). It reads the
// WOFF 1.0 sibling of each slice instead and unwraps it here: every table is zlib (or stored), so fflate is
// enough and no Brotli decoder ships.
import { unzlibSync } from 'fflate';

const WOFF = 0x774f4646; // 'wOFF'

export function woffToSfnt(w: Uint8Array): Uint8Array {
  if (w.byteLength < 44) throw new Error('not WOFF');
  const v = new DataView(w.buffer, w.byteOffset, w.byteLength);
  if (v.getUint32(0) !== WOFF) throw new Error('not WOFF');
  const flavor = v.getUint32(4);
  const n = v.getUint16(12);
  if (44 + n * 20 > w.byteLength) throw new Error('WOFF table directory out of range');
  const tables: { tag: number; data: Uint8Array; sum: number }[] = [];
  for (let i = 0; i < n; i++) {
    const o = 44 + i * 20;
    const tag = v.getUint32(o);
    const off = v.getUint32(o + 4);
    const comp = v.getUint32(o + 8);
    const orig = v.getUint32(o + 12);
    const sum = v.getUint32(o + 16);
    if (off + comp > w.byteLength) throw new Error('WOFF table out of range');
    const raw = w.subarray(off, off + comp);
    const data = comp < orig ? unzlibSync(raw) : raw;
    if (data.length !== orig) throw new Error('WOFF table size mismatch');
    tables.push({ tag, data, sum });
  }
  let size = 12 + 16 * n;
  for (const t of tables) size += (t.data.length + 3) & ~3;
  const out = new Uint8Array(size);
  const o = new DataView(out.buffer);
  let es = 0;
  while (1 << (es + 1) <= n) es++;
  o.setUint32(0, flavor);
  o.setUint16(4, n);
  o.setUint16(6, (1 << es) * 16);
  o.setUint16(8, es);
  o.setUint16(10, n * 16 - (1 << es) * 16);
  let off = 12 + 16 * n;
  tables.forEach((t, i) => {
    o.setUint32(12 + i * 16, t.tag);
    o.setUint32(16 + i * 16, t.sum);
    o.setUint32(20 + i * 16, off);
    o.setUint32(24 + i * 16, t.data.length);
    out.set(t.data, off);
    off += (t.data.length + 3) & ~3;
  });
  return out;
}
