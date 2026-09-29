// Regression harness for PDF 합치기 (brief §3.4). Local only, not CI.
// Runs the spike merge scenarios S1–S5 (S7 with --large) through our src/lib/pdf/mergePlus.ts in Node
// and checks page count, per-page text equality, render SSIM, form fields, bookmarks and link targets.
// Usage: npm run regress:merge [-- --large] [-- --only S1]
// Corpus: CORPUS_DIR (default spikes/pdf/corpus). Output: regress-out/merge.json + a Markdown table.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const corpus = resolve(root, process.env.CORPUS_DIR ?? 'spikes/pdf/corpus');
const outDir = join(root, 'regress-out');
const args = process.argv.slice(2);
const large = args.includes('--large');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const SCENARIOS = {
  S1_mixed_office: [['kr_kcc_briefing.pdf'], ['irs_f1040.pdf'], ['kr_gongmun_msit.pdf'], ['en_iea_korea2025.pdf'], ['scan_keti_bizreg_bank.pdf']],
  S2_same_form_twice: [['irs_fw9.pdf'], ['irs_fw9.pdf']],
  S3_subset_with_links: [['en_iea_korea2025.pdf', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]], ['kr_kcc_briefing.pdf', [3, 0, 1]]],
  S4_user_password: [['edge_encrypted_userpw_1234.pdf', null, '1234'], ['kr_pen_doc.pdf']],
  S5_damaged_input: [['edge_damaged_badxref.pdf'], ['kr_pen_doc.pdf']],
  ...(large ? { S7_big_75MB: [['kr_kpmg_outlook.pdf'], ['kr_gongmun_ice.pdf'], ['scan_us_nkarmy_history.pdf']] } : {}),
};
const THRESHOLDS = {
  S1_mixed_office: { fields: 199, linksCorrect: 18, outline: 79 },
};
const SSIM_MIN = 0.999;
const SAMPLE_PAGES = 12;
const isScan = (name) => /^(scan_|synth_scan)/.test(name);

if (!existsSync(corpus)) {
  console.error(`regress:merge: corpus not found at ${corpus} (set CORPUS_DIR)`);
  process.exit(2);
}

const load = async (p) => (await runnerImport(join(root, p), { root })).module;
const { mergePlus } = await load('src/lib/pdf/mergePlus.ts');
const { PDFDocument } = await import('@cantoo/pdf-lib');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const pdfjsRoot = join(root, 'node_modules', 'pdfjs-dist');

async function openPdf(bytes, password) {
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

async function pageText(doc, i) {
  const page = await doc.getPage(i + 1);
  const tc = await page.getTextContent();
  return tc.items.map((it) => it.str ?? '').join('');
}

async function renderGray(doc, i, width = 600) {
  const page = await doc.getPage(i + 1);
  const unit = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / unit.width });
  const w = Math.ceil(viewport.width);
  const h = Math.ceil(viewport.height);
  const cc = doc.canvasFactory.create(w, h);
  cc.context.fillStyle = '#fff';
  cc.context.fillRect(0, 0, w, h);
  await page.render({ canvas: cc.canvas, canvasContext: cc.context, viewport }).promise;
  const rgba = cc.context.getImageData(0, 0, w, h).data;
  const g = new Float64Array(w * h);
  for (let k = 0; k < w * h; k++) g[k] = 0.299 * rgba[k * 4] + 0.587 * rgba[k * 4 + 1] + 0.114 * rgba[k * 4 + 2];
  doc.canvasFactory.destroy(cc);
  return { g, w, h };
}

/** Mean SSIM over 8×8 blocks (grayscale). */
function ssim(a, b) {
  if (a.w !== b.w || a.h !== b.h) return 0;
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let sum = 0;
  let n = 0;
  for (let y = 0; y + 8 <= a.h; y += 8) {
    for (let x = 0; x + 8 <= a.w; x += 8) {
      let ma = 0, mb = 0;
      for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) { const k = (y + dy) * a.w + x + dx; ma += a.g[k]; mb += b.g[k]; }
      ma /= 64; mb /= 64;
      let va = 0, vb = 0, cov = 0;
      for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) {
        const k = (y + dy) * a.w + x + dx;
        const da = a.g[k] - ma; const db = b.g[k] - mb;
        va += da * da; vb += db * db; cov += da * db;
      }
      va /= 63; vb /= 63; cov /= 63;
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      n++;
    }
  }
  return n ? sum / n : 1;
}

const countOutline = (o) => (o ?? []).reduce((a, it) => a + 1 + countOutline(it.items), 0);

async function fieldNames(bytes, password) {
  const d = await PDFDocument.load(bytes, { password: password ?? '', updateMetadata: false, throwOnInvalidObject: false });
  return d.getForm().getFields().map((f) => f.getName());
}

async function destIndex(doc, annot) {
  try {
    let d = annot.dest;
    if (typeof d === 'string') d = await doc.getDestination(d);
    if (!d) return -2;
    return typeof d[0] === 'object' ? await doc.getPageIndex(d[0]) : d[0];
  } catch {
    return -3;
  }
}

function samplePages(map, n) {
  const pick = new Set();
  const firstLast = new Map();
  map.forEach((m, i) => {
    if (!firstLast.has(m.fi)) firstLast.set(m.fi, [i, i]);
    firstLast.get(m.fi)[1] = i;
  });
  for (const [a, b] of firstLast.values()) { pick.add(a); pick.add(b); }
  for (let k = 0; k < n; k++) pick.add(Math.floor((k * (map.length - 1)) / Math.max(1, n - 1)));
  return [...pick].sort((a, b) => a - b);
}

async function runScenario(name, inputs) {
  const srcs = inputs.map(([f, pages, password]) => ({
    name: f,
    bytes: new Uint8Array(readFileSync(join(corpus, f))),
    pages: pages ?? null,
    password,
    title: f.replace(/\.pdf$/, ''),
  }));
  const res = { scenario: name, ok: true, errors: [] };
  const t0 = performance.now();
  let out;
  let report;
  try {
    ({ bytes: out, report } = await mergePlus(srcs.map((s) => ({ bytes: s.bytes, pages: s.pages, password: s.password, title: s.title }))));
  } catch (err) {
    res.ok = false;
    res.errors.push(`merge failed: ${err?.name} ${err?.message}`);
    return res;
  }
  res.ms = Math.round(performance.now() - t0);
  res.inMB = +(srcs.reduce((a, s) => a + s.bytes.length, 0) / 1048576).toFixed(2);
  res.outMB = +(out.length / 1048576).toFixed(2);
  res.report = report;

  const O = await openPdf(out);
  const docs = [];
  const map = [];
  let expOutline = 0;
  for (let fi = 0; fi < srcs.length; fi++) {
    const D = await openPdf(srcs[fi].bytes, srcs[fi].password);
    docs.push(D);
    if (!srcs[fi].pages) expOutline += countOutline(await D.getOutline());
    (srcs[fi].pages ?? [...Array(D.numPages).keys()]).forEach((p) => map.push({ fi, p }));
  }
  res.pages = O.numPages;
  res.expPages = map.length;
  if (res.pages !== res.expPages) res.errors.push(`pages ${res.pages} != ${res.expPages}`);

  // Text equality and render SSIM on sampled pages.
  const sample = samplePages(map, SAMPLE_PAGES);
  let textEq = 0;
  let ssimMin = 1;
  let ssimMinScan = 1;
  for (const i of sample) {
    const { fi, p } = map[i];
    if ((await pageText(O, i)) === (await pageText(docs[fi], p))) textEq++;
    else res.errors.push(`text differs on output page ${i + 1} (${srcs[fi].name} p${p + 1})`);
    const s = ssim(await renderGray(O, i), await renderGray(docs[fi], p));
    if (isScan(srcs[fi].name)) ssimMinScan = Math.min(ssimMinScan, s);
    else ssimMin = Math.min(ssimMin, s);
  }
  // Harness self-check: a rendered page must not look like a blank page to our SSIM.
  const first = await renderGray(O, 0);
  if (ssim(first, { ...first, g: new Float64Array(first.g.length).fill(255) }) > 0.99) {
    res.errors.push('SSIM self-check failed (page 1 indistinguishable from blank)');
  }
  res.textEq = `${textEq}/${sample.length}`;
  res.ssimMin = +ssimMin.toFixed(5);
  res.ssimMinScan = +ssimMinScan.toFixed(5);
  if (textEq !== sample.length) res.ok = false;
  if (ssimMin < SSIM_MIN) res.errors.push(`SSIM ${ssimMin.toFixed(5)} < ${SSIM_MIN}`);

  // Form fields (as a viewer's form sees them) and a fill round-trip.
  let expFields = 0;
  for (const s of srcs) if (!s.pages) expFields += (await fieldNames(s.bytes, s.password)).length;
  const names = await fieldNames(out);
  res.fields = `${names.length}/${expFields}`;
  res.fieldNamesUnique = new Set(names).size === names.length;
  if (!res.fieldNamesUnique) res.errors.push('duplicate field names');
  if (names.length) {
    const d = await PDFDocument.load(out, { updateMetadata: false });
    const tf = d.getForm().getFields().find((x) => x.constructor.name.includes('Text'));
    if (tf) {
      tf.setText('홍길동 TEST');
      const d2 = await PDFDocument.load(await d.save());
      res.fillOk = d2.getForm().getTextField(tf.getName()).getText() === '홍길동 TEST';
      if (!res.fillOk) res.errors.push('fill round-trip failed');
    }
  }

  // Bookmarks and internal links.
  res.outline = countOutline(await O.getOutline());
  res.expOutlineSrc = expOutline;
  let linkDest = 0, linkCorrect = 0, linkWrong = 0, linkDropped = 0;
  for (let i = 0; i < Math.min(O.numPages, map.length); i++) {
    const { fi, p } = map[i];
    const sa = (await (await docs[fi].getPage(p + 1)).getAnnotations()).filter((a) => a.subtype === 'Link' && a.dest);
    const oa = (await (await O.getPage(i + 1)).getAnnotations()).filter((a) => a.subtype === 'Link');
    for (const s of sa) {
      linkDest++;
      const st = await destIndex(docs[fi], s);
      const expected = map.findIndex((m) => m.fi === fi && m.p === st);
      const o = oa.find((x) => x.rect.every((v, k) => Math.abs(v - s.rect[k]) < 0.5));
      if (expected === -1) { linkDropped++; continue; }
      if (!o || !o.dest) { linkWrong++; continue; }
      if ((await destIndex(O, o)) === expected) linkCorrect++;
      else linkWrong++;
    }
  }
  Object.assign(res, { linkDest, linkCorrect, linkWrong, linkDropped });
  if (linkWrong) res.errors.push(`${linkWrong} link(s) point to the wrong page`);

  const th = THRESHOLDS[name];
  if (th) {
    if (names.length !== th.fields || expFields !== th.fields) res.errors.push(`fields ${names.length}/${expFields}, want ${th.fields}/${th.fields}`);
    if (linkCorrect !== th.linksCorrect) res.errors.push(`links correct ${linkCorrect}, want ${th.linksCorrect}`);
    if (res.outline !== th.outline) res.errors.push(`bookmarks ${res.outline}, want ${th.outline}`);
  }

  await O.close();
  for (const d of docs) await d.close();
  if (res.errors.length) res.ok = false;
  return res;
}

const results = [];
for (const [name, inputs] of Object.entries(SCENARIOS)) {
  if (only && !name.startsWith(only)) continue;
  const r = await runScenario(name, inputs);
  results.push(r);
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${name}${r.errors.length ? ` — ${r.errors.join('; ')}` : ''}`);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'merge.json'), JSON.stringify(results, null, 1));
const rows = results.map((r) =>
  `| ${r.scenario} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.pages ?? '–'}/${r.expPages ?? '–'} | ${r.textEq ?? '–'} | ${r.ssimMin ?? '–'} (scan ${r.ssimMinScan ?? '–'}) | ${r.fields ?? '–'}${r.fillOk === undefined ? '' : r.fillOk ? ' ✓fill' : ' ✗fill'} | ${r.outline ?? '–'} | ${r.linkCorrect ?? '–'}/${r.linkDest ?? '–'} (wrong ${r.linkWrong ?? '–'}, dropped ${r.linkDropped ?? '–'}) | ${r.ms ?? '–'} | ${r.inMB ?? '–'} → ${r.outMB ?? '–'} |`,
);
const table = [
  '| Scenario | Result | Pages | Text eq (sampled) | SSIM min non-scan | Fields | Bookmarks | Links correct | ms | MB in → out |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...rows,
].join('\n');
writeFileSync(join(outDir, 'merge.md'), `${table}\n`);
console.log(`\n${table}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
