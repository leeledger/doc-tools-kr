import { readFileSync, writeFileSync } from 'node:fs';
const root = 'C:/dev/doc-tools-kr/node_modules/@rhwp/core/';
const mod = await import('file:///' + root + 'rhwp.js');
globalThis.measureTextWidth = (font, text) => { const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16); let w=0; for (const ch of text){const cp=ch.codePointAt(0); w += cp>=0xac00&&cp<=0xd7af?px:px*0.55;} return w; };
await mod.default({ module_or_path: readFileSync(root + 'rhwp_bg.wasm') });
const D = mod.HwpDocument;
const log = (k, v) => console.log(k, typeof v === 'string' ? v.slice(0, 200) : v);
let doc;
try { doc = D.createEmpty(); log('createEmpty ok', doc.pageCount?.()); } catch (e) { log('createEmpty err', String(e)); }
try { log('blank', doc.createBlankDocument()); } catch (e) { log('blank err', String(e)); }
log('pages', doc.pageCount());
log('paras', doc.getParagraphCount(0));
try { log('title', doc.insertText(0, 0, 0, '위 임 장')); } catch (e) { log('insertText err', String(e)); }
try { log('split', doc.splitParagraph(0, 0, 5)); } catch (e) { log('split err', String(e)); }
log('paras', doc.getParagraphCount(0));
let t;
try { t = doc.createTable(0, 1, 0, 4, 2); log('table', t); } catch (e) { log('table err', String(e)); }
const p = JSON.parse(t || '{}');
try { log('dims', doc.getTableDimensions(0, p.paraIdx, p.controlIdx)); } catch (e) { log('dims err', String(e)); }
for (let c = 0; c < 8; c++) { try { doc.insertTextInCell(0, p.paraIdx, p.controlIdx, c, 0, 0, c % 2 ? '홍길동 가나다 ' + c : '성명'); } catch (e) { log('cell err ' + c, String(e)); } }
try { log('merge', doc.mergeTableCells(0, p.paraIdx, p.controlIdx, 3, 0, 3, 1)); } catch (e) { log('merge err', String(e)); }
const ex = doc.exportHwpWithReport(); log('loss', ex.contentLoss()); const bytes = ex.takeBytes(); ex.free();
writeFileSync('probe.hwp', bytes); log('bytes', bytes.length);
const r = new D(bytes); log('reload pages', r.pageCount());
const svg = r.renderPageSvg(0); log('svg has 홍길동', svg.includes('홍') || svg.length);
try { log('hwpx', doc.exportHwpx().length); } catch (e) { log('hwpx err', String(e)); }
const t0 = Date.now(); for (let i=0;i<3;i++){} 
