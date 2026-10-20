// F1 probe d (Bob, 2026-10-20): rhwp 0.8.6 layout vs. edit order. Paragraphs T, gap, [table], gap, [table], gap,
// [table], gap, two, gap, three, gap, four. Variant A: paragraphs, tables, then a 10 pt applyCharFormat on every
// text paragraph after the tables → early page breaks. Variant B: same without char formats after the tables → 1 page.
// Variant C: written top to bottom, each table created when its paragraph is the last one (split at its
// logicalOffset), char formats on the way → 2 pages. build.ts uses B (+ char formats only before the first table).
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../../../node_modules/@rhwp/core/', import.meta.url);
const mod = await import(new URL('rhwp.js', root).href);
globalThis.measureTextWidth = (font, text) => { const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16); let w = 0; for (const ch of text) { const cp = ch.codePointAt(0); w += cp >= 0xac00 && cp <= 0xd7af ? px : px * 0.55; } return w; };
await mod.default({ module_or_path: readFileSync(new URL('rhwp_bg.wasm', root)) });
const D = mod.HwpDocument;
const out = [];
const plan = ['T', ' ', null, ' ', null, ' ', null, ' ', 'two', ' ', 'three', ' ', 'four'];
const table = (doc, i) => {
  const r = JSON.parse(doc.createTableEx(JSON.stringify({ sectionIdx: 0, paraIdx: i, charOffset: 0, rowCount: 3, colCount: 3, treatAsChar: true, colWidths: [6000, 10500, 25452] })));
  for (let c = 0; c < 9; c++) doc.setCellProperties(0, i, 0, c, JSON.stringify({ height: 2268 }));
  doc.mergeTableCells(0, i, 0, 0, 0, 2, 0);
  return r.logicalOffset;
};
const layout = (doc) => { const n = doc.pageCount(); const f = []; for (let p = 1; p < n; p++) f.push(JSON.parse(doc.getPageTextLayout(p)).runs[0]?.text.trim() || '_'); return `pages ${n}${f.length ? ' (next pages start with ' + f.join(', ') + ')' : ''}`; };
for (const v of ['A', 'B']) {
  const doc = D.createEmpty(); doc.createBlankDocument();
  const ends = [];
  plan.forEach((t, i) => { const e = t ? JSON.parse(doc.insertText(0, i, 0, t)).charOffset : 0; ends.push(e); if (i < plan.length - 1) doc.splitParagraph(0, i, e); });
  plan.forEach((t, i) => { if (t === null) table(doc, i); });
  doc.applyCharFormat(0, 0, 0, 1, JSON.stringify({ fontSize: 2000, bold: true }));
  if (v === 'A') plan.forEach((t, i) => { if (t && i > 2) doc.applyCharFormat(0, i, 0, ends[i], JSON.stringify({ fontSize: 1000, bold: false })); });
  out.push(`${v}: ${layout(doc)}`);
}
{
  const doc = D.createEmpty(); doc.createBlankDocument();
  plan.forEach((t, i) => { let e; if (t === null) e = table(doc, i); else { e = JSON.parse(doc.insertText(0, i, 0, t)).charOffset; doc.applyCharFormat(0, i, 0, e, JSON.stringify({ fontSize: i ? 1000 : 2000, bold: !i })); } if (i < plan.length - 1) doc.splitParagraph(0, i, e); });
  out.push(`C: ${layout(doc)}`);
}
console.log(out.join('\n'));
writeFileSync(new URL('probe-f1d.out.txt', import.meta.url), out.join('\n') + '\n');
