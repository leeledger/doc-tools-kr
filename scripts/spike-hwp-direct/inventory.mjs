// SPIKE-HWP-DIRECT: inventory of the SVG vocabulary rhwp 0.8.6 emits (elements, attributes, path commands),
// over the fixtures + the spike corpus, in Node. Output: inventory.json (in regress-out/).
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { initSync, HwpDocument } from '@rhwp/core';
const root = join(import.meta.dirname, '..', '..');
globalThis.measureTextWidth = (font, text) => [...text].length * 10;
initSync({ module: readFileSync(join(root, 'node_modules/@rhwp/core/rhwp_bg.wasm')) });
const dirs = [join(root, 'tests/corpus/hwp'), process.env.CORPUS_DIR ?? 'C:/dev/doc-tools-kr/spikes/hwp/corpus'];
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
const inv = { elements: {}, attrs: {}, pathCmds: {}, imageMime: {}, transforms: {}, textAttrs: {}, filesWith: {}, samples: {} };
const bump = (o, k, n = 1) => (o[k] = (o[k] ?? 0) + n);
const seen = new Set();
for (const d of dirs) for (const f of readdirSync(d).filter((x) => /\.hwpx?$/.test(x))) {
  const key = f.replace(/\.hwpx?$/, '');
  if (seen.has(key) || (only && !only.test(key))) continue;
  seen.add(key);
  let doc;
  try { doc = new HwpDocument(new Uint8Array(readFileSync(join(d, f)))); } catch (e) { console.log(key, 'open fail', e.message); continue; }
  const n = Math.min(doc.pageCount(), 60);
  const fileEls = new Set();
  for (let i = 0; i < n; i++) {
    const svg = doc.renderPageSvg(i);
    for (const m of svg.matchAll(/<([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g)) {
      const el = m[1];
      bump(inv.elements, el);
      fileEls.add(el);
      for (const a of m[2].matchAll(/([\w:-]+)="([^"]*)"/g)) {
        bump(inv.attrs, `${el}@${a[1]}`);
        if (a[1] === 'd') for (const c of a[2].matchAll(/[A-Za-z]/g)) bump(inv.pathCmds, c[0]);
        if (a[1] === 'transform') bump(inv.transforms, a[2].replace(/[-\d.e]+/g, 'n'));
        if (el === 'image' && /href/.test(a[1])) bump(inv.imageMime, a[2].slice(0, 30).match(/^data:[^;,]+/)?.[0] ?? a[2].slice(0, 20));
        if (el === 'text' && !['x', 'y', 'font-family', 'font-size', 'fill'].includes(a[1])) bump(inv.textAttrs, `${a[1]}=${a[2].slice(0, 30)}`);
        if (['fill', 'stroke'].includes(a[1]) && a[2].startsWith('url(')) bump(inv.attrs, `${el}@${a[1]}=url`);
      }
      if (!inv.samples[el]) inv.samples[el] = m[0].slice(0, 300);
    }
  }
  for (const e of fileEls) (inv.filesWith[e] ??= []).push(key);
  doc.free();
  process.stdout.write(`${key}(${n}) `);
}
for (const k of Object.keys(inv.textAttrs)) if (inv.textAttrs[k] < 3) delete inv.textAttrs[k];
for (const e of Object.keys(inv.filesWith)) if (inv.filesWith[e].length > 20) inv.filesWith[e] = `${inv.filesWith[e].length} files`;
mkdirSync(join(root, 'regress-out'), { recursive: true });
writeFileSync(join(root, 'regress-out', 'hwp-svg-inventory.json'), JSON.stringify(inv, null, 1));
console.log('\n', JSON.stringify({ elements: inv.elements, pathCmds: inv.pathCmds, imageMime: inv.imageMime, filesWith: inv.filesWith }, null, 0));
