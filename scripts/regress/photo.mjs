// Regression harness for 사진 용량 줄이기 (brief Step 3 "Regression harness"). Local only, not CI.
// Starts a Vite dev server on scripts/regress/photo-harness/, opens it in Playwright (Chromium by default)
// and runs the production worker (src/lib/image/photo.worker.ts) on the committed photo fixtures and every
// image in CORPUS_DIR (default spikes/photo/corpus), at the spike byte targets, in 품질 우선 and 빠른 모드,
// plus a naive canvas baseline for the blockiness guard. Metrics are computed in the page.
// Usage: npm run regress:photo [-- --browser firefox|webkit] [-- --only <regex>] [-- --fixtures-only]
//        Without the corpus the run fails unless --fixtures-only is given (then the report says PARTIAL).
//        node scripts/regress/photo.mjs --make-baseline   (once: spike results → photo-baseline.json)
// Output: regress-out/photo.json and regress-out/photo.md.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const baselinePath = join(root, 'scripts', 'regress', 'photo-baseline.json');

const TARGETS = [
  { label: '500KB', bytes: 512_000 },
  { label: '200KB', bytes: 204_800 },
  { label: '100KB', bytes: 102_400 },
  { label: '50%', percent: 50 },
];
const BASELINE_CFGS = ['fit-mozjpeg', 'hybrid-mozjpeg', 'fit-canvas-jpeg-q40'];

if (args.includes('--make-baseline')) {
  const spike = JSON.parse(readFileSync(resolve(root, arg('--spike') ?? 'spikes/photo/results/compress.json'), 'utf8'));
  const images = {};
  for (const [id, v] of Object.entries(spike.images)) {
    images[id] = {};
    for (const r of v.rows) {
      if (!BASELINE_CFGS.includes(r.cfg) || r.ssim === undefined) continue;
      (images[id][r.target] ??= {})[r.cfg] = { ssim: r.ssim, psnr: r.psnr, ms: r.ms };
    }
  }
  writeFileSync(baselinePath, `${JSON.stringify({ source: 'spikes/photo/results/compress.json', chromium: spike.chromium, images }, null, 1)}\n`);
  console.log(`regress:photo: baseline written (${Object.keys(images).length} images)`);
  process.exit(0);
}

// Brief thresholds. Do not lower them; report misses under Blocked.
const MEANS = {
  '500KB': { q: [0.945, 36.8], f: [0.942, 35.7] },
  '200KB': { q: [0.905, 34.9], f: [0.906, 34.2] },
  '100KB': { q: [0.865, 31.7], f: [0.868, 31.4] },
  '50%': { q: [0.968, 39.3], f: [0.966, 38.3] },
};
const SSIM_SLACK = 0.01;
const PSNR_SLACK = 0.6;
/** A re-baselined pair (`baseline-jpeg`, our own measured numbers) gets only run-to-run noise as slack. */
const REBASE_SSIM_SLACK = 0.001;
const REBASE_PSNR_SLACK = 0.05;
/** Mean PSNR(품질) − PSNR(빠른) per target (Arch F4: 100 KB ≥ +0.45 dB after the scale re-search). */
const MOZ_GAIN = { '500KB': 0.5, '200KB': 0.5, '100KB': 0.45, '50%': 0.5 };
const UTIL_MIN = 0.93;
/**
 * Absolute blockiness cap for 품질 우선 on the corpus photos (Arch F6: 1.25 × the largest MozJPEG BI of the
 * first full run, rounded up to 0.1). That run's largest corpus BI was 1.968 (g03 at 200 KB) → 2.5. The
 * synthetic fixtures are left out: their flat patches put real colour edges on the 8-px grid (p3_patches
 * BI 391.6), so BI does not measure blocking there.
 */
const BI_CAP = 2.5;
/** Arch F5: PSNR of the s02_p3 50 % output against its decoded original. */
const S02_MIN_PSNR = 31.0;

const { createServer } = await import('vite');
const pw = await import('@playwright/test');
const browserName = arg('--browser') ?? 'chromium';
const only = arg('--only') ? new RegExp(arg('--only')) : null;
const corpus = resolve(root, process.env.CORPUS_DIR ?? 'spikes/photo/corpus');
const fixtures = join(root, 'tests', 'fixtures', 'photo');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')).images;

const server = await createServer({
  root: join(root, 'scripts', 'regress', 'photo-harness'),
  configFile: false,
  logLevel: 'warn',
  server: { port: 0, host: '127.0.0.1', fs: { allow: [root, corpus] } },
  worker: { format: 'es' },
  optimizeDeps: { noDiscovery: true, include: [] },
});
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await pw[browserName].launch();
const page = await browser.newPage();
page.setDefaultTimeout(0);
await page.goto(base);
await page.waitForFunction(() => window.harnessReady === true);
const fsUrl = (p) => `/@fs/${p.split('\\').join('/').replace(/^\/+/, '')}`;

const jobs = [];
for (const f of readdirSync(fixtures).sort()) if (/\.(jpe?g|png|gif|webp)$/i.test(f)) jobs.push({ id: f, path: join(fixtures, f), corpus: false });
if (existsSync(corpus)) {
  for (const f of readdirSync(corpus).sort()) if (/\.(jpe?g|png|webp|heic|avif)$/i.test(f)) jobs.push({ id: f.replace(/\.[^.]+$/, ''), path: join(corpus, f), corpus: true });
} else if (args.includes('--fixtures-only')) {
  console.log(`regress:photo: PARTIAL run, corpus not found at ${corpus}; committed fixtures only (--fixtures-only).`);
} else {
  console.error(`regress:photo: corpus not found at ${corpus}. Set CORPUS_DIR, or pass --fixtures-only for a PARTIAL run.`);
  await browser.close();
  await server.close();
  process.exit(1);
}

const rows = [];
const specials = [];
const opt = (t) => (t.percent ? { mode: 'percent', percent: t.percent } : { mode: 'target', targetBytes: t.bytes });

for (const job of jobs) {
  if (only && !only.test(job.id)) continue;
  const info = await page.evaluate((u) => window.harness.prepare(u), fsUrl(job.path));
  if (job.id === 'h01_example') {
    const r = await page.evaluate((o) => window.harness.compress(o), { ...opt(TARGETS[1]), format: 'jpeg', fast: false, maxLongEdge: null });
    specials.push({ check: 'HEIC h01 gives heic, never corrupt', ok: r.error === 'heic', got: r.error ?? 'a result' });
    console.log(`${r.error === 'heic' ? 'PASS' : 'FAIL'} h01_example: ${r.error ?? 'a result'}`);
    continue;
  }
  if (info.decodeError) {
    console.log(`SKIP ${job.id}: the browser cannot decode it (${info.decodeError})`);
    continue;
  }
  if (job.id === 'anim.gif') continue; // animated: a row error by design (unit and e2e tested)
  for (const t of TARGETS) {
    const target = t.percent ? Math.floor((info.size * t.percent) / 100) : t.bytes;
    if (target >= info.size) continue; // the spike skipped targets the original already meets
    const row = { image: job.id, source: job.corpus ? 'corpus' : 'fixture', target: t.label, targetBytes: target, inBytes: info.size, w: info.w, h: info.h };
    for (const [key, fast] of [
      ['q', false],
      ['f', true],
    ]) {
      const r = await page.evaluate((o) => window.harness.compress(o), { ...opt(t), format: 'jpeg', fast, maxLongEdge: null });
      row[key] = r.error
        ? { error: r.error }
        : { bytes: r.bytes, util: +(r.bytes / target).toFixed(3), ssim: +r.ssim.toFixed(4), psnr: +r.psnr.toFixed(2), bi: +r.bi.toFixed(3), q: r.report.q, enc: r.report.encoder, outW: r.w, outH: r.h, ms: r.ms, sof: r.sof, fallback: r.report.mozjpegFallback };
    }
    const n = await page.evaluate((tb) => window.harness.naive(tb), target);
    row.naive = n.fits ? { q: n.q, ssim: +n.ssim.toFixed(4), psnr: +n.psnr.toFixed(2), bi: +n.bi.toFixed(3) } : { fits: false };
    row.base = job.corpus ? (baseline[job.id]?.[t.label] ?? null) : null;
    row.problems = judge(row);
    rows.push(row);
    const fmt = (x) => (x.error ? `error ${x.error}` : `${x.bytes} B q${x.q} ${x.enc} ${x.outW}×${x.outH} SSIM ${x.ssim} PSNR ${x.psnr} BI ${x.bi} ${x.ms} ms`);
    console.log(`${row.problems.length ? 'FAIL' : 'PASS'} ${job.id} [${t.label}] 품질 ${fmt(row.q)} | 빠른 ${fmt(row.f)} | naive ${n.fits ? `q${n.q} BI ${row.naive.bi}` : 'no fit'}${row.problems.length ? ` — ${row.problems.join('; ')}` : ''}`);
  }
  if (job.id === 's01_exif6') {
    const q = rows.find((r) => r.image === 's01_exif6' && r.q && !r.q.error);
    const ok = Boolean(q && q.q.outH > q.q.outW);
    specials.push({ check: 's01_exif6 output is portrait', ok, got: q ? `${q.q.outW}×${q.q.outH}` : 'no output' });
  }
  if (job.id === 's02_p3') {
    const r = rows.find((x) => x.image === 's02_p3' && x.target === '50%');
    const v = r && !r.q.error ? r.q.psnr : null;
    specials.push({ check: `s02_p3 at 50 %: PSNR(output, decoded original) ≥ ${S02_MIN_PSNR} dB`, ok: v !== null && v >= S02_MIN_PSNR, got: v === null ? 'no output' : `${v} dB` });
  }
  await page.evaluate(() => window.harness.release());
}
const browserLabel = `${browserName} ${browser.version()}`;
await browser.close();
await server.close();

function judge(r) {
  const p = [];
  for (const [key, name] of [
    ['q', '품질'],
    ['f', '빠른'],
  ]) {
    const x = r[key];
    if (x.error) {
      p.push(`${name}: error ${x.error}`);
      continue;
    }
    if (x.bytes > r.targetBytes) p.push(`${name}: ${x.bytes} > target ${r.targetBytes}`);
    if (Math.max(x.outW, x.outH) > 64 && x.q !== null && (x.enc === 'canvas' ? x.q < 0.5 : x.q < 50)) p.push(`${name}: q ${x.q} below the floor`);
    if (x.sof !== 0xc0) p.push(`${name}: not baseline (SOF 0x${x.sof.toString(16)})`);
  }
  const b = r.base;
  if (b && !r.q.error) {
    // Arch F3-ii: a pair re-baselined to the measured baseline-JPEG numbers is judged against them.
    const fit = b['fit-mozjpeg'];
    const hyb = b['hybrid-mozjpeg'];
    const rebased = b['baseline-jpeg'];
    const ref = rebased ?? (fit && hyb ? (fit.ssim <= hyb.ssim ? fit : hyb) : (fit ?? hyb));
    const ss = rebased ? REBASE_SSIM_SLACK : SSIM_SLACK;
    const ps = rebased ? REBASE_PSNR_SLACK : PSNR_SLACK;
    if (ref && r.q.ssim < ref.ssim - ss) p.push(`품질 SSIM ${r.q.ssim} < ${ref.ssim} − ${ss}${rebased ? ' (re-baselined)' : ''}`);
    if (ref && r.q.psnr < ref.psnr - ps) p.push(`품질 PSNR ${r.q.psnr} < ${ref.psnr} − ${ps}${rebased ? ' (re-baselined)' : ''}`);
  }
  // Arch F3-iii: 빠른 모드 is not compared per pair with the spike's q40 reference (its 0.50 floor is an
  // anti-blocking choice); its target, floor and blockiness rules still apply.
  if (r.source === 'corpus' && !r.q.error && r.q.bi > BI_CAP) p.push(`품질 BI ${r.q.bi} > cap ${BI_CAP}`);
  if (r.naive.q !== undefined && r.naive.q < 0.3 && !r.q.error && !(r.q.bi < r.naive.bi)) p.push(`blockiness: 품질 BI ${r.q.bi} ≥ naive BI ${r.naive.bi} (naive q ${r.naive.q})`);
  return p;
}

// ---------- aggregate rules ----------
const avg = (xs) => (xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : NaN);
const median = (xs) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const ok = (r, k) => r[k] && !r[k].error;
const aggregate = [];
const add = (check, pass, got) => aggregate.push({ check, ok: pass, got });
/** Corpus-only rules in a PARTIAL (--fixtures-only) run: reported as skipped, not failed on empty means. */
const partial = !existsSync(corpus);
const addCorpus = (check, pass, got) => (partial ? aggregate.push({ check, ok: true, skipped: true, got: 'skipped: no corpus (PARTIAL run)' }) : add(check, pass, got));

const encodes = rows.length * 2;
const produced = rows.reduce((a, r) => a + ['q', 'f'].filter((k) => ok(r, k)).length, 0);
const overshoots = rows.reduce((a, r) => a + ['q', 'f'].filter((k) => ok(r, k) && r[k].bytes > r.targetBytes).length, 0);
add('Fit: every encode ≤ target (0 overshoots, 0 errors)', produced === encodes && overshoots === 0, `${produced}/${encodes} encodes produced, ${overshoots} overshoots`);
for (const k of ['q', 'f']) {
  const u = avg(rows.filter((r) => ok(r, k)).map((r) => r[k].util));
  add(`Mean utilisation ≥ ${UTIL_MIN} (${k === 'q' ? '품질 우선' : '빠른 모드'})`, u >= UTIL_MIN, u.toFixed(3));
}
for (const id of ['p02', 'p11']) {
  const r = rows.find((x) => x.image === id && x.target === '100KB');
  if (r) add(`${id} at 100 KB fits (naive cannot)`, ok(r, 'q') && ok(r, 'f') && r.q.bytes <= r.targetBytes && r.f.bytes <= r.targetBytes, `품질 ${r.q.bytes ?? r.q.error}, 빠른 ${r.f.bytes ?? r.f.error}, naive ${r.naive.fits === false ? 'no fit' : `q${r.naive.q}`}`);
}
const meansTable = [];
const timing = [];
for (const t of TARGETS) {
  const set = rows.filter((r) => r.target === t.label && r.base && ok(r, 'q') && ok(r, 'f'));
  const allSet = rows.filter((r) => r.target === t.label && ok(r, 'q') && ok(r, 'f'));
  const m = {
    n: set.length,
    qs: avg(set.map((r) => r.q.ssim)),
    qp: avg(set.map((r) => r.q.psnr)),
    fs: avg(set.map((r) => r.f.ssim)),
    fp: avg(set.map((r) => r.f.psnr)),
    allN: allSet.length,
    allQs: avg(allSet.map((r) => r.q.ssim)),
    allQp: avg(allSet.map((r) => r.q.psnr)),
    spike: avg(set.map((r) => r.base['hybrid-mozjpeg']?.ssim).filter((v) => v !== undefined)),
  };
  meansTable.push({ target: t.label, ...m });
  const [qs, qp] = MEANS[t.label].q;
  const [fs, fp] = MEANS[t.label].f;
  addCorpus(`Mean ${t.label} 품질 우선 SSIM ≥ ${qs} / PSNR ≥ ${qp}`, m.qs >= qs && m.qp >= qp, `${m.qs.toFixed(4)} / ${m.qp.toFixed(2)} (n ${m.n})`);
  addCorpus(`Mean ${t.label} 빠른 모드 SSIM ≥ ${fs} / PSNR ≥ ${fp}`, m.fs >= fs && m.fp >= fp, `${m.fs.toFixed(4)} / ${m.fp.toFixed(2)} (n ${m.n})`);
  addCorpus(`MozJPEG gain ${t.label}: mean PSNR(품질) − PSNR(빠른) ≥ +${MOZ_GAIN[t.label]} dB`, m.qp - m.fp >= MOZ_GAIN[t.label], `${(m.qp - m.fp).toFixed(2)} dB`);
  const ms = median(allSet.map((r) => r.q.ms));
  const spikeMs = median(set.map((r) => r.base['hybrid-mozjpeg']?.ms).filter((v) => v !== undefined));
  timing.push({ target: t.label, ms, fastMs: median(allSet.map((r) => r.f.ms)), spikeMs, slow: ms > 2 * spikeMs });
}
const floorOk = rows.every((r) => !r.problems.some((p) => p.includes('floor')));
add('Floor: final q ≥ 50 (MozJPEG) / ≥ 0.50 (canvas) when the long edge is over 64', floorOk, floorOk ? 'all' : 'see rows');
const blockPairs = rows.filter((r) => r.naive.q !== undefined && r.naive.q < 0.3 && ok(r, 'q'));
const corpusBi = rows.filter((r) => r.source === 'corpus' && ok(r, 'q')).map((r) => r.q.bi);
add(`Blockiness cap: BI(품질) ≤ ${BI_CAP} on every corpus photo`, corpusBi.every((v) => v <= BI_CAP), `max ${Math.max(...corpusBi).toFixed(3)}`);
add('Blockiness: BI(품질) < BI(naive) wherever naive q < 0.30', blockPairs.every((r) => r.q.bi < r.naive.bi), `${blockPairs.filter((r) => r.q.bi < r.naive.bi).length}/${blockPairs.length} pairs`);
const p03 = rows.find((r) => r.image === 'p03' && r.target === '100KB');
if (p03) add('p03 at 100 KB: BI(품질) < BI(naive)', ok(p03, 'q') && p03.naive.bi !== undefined && p03.q.bi < p03.naive.bi, `품질 ${p03.q.bi}, naive ${p03.naive.bi ?? 'no fit'} (naive q ${p03.naive.q ?? '–'})`);
for (const s of specials) add(s.check, s.ok, s.got);

const failedRows = rows.filter((r) => r.problems.length);
const failedAgg = aggregate.filter((a) => !a.ok);
const dist = (xs) => (xs.length ? `min ${Math.min(...xs).toFixed(3)} · median ${median(xs).toFixed(3)} · max ${Math.max(...xs).toFixed(3)}` : '–');

const cell = (x) => (x?.error ? `error ${x.error}` : x ? `${x.ssim} / ${x.psnr}` : '–');
const baseCell = (b, cfg) => (b?.[cfg] ? `${b[cfg].ssim} / ${b[cfg].psnr}` : '–');
const md = [
  `# regress:photo — ${browserLabel}${existsSync(corpus) ? '' : ' — PARTIAL (no corpus, fixtures only)'}`,
  '',
  `Inputs: ${new Set(rows.map((r) => r.image)).size} images (${relative(root, fixtures)} and ${existsSync(corpus) ? relative(root, corpus) : 'no corpus'}). Encodes: ${encodes}.`,
  '',
  '## Aggregate rules',
  '',
  '| Rule | Result | Measured |',
  '|---|---|---|',
  ...aggregate.map((a) => `| ${a.check} | ${a.skipped ? 'SKIP' : a.ok ? 'PASS' : 'FAIL'} | ${a.got} |`),
  '',
  '## Means per target (spike-baseline images; "all" includes every input)',
  '',
  '| Target | n | 품질 우선 SSIM / PSNR | 빠른 모드 SSIM / PSNR | Gain dB | all n | all 품질 SSIM / PSNR | spike hybrid SSIM |',
  '|---|---|---|---|---|---|---|---|',
  ...meansTable.map((m) => `| ${m.target} | ${m.n} | ${m.qs.toFixed(4)} / ${m.qp.toFixed(2)} | ${m.fs.toFixed(4)} / ${m.fp.toFixed(2)} | ${(m.qp - m.fp).toFixed(2)} | ${m.allN} | ${m.allQs.toFixed(4)} / ${m.allQp.toFixed(2)} | ${m.spike.toFixed(4)} |`),
  '',
  '## Timing (median ms per image, worker wall time incl. wasm compile)',
  '',
  '| Target | 품질 우선 | 빠른 모드 | spike hybrid-mozjpeg | Flag (> 2×) |',
  '|---|---|---|---|---|',
  ...timing.map((t) => `| ${t.target} | ${Math.round(t.ms)} | ${Math.round(t.fastMs)} | ${Number.isNaN(t.spikeMs) ? '–' : Math.round(t.spikeMs)} | ${t.slow ? 'SLOW' : ''} |`),
  '',
  '## Blockiness distribution (BI; ≈ 1 = no block edges)',
  '',
  `- 품질 우선: ${dist(rows.filter((r) => ok(r, 'q')).map((r) => r.q.bi))}`,
  `- 빠른 모드: ${dist(rows.filter((r) => ok(r, 'f')).map((r) => r.f.bi))}`,
  `- naive: ${dist(rows.filter((r) => r.naive.bi !== undefined).map((r) => r.naive.bi))}`,
  `- naive where q < 0.30: ${dist(blockPairs.map((r) => r.naive.bi))}; 품질 우선 on those pairs: ${dist(blockPairs.map((r) => r.q.bi))}`,
  '',
  '## Rows',
  '',
  '| Image | Target | Result | 품질 SSIM / PSNR | q · enc · size | 빠른 SSIM / PSNR | q | util 품질 / 빠른 | BI 품질 / 빠른 / naive (q) | spike fit-moz | spike hybrid-moz | spike canvas-q40 | Problems |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${r.image} | ${r.target} | ${r.problems.length ? 'FAIL' : 'PASS'} | ${cell(r.q)} | ${r.q.q ?? '–'} · ${r.q.enc ?? '–'} · ${r.q.outW ?? '–'}×${r.q.outH ?? '–'} | ${cell(r.f)} | ${r.f.q ?? '–'} | ${r.q.util ?? '–'} / ${r.f.util ?? '–'} | ${r.q.bi ?? '–'} / ${r.f.bi ?? '–'} / ${r.naive.bi ?? 'no fit'} (${r.naive.q ?? '–'}) | ${baseCell(r.base, 'fit-mozjpeg')} | ${baseCell(r.base, 'hybrid-mozjpeg')} | ${baseCell(r.base, 'fit-canvas-jpeg-q40')} | ${r.problems.join('; ')} |`,
  ),
  '',
  `${rows.length - failedRows.length}/${rows.length} rows pass; ${aggregate.length - failedAgg.length}/${aggregate.length} aggregate rules pass.`,
  '',
].join('\n');
const outDir = join(root, 'regress-out');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'photo.json'), JSON.stringify({ browser: browserLabel, rows, aggregate, meansTable, timing }, null, 1));
writeFileSync(join(outDir, 'photo.md'), md);
console.log(`\n${rows.length - failedRows.length}/${rows.length} rows pass; ${aggregate.length - failedAgg.length}/${aggregate.length} aggregate rules pass. Table: regress-out/photo.md`);
for (const a of failedAgg) console.log(`FAIL ${a.check}: ${a.got}`);
process.exit(failedRows.length || failedAgg.length ? 1 : 0);
