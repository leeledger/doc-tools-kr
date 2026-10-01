// Regression harness for HWP PDF 변환 (brief Step 5 "Regression harness"; HWP direct, SPIKE-HWP-DIRECT §6.9).
// Local only, not CI. Starts a Vite dev server on scripts/regress/hwp-harness/ (public/ served, so the vendored
// wasm and fonts load as in production), opens it in Playwright Chromium and, per file, runs the production
// worker and the production PDF export (exportPdf: vector writer + raster fallback) in the page, then scores
// the PDF bytes in Node with pdf.js against the official twin (content recall, ink IoU at 36 dpi, 2-up aware),
// checks them (rule 7: valid, no NaN/Infinity operand, no missing glyph, fallback pages) and reports SSIM
// against the print-path PDFs made once from main (PRINT_DIR, report only). On Windows the browser's process
// tree working set is sampled (memwatch.ps1): peak − idle per file.
// Inputs: the 10 fixtures (tests/corpus/hwp) always, plus every file in CORPUS_DIR (default spikes/hwp/corpus)
// with its twin <key>.pdf; manual classes from spikes/hwp/results/classes.v2.json (override: CLASSES).
// Usage: npm run regress:hwp [-- --fixtures-only] [-- --only <regex>] [-- --mobile] [-- --keep-pdf]
//        PRINT_DIR (default regress-out/direct/print/chromium-P): <key>.pdf of the old print path, if any.
//        node scripts/regress/hwp.mjs --make-baseline [--spike spikes/hwp]   (once: spike results → hwp-baseline.json)
// Every rhwp upgrade re-runs this harness on the full corpus before merge.
// Output: regress-out/hwp.json and regress-out/hwp.md.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { crop, gray, iou, ssim } from './hwp-ink.mjs';
import { openPdf, pageText, renderRgba, unitSize } from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const baselinePath = join(root, 'scripts', 'regress', 'hwp-baseline.json');
const fixturesDir = join(root, 'tests', 'corpus', 'hwp');

// ---------- rules (do not lower them; misses go under Blocked) ----------
// The 19 spike keys minus the five routed by equations only (HWP direct §6.6: law14, adm07, law09, law16, adm19).
const GUARDED_KEYS = ['adm04', 'adm11', 'adm16', 'adm28', 'adm29', 'adm30', 'law17', 'law19', 'law20', 'law21', 'nt01', 'nt02', 'nt03', 'nt04'];
const EXPECTED_MODES = {
  law05: ['convert', 'convert'],
  law07: ['convert', 'convert'],
  law10: ['convert', 'convert'],
  law18: ['convert', 'convert'],
  adm02: ['convert', 'convert'],
  adm14: ['convert', 'convert'],
  law09: ['convert', 'convert'],
  law17: ['viewer-first', 'viewer-first'],
  adm19: ['convert', 'convert'],
  adm28: ['viewer-first', 'viewer-only'],
};
const RECALL_MIN = 0.99;
const RECALL_SLACK = 0.002;
const INK_SLACK = 0.03;
const MAX_BROKEN_RATE = 0.05;
const SIZE_MAX_RATIO = 3;
const SIZE_MEDIAN_MAX = 1.5;
const KR01_MAX = 5 * 1_000_000;
// Export time, open → PDF bytes (desktop Chromium; the spike measured 1.9–3.2 s and 5.2–8.4 s).
const TIME_HARD = { law10: 4000, adm28: 15000 };
// The spike's 40-file sample (10 fixtures + 30 corpus files): 0 fallback pages there (rule 7).
const SAMPLE_40 = 'adm01 adm02 adm04 adm06 adm10 adm11 adm12 adm14 adm16 adm19 adm21 adm28 adm29 kr01 kr03 kr08 kr10 kr17 kr18 kr36 kr45 law01 law04 law05 law07 law08 law09 law10 law11 law16 law17 law18 law19 law20 na02 na05 na07 nt02 nt03 nt08'.split(' ');
const SSIM_SCALE = 100 / 72;
const MAX_SSIM_PAGES = 40;
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

/** Content streams (flate) with a NaN or Infinity operand, plus any outside streams. */
function badNumbers(bytes) {
  const buf = Buffer.from(bytes);
  let bad = 0;
  let i = 0;
  for (;;) {
    const s = buf.indexOf('stream', i);
    if (s < 0) break;
    let start = s + 6;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const e = buf.indexOf('endstream', start);
    if (e < 0) break;
    try {
      if (/(^|[\s[])-?(NaN|Infinity)\b/.test(inflateSync(buf.subarray(start, e)).toString('latin1'))) bad++;
    } catch {
      // not a flate stream (image, font)
    }
    i = e + 9;
  }
  if (/-Infinity|NaN/.test(buf.toString('latin1').replace(/stream[\s\S]*?endstream/g, ''))) bad++;
  return bad;
}

/** SSIM per page vs the print-path PDF (≤ 40 pages, evenly sampled), or null without one. */
async function ssimVsPrint(ours, printPath) {
  if (!printPath || !existsSync(printPath)) return null;
  const pr = await openPdf(new Uint8Array(readFileSync(printPath)));
  const n = Math.min(pr.numPages, ours.numPages);
  const pick = n <= MAX_SSIM_PAGES ? [...Array(n).keys()] : [...Array(MAX_SSIM_PAGES).keys()].map((i) => Math.round((i * (n - 1)) / (MAX_SSIM_PAGES - 1)));
  const vals = [];
  for (const i of pick) vals.push(ssim(gray(await renderRgba(pr, i, SSIM_SCALE)), gray(await renderRgba(ours, i, SSIM_SCALE))));
  await pr.close();
  return vals.length ? { mean: vals.reduce((x, y) => x + y, 0) / vals.length, min: Math.min(...vals) } : null;
}

async function score(ourPdf, twinPath, officialText, printPath) {
  const ours = await openPdf(new Uint8Array(ourPdf));
  const out = { pdfPages: ours.numPages, sizes: [] };
  let text = '';
  for (let i = 0; i < ours.numPages; i++) {
    text += await pageText(ours, i);
    if (i < 3) out.sizes.push(await unitSize(ours, i));
  }
  const oursContent = content(text);
  out.wordCount = text.split(/\s+/).filter(Boolean).length;
  out.badNumbers = badNumbers(ourPdf);
  // Valid: pdf.js opened it and read every page's text (above), and no operand is NaN/Infinity.
  out.valid = out.badNumbers === 0;
  const sv = await ssimVsPrint(ours, printPath);
  if (sv) {
    out.ssimMean = sv.mean;
    out.ssimMin = sv.min;
  }
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
      guard: (r.pages ?? 0) >= 100 || (f.textboxes ?? 0) >= 3,
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
const printDir = resolve(root, process.env.PRINT_DIR ?? 'regress-out/direct/print/chromium-P');
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
  optimizeDeps: { include: ['@cantoo/pdf-lib', '@cantoo/fontkit', 'fflate'] },
});
await server.listen();
const base = server.resolvedUrls.local[0];
const fsUrl = (p) => `/@fs/${p.split('\\').join('/').replace(/^\/+/, '')}`;

/** The browser process tree's working set, sampled by memwatch.ps1 (Windows only; elsewhere no samples). */
function memWatch(pid) {
  const samples = [];
  if (process.platform !== 'win32' || !pid) return { samples, since: () => [], stop: () => undefined };
  const ps = spawn('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'regress', 'memwatch.ps1'), String(pid)]);
  let buf = '';
  ps.stdout.on('data', (d) => {
    buf += d;
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const l of lines) {
      const [t, b] = l.trim().split(' ').map(Number);
      if (b) samples.push([t, b]);
    }
  });
  return { samples, since: (t) => samples.filter(([x]) => x >= t).map(([, b]) => b), stop: () => ps.kill() };
}
async function launch() {
  const srv = await pw.chromium.launchServer({});
  const b = await pw.chromium.connect(srv.wsEndpoint());
  const mem = memWatch(srv.process().pid);
  return { browser: b, mem, close: async () => { mem.stop(); await b.close().catch(() => undefined); await srv.close().catch(() => undefined); } };
}
let B = await launch();
let browser = B.browser;
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
    await new Promise((res2) => setTimeout(res2, 400));
    const idle = B.mem.samples.length ? B.mem.samples[B.mem.samples.length - 1][1] : 0;
    const tStart = Date.now();
    const res = await Promise.race([
      page.evaluate((u) => window.RUN(u), fsUrl(input.path)),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)),
    ]);
    await new Promise((res2) => setTimeout(res2, 300));
    const during = B.mem.since(tStart);
    r.memDeltaMB = during.length && idle ? (Math.max(...during) - idle) / 1048576 : null;
    const pdf = res.pdf ? Buffer.from(res.pdf, 'base64') : null;
    delete res.pdf;
    Object.assign(r, res);
    if (res.ok && pdf) {
      Object.assign(r, { failedPages: res.stats.failedPages, fallbackPages: res.stats.fallbackPages, missingGlyphs: res.stats.missingGlyphs, missingChars: res.stats.missingChars, nonFinite: res.stats.nonFinite, sanitizerRemovals: res.stats.sanitizerRemovals, unsupported: res.stats.unsupported, fontBytes: res.stats.fontBytes, images: res.stats.images });
      r.pdfBytes = pdf.length;
      if (args.includes('--keep-pdf')) {
        mkdirSync(join(root, 'regress-out', 'hwp-pdf'), { recursive: true });
        writeFileSync(join(root, 'regress-out', 'hwp-pdf', `${key}.pdf`), pdf);
      }
      if (!mobileMode) {
        const twin = haveCorpus ? join(corpus, `${key}.pdf`) : null;
        Object.assign(r, await score(pdf, twin, expected[key]?.officialText, join(printDir, `${key}.pdf`)));
      }
    }
  } catch (err) {
    r.ok = false;
    r.error = String(err instanceof Error ? err.message : err).slice(0, 300);
  }
  r.totalMs = Date.now() - t0;
  results[key] = r;
  console.log(key, r.ok ? `ok pages=${r.pages} pdf=${r.pdfPages ?? '-'} recall=${r.recall?.toFixed(4) ?? '-'} ink=${r.inkMean?.toFixed(3) ?? '-'} ssim=${r.ssimMean?.toFixed(3) ?? '-'}/${r.ssimMin?.toFixed(3) ?? '-'} export=${Math.round(r.ms?.ready ?? 0)}ms memΔ=${r.memDeltaMB != null ? Math.round(r.memDeltaMB) : '-'}MB fallback=${r.fallbackPages} missing=${r.missingGlyphs} MB=${((r.pdfBytes ?? 0) / 1e6).toFixed(2)} mode=${r.route?.desktop.mode}/${r.route?.mobile.mode}` : `FAIL ${r.error}`);
  await ctx.close().catch(() => undefined);
  if (!r.ok) {
    await B.close();
    B = await launch();
    browser = B.browser;
  }
  writeFileSync(join(root, 'regress-out', mobileMode ? 'hwp-mobile.json' : 'hwp.json'), JSON.stringify(results, null, 1));
}
await B.close();
await server.close();

// ---------- report ----------
const lines = [];
const out = (s = '') => lines.push(s);
if (mobileMode) {
  out('# regress:hwp — mobile profile (Pixel 7 emulation, 4x CPU throttle)');
  out('');
  out('| file | ok | pages | engine ms | parse ms | export ms | open → PDF ms | memory Δ MB | WASM MiB | fallback pages |');
  out('|---|---|---|---|---|---|---|---|---|---|');
  for (const k of keys) {
    const r = results[k];
    out(`| ${k} | ${r.ok ? 'yes' : `no: ${r.error}`} | ${r.pages ?? '-'} | ${Math.round(r.ms?.engine ?? 0)} | ${Math.round(r.ms?.parse ?? 0)} | ${Math.round(r.ms?.export ?? 0)} | ${Math.round(r.ms?.ready ?? 0)} | ${r.memDeltaMB != null ? Math.round(r.memDeltaMB) : '-'} | ${r.wasmBytes ? (r.wasmBytes / 1048576).toFixed(0) : '-'} | ${r.fallbackPages ?? '-'} |`);
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
    if (r.pdfPages !== r.pages) why.push(`PDF pages ${r.pdfPages} ≠ document pages ${r.pages}`);
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
  // (The baseline `ms` is the old render-to-ready time; the export time is judged by rule 6 instead.)
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
// Rule 2 (Arch F1; 14 keys since HWP direct): the routed set on the desktop profile = the guard keys + every file routed by a cap,
// and each cap-routed file is listed with its reason. Parity is checked on the guard reasons.
const CAP_KINDS = ['bytes', 'pages', 'wasm', 'images'];
const ours = rows.filter((r) => r.routed).map((r) => r.key).sort();
const guardRouted = rows.filter((r) => r.ok && r.route.desktop.reasons.some((x) => !CAP_KINDS.includes(x.kind))).map((r) => r.key);
const capRouted = rows.filter((r) => r.ok && r.route.desktop.reasons.some((x) => CAP_KINDS.includes(x.kind)));
const capLines = capRouted.map((r) => `${r.key}: ${r.route.desktop.reasons.filter((x) => CAP_KINDS.includes(x.kind)).map((x) => `${x.kind} ${x.value} > ${x.limit}`).join(', ')}`);
// On a --fixtures-only run this compares the fixture subset (the files actually run) only.
const parityDiff = [...guardRouted.filter((k) => !GUARDED_KEYS.includes(k)).map((k) => `+${k}`), ...GUARDED_KEYS.filter((k) => keys.includes(k) && !guardRouted.includes(k)).map((k) => `-${k}`)];
for (const d of parityDiff) {
  const r = results[d.slice(1)];
  fails.push(`rule 2: guard parity ${d} (pages ${r?.pages}, equations ${r?.equations}, textboxes ${r?.textboxes}, reasons ${JSON.stringify(r?.route?.desktop.reasons)})`);
}
const unexplained = ours.filter((k) => !GUARDED_KEYS.includes(k) && !capRouted.some((r) => r.key === k));
for (const k of unexplained) fails.push(`rule 2: ${k} routed neither by the guard keys nor by a cap`);
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
// Rule 6: export time, open → PDF bytes
for (const [k, lim] of Object.entries(TIME_HARD)) if (results[k]?.ok && results[k].ms.ready > lim) fails.push(`rule 6: ${k} open → PDF ${Math.round(results[k].ms.ready)} ms > ${lim} ms`);
// Rule 7 (HWP direct): every PDF valid, no missing glyph, recall ≥ 0.99 for guarded files too, and no fallback
// page on the spike's 40-file sample (fallback pages are reported for every file).
for (const r of rows.filter((x) => x.ok)) {
  if (!r.valid) fails.push(`rule 7: ${r.key} PDF not valid (${r.badNumbers} content stream(s) with NaN/Infinity)`);
  if (r.missingGlyphs > 0) fails.push(`rule 7: ${r.key} ${r.missingGlyphs} missing glyph(s): ${[...(r.missingChars ?? '')].map((c) => `${c} U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(', ')}`);
  if (r.recall != null && r.officialBytes != null && r.recall < RECALL_MIN) fails.push(`rule 7: ${r.key} recall ${r.recall.toFixed(4)} < ${RECALL_MIN}`);
  if (SAMPLE_40.includes(r.key) && r.fallbackPages > 0) fails.push(`rule 7: ${r.key} ${r.fallbackPages} fallback page(s) (${JSON.stringify(r.unsupported)})`);
}

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
out(partial ? `Guard parity: ${parityDiff.length ? parityDiff.join(' ') : 'fixture subset match'} (${guardRouted.length} guard-routed of ${keys.length} fixtures; the full check needs CORPUS_DIR)` : `Guard parity with the 14 keys (the 19 spike keys minus the equation-only five): ${parityDiff.length ? parityDiff.join(' ') : 'exact match'}`);
out(`Cap-routed (desktop): ${capLines.length ? capLines.join('; ') : 'none'}`);
out('');
out(`Size rule: ${sizeRows.length} non-routed files with ≥ 1 MB of images and a twin; median ratio ${median?.toFixed(2) ?? '-'}; ` + sizeRows.map((r) => `${r.key} ${(r.pdfBytes / r.officialBytes).toFixed(2)}×`).join(', '));
for (const k of ['kr01', 'kr17', 'adm04']) if (results[k]?.ok) out(`- ${k}: PDF ${(results[k].pdfBytes / 1e6).toFixed(2)} MB, official ${((results[k].officialBytes ?? 0) / 1e6).toFixed(2)} MB, images re-encoded ${results[k].images?.reencoded ?? '-'} / passed through ${results[k].images?.passthrough ?? '-'}`);
const ssimRows = rows.filter((r) => r.ssimMean != null);
if (ssimRows.length) out(`SSIM vs the print path (report only, ${ssimRows.length} files with a print PDF): mean ${(ssimRows.reduce((a, r) => a + r.ssimMean, 0) / ssimRows.length).toFixed(3)}, worst page ${Math.min(...ssimRows.map((r) => r.ssimMin)).toFixed(3)} (${ssimRows.reduce((a, r) => (r.ssimMin < a.ssimMin ? r : a)).key}); pages < 0.90 in: ${ssimRows.filter((r) => r.ssimMin < 0.9).map((r) => r.key).join(' ') || 'none'}`);
const fallbackTotal = rows.reduce((a, r) => a + (r.fallbackPages ?? 0), 0);
out(`Fallback pages: ${fallbackTotal} of ${rows.reduce((a, r) => a + (r.ok ? r.pages : 0), 0)} (${rows.filter((r) => r.fallbackPages > 0).map((r) => `${r.key} ${r.fallbackPages}`).join(', ') || 'none'})`);
const mems = rows.filter((r) => r.memDeltaMB != null);
if (mems.length) out(`Memory (browser tree working set, peak − idle): max ${Math.round(Math.max(...mems.map((r) => r.memDeltaMB)))} MB (${mems.reduce((a, r) => (r.memDeltaMB > a.memDeltaMB ? r : a)).key})${results.adm16?.memDeltaMB != null ? `; adm16 ${Math.round(results.adm16.memDeltaMB)} MB (budget 1,536 MB)` : ''}`);
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
out('| key | ok | pages (base) | PDF pages | recall (base) | ink mean/min (base) | SSIM vs print mean/min | dangling | sanitizer | measure | fallback | missing | open → PDF ms | memory Δ MB | PDF MB (×off) | fonts MB | mode desktop/mobile | class | auto |');
out('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const b = baseline[r.key] ?? {};
  out(
    `| ${r.key} | ${r.ok ? 'yes' : 'no'} | ${r.pages ?? '-'} (${b.pages ?? '-'}) | ${r.pdfPages ?? '-'} | ${r.recall?.toFixed(4) ?? '-'} (${b.recall ?? '-'}) | ${r.inkMean?.toFixed(3) ?? '-'}/${r.inkMin?.toFixed(3) ?? '-'} (${b.inkMean ?? '-'}) | ${r.ssimMean?.toFixed(3) ?? '-'}/${r.ssimMin?.toFixed(3) ?? '-'} | ${r.dangling ?? '-'} | ${r.sanitizerRemovals ?? '-'} | ${r.measureCalls ?? '-'} | ${r.fallbackPages ?? '-'} | ${r.missingGlyphs ?? '-'} | ${Math.round(r.ms?.ready ?? 0)} | ${r.memDeltaMB != null ? Math.round(r.memDeltaMB) : '-'} | ${r.pdfBytes ? (r.pdfBytes / 1e6).toFixed(2) : '-'}${r.officialBytes ? ` (${(r.pdfBytes / r.officialBytes).toFixed(2)})` : ''} | ${r.fontBytes != null ? (r.fontBytes / 1e6).toFixed(2) : '-'} | ${r.route ? `${r.route.desktop.mode}/${r.route.mobile.mode}` : '-'} | ${r.manual ?? '-'} | ${r.autoBroken ? 'broken' : ''} |`,
  );
}
writeFileSync(join(root, 'regress-out', 'hwp.md'), `${lines.join('\n')}\n`);
console.log(lines.slice(0, 40).join('\n'));
process.exit(fails.length ? 1 : 0);
