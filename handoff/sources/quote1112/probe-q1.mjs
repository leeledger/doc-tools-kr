// QUOTE1112 probe q1 (Arch, 2026-11-12): rhwp 0.8.6 — (a) an item grid 7 cols × 13 rows + two label tables on one
// A4 page (build.ts order B); (b) insertPicture of a PNG inline in a body paragraph and floating in a table cell;
// export → reload → pageCount; renderPageSvg has an <image>.
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const root = new URL('../../../node_modules/@rhwp/core/', import.meta.url);
const mod = await import(new URL('rhwp.js', root).href);
globalThis.measureTextWidth = (font, text) => { const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16); let w = 0; for (const ch of text) { const cp = ch.codePointAt(0); w += cp >= 0xac00 && cp <= 0xd7af ? px : px * 0.55; } return w; };
await mod.default({ module_or_path: readFileSync(new URL('rhwp_bg.wasm', root)) });
const D = mod.HwpDocument;
// 64×64 red PNG
const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const W = 64; const raw = Buffer.alloc((W * 4 + 1) * W); for (let y = 0; y < W; y++) { raw[y * (W * 4 + 1)] = 0; for (let x = 0; x < W; x++) { const o = y * (W * 4 + 1) + 1 + x * 4; raw[o] = 220; raw[o + 1] = 30; raw[o + 2] = 30; raw[o + 3] = 255; } }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
const out = [];
const tbl = (doc, i, rows, cols, widths, h) => { const r = JSON.parse(doc.createTableEx(JSON.stringify({ sectionIdx: 0, paraIdx: i, charOffset: 0, rowCount: rows, colCount: cols, treatAsChar: true, colWidths: widths }))); for (let c = 0; c < rows * cols; c++) doc.setCellProperties(0, r.paraIdx, r.controlIdx, c, JSON.stringify({ height: h })); return r; };
const fillCells = (doc, r, rows, cols, f) => { for (let ro = 0; ro < rows; ro++) for (let c = 0; c < cols; c++) { const t = f(ro, c); if (t) doc.insertTextInCell(0, r.paraIdx, r.controlIdx, ro * cols + c, 0, 0, t); } };
for (const pic of ['none', 'inline', 'cell']) {
  const doc = D.createEmpty(); doc.createBlankDocument();
  const plan = ['견 적 서', ' ', null, ' ', null, ' ', '합계 금액  일금 일천일백만원정 (₩11,000,000)', ' ', null, ' ', '위와 같이 견적합니다.', '2026년 11월 12일', '공급자  ○○상사 대표 홍길동  (인)'];
  const ends = [];
  plan.forEach((t, i) => { const e = t ? JSON.parse(doc.insertText(0, i, 0, t)).charOffset : 0; ends.push(e); doc.applyParaFormat(0, i, JSON.stringify({ alignment: i === 0 ? 'center' : 'left' })); if (i < plan.length - 1) doc.splitParagraph(0, i, e); });
  const sup = tbl(doc, 2, 7, 3, [3000, 9000, 30000], 1700);
  fillCells(doc, sup, 7, 3, (r, c) => c === 1 ? ['등록번호', '상호', '대표자', '주소', '업태', '종목', '연락처'][r] : c === 2 ? '서울특별시 ○○구 ○○로 123, 4층 (○○동, ○○빌딩)'.slice(0, 20 + r) : '');
  doc.mergeTableCells(0, sup.paraIdx, sup.controlIdx, 0, 0, 6, 0);
  const rec = tbl(doc, 4, 3, 3, [3000, 9000, 30000], 1700);
  fillCells(doc, rec, 3, 3, (r, c) => c === 1 ? ['상호', '등록번호', '연락처'][r] : c === 2 ? '○○주식회사 구매팀' : '');
  doc.mergeTableCells(0, rec.paraIdx, rec.controlIdx, 0, 0, 2, 0);
  const g = tbl(doc, 8, 13, 7, [2600, 12000, 6000, 4000, 6000, 6400, 5000], 1700);
  fillCells(doc, g, 13, 7, (r, c) => r === 0 ? ['번호', '품명', '규격', '수량', '단가', '공급가액', '세액'][c] : r === 12 ? ['', '합계', '', '', '', '10,000,000', '1,000,000'][c] : [String(r), '사무용 의자 (메시, 팔걸이 있음)', 'W600×D600', '1,000', '100,000,000', '100,000,000,000', '10,000,000,000'][c]);
  doc.applyCharFormat(0, 0, 0, ends[0], JSON.stringify({ fontSize: 2000, bold: true }));
  let picRes = '-';
  try {
    if (pic === 'inline') picRes = doc.insertPicture(0, 12, ends[12], '', png, 3600, 3600, 64, 64, 'png', '직인');
    if (pic === 'cell') picRes = doc.insertPicture(0, sup.paraIdx, 0, JSON.stringify([{ controlIndex: sup.controlIdx, cellIndex: 3 * 2 + 2, cellParaIndex: 0 }]), png, 3600, 3600, 64, 64, 'png', '직인');
  } catch (e) { picRes = 'THROW ' + e; }
  const pages = doc.pageCount();
  const svg0 = doc.renderPageSvg(0);
  let reload = '-';
  try { const ex = doc.exportHwpWithReport(); const loss = ex.contentLoss(); const bytes = ex.takeBytes(); const r2 = new D(bytes); reload = `bytes ${bytes.length} loss ${loss} reloadPages ${r2.pageCount()} reloadImg ${/<image/.test(r2.renderPageSvg(0))}`; } catch (e) { reload = 'THROW ' + e; }
  out.push(`${pic}: insert ${picRes} | pages ${pages} | svgImage ${/<image/.test(svg0)} | ${reload}`);
}
console.log(out.join('\n'));
writeFileSync(new URL('probe-q1.out.txt', import.meta.url), out.join('\n') + '\n');
