// Test-time HWP fixtures (brief Step 5 "Generated at test time, not committed"): truncated, password- and
// distribution-patched law05, a .docx-style zip, law05 padded over 10 MB, adm14 with a 9 MB stored BinData entry.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
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
