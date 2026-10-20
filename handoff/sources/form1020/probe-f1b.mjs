// F1 probe b (Bob, 2026-10-20): colWidths, cell width setters, cell order after merge, bboxes.
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../../../node_modules/@rhwp/core/', import.meta.url);
const mod = await import(new URL('rhwp.js', root).href);
globalThis.measureTextWidth = (font, text) => { const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16); let w = 0; for (const ch of text) { const cp = ch.codePointAt(0); w += cp >= 0xac00 && cp <= 0xd7af ? px : px * 0.55; } return w; };
await mod.default({ module_or_path: readFileSync(new URL('rhwp_bg.wasm', root)) });
const D = mod.HwpDocument;
const out = [];
const log = (k, v) => { const s = `${k} ${typeof v === 'string' ? v.slice(0, 400) : JSON.stringify(v)}`; out.push(s); console.log(s); };
const tryc = (k, f) => { try { log(k, f()); } catch (e) { log(k + ' THROW', String(e)); } };
for (const widths of [[6000, 9000, 27000], [8000, 10000, 24520]]) {
  const doc = D.createEmpty(); doc.createBlankDocument();
  let t; tryc('tableEx ' + widths, () => (t = doc.createTableEx(JSON.stringify({ sectionIdx: 0, paraIdx: 0, charOffset: 0, rowCount: 3, colCount: 3, treatAsChar: true, colWidths: widths }))));
  const p = JSON.parse(t);
  tryc('w0 w1 w2', () => [0, 1, 2].map((c) => JSON.parse(doc.getCellProperties(0, p.paraIdx, p.controlIdx, c)).width).join(','));
  tryc('tableProps', () => doc.getTableProperties ? doc.getTableProperties(0, p.paraIdx, p.controlIdx) : 'n/a');
}
const doc = D.createEmpty(); doc.createBlankDocument();
const p = JSON.parse(doc.createTable(0, 0, 0, 3, 3));
tryc('setCellProperties width', () => doc.setCellProperties(0, p.paraIdx, p.controlIdx, 0, JSON.stringify({ width: 6000 })));
tryc('widths after set', () => [0, 1, 2, 3].map((c) => JSON.parse(doc.getCellProperties(0, p.paraIdx, p.controlIdx, c)).width).join(','));
tryc('resize', () => doc.resizeTableCells(0, p.paraIdx, p.controlIdx, JSON.stringify([{ cellIdx: 0, widthDelta: -7984 }, { cellIdx: 3, widthDelta: -7984 }, { cellIdx: 6, widthDelta: -7984 }])));
tryc('widths after resize', () => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((c) => JSON.parse(doc.getCellProperties(0, p.paraIdx, p.controlIdx, c)).width).join(','));
tryc('merge', () => doc.mergeTableCells(0, p.paraIdx, p.controlIdx, 0, 0, 2, 0));
for (let c = 0; c < 7; c++) tryc('info ' + c, () => doc.getCellInfo(0, p.paraIdx, p.controlIdx, c));
tryc('bboxes', () => doc.getTableCellBboxes(0, p.paraIdx, p.controlIdx));
writeFileSync(new URL('probe-f1b.out.txt', import.meta.url), out.join('\n') + '\n');
