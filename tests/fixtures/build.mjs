// Generates the committed synthetic fixtures (run: node tests/fixtures/build.mjs) and,
// via makeRuntimeFixtures(), the edge-case files that are created at test time and never committed.
import { PDFDocument, PDFHexString, PDFName, StandardFonts, degrees } from '@cantoo/pdf-lib';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = dirname(fileURLToPath(import.meta.url));

const N = (s) => PDFName.of(s);

/** 4 pages; outline with 3 entries; 2 GoTo links on page 1 (one /Dest, one /A); 1 named destination. */
async function buildLinksOutline() {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = [1, 2, 3, 4].map((n) => {
    const p = doc.addPage([595, 842]);
    p.drawText(`Links and outline fixture page ${n}`, { x: 60, y: 760, size: 20, font });
    return p;
  });
  const ctx = doc.context;
  const [p1, p2, p3, p4] = pages;

  // Named destination "chap4" -> page 4.
  const destsArray = ctx.obj([PDFHexString.fromText('chap4'), [p4.ref, 'XYZ', 0, 842, null]]);
  const destsTree = ctx.obj({ Names: destsArray });
  doc.catalog.set(N('Names'), ctx.obj({ Dests: ctx.register(destsTree) }));

  // Link 1: explicit /Dest -> page 3. Link 2: /A GoTo with the named destination -> page 4.
  p1.drawText('Go to page 3', { x: 60, y: 700, size: 14, font });
  p1.drawText('Go to page 4 (named)', { x: 60, y: 660, size: 14, font });
  const link1 = ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [55, 695, 200, 715], Border: [0, 0, 0], Dest: [p3.ref, 'Fit'] });
  const link2 = ctx.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [55, 655, 240, 675],
    Border: [0, 0, 0],
    A: { S: 'GoTo', D: PDFHexString.fromText('chap4') },
  });
  p1.node.set(N('Annots'), ctx.obj([ctx.register(link1), ctx.register(link2)]));

  // Outline: 3 entries (explicit /Dest, /A GoTo explicit, named destination).
  const olRef = ctx.nextRef();
  const refs = [ctx.nextRef(), ctx.nextRef(), ctx.nextRef()];
  const items = [
    { title: 'Chapter 1', Dest: [p1.ref, 'Fit'] },
    { title: 'Chapter 2', A: { S: 'GoTo', D: [p2.ref, 'XYZ', 0, 842, null] } },
    { title: 'Chapter 4', Dest: PDFHexString.fromText('chap4') },
  ];
  items.forEach((it, i) => {
    const d = ctx.obj({ Title: PDFHexString.fromText(it.title), Parent: olRef });
    if (it.Dest) d.set(N('Dest'), ctx.obj(it.Dest));
    if (it.A) d.set(N('A'), ctx.obj(it.A));
    if (i > 0) d.set(N('Prev'), refs[i - 1]);
    if (i < items.length - 1) d.set(N('Next'), refs[i + 1]);
    ctx.assign(refs[i], d);
  });
  ctx.assign(olRef, ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs[2], Count: 3 }));
  doc.catalog.set(N('Outlines'), olRef);
  return doc.save({ useObjectStreams: false });
}

/** Page 1: A4 landscape. Page 2: A4 portrait with /Rotate 90. */
async function buildLandscapeRotated() {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const a = doc.addPage([842, 595]);
  a.drawText('Landscape page', { x: 60, y: 520, size: 24, font });
  const b = doc.addPage([595, 842]);
  b.drawText('Rotated page', { x: 60, y: 760, size: 24, font });
  b.setRotation(degrees(90));
  return doc.save({ useObjectStreams: false });
}

// 1×1 PNG.
const PNG_BYTES = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

/**
 * Writes the never-committed edge-case fixtures into `dir` and returns their paths.
 * @param {string} dir
 * @returns {Promise<Record<'encrypted_userpw_1234' | 'damaged_badxref' | 'truncated' | 'not_a_pdf' | 'owner_restricted' | 'owner_no_copy' | 'signed_fake' | 'jpx_only' | 'cmyk_jpeg' | 'junk_content', string>>}
 */
export async function makeRuntimeFixtures(dir) {
  mkdirSync(dir, { recursive: true });
  const law = readFileSync(join(FIXTURES, 'kr_law_form.pdf'));
  const fw9 = readFileSync(join(FIXTURES, 'irs_fw9.pdf'));

  // kr_law_form is PDF/A, which forbids encryption, so its pages go into a fresh document first.
  const lawDoc = await PDFDocument.load(law, { updateMetadata: false });
  const plainDoc = await PDFDocument.create({ updateMetadata: false });
  for (const p of await plainDoc.copyPages(lawDoc, lawDoc.getPageIndices())) plainDoc.addPage(p);
  const plain = await plainDoc.save({ useObjectStreams: false });
  const encDoc = await PDFDocument.load(plain, { updateMetadata: false });
  encDoc.encrypt({ userPassword: '1234', ownerPassword: 'owner-only-1234' });
  const encrypted = await encDoc.save({ useObjectStreams: false });

  // startxref set to 999 (same recipe as the spike corpus).
  const text = Buffer.from(law).toString('latin1');
  const at = text.lastIndexOf('startxref');
  const badxref = Buffer.from(text.slice(0, at) + text.slice(at).replace(/startxref\s+\d+/, 'startxref\n999'), 'latin1');

  const files = {
    encrypted_userpw_1234: encrypted,
    damaged_badxref: badxref,
    truncated: fw9.subarray(0, Math.floor(fw9.length * 0.6)),
    not_a_pdf: PNG_BYTES,
    // Owner password only (empty user password), AES-256: opens without a password, edit-restricted.
    owner_restricted: await qpdfNode(['--encrypt', '', 'owner', '256', '--', 'in.pdf', 'out.pdf'], plain),
    // Owner password only, AES-256, printing / changing / copying not allowed: opens without a password (TOOLS4 T3 notice, T4 lock refusal).
    owner_no_copy: await qpdfNode(['--encrypt', '', 'owner', '256', '--print=none', '--modify=none', '--extract=n', '--', 'in.pdf', 'out.pdf'], plain),
    signed_fake: await buildSignedFake(law),
    jpx_only: await imagePdf({ Filter: 'JPXDecode', ColorSpace: 'DeviceRGB', BitsPerComponent: 8 }, seededBytes(64 * 1024, 7), 200, 200),
    cmyk_jpeg: await imagePdf({ Filter: 'DCTDecode', ColorSpace: 'DeviceCMYK', BitsPerComponent: 8 }, await noisyJpeg(900, 900), 900, 900),
    junk_content: await buildJunkContent(),
  };
  /** @type {Record<string, string>} */
  const paths = {};
  for (const [name, bytes] of Object.entries(files)) {
    paths[name] = join(dir, `${name}.pdf`);
    writeFileSync(paths[name], bytes);
  }
  return paths;
}

/** Deterministic pseudo-random bytes (the spike LCG). */
export function seededBytes(n, seed) {
  const out = new Uint8Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (s >>> 16) & 0xff;
  }
  return out;
}

/** A JPEG of a seeded noisy colour gradient (large enough to be a compression candidate). */
export async function noisyJpeg(w, h, quality = 92) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  const id = g.createImageData(w, h);
  const noise = seededBytes(w * h, 99);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      const n = (noise[y * w + x] % 17) - 8;
      id.data[k] = (x * 255) / w + n;
      id.data[k + 1] = (y * 255) / h + n;
      id.data[k + 2] = 128 + n;
      id.data[k + 3] = 255;
    }
  }
  g.putImageData(id, 0, 0);
  return new Uint8Array(await c.encode('jpeg', quality));
}

/**
 * One A4 page drawing a single image XObject /Im1 (dictionary `dict` plus Width/Height, stream `bytes`)
 * at 400 × 400 pt. `content` replaces the page content stream when given. `extra(ctx)` may register
 * more objects (for example an /SMask) and returns entries to add to the image dictionary.
 */
export async function imagePdf(dict, bytes, width, height, { content, extra } = {}) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const ctx = doc.context;
  const page = doc.addPage([595, 842]);
  const imgDict = { Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ...dict, ...(extra ? extra(ctx) : {}) };
  const img = ctx.register(ctx.stream(bytes, imgDict));
  const draw = content ?? 'q 400 0 0 400 97 221 cm /Im1 Do Q';
  page.node.set(N('Contents'), ctx.register(ctx.stream(new TextEncoder().encode(draw))));
  page.node.set(N('Resources'), ctx.obj({ XObject: { Im1: img } }));
  return doc.save({ useObjectStreams: false });
}

/** kr_law_form plus an AcroForm signature field whose /V has /ByteRange and /Contents. */
async function buildSignedFake(law) {
  const doc = await PDFDocument.load(law, { updateMetadata: false });
  const ctx = doc.context;
  const sig = ctx.obj({
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    SubFilter: 'adbe.pkcs7.detached',
    ByteRange: [0, 100, 200, 300],
    Contents: PDFHexString.of('00'.repeat(64)),
  });
  const page = doc.getPage(0);
  const field = ctx.obj({
    FT: 'Sig',
    T: PDFHexString.fromText('Signature1'),
    V: ctx.register(sig),
    Type: 'Annot',
    Subtype: 'Widget',
    Rect: [0, 0, 0, 0],
    F: 132,
    P: page.ref,
  });
  const fieldRef = ctx.register(field);
  page.node.set(N('Annots'), ctx.obj([fieldRef]));
  doc.catalog.set(N('AcroForm'), ctx.obj({ Fields: [fieldRef], SigFlags: 3 }));
  return doc.save({ useObjectStreams: false });
}

/** A 900×900 JPEG image whose only `Do` is swallowed by garbage: unbalanced q/Q, stray delimiters, a 1 MB token and an unterminated string. */
async function buildJunkContent() {
  const junk = `q q q 1 0 0 1 0 0 cm ] ] >> ) ${'A'.repeat(1024 * 1024)} Q Q Q Q Q 0 0 m l S BT /F1 Tf (unterminated 12 0 0 12 0 0 cm /Im1 Do`;
  return imagePdf({ Filter: 'DCTDecode', ColorSpace: 'DeviceRGB', BitsPerComponent: 8 }, await noisyJpeg(900, 900), 900, 900, { content: junk });
}

/** Runs the qpdf CLI (qpdf-wasm, Node) on `input` at in.pdf and returns out.pdf. */
async function qpdfNode(args, input) {
  const factory = createRequire(import.meta.url)('@neslinesli93/qpdf-wasm/dist/qpdf.js');
  const m = await factory({ noInitialRun: true });
  m.FS.writeFile('/in.pdf', input);
  try {
    m.callMain(args);
  } catch (e) {
    if (typeof e?.status !== 'number') throw e;
  }
  return m.FS.readFile('/out.pdf');
}

/**
 * A valid 1-page PDF just over `megabytes` MB: the size comes from an unreferenced stream of random bytes,
 * which a merge does not copy. Used for the mobile soft limits in e2e (51 MB: merge, 21 MB: compress).
 */
export async function makeBigFixture(dir, megabytes = 51) {
  mkdirSync(dir, { recursive: true });
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([595, 842]).drawText('Large file fixture', { x: 60, y: 760, size: 20, font });
  doc.context.register(doc.context.stream(randomBytes(megabytes * 1024 * 1024)));
  const path = join(dir, `big_${megabytes}mb.pdf`);
  writeFileSync(path, await doc.save({ useObjectStreams: false }));
  return path;
}

/**
 * scan_multi_{pages}.pdf (Polish P.13 목표 용량 e2e): `pages` A6 scan pages, each the gen_scan_a6 image with
 * its own seeded noise (so no two image streams are equal and dedupe cannot merge them), JPEG q92.
 * Built from the committed fixture, so it needs no pdf.js rendering.
 */
export async function makeScanMultiFixture(dir, pages = 40) {
  mkdirSync(dir, { recursive: true });
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const scan = await PDFDocument.load(readFileSync(join(FIXTURES, 'gen_scan_a6.pdf')), { updateMetadata: false });
  let jpeg = null;
  for (const [, obj] of scan.context.enumerateIndirectObjects()) {
    if (!jpeg && obj?.dict?.get(N('Subtype')) === N('Image')) jpeg = obj.contents;
  }
  if (!jpeg) throw new Error('scan_multi: no image in gen_scan_a6.pdf');
  const img = await loadImage(Buffer.from(jpeg));
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  const out = await PDFDocument.create({ updateMetadata: false });
  for (let p = 0; p < pages; p++) {
    g.drawImage(img, 0, 0);
    const id = g.getImageData(0, 0, c.width, c.height);
    const noise = seededBytes(id.data.length / 4, 1000 + p);
    for (let k = 0, i = 0; k < id.data.length; k += 4, i++) {
      const n = (noise[i] % 7) - 3;
      id.data[k] += n;
      id.data[k + 1] += n;
      id.data[k + 2] += n;
    }
    g.putImageData(id, 0, 0);
    const page = await out.embedJpg(new Uint8Array(await c.encode('jpeg', 92)));
    out.addPage([297.64, 419.53]).drawImage(page, { x: 0, y: 0, width: 297.64, height: 419.53 });
  }
  const path = join(dir, `scan_multi_${pages}.pdf`);
  writeFileSync(path, await out.save({ useObjectStreams: false }));
  return path;
}

// ---------- committed PDF 용량 줄이기 fixtures (dev time: @napi-rs/canvas, pdf.js legacy build) ----------

const A6 = [297.64, 419.53];

/** Renders page `pageNo` (1-based) of `bytes` at `dpi` on white into an @napi-rs/canvas canvas. */
async function renderPage(bytes, pageNo, dpi) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const root = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    cMapUrl: join(root, 'cmaps') + '/',
    cMapPacked: true,
    standardFontDataUrl: join(root, 'standard_fonts') + '/',
    wasmUrl: join(root, 'wasm') + '/',
    verbosity: 0,
  });
  const doc = await task.promise;
  const page = await doc.getPage(pageNo);
  const viewport = page.getViewport({ scale: dpi / 72 });
  const cc = doc.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
  cc.context.fillStyle = '#fff';
  cc.context.fillRect(0, 0, cc.canvas.width, cc.canvas.height);
  await page.render({ canvas: cc.canvas, canvasContext: cc.context, viewport }).promise;
  const canvas = cc.canvas;
  await task.destroy();
  return canvas;
}

/**
 * gen_scan_a6.pdf: kr_law_form page 1 rendered at 150 dpi and placed on an A6 page (effective 300 ppi),
 * with the spike's MFP recipe (harness/gen.cjs): paper tone, 0.6 px blur, 0.35° skew, seeded noise ±9
 * (LCG seed 12345), colour JPEG q92.
 */
async function buildScanA6() {
  const { createCanvas } = await import('@napi-rs/canvas');
  const src = await renderPage(readFileSync(join(FIXTURES, 'kr_law_form.pdf')), 1, 150);
  const s = createCanvas(src.width, src.height);
  const g = s.getContext('2d');
  g.fillStyle = 'rgb(246,244,238)';
  g.fillRect(0, 0, s.width, s.height);
  g.filter = 'blur(0.6px)';
  g.globalCompositeOperation = 'multiply';
  g.translate(s.width / 2, s.height / 2);
  g.rotate((0.35 * Math.PI) / 180);
  g.translate(-s.width / 2, -s.height / 2);
  g.drawImage(src, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.filter = 'none';
  g.globalCompositeOperation = 'source-over';
  const id = g.getImageData(0, 0, s.width, s.height);
  const px = id.data;
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let k = 0; k < px.length; k += 4) {
    const n = (rnd() + rnd() + rnd() - 1.5) * 9;
    px[k] += n;
    px[k + 1] += n;
    px[k + 2] += n + 1;
  }
  g.putImageData(id, 0, 0);
  const jpg = new Uint8Array(await s.encode('jpeg', 92));
  const out = await PDFDocument.create({ updateMetadata: false });
  const img = await out.embedJpg(jpg);
  out.addPage(A6).drawImage(img, { x: 0, y: 0, width: A6[0], height: A6[1] });
  return out.save({ useObjectStreams: false });
}

/** A seeded, smooth colour "photo" (soft gradients and blobs, light sensor noise) as JPEG q92. */
async function smoothPhotoJpeg(w, h) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, 'rgb(208,222,236)');
  bg.addColorStop(1, 'rgb(176,194,214)');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const blob = (x, y, r, c0, c1) => {
    const rg = g.createRadialGradient(x, y, r * 0.1, x, y, r);
    rg.addColorStop(0, c0);
    rg.addColorStop(1, c1);
    g.fillStyle = rg;
    g.beginPath();
    g.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2);
    g.fill();
  };
  blob(w * 0.5, h * 1.02, w * 0.62, 'rgb(52,58,78)', 'rgb(30,34,48)'); // shoulders
  blob(w * 0.5, h * 0.42, w * 0.3, 'rgb(236,200,176)', 'rgb(206,160,136)'); // face
  blob(w * 0.5, h * 0.26, w * 0.32, 'rgb(40,30,26)', 'rgb(22,16,14)'); // hair
  blob(w * 0.5, h * 0.46, w * 0.26, 'rgb(238,204,182)', 'rgb(214,170,146)');
  const id = g.getImageData(0, 0, w, h);
  const noise = seededBytes(w * h, 4242);
  for (let i = 0; i < w * h; i++) {
    const n = (noise[i] % 7) - 3;
    id.data[i * 4] += n;
    id.data[i * 4 + 1] += n;
    id.data[i * 4 + 2] += n;
  }
  g.putImageData(id, 0, 0);
  return new Uint8Array(await c.encode('jpeg', 92));
}

/** gen_photo_resume.pdf: kr_law_form page 1 (real Korean text) plus a 1800×2400 photo drawn at 3×4 cm. */
async function buildPhotoResume() {
  const law = await PDFDocument.load(readFileSync(join(FIXTURES, 'kr_law_form.pdf')), { updateMetadata: false });
  const out = await PDFDocument.create({ updateMetadata: false });
  const [page] = await out.copyPages(law, [0]);
  out.addPage(page);
  const img = await out.embedJpg(await smoothPhotoJpeg(1800, 2400));
  const cm = 72 / 2.54;
  const { width, height } = page.getSize();
  page.drawImage(img, { x: width - 3 * cm - 40, y: height - 4 * cm - 60, width: 3 * cm, height: 4 * cm });
  return out.save({ useObjectStreams: false });
}

/** gen_already_small.pdf: our own 권장 output of kr_law_form (a unit test keeps it honest). */
async function buildAlreadySmall() {
  const { runnerImport } = await import('vite');
  const root = join(FIXTURES, '..', '..');
  const load = async (p) => (await runnerImport(join(root, p), { root })).module;
  await load('tests/helpers/image-data.ts');
  const { compressPdf } = await load('src/lib/pdf/compress/engine.ts');
  const { nodeCompressDeps } = await load('tests/helpers/compress-deps.ts');
  const law = new Uint8Array(readFileSync(join(FIXTURES, 'kr_law_form.pdf')));
  const r = await compressPdf(law, { level: 'recommended', expectedPages: 7 }, await nodeCompressDeps());
  if (r.keptOriginal) throw new Error('gen_already_small: kr_law_form did not shrink');
  return r.bytes;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = {
    'gen_links_outline.pdf': await buildLinksOutline(),
    'gen_landscape_rotated.pdf': await buildLandscapeRotated(),
    'gen_scan_a6.pdf': await buildScanA6(),
    'gen_photo_resume.pdf': await buildPhotoResume(),
    'gen_already_small.pdf': await buildAlreadySmall(),
  };
  for (const [name, bytes] of Object.entries(out)) {
    writeFileSync(join(FIXTURES, name), bytes);
    console.log(`fixtures: ${name} ${(bytes.length / 1024).toFixed(1)} KB`);
  }
  process.exit(0);
}
