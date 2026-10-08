// TOOLS5 U4 spike (report only): how rhwp's HWP export fails. Inputs made in memory from the fixtures:
// a truncated HWPX, a HWPX with section0.xml removed, random bytes, an HWP source (adapter no-op) and an
// empty document. Prints one line per probe: where it failed (open / verify / export / reload) and the message.
// Usage: node scripts/spike/hwpx-to-hwp-failures.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import init, { HwpDocument } from '@rhwp/core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
globalThis.measureTextWidth = (font, text) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16) * [...text].length;
await init({ module_or_path: readFileSync(join(root, 'node_modules', '@rhwp', 'core', 'rhwp_bg.wasm')) });
const fx = (n) => new Uint8Array(readFileSync(join(root, 'tests', 'corpus', 'hwp', n)));

/** The ZIP with one entry's local name mangled, so the reader cannot find it. */
function dropEntry(zip, name) {
  const out = zip.slice();
  const needle = new TextEncoder().encode(name);
  for (let i = 0; i < out.length - needle.length; i++) {
    if (needle.every((b, j) => out[i + j] === b)) out[i + needle.length - 5] = 0x5f; // section0.xml → section_.xml
  }
  return out;
}

const adm14 = fx('adm14.hwpx');
const probes = {
  truncatedHalf: adm14.slice(0, adm14.length >> 1),
  missingSection0: dropEntry(adm14, 'Contents/section0.xml'),
  randomBytes: Uint8Array.from({ length: 4096 }, (_, i) => (i * 2654435761) >>> 24),
  hwpSource_law05: fx('law05.hwp'),
  empty: null,
};
for (const [name, bytes] of Object.entries(probes)) {
  let stage = 'open';
  try {
    const doc = bytes ? new HwpDocument(bytes) : HwpDocument.createEmpty();
    const pagesIn = doc.pageCount();
    stage = 'verify';
    const verify = doc.exportHwpVerify();
    stage = 'export';
    const exp = doc.exportHwpWithReport();
    const loss = exp.contentLoss();
    const out = exp.takeBytes();
    stage = 'reload';
    const back = new HwpDocument(out);
    console.log(`${name}: ok pagesIn=${pagesIn} pagesOut=${back.pageCount()} bytes=${out.length} verify=${verify} loss=${loss}`);
  } catch (err) {
    console.log(`${name}: FAIL at ${stage}: ${String(err?.message ?? err).slice(0, 200)}`);
  }
}
