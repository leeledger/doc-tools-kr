// QUOTE1112 A1 (Bob, 2026-11-12): rhwp 0.8.6 in Node. (1) The narrowest column (HWPUNIT) that keeps each widest
// item-grid text on one line at 10 pt; (2) the cause of probe q1's 2 pages in memory vs 1 after reload.
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../../../node_modules/@rhwp/core/', import.meta.url);
const mod = await import(new URL('rhwp.js', root).href);
globalThis.measureTextWidth = (font, text) => { const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16); let w = 0; for (const ch of text) { const cp = ch.codePointAt(0); w += cp >= 0xac00 && cp <= 0xd7af ? px : px * 0.55; } return w; };
await mod.default({ module_or_path: readFileSync(new URL('rhwp_bg.wasm', root)) });
const D = mod.HwpDocument;
const out = [];
const log = (s) => { out.push(s); console.log(s); };
// (1) one 1×2 table: cell 0 width w holding text; does it stay one line?
const lines = (w, text) => {
  const doc = D.createEmpty(); doc.createBlankDocument();
  const r = JSON.parse(doc.createTableEx(JSON.stringify({ sectionIdx: 0, paraIdx: 0, charOffset: 0, rowCount: 1, colCount: 2, treatAsChar: true, colWidths: [w, 41952 - w] })));
  doc.insertTextInCell(0, r.paraIdx, r.controlIdx, 0, 0, 0, text);
  const n = JSON.parse(doc.getLineInfoInCell(0, r.paraIdx, r.controlIdx, 0, 0, [...text].length)).lineCount;
  doc.free(); return n;
};
const minWidth = (text) => { let lo = 200, hi = 30000; while (hi - lo > 10) { const m = (lo + hi) >> 1; if (lines(m, text) === 1) hi = m; else lo = m; } return hi; };
for (const t of ['번호', '10', '품명', '규격', '수량', '999,999.99', '단가', '9,999,999,999', '공급가액', '세액', '909,090,909', '합 계', '가가가가가가가가가가', 'WWWWWWWWWW', '9']) log(`min width ${JSON.stringify(t)}: ${minWidth(t)}`);
writeFileSync(new URL('probe-a1.out.txt', import.meta.url), out.join('\n') + '\n');
