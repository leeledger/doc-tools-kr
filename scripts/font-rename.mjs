// Renames a TrueType/OpenType font (sfnt) by rewriting its `name` table.
// Used for our Pretendard subset: under the SIL OFL 1.1 a Modified Version must not use the
// Reserved Font Name, so every name record that contains it is rewritten. Copyright (0),
// trademark (7) and license (13, 14) records are kept verbatim.
const KEEP_IDS = new Set([0, 7, 13, 14]);

const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const tagAt = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

/** Windows/Unicode platforms store UTF-16BE; Mac (1) stores single-byte Roman (ASCII here). */
const isUtf16 = (platformID) => platformID === 0 || platformID === 3;

function decode(bytes, platformID) {
  if (!isUtf16(platformID)) return String.fromCharCode(...bytes);
  let s = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode(u16(bytes, i));
  return s;
}

function encode(str, platformID) {
  if (!isUtf16(platformID)) return Uint8Array.from(str, (c) => c.charCodeAt(0) & 0xff);
  const out = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    out[i * 2] = str.charCodeAt(i) >> 8;
    out[i * 2 + 1] = str.charCodeAt(i) & 0xff;
  }
  return out;
}

function checksum(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    sum = (sum + ((bytes[i] << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0))) >>> 0;
  }
  return sum;
}

function buildNameTable(name, from, to, toPostScript) {
  const count = u16(name, 2);
  const storage = u16(name, 4);
  const records = [];
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 12;
    const rec = {
      platformID: u16(name, o),
      encodingID: u16(name, o + 2),
      languageID: u16(name, o + 4),
      nameID: u16(name, o + 6),
    };
    const len = u16(name, o + 8);
    const off = u16(name, o + 10);
    let bytes = name.slice(storage + off, storage + off + len);
    if (!KEEP_IDS.has(rec.nameID)) {
      const text = decode(bytes, rec.platformID);
      if (text.includes(from)) {
        // PostScript-style names (6, 25, fvar instance names) have no spaces; keep it that way.
        const replacement = rec.nameID === 6 || rec.nameID === 25 || !/\s/.test(text) ? toPostScript : to;
        bytes = encode(text.split(from).join(replacement), rec.platformID);
      }
    }
    records.push({ ...rec, bytes });
  }
  const header = 6 + records.length * 12;
  const total = header + records.reduce((a, r) => a + r.bytes.length, 0);
  const out = new Uint8Array(total);
  const w16 = (o, v) => {
    out[o] = v >> 8;
    out[o + 1] = v & 0xff;
  };
  w16(0, 0);
  w16(2, records.length);
  w16(4, header);
  let off = 0;
  records.forEach((r, i) => {
    const o = 6 + i * 12;
    w16(o, r.platformID);
    w16(o + 2, r.encodingID);
    w16(o + 4, r.languageID);
    w16(o + 6, r.nameID);
    w16(o + 8, r.bytes.length);
    w16(o + 10, off);
    out.set(r.bytes, header + off);
    off += r.bytes.length;
  });
  return out;
}

/** Returns the names found in the `name` table (nameID -> first string), for verification. */
export function readNames(sfnt) {
  const b = sfnt instanceof Uint8Array ? sfnt : new Uint8Array(sfnt);
  const numTables = u16(b, 4);
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    if (tagAt(b, o) !== 'name') continue;
    const name = b.slice(u32(b, o + 8), u32(b, o + 8) + u32(b, o + 12));
    const storage = u16(name, 4);
    const names = {};
    for (let k = 0; k < u16(name, 2); k++) {
      const r = 6 + k * 12;
      const id = u16(name, r + 6);
      const len = u16(name, r + 8);
      const off = u16(name, r + 10);
      names[id] ??= decode(name.slice(storage + off, storage + off + len), u16(name, r));
    }
    return names;
  }
  return {};
}

/** Rewrites `from` to `to` in the name table and re-lays out the sfnt with correct checksums. */
export function renameFont(sfnt, from, to) {
  const b = sfnt instanceof Uint8Array ? sfnt : new Uint8Array(sfnt);
  const sfntVersion = b.slice(0, 4);
  const numTables = u16(b, 4);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    const tag = tagAt(b, o);
    const offset = u32(b, o + 8);
    const length = u32(b, o + 12);
    tables.push({ tag, data: b.slice(offset, offset + length) });
  }
  const name = tables.find((t) => t.tag === 'name');
  const head = tables.find((t) => t.tag === 'head');
  if (!name || !head) throw new Error('font-rename: name or head table missing');
  name.data = buildNameTable(name.data, from, to, to.replace(/\s+/g, ''));
  head.data = head.data.slice();
  head.data.fill(0, 8, 12); // checkSumAdjustment, recomputed below

  tables.sort((x, y) => (x.tag < y.tag ? -1 : 1));
  const dirSize = 12 + tables.length * 16;
  const pad4 = (n) => (n + 3) & ~3;
  const total = dirSize + tables.reduce((a, t) => a + pad4(t.data.length), 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set(sfntVersion, 0);
  const entrySelector = Math.floor(Math.log2(tables.length));
  const searchRange = 2 ** entrySelector * 16;
  view.setUint16(4, tables.length);
  view.setUint16(6, searchRange);
  view.setUint16(8, entrySelector);
  view.setUint16(10, tables.length * 16 - searchRange);
  let offset = dirSize;
  let headOffset = 0;
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[o + k] = t.tag.charCodeAt(k);
    view.setUint32(o + 4, checksum(t.data));
    view.setUint32(o + 8, offset);
    view.setUint32(o + 12, t.data.length);
    out.set(t.data, offset);
    if (t.tag === 'head') headOffset = offset;
    offset += pad4(t.data.length);
  });
  view.setUint32(headOffset + 8, (0xb1b0afba - checksum(out)) >>> 0);
  return out;
}
