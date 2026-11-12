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
// (2) probe q1b's layout (old widths, wrapping amounts) vs the chosen widths: table heights and cell line counts in
// memory and after export → reload.
const tbl = (doc, i, rows, cols, widths, h) => { const r = JSON.parse(doc.createTableEx(JSON.stringify({ sectionIdx: 0, paraIdx: i, charOffset: 0, rowCount: rows, colCount: cols, treatAsChar: true, colWidths: widths }))); for (let c = 0; c < rows * cols; c++) doc.setCellProperties(0, r.paraIdx, r.controlIdx, c, JSON.stringify({ height: h })); return r; };
const fillCells = (doc, r, rows, cols, f) => { for (let ro = 0; ro < rows; ro++) for (let c = 0; c < cols; c++) { const t = f(ro, c); if (t) doc.insertTextInCell(0, r.paraIdx, r.controlIdx, ro * cols + c, 0, 0, t); } };
const layout = (label, widths, row, H, rows) => {
  const doc = D.createEmpty(); doc.createBlankDocument();
  const plan = ['견 적 서', ' ', null, ' ', null, ' ', '합계 금액  일금 구십구억구천구백구십구만구천구백구십구원정 (9,999,999,999원) (부가세 포함)', ' ', null, ' ', '위와 같이 견적합니다.', '2026년 11월 12일', '공급자  ○○상사 대표 홍길동  (인)'];
  const ends = [];
  plan.forEach((t, i) => { const e = t ? JSON.parse(doc.insertText(0, i, 0, t)).charOffset : 0; ends.push(e); if (i < plan.length - 1) doc.splitParagraph(0, i, e); });
  const sup = tbl(doc, 2, 7, 3, [3000, 9000, 29952], H); fillCells(doc, sup, 7, 3, (r, c) => c === 1 ? '등록번호' : c === 2 ? '가'.repeat(r === 3 ? (globalThis.ADDR ?? 60) : 20) : ''); doc.mergeTableCells(0, sup.paraIdx, sup.controlIdx, 0, 0, 6, 0);
  const rec = tbl(doc, 4, 3, 3, [3000, 9000, 29952], H); fillCells(doc, rec, 3, 3, (r, c) => c === 1 ? '상호' : c === 2 ? '가'.repeat(30) : ''); doc.mergeTableCells(0, rec.paraIdx, rec.controlIdx, 0, 0, 2, 0);
  const g = tbl(doc, 8, rows + 2, 7, widths, H);
  if (globalThis.PAD != null) for (let c = 0; c < (rows + 2) * 7; c++) doc.setCellProperties(0, g.paraIdx, g.controlIdx, c, JSON.stringify({ paddingLeft: globalThis.PAD, paddingRight: globalThis.PAD, applyInnerMargin: true }));
  fillCells(doc, g, rows + 2, 7, (r, c) => r === 0 ? ['번호', '품명', '규격', '수량', '단가', '공급가액', '세액'][c] : r === rows + 1 ? ['합 계', '', '', '', '', '9,999,999,999', '999,999,999'][c] : [String(r), row[0], row[1], '999,999.99', '9,999,999,999', '9,999,999,999', '999,999,999'][c]);
  doc.applyCharFormat(0, 0, 0, ends[0], JSON.stringify({ fontSize: 2000, bold: true }));
  const bb = (d) => JSON.parse(d.getTableBBox(0, 8, 0)).height ?? JSON.parse(d.getTableBBox(0, 8, 0));
  const li = (d, cell) => JSON.parse(d.getLineInfoInCell(0, 8, 0, cell, 0, 0)).lineCount;
  const mem = `p1runs ${JSON.parse(doc.getPageTextLayout(0)).runs.length} pages ${doc.pageCount()} gridH ${JSON.stringify(bb(doc))} lines(amount r1) ${li(doc, 7 + 5)}`;
  const r2 = new D(doc.exportHwpWithReport().takeBytes());
  log(`${label}: memory ${mem} | reload pages ${r2.pageCount()} gridH ${JSON.stringify(bb(r2))} lines(amount r1) ${li(r2, 7 + 5)}`);
};
const OLD = [2600, 12000, 6000, 4000, 6000, 6400, 5000];
layout('q1b widths, 13 rows, 15-char amounts', OLD, ['가가가', 'W6'], 1400, 11);
for (const rows of [8, 10]) for (const [nl, sl] of [[20, 10], [30, 16]]) for (const W of [[3000, 9000, 4952, 6600, 7900, 7900, 2600 + 0]]) {
  const w = [3000, 0, 0, 6600, 7900, 7900, 7000]; const rest = 41952 - w.reduce((a, b) => a + b, 0); w[1] = Math.round(rest * 0.62); w[2] = rest - w[1];
  layout(`chosen ${JSON.stringify(w)} ${rows} rows name${nl} spec${sl}`, w, ['가'.repeat(nl), 'W'.repeat(sl)], 1400, rows);
}
// (3) the reload page count is not a layout check: a reloaded grid of 1,721 px (taller than the A4 page) still
// answers 1 page. Per-page bboxes after reload:
{
  const doc = D.createEmpty(); doc.createBlankDocument();
  ['a', null, 'b'].forEach((t, i) => { const e = t ? JSON.parse(doc.insertText(0, i, 0, t)).charOffset : 0; if (i < 2) doc.splitParagraph(0, i, e); });
  const g = tbl(doc, 1, 40, 2, [20000, 21952], 1400); fillCells(doc, g, 40, 2, () => '가'.repeat(30));
  const r2 = new D(doc.exportHwpWithReport().takeBytes());
  const pg = (d) => Array.from({ length: d.pageCount() }, (_, p) => JSON.parse(d.getPageTextLayout(p)).runs.length).join('/');
  log(`40-row 2-line grid: memory pages ${doc.pageCount()} runs/page ${pg(doc)} | reload pages ${r2.pageCount()} runs/page ${pg(r2)} reload page0 info ${r2.getPageInfo(0).slice(0, 120)}`);
}
// (4) sweep: in-memory pages for all-max Hangul 품명/규격 by rows and lengths, widths fitted to the widest amounts.
const FIT = [3000, 0, 0, 6300, 7700, 7700, 6900];
for (const rows of [8, 10]) for (const [nl, sl, split] of [[20, 10, 0.68], [16, 10, 0.68], [12, 8, 0.66], [10, 6, 0.66]]) {
  const w = [...FIT]; const rest = 41952 - w.reduce((a, b) => a + b, 0); w[1] = Math.round(rest * split); w[2] = rest - w[1];
  layout(`fit ${JSON.stringify(w)} ${rows} rows name${nl} spec${sl}`, w, ['가'.repeat(nl), '가'.repeat(sl)], 1400, rows);
}
// (5) how many wrapped item lines fit: 품명 col 7039 holds 6 Hangul per line; rows × lines with 주소 60 / 30.
for (const addr of [60, 30]) for (const rows of [8, 10]) for (const L of [1, 2]) {
  globalThis.ADDR = addr;
  layout(`fit addr${addr} ${rows} rows ${L}-line items`, [3000, 7039, 3313, 6300, 7700, 7700, 6900], ['가'.repeat(L === 1 ? 6 : 12), 'W6'], 1400, rows);
}
// (6) grid cells with 140 HU left/right padding (setCellProperties {paddingLeft, paddingRight, applyInnerMargin}:
// kept after reload): the narrowest one-line widths, then rows of 1- and 2-line items.
const minPad = (text) => { let lo = 200, hi = 30000; while (hi - lo > 10) { const m = (lo + hi) >> 1; const doc = D.createEmpty(); doc.createBlankDocument(); const r = JSON.parse(doc.createTableEx(JSON.stringify({ sectionIdx: 0, paraIdx: 0, charOffset: 0, rowCount: 1, colCount: 2, treatAsChar: true, colWidths: [m, 41952 - m] }))); doc.setCellProperties(0, r.paraIdx, r.controlIdx, 0, JSON.stringify({ paddingLeft: 140, paddingRight: 140, applyInnerMargin: true })); doc.insertTextInCell(0, r.paraIdx, r.controlIdx, 0, 0, 0, text); const n = JSON.parse(doc.getLineInfoInCell(0, r.paraIdx, r.controlIdx, 0, 0, [...text].length)).lineCount; doc.free(); if (n === 1) hi = m; else lo = m; } return hi; };
for (const t of ['번호', '공급가액', '999,999.99', '9,999,999,999', '999,999,999', '합 계', '가가가가가가가가가', '가가가가']) log(`pad 140 min width ${JSON.stringify(t)}: ${minPad(t)}`);
globalThis.PAD = 140;
const PADW = [2400, 9200, 4252, 5700, 7100, 7100, 6200];
for (const addr of [60, 40]) for (const rows of [8, 10]) for (const [nl, sl] of [[9, 4], [18, 8]]) {
  globalThis.ADDR = addr;
  layout(`pad140 ${JSON.stringify(PADW)} addr${addr} ${rows} rows name${nl} spec${sl}`, PADW, ['가'.repeat(nl), '가'.repeat(sl)], 1400, rows);
}
writeFileSync(new URL('probe-a1.out.txt', import.meta.url), out.join('\n') + '\n');
