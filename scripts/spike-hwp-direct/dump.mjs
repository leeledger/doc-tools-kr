// node dump.mjs <file> <page0> : prints rhwp's raw SVG for one page (SPIKE-HWP-DIRECT debugging aid).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initSync, HwpDocument } from '@rhwp/core';
const root = join(import.meta.dirname, '..', '..');
globalThis.measureTextWidth = (f, t) => [...t].length * 10;
initSync({ module: readFileSync(join(root, 'node_modules/@rhwp/core/rhwp_bg.wasm')) });
const doc = new HwpDocument(new Uint8Array(readFileSync(process.argv[2])));
const i = Number(process.argv[3] ?? 0);
if (process.argv[4] === 'layout') console.log(doc.getPageTextLayout(i).slice(0, 3000));
else process.stdout.write(doc.renderPageSvg(i));
