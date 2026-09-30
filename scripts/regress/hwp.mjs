// Regression harness for HWP PDF 변환 (brief Step 5 "Regression harness"). Local only, not CI.
// Starts a Vite dev server on scripts/regress/hwp-harness/ (public/ served, so the vendored wasm and fonts load
// as in production), opens it in Playwright Chromium and, per file, runs the production worker, viewer
// post-processing, downscale and print CSS as a full render; then emulateMedia('print') + page.pdf and scores
// the PDF in Node with pdf.js against the official twin (content recall, ink IoU at 36 dpi, 2-up aware).
// Inputs: the 10 fixtures (tests/corpus/hwp) always, plus every file in CORPUS_DIR (default spikes/hwp/corpus)
// with its twin <key>.pdf; manual classes from spikes/hwp/results/classes.v2.json (override: CLASSES).
// Usage: npm run regress:hwp [-- --fixtures-only] [-- --only <regex>] [-- --mobile] [-- --keep-pdf]
//        node scripts/regress/hwp.mjs --make-baseline [--spike spikes/hwp]   (once: spike results → hwp-baseline.json)
// Every rhwp upgrade re-runs this harness on the full corpus before merge.
// Output: regress-out/hwp.json and regress-out/hwp.md.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crop, gray, iou } from './hwp-ink.mjs';
import { openPdf, pageText, renderRgba, unitSize } from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const baselinePath = join(root, 'scripts', 'regress', 'hwp-baseline.json');
const fixturesDir = join(root, 'tests', 'corpus', 'hwp');

// ---------- rules (do not lower them; misses go under Blocked) ----------
const GUARDED_KEYS = ['adm04', 'adm07', 'adm11', 'adm16', 'adm19', 'adm28', 'adm29', 'adm30', 'law09', 'law14', 'law16', 'law17', 'law19', 'law20', 'law21', 'nt01', 'nt02', 'nt03', 'nt04'];
const EXPECTED_MODES = {
  law05: ['convert', 'convert'],
  law07: ['convert', 'convert'],
  law10: ['convert', 'convert'],
  law18: ['convert', 'convert'],
  adm02: ['convert', 'convert'],
  adm14: ['convert', 'convert'],
  law09: ['viewer-first', 'viewer-first'],
  law17: ['viewer-first', 'viewer-first'],
  adm19: ['viewer-first', 'viewer-first'],
  adm28: ['viewer-first', 'viewer-only'],
};
const RECALL_MIN = 0.99;
const RECALL_SLACK = 0.002;
const INK_SLACK = 0.03;
const MAX_BROKEN_RATE = 0.05;
const SIZE_MAX_RATIO = 3;
const SIZE_MEDIAN_MAX = 1.5;
const KR01_MAX = 5 * 1_000_000;
const TIME_HARD = { law10: 3000, adm28: 15000 };
const TIMEOUT_MS = 300_000;
const MOBILE_KEYS = ['law09', 'kr18', 'kr17', 'adm04'];

const wilson = (k, n, z = 1.96) => {
  if (!n) return [0, 0];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - h) / d, (c + h) / d];
};
const pct = (x) => `${(x * 100).toFixed(1)} %`;
const CONTENT_RE = /[가-힣A-Za-z0-9]/g;
const content = (s) => s.normalize('NFKC').match(CONTENT_RE) ?? [];
const multiset = (arr) => {
  const m = new Map();
  for (const c of arr) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
};
function recallOf(official, ours) {
  const a = multiset(official);
  const b = multiset(ours);
  let inter = 0;
  for (const [c, n] of a) inter += Math.min(n, b.get(c) ?? 0);
  return official.length ? inter / official.length : 1;
}

async function score(ourPdf, twinPath, officialText) {
  const ours = await openPdf(new Uint8Array(ourPdf));
  const out = { pdfPages: ours.numPages, sizes: [] };
  let text = '';
  for (let i = 0; i < ours.numPages; i++) {
    text += await pageText(ours, i);
    if (i < 3) out.sizes.push(await unitSize(ours, i));
  }
  const oursContent = content(text);
  out.wordCount = text.split(/\s+/).filter(Boolean).length;
  if (twinPath && existsSync(twinPath)) {
    const off = await openPdf(new Uint8Array(readFileSync(twinPath)));
    let otext = '';
    for (let i = 0; i < off.numPages; i++) otext += await pageText(off, i);
    out.recall = recallOf(content(otext), oursContent);
    out.officialBytes = readFileSync(twinPath).length;
    // 2-up official PDFs (landscape sheets holding two portrait pages) are compared as halves.
    const aSize = await unitSize(off, 0);
    const bSize = await unitSize(ours, 0);
    let allLand = true;
    for (let i = 0; i < off.numPages; i++) {
      const s = await unitSize(off, i);
      if (!(s.width > s.height)) allLand = false;
    }
    const twoUp = aSize.width > aSize.height && bSize.width < bSize.height && ours.numPages >= 2 * off.numPages - 1 && allLand;
    const nOff = twoUp ? 2 * off.numPages : off.numPages;
    out.twoUp = twoUp;
    out.officialPages = off.numPages;
    if (nOff === ours.numPages) {
      const vals = [];
      for (let i = 0; i < ours.numPages; i++) {
        let a = gray(await renderRgba(off, twoUp ? Math.floor(i / 2) : i, 0.5));
        if (twoUp) a = i % 2 === 0 ? crop(a, 0, a.w >> 1) : crop(a, a.w >> 1, a.w);
        const b = gray(await renderRgba(ours, i, 0.5));
        vals.push(iou(a, b));
      }
      out.inkMean = vals.reduce((x, y) => x + y, 0) / vals.length;
      out.inkMin = Math.min(...vals);
    }
    await off.close();
  } else if (officialText) {
    out.recall = recallOf([...officialText], oursContent);
  }
  await ours.close();
  return out;
}

// ---------- baseline (once) ----------
if (args.includes('--make-baseline')) {
  const spike = resolve(root, arg('--spike') ?? 'spikes/hwp');
  const read = (f) => JSON.parse(readFileSync(join(spike, 'results', f), 'utf8'));
  const run = read('run.bundled.json');
  const recall = read('recall2.bundled.json');
  const cmp = read('compare.bundled.json');
  const feat = read('features.json');
  const files = {};
  // Ink is re-measured here with this harness's metric (pdf.js + hwp-ink.mjs) on the spike's own PDFs
  // (results/<key>.bundled.pdf): compare.py used PyMuPDF, whose rasteriser scores the same PDF up to
  // 0.09 differently (law22: 0.794 vs 0.706), which would turn a renderer difference into "auto-broken".
  for (const [k, r] of Object.entries(run)) {
    const f = feat[k] ?? {};
    const c = cmp[k];
    files[k] = {
      pages: r.pages ?? null,
      recall: recall[k]?.content_recall ?? null,
      inkMean: null,
      inkMin: null,
      inkMeanPyMuPDF: c?.ink_iou_mean ?? null,
      ms: r.ms ? Math.round(r.ms.init + r.ms.parse + r.ms.renderSvgAll + r.ms.fonts) : null,
      pdfBytes: r.pdfBytes ?? null,
      guard: (r.pages ?? 0) >= 100 || (f.equations ?? 0) > 0 || (f.textboxes ?? 0) >= 3,
    };
  }
  for (const k of Object.keys(files)) {
    const ours = join(spike, 'results', `${k}.bundled.pdf`);
    const twin = join(spike, 'corpus', `${k}.pdf`);
    if (!existsSync(ours) || !existsSync(twin)) continue;
    const sc = await score(readFileSync(ours), twin, null);
    files[k].inkMean = sc.inkMean != null ? Number(sc.inkMean.toFixed(3)) : null;
    files[k].inkMin = sc.inkMin != null ? Number(sc.inkMin.toFixed(3)) : null;
    console.log(k, files[k].inkMean, files[k].inkMeanPyMuPDF);
  }
  writeFileSync(baselinePath, `${JSON.stringify({ source: 'spikes/hwp/results {run,recall2,compare}.bundled.json + features.json (Corpus v2, rhwp 0.8.6); ink re-measured with scripts/regress/hwp-ink.mjs on the spike PDFs', files }, null, 1)}\n`);
  console.log(`regress:hwp: baseline written (${Object.keys(files).length} files)`);
  process.exit(0);
}

// ---------- run ----------
const fixturesOnly = args.includes('--fixtures-only');
const mobileMode = args.includes('--mobile');
const only = arg('--only') ? new RegExp(arg('--only')) : null;
const corpus = resolve(root, process.env.CORPUS_DIR ?? 'spikes/hwp/corpus');
const classesPath = resolve(root, process.env.CLASSES ?? join(dirname(corpus), 'results', 'classes.v2.json'));
const haveCorpus = existsSync(corpus) && !fixturesOnly;
if (!haveCorpus && !fixturesOnly) {
  console.error(`regress:hwp: CORPUS_DIR ${corpus} not found. Pass --fixtures-only for a PARTIAL run.`);
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')).files;
const classes = existsSync(classesPath) ? JSON.parse(readFileSync(classesPath, 'utf8')) : {};
const expected = JSON.parse(readFileSync(join(fixturesDir, 'expected.json'), 'utf8')).files;

const inputs = new Map();
for (const f of readdirSync(fixturesDir).filter((x) => /\.hwpx?$/.test(x))) inputs.set(f.replace(/\.hwpx?$/, ''), { path: join(fixturesDir, f), fixture: true });
if (haveCorpus) for (const f of readdirSync(corpus).filter((x) => /\.hwpx?$/.test(x))) {
  const key = f.replace(/\.hwpx?$/, '');
  inputs.set(key, { path: join(corpus, f), fixture: inputs.has(key) });
}
let keys = [...inputs.keys()].sort();
if (mobileMode) keys = MOBILE_KEYS.filter((k) => inputs.has(k));
if (only) keys = keys.filter((k) => only.test(k));

const { createServer } = await import('vite');
const { rhwpNoDefaultWasm } = await import('../lib/vite-rhwp.mjs');
const pw = await import('@playwright/test');
const server = await createServer({
  root: join(root, 'scripts', 'regress', 'hwp-harness'),
  publicDir: join(root, 'public'),
  configFile: false,
  logLevel: 'warn',
  server: { port: 0, host: '127.0.0.1', fs: { allow: [root, corpus] } },
  worker: { format: 'es', plugins: () => [rhwpNoDefaultWasm()] },
  plugins: [rhwpNoDefaultWasm()],
});
await server.listen();
const base = server.resolvedUrls.local[0];
const fsUrl = (p) => `/@fs/${p.split('\\').join('/').replace(/^\/+/, '')}`;

let browser = await pw.chromium.launch();
const chromiumVersion = browser.version();
const results = {};
mkdirSync(join(root, 'regress-out'), { recursive: true });
for (const key of keys) {
  const input = inputs.get(key);
  const ctx = await browser.newContext(mobileMode ? { ...pw.devices['Pixel 7'] } : {});
  const page = await ctx.newPage();
  if (mobileMode) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  const r = { key, file: basename(input.path), fixture: input.fixture };
  const t0 = Date.now();
  try {
    await page.goto(`${base}index.html`);
    await page.waitForFunction(() => window.READY);
    const res = await Promise.race([
      page.evaluate((u) => window.RUN(u), fsUrl(input.path)),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)),
    ]);
    Object.assign(r, res);
    if (res.ok && !mobileMode) {
      await page.emulateMedia({ media: 'print' });
      const tp = Date.now();
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 600_000 });
      r.pdfMs = Date.now() - tp;
      r.pdfBytes = pdf.length;
      if (args.includes('--keep-pdf')) {
        mkdirSync(join(root, 'regress-out', 'hwp-pdf'), { recursive: true });
        writeFileSync(join(root, 'regress-out', 'hwp-pdf', `${key}.pdf`), pdf);
      }
      const twin = haveCorpus ? join(corpus, `${key}.pdf`) : null;
      Object.assign(r, await score(pdf, twin, expected[key]?.officialText));
    }
  } catch (err) {
    r.ok = false;
    r.error = String(err instanceof Error ? err.message : err).slice(0, 300);
  }
  r.totalMs = Date.now() - t0;
  results[key] = r;
  console.log(key, r.ok ? `ok pages=${r.pages} pdf=${r.pdfPages ?? '-'} recall=${r.recall?.toFixed(4) ?? '-'} ink=${r.inkMean?.toFixed(3) ?? '-'} ready=${Math.round(r.ms?.ready ?? 0)}ms mode=${r.route?.desktop.mode}/${r.route?.mobile.mode}` : `FAIL ${r.error}`);
  await ctx.close().catch(() => undefined);
  if (!r.ok) {
    await browser.close().catch(() => undefined);
    browser = await pw.chromium.launch();
  }
  writeFileSync(join(root, 'regress-out', mobileMode ? 'hwp-mobile.json' : 'hwp.json'), JSON.stringify(results, null, 1));
}
await browser.close();
await server.close();

// ---------- report ----------
const lines = [];
const out = (s = '') => lines.push(s);
if (mobileMode) {
  out('# regress:hwp — mobile profile (Pixel 7 emulation, 4x CPU throttle)');
  out('');
  out('| file | ok | pages | engine ms | parse ms | render ms | fonts ms | ready ms | WASM MiB |');
  out('|---|---|---|---|---|---|---|---|---|');
  for (const k of keys) {
    const r = results[k];
    out(`| ${k} | ${r.ok ? 'yes' : `no: ${r.error}`} | ${r.pages ?? '-'} | ${Math.round(r.ms?.engine ?? 0)} | ${Math.round(r.ms?.parse ?? 0)} | ${Math.round(r.ms?.render ?? 0)} | ${Math.round(r.ms?.fonts ?? 0)} | ${Math.round(r.ms?.ready ?? 0)} | ${r.wasmBytes ? (r.wasmBytes / 1048576).toFixed(0) : '-'} |`);
  }
  writeFileSync(join(root, 'regress-out', 'hwp-mobile.md'), `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
  process.exit(0);
}

const flagged = [];
const fails = [];
const rows = [];
for (const k of keys) {
  const r = results[k];
  const b = baseline[k] ?? {};
  const why = [];
  if (!r.ok) why.push(`error: ${r.error}`);
  else {
    if (b.pages != null && r.pages !== b.pages) why.push(`pages ${r.pages} ≠ baseline ${b.pages}`);
    if (r.pdfPages !== r.screenPages) why.push(`PDF pages ${r.pdfPages} ≠ screen pages ${r.screenPages}`);
    if (r.recall != null && r.officialBytes != null && r.recall < RECALL_MIN) why.push(`recall ${r.recall.toFixed(4)} < ${RECALL_MIN}`);
    if (r.recall != null && b.recall != null && r.recall < b.recall - RECALL_SLACK) why.push(`recall ${r.recall.toFixed(4)} < baseline ${b.recall} − ${RECALL_SLACK}`);
    if (r.dangling > 0) why.push(`dangling refs ${r.dangling}`);
    if (r.failedPages > 0) why.push(`${r.failedPages} page(s) did not parse: ${(r.parseErrors ?? []).join(' | ').slice(0, 300)}`);
    if (r.sanitizerRemovals > 0) why.push(`sanitizer removed ${r.sanitizerRemovals}`);
    if (r.inkMean != null && b.inkMean != null && r.inkMean < b.inkMean - INK_SLACK) why.push(`ink ${r.inkMean.toFixed(3)} < baseline ${b.inkMean} − ${INK_SLACK}`);
  }
  r.autoBroken = why.length > 0;
  r.autoWhy = why;
  r.manual = classes[k]?.class ?? null;
  r.broken = r.manual === 'broken' || r.autoBroken;
  r.routed = r.ok ? r.route.desktop.mode !== 'convert' : Boolean(b.guard);
  if (r.autoBroken) flagged.push(`${k}: ${why.join('; ')}`);
  if (r.ok && b.ms && r.ms.ready > 2 * b.ms) flagged.push(`${k}: ready ${Math.round(r.ms.ready)} ms > 2 × baseline ${b.ms} ms (flag, not a failure)`);
  rows.push(r);
}
const setStats = (set) => {
  const n = set.length;
  const k = set.filter((r) => r.broken).length;
  const [lo, hi] = wilson(k, n);
  return { n, broken: k, rate: n ? k / n : 0, lo, hi, keys: set.filter((r) => r.broken).map((r) => r.key) };
};
const all = setStats(rows);
const non = setStats(rows.filter((r) => !r.routed));
const routedSet = setStats(rows.filter((r) => r.routed));

// Rule 1
if (haveCorpus && non.rate > MAX_BROKEN_RATE) fails.push(`rule 1: non-routed broken rate ${pct(non.rate)} > 5.0 %`);
// Rule 2: routing parity on the desktop profile
const ours = rows.filter((r) => r.routed).map((r) => r.key).sort();
const parityDiff = haveCorpus ? [...ours.filter((k) => !GUARDED_KEYS.includes(k)).map((k) => `+${k}`), ...GUARDED_KEYS.filter((k) => keys.includes(k) && !ours.includes(k)).map((k) => `-${k}`)] : [];
for (const d of parityDiff) {
  const r = results[d.slice(1)];
  fails.push(`rule 2: routing parity ${d} (pages ${r?.pages}, equations ${r?.equations}, textboxes ${r?.textboxes}, reasons ${JSON.stringify(r?.route?.desktop.reasons)})`);
}
// Rule 3: fixtures
for (const [k, [dm, mm]] of Object.entries(EXPECTED_MODES)) {
  const r = results[k];
  if (!r) continue;
  if (!r.ok) {
    fails.push(`rule 3: fixture ${k} failed: ${r.error}`);
    continue;
  }
  if (r.pages !== expected[k].pages) fails.push(`rule 3: fixture ${k} pages ${r.pages} ≠ expected ${expected[k].pages}`);
  if (dm === 'convert' && r.recall != null && r.recall < RECALL_MIN) fails.push(`rule 3: fixture ${k} recall ${r.recall.toFixed(4)} < 0.99`);
  if (r.route.desktop.mode !== dm) fails.push(`rule 3: fixture ${k} desktop mode ${r.route.desktop.mode} ≠ ${dm}`);
  if (r.route.mobile.mode !== mm) fails.push(`rule 3: fixture ${k} mobile mode ${r.route.mobile.mode} ≠ ${mm}`);
}
// Rule 4
for (const r of rows.filter((x) => x.ok)) {
  if (r.measureCalls > 0) fails.push(`rule 4: ${r.key} measureCalls ${r.measureCalls}`);
  if (r.sanitizerRemovals > 0) fails.push(`rule 4: ${r.key} sanitizer removals ${r.sanitizerRemovals}`);
}
// Rule 5: size
const sizeRows = rows.filter((r) => r.ok && !r.routed && r.officialBytes && r.imageBytes >= 1_000_000);
const ratios = sizeRows.map((r) => r.pdfBytes / r.officialBytes).sort((a, b) => a - b);
const median = ratios.length ? (ratios.length % 2 ? ratios[(ratios.length - 1) / 2] : (ratios[ratios.length / 2 - 1] + ratios[ratios.length / 2]) / 2) : null;
for (const r of sizeRows) if (r.pdfBytes > SIZE_MAX_RATIO * r.officialBytes) fails.push(`rule 5: ${r.key} PDF ${(r.pdfBytes / 1e6).toFixed(1)} MB > 3 × official ${(r.officialBytes / 1e6).toFixed(1)} MB`);
if (median != null && median > SIZE_MEDIAN_MAX) fails.push(`rule 5: median size ratio ${median.toFixed(2)} > 1.5`);
if (results.kr01?.ok && results.kr01.pdfBytes > KR01_MAX) fails.push(`rule 5: kr01 PDF ${(results.kr01.pdfBytes / 1e6).toFixed(1)} MB > 5 MB`);
// Rule 6
for (const [k, lim] of Object.entries(TIME_HARD)) if (results[k]?.ok && results[k].ms.ready > lim) fails.push(`rule 6: ${k} render-to-ready ${Math.round(results[k].ms.ready)} ms > ${lim} ms`);

const partial = !haveCorpus;
out(`# regress:hwp${partial ? ' — PARTIAL (fixtures only, no corpus)' : ''}`);
out('');
out(`Files: ${rows.length} (${rows.filter((r) => r.fixture).length} fixtures). Conversions ok: ${rows.filter((r) => r.ok).length}. Chromium ${chromiumVersion}`);
out('');
out('## Gate (broken = manual class "broken" OR auto-broken)');
out('');
out('| set | n | broken | rate | Wilson 95 % CI | broken keys |');
out('|---|---|---|---|---|---|');
for (const [name, s] of [['all', all], ['non-routed (TS scan + route.ts, desktop)', non], ['routed', routedSet]]) out(`| ${name} | ${s.n} | ${s.broken} | ${pct(s.rate)} | ${pct(s.lo)}–${pct(s.hi)} | ${s.keys.join(' ')} |`);
out('');
out(`Routed set (desktop): ${ours.join(' ')}`);
out(`Routing parity with the 19 spike keys: ${parityDiff.length ? parityDiff.join(' ') : 'exact match'}`);
out('');
out(`Size rule: ${sizeRows.length} non-routed files with ≥ 1 MB of images and a twin; median ratio ${median?.toFixed(2) ?? '-'}; ` + sizeRows.map((r) => `${r.key} ${(r.pdfBytes / r.officialBytes).toFixed(2)}×`).join(', '));
for (const k of ['kr01', 'kr17', 'adm04']) if (results[k]?.ok) out(`- ${k}: PDF ${(results[k].pdfBytes / 1e6).toFixed(2)} MB, official ${((results[k].officialBytes ?? 0) / 1e6).toFixed(2)} MB, downscaled ${results[k].downscaled}`);
out('');
out(`Pass rules: ${fails.length ? 'FAIL' : 'all pass'}`);
for (const f of fails) out(`- ${f}`);
out('');
out('## Flagged rows');
for (const f of flagged) out(`- ${f}`);
if (!flagged.length) out('- none');
out('');
out('## Per file');
out('');
out('| key | ok | pages (base) | PDF pages | recall (base) | ink mean/min (base) | dangling | sanitizer | measure | spaces | fitted | downscaled | ready ms (base) | PDF MB (×off) | mode desktop/mobile | class | auto |');
out('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const b = baseline[r.key] ?? {};
  out(
    `| ${r.key} | ${r.ok ? 'yes' : 'no'} | ${r.pages ?? '-'} (${b.pages ?? '-'}) | ${r.pdfPages ?? '-'} | ${r.recall?.toFixed(4) ?? '-'} (${b.recall ?? '-'}) | ${r.inkMean?.toFixed(3) ?? '-'}/${r.inkMin?.toFixed(3) ?? '-'} (${b.inkMean ?? '-'}) | ${r.dangling ?? '-'} | ${r.sanitizerRemovals ?? '-'} | ${r.measureCalls ?? '-'} | ${r.spacesAdded ?? '-'} | ${r.fillFitted ?? '-'} | ${r.downscaled ?? '-'} | ${Math.round(r.ms?.ready ?? 0)} (${b.ms ?? '-'}) | ${r.pdfBytes ? (r.pdfBytes / 1e6).toFixed(2) : '-'}${r.officialBytes ? ` (${(r.pdfBytes / r.officialBytes).toFixed(2)})` : ''} | ${r.route ? `${r.route.desktop.mode}/${r.route.mobile.mode}` : '-'} | ${r.manual ?? '-'} | ${r.autoBroken ? 'broken' : ''} |`,
  );
}
writeFileSync(join(root, 'regress-out', 'hwp.md'), `${lines.join('\n')}\n`);
console.log(lines.slice(0, 40).join('\n'));
process.exit(fails.length ? 1 : 0);
