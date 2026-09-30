// Test-time HWP fixtures (brief Step 5 "Generated at test time, not committed"): truncated, password- and
// distribution-patched law05, a .docx-style zip, law05 padded over 10 MB, adm14 with a 9 MB stored BinData entry.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Deflate, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { openCfb } from '../../src/lib/hwp/cfb';
import { writeCfb } from './cfb-writer';

export const HWP_CORPUS = join(process.cwd(), 'tests', 'corpus', 'hwp');
export const hwpFixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(HWP_CORPUS, name)));

export function cfbStreams(bytes: Uint8Array): { path: string; data: Uint8Array }[] {
  const cfb = openCfb(bytes);
  return cfb.listStreams().map((s) => ({ path: s.path, data: cfb.readStream(s.path)! }));
}

/** A copy of an HWP 5 file with FileHeader props (u32 at 36) OR-ed with `bits`, rewritten as a fresh CFB. */
export function patchHwpFlags(bytes: Uint8Array, bits: number): Uint8Array {
  const streams = cfbStreams(bytes).map((s) => {
    if (s.path !== 'FileHeader') return s;
    const data = s.data.slice();
    const dv = new DataView(data.buffer);
    dv.setUint32(36, (dv.getUint32(36, true) | bits) >>> 0, true);
    return { path: s.path, data };
  });
  return writeCfb(streams).bytes;
}

export const PASSWORD_BIT = 2;
export const DISTRIBUTION_BIT = 4;

/** An HWP 5 file with an extra non-BinData stream, so only the file size grows (not the image total). */
export function padHwp(bytes: Uint8Array, totalBytes: number): Uint8Array {
  const streams = cfbStreams(bytes);
  const pad = new Uint8Array(Math.max(0, totalBytes - bytes.length));
  for (let i = 0; i < pad.length; i += 4096) pad[i] = (i / 4096) & 255;
  return writeCfb([...streams, { path: 'Pad', data: pad }]).bytes;
}

/** An HWPX with an extra stored BinData/pad.bin of `padBytes` (the image cap test). */
export function padHwpxBinData(bytes: Uint8Array, padBytes: number): Uint8Array {
  const entries = unzipSync(bytes);
  const out: Zippable = {};
  out.mimetype = [entries.mimetype, { level: 0 }];
  for (const [name, data] of Object.entries(entries)) if (name !== 'mimetype') out[name] = [data, { level: 6 }];
  const pad = new Uint8Array(padBytes);
  for (let i = 0; i < pad.length; i += 997) pad[i] = i & 255;
  out['BinData/pad.bin'] = [pad, { level: 0 }];
  return zipSync(out);
}

/** A .docx-shaped zip (what a renamed Word file looks like). */
export function docxLikeZip(): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'word/document.xml': strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>'),
  });
}

/**
 * A zip bomb shaped like an HWPX: a stored mimetype and a Contents/section0.xml that inflates to `outBytes`
 * of '<'-free filler (built with a streaming deflater, so building it never holds `outBytes` in memory).
 */
export function hwpxZipBomb(outBytes: number): Uint8Array {
  const parts: Uint8Array[] = [];
  const def = new Deflate({ level: 9 }, (chunk) => parts.push(chunk));
  const block = new Uint8Array(1 << 20).fill(0x20);
  for (let left = outBytes; left > 0; left -= block.length) def.push(left > block.length ? block : block.subarray(0, left), left <= block.length);
  const data = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    data.set(p, o);
    o += p.length;
  }
  const mime = strToU8('application/hwp+zip');
  const entries = [
    { name: strToU8('mimetype'), method: 0, data: mime, size: mime.length },
    { name: strToU8('Contents/section0.xml'), method: 8, data, size: outBytes >>> 0 },
  ];
  const out: number[] = [];
  const u16 = (v: number) => out.push(v & 255, (v >>> 8) & 255);
  const u32 = (v: number) => out.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255);
  const offsets: number[] = [];
  const chunks: Uint8Array[] = [];
  let pos = 0;
  for (const e of entries) {
    offsets.push(pos);
    out.length = 0;
    u32(0x04034b50); u16(20); u16(0); u16(e.method); u16(0); u16(0); u32(0); u32(e.data.length); u32(e.size); u16(e.name.length); u16(0);
    const head = Uint8Array.from([...out, ...e.name]);
    chunks.push(head, e.data);
    pos += head.length + e.data.length;
  }
  const cdStart = pos;
  entries.forEach((e, k) => {
    out.length = 0;
    u32(0x02014b50); u16(20); u16(20); u16(0); u16(e.method); u16(0); u16(0); u32(0); u32(e.data.length); u32(e.size); u16(e.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(offsets[k]);
    const cd = Uint8Array.from([...out, ...e.name]);
    chunks.push(cd);
    pos += cd.length;
  });
  out.length = 0;
  u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length); u32(pos - cdStart); u32(cdStart); u16(0);
  chunks.push(Uint8Array.from(out));
  const zip = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  o = 0;
  for (const c of chunks) {
    zip.set(c, o);
    o += c.length;
  }
  return zip;
}
