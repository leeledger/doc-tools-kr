// node sbs.mjs <out.png> <scale> <page0> <pdf>...  : side-by-side render of one page of several PDFs (pdf.js).
import { readFileSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { openPdf, renderRgba } from '../regress/lib.mjs';
const [out, scale, pg, ...pdfs] = process.argv.slice(2);
const imgs = [];
for (const p of pdfs) { const d = await openPdf(new Uint8Array(readFileSync(p))); imgs.push(await renderRgba(d, Number(pg), Number(scale))); await d.close(); }
const W = imgs.reduce((a, i) => a + i.w + 10, 0), H = Math.max(...imgs.map((i) => i.h));
const c = createCanvas(W, H); const ctx = c.getContext('2d'); ctx.fillStyle = '#f00'; ctx.fillRect(0, 0, W, H);
let x = 0; for (const i of imgs) { const id = ctx.createImageData(i.w, i.h); id.data.set(i.rgba); ctx.putImageData(id, x, 0); x += i.w + 10; }
writeFileSync(out, c.toBuffer('image/png'));
