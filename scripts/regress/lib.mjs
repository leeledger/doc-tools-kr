// Shared pdf.js helpers for the Node regression harnesses (regress:merge, regress:compress).
import { join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export { pdfjs };

const pdfjsRoot = join(import.meta.dirname, '..', '..', 'node_modules', 'pdfjs-dist');

/** Opens a PDF with pdf.js (legacy build, Node). `doc.close()` destroys the loading task. */
export async function openPdf(bytes, password) {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    password,
    cMapUrl: join(pdfjsRoot, 'cmaps') + '/',
    cMapPacked: true,
    standardFontDataUrl: join(pdfjsRoot, 'standard_fonts') + '/',
    wasmUrl: join(pdfjsRoot, 'wasm') + '/',
    verbosity: 0,
  });
  const doc = await task.promise;
  doc.close = () => task.destroy();
  return doc;
}

/** Text of page `i` (0-based), items joined without separators. */
export async function pageText(doc, i) {
  const page = await doc.getPage(i + 1);
  const tc = await page.getTextContent();
  return tc.items.map((it) => it.str ?? '').join('');
}

/** Renders page `i` (0-based) on white at `scale` (1 = 72 dpi) and returns `{rgba, w, h}`. */
export async function renderRgba(doc, i, scale) {
  const page = await doc.getPage(i + 1);
  const viewport = page.getViewport({ scale });
  const w = Math.ceil(viewport.width);
  const h = Math.ceil(viewport.height);
  const cc = doc.canvasFactory.create(w, h);
  cc.context.fillStyle = '#fff';
  cc.context.fillRect(0, 0, w, h);
  await page.render({ canvas: cc.canvas, canvasContext: cc.context, viewport }).promise;
  const rgba = cc.context.getImageData(0, 0, w, h).data;
  doc.canvasFactory.destroy(cc);
  page.cleanup();
  return { rgba, w, h };
}

/** Unit (scale 1) viewport size of page `i` (0-based). */
export async function unitSize(doc, i) {
  const vp = (await doc.getPage(i + 1)).getViewport({ scale: 1 });
  return { width: vp.width, height: vp.height };
}
