// QUOTE1112 probe q1c (Arch, 2026-11-12): in-memory pageCount vs grid rows (n) and the label tables (on/off), H 1400.
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../../../node_modules/@rhwp/core/', import.meta.url);
const mod = await import(new URL('rhwp.js', root).href);
globalThis.measureTextWidth = (font, text) => { const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16); let w = 0; for (const ch of text) { const cp = ch.codePointAt(0); w += cp >= 0xac00 && cp <= 0xd7af ? px : px * 0.55; } return w; };
await mod.default({ module_or_path: readFileSync(new URL('rhwp_bg.wasm', root)) });
const D = mod.HwpDocument; const out = [];
const tbl = (doc, i, rows, cols, widths, h) => { const r = JSON.parse(doc.createTableEx(JSON.stringify({ sectionIdx: 0, paraIdx: i, charOffset: 0, rowCount: rows, colCount: cols, treatAsChar: true, colWidths: widths }))); for (let c = 0; c < rows * cols; c++) doc.setCellProperties(0, r.paraIdx, r.controlIdx, c, JSON.stringify({ height: h })); for (let c = 0; c < rows * cols; c++) doc.insertTextInCell(0, r.paraIdx, r.controlIdx, c, 0, 0, '가'); return r; };
for (const labels of [false, true]) for (const n of [4, 8, 13, 20]) {
  const doc = D.createEmpty(); doc.createBlankDocument();
  const plan = labels ? ['견 적 서', ' ', null, ' ', null, ' ', 'x', ' ', null, ' ', 'end'] : ['견 적 서', ' ', 'x', ' ', null, ' ', 'end'];
  plan.forEach((t, i) => { const e = t ? JSON.parse(doc.insertText(0, i, 0, t)).charOffset : 0; if (i < plan.length - 1) doc.splitParagraph(0, i, e); });
  if (labels) { tbl(doc, 2, 7, 3, [3000, 9000, 30000], 1400); tbl(doc, 4, 3, 3, [3000, 9000, 30000], 1400); }
  tbl(doc, labels ? 8 : 4, n, 7, [2600, 12000, 6000, 4000, 6000, 6400, 5000], 1400);
  const ex = doc.exportHwpWithReport(); const r2 = new D(ex.takeBytes());
  out.push(`labels ${labels} gridRows ${n}: pages ${doc.pageCount()} reload ${r2.pageCount()}`);
}
console.log(out.join('\n')); writeFileSync(new URL('probe-q1c.out.txt', import.meta.url), out.join('\n') + '\n');
