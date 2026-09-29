// Regression harness for PDF 용량 줄이기 (brief Step 2 "Regression harness"). Local only, not CI.
// Runs src/lib/pdf/compress (engine + raster assembler) in Node with the shipped wasm on the committed
// fixtures and on every PDF in CORPUS_DIR (default spikes/pdf/corpus), and measures with the spike's
// bench_compress.cjs metrics: pdf.js render at 110 dpi (long side ≤ 1800 px), luma SSIM over 8×8
// windows with stride 4 on up to 7 sampled pages, text equality (all pages up to 60, else the sample).
// Usage: npm run regress:compress [-- --only <regex>] [-- --levels high,recommended,strong,raster]
// Output: regress-out/compress.json and regress-out/compress.md.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';
import { openPdf, pageText, renderRgba, unitSize } from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const corpus = resolve(root, process.env.CORPUS_DIR ?? 'spikes/pdf/corpus');
const fixtures = join(root, 'tests', 'fixtures');
const outDir = join(root, 'regress-out');
const args = process.argv.slice(2);
const only = args.includes('--only') ? new RegExp(args[args.indexOf('--only') + 1]) : null;
const LEVELS = args.includes('--levels') ? args[args.indexOf('--levels') + 1].split(',') : ['high', 'recommended', 'strong', 'raster'];
const PASSWORDS = { 'edge_encrypted_userpw_1234.pdf': '1234' };
const baseline = JSON.parse(readFileSync(join(root, 'scripts', 'regress', 'compress-baseline.json'), 'utf8')).files;
// Raster rows are judged against the shipped MozJPEG pipeline (Arch decision, 2026-09-29), not the spike's canvas JPEG.
const rasterBaseline = JSON.parse(readFileSync(join(root, 'scripts', 'regress', 'compress-raster-baseline.json'), 'utf8')).files;
/** A raster result may be offered only if it is at least 1 % smaller and its SSIMmin is at most this far below the baseline. */
const RASTER_SSIM_SLACK = 0.005;

// Named floors (brief). Level defaults to 권장.
const FLOORS = [
  { file: 'synth_scan_mfp_gongmun.pdf', level: 'recommended', reduction: 93, ssim: 0.94 },
  { file: 'synth_scan_phone_cv.pdf', level: 'recommended', reduction: 82, ssim: 0.96 },
  { file: 'synth_resume_kr_photo.pdf', level: 'recommended', reduction: 93, ssim: 0.99 },
  { file: 'scan_keti_bizreg_bank.pdf', level: 'recommended', reduction: 7, ssim: 0.99 },
  { file: 'kr_kpmg_outlook.pdf', level: 'recommended', reduction: 18, ssim: 0.96, text: '51/51' },
  { file: 'kr_gongmun_ice.pdf', level: 'recommended', reduction: 10 },
  { file: 'synth_scan_mfp_gongmun.pdf', level: 'high', reduction: 84, ssim: 0.95 },
  { file: 'synth_scan_mfp_gongmun.pdf', level: 'strong', reduction: 95, ssim: 0.92 },
  { file: 'edge_damaged_badxref.pdf', level: 'recommended', reduction: 9 },
  { file: 'kr_kpmg_outlook.pdf', level: 'raster', reduction: 71, ssim: 0.93 },
];
const KEPT_OR_2 = new Set(['scan_book_sangsomun.pdf', 'scan_donga_1949.pdf']);

const load = async (p) => (await runnerImport(join(root, p), { root })).module;
await load('tests/helpers/image-data.ts');
const { compressPdf } = await load('src/lib/pdf/compress/engine.ts');
const { RasterAssembler } = await load('src/lib/pdf/compress/raster.ts');
const { KEEP_ORIGINAL_RATIO, rasterScale } = await load('src/lib/pdf/compress/levels.ts');
const { ssimLuma, toLuma } = await load('src/lib/pdf/compress/ssim.ts');
const { nodeCompressDeps } = await load('tests/helpers/compress-deps.ts');
const deps = await nodeCompressDeps();

/** Spike `sample`: every page up to 6, else pages 1, 2 and five evenly spaced ones. */
const samplePages = (n) =>
  n <= 6 ? [...Array(n).keys()] : [...new Set([0, 1, ...Array.from({ length: 5 }, (_, k) => Math.round(((k + 1) * (n - 1)) / 5))])];

async function renderLuma(doc, i) {
  const u = await unitSize(doc, i);
  const scale = Math.min(110 / 72, 1800 / Math.max(u.width, u.height));
  const { rgba, w, h } = await renderRgba(doc, i, scale);
  return toLuma({ data: rgba, width: w, height: h });
}

async function raster(input, password, pages) {
  const doc = await openPdf(input, password);
  const asm = new RasterAssembler(deps);
  for (let i = 0; i < pages; i++) {
    const u = await unitSize(doc, i);
    const { rgba, w, h } = await renderRgba(doc, i, rasterScale(u.width, u.height));
    await asm.addPage(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), w, h, u.width, u.height);
  }
  await doc.close();
  const out = await asm.finish();
  const kept = out.length >= KEEP_ORIGINAL_RATIO * input.length;
  return { bytes: kept ? input : out, keptOriginal: kept, report: { imagesReplaced: 0, imagesSeen: 0, keptReason: kept ? 'raster-larger' : undefined } };
}

async function measure(input, password, out) {
  const A = await openPdf(input, password);
  // A kept result is the input itself (still encrypted when the input was).
  const B = await openPdf(out, out === input ? password : undefined);
  const n = A.numPages;
  const sample = samplePages(n);
  const textIdx = n <= 60 ? [...Array(n).keys()] : sample;
  let textOk = 0;
  for (const i of textIdx) {
    const ta = (await pageText(A, i)).replace(/\s+/g, '');
    const tb = i < B.numPages ? (await pageText(B, i)).replace(/\s+/g, '') : '';
    if (ta === tb) textOk++;
  }
  let ssimMin = 1;
  if (B.numPages === n) {
    for (const i of sample) ssimMin = Math.min(ssimMin, ssimLuma(await renderLuma(A, i), await renderLuma(B, i)));
  } else ssimMin = 0;
  const res = { pages: n, outPages: B.numPages, text: `${textOk}/${textIdx.length}`, textAll: textOk === textIdx.length, ssimMin: +ssimMin.toFixed(4) };
  await A.close();
  await B.close();
  return res;
}

async function runOne(dir, file, level) {
  const input = new Uint8Array(readFileSync(join(dir, file)));
  const password = PASSWORDS[file];
  const r = { file, level, inMB: +(input.length / 1048576).toFixed(2) };
  let pages;
  try {
    const d = await openPdf(input, password);
    pages = d.numPages;
    await d.close();
  } catch {
    // The page inspects with pdf.js first; a file it cannot open is reported as corrupt.
    return { ...r, error: 'corrupt' };
  }
  const t0 = performance.now();
  let res;
  try {
    res = level === 'raster' ? await raster(input, password, pages) : await compressPdf(input, { level, password, expectedPages: pages }, deps);
  } catch (err) {
    return { ...r, error: err?.code ?? `exception: ${String(err?.message ?? err).slice(0, 120)}` };
  }
  r.ms = Math.round(performance.now() - t0);
  r.outMB = +(res.bytes.length / 1048576).toFixed(2);
  r.reduction = +(100 * (1 - res.bytes.length / input.length)).toFixed(1);
  r.kept = res.keptOriginal;
  r.images = `${res.report.imagesReplaced}/${res.report.imagesSeen}`;
  if (res.report.repairedBy) r.repairedBy = res.report.repairedBy;
  Object.assign(r, await measure(input, password, res.bytes));
  return r;
}

function judge(r, fromCorpus) {
  const problems = [];
  const spike = r.spike ?? undefined;
  if (spike?.error) {
    if (r.error !== 'corrupt') problems.push(`expected error corrupt, got ${r.error ?? 'a result'}`);
    return problems;
  }
  if (r.error) return [`error ${r.error}`];
  if (r.level !== 'raster') {
    if (r.outPages !== r.pages) problems.push(`pages ${r.outPages}/${r.pages}`);
    if (!r.textAll) problems.push(`text ${r.text}`);
    if (spike) {
      const keptOk = spike.reduction < 1 && r.kept;
      if (!keptOk && r.reduction < spike.reduction - 3) problems.push(`reduction ${r.reduction} < spike ${spike.reduction} − 3`);
      if (r.ssimMin < spike.ssimMin - 0.005) problems.push(`SSIMmin ${r.ssimMin} < spike ${spike.ssimMin} − 0.005`);
    }
    if (fromCorpus && KEPT_OR_2.has(r.file) && !r.kept && r.reduction > 2) problems.push(`JPX/CCITT file shrank ${r.reduction} % (want kept or ≤ 2 %)`);
  } else {
    if (r.outPages !== r.pages) problems.push(`pages ${r.outPages}/${r.pages}`);
    // Offered only if ≥ 1 % smaller and within the SSIM gate; otherwise the original is kept.
    if (!r.kept && r.reduction < 1) problems.push(`raster offered at ${r.reduction} % (< 1 %)`);
    if (spike && !r.kept && r.ssimMin < spike.ssimMin - RASTER_SSIM_SLACK) problems.push(`raster SSIMmin ${r.ssimMin} < baseline ${spike.ssimMin} − ${RASTER_SSIM_SLACK}`);
    if (spike && spike.kept !== r.kept) problems.push(`raster ${r.kept ? 'kept' : 'offered'}, baseline ${spike.kept ? 'kept' : 'offered'}`);
    if (spike && !spike.kept && !r.kept && r.reduction < spike.reduction - 3) problems.push(`raster reduction ${r.reduction} < baseline ${spike.reduction} − 3`);
  }
  if (fromCorpus) {
    for (const f of FLOORS.filter((x) => x.file === r.file && x.level === r.level)) {
      if (r.reduction < f.reduction) problems.push(`reduction ${r.reduction} < floor ${f.reduction}`);
      if (f.ssim !== undefined && r.ssimMin < f.ssim) problems.push(`SSIMmin ${r.ssimMin} < floor ${f.ssim}`);
      if (f.text && r.text !== f.text) problems.push(`text ${r.text}, want ${f.text}`);
    }
  }
  if (!fromCorpus && r.file === 'gen_already_small.pdf' && r.level !== 'raster' && !r.kept) problems.push('gen_already_small was not kept');
  return problems;
}

const jobs = [];
for (const f of readdirSync(fixtures).filter((x) => x.endsWith('.pdf')).sort()) jobs.push({ dir: fixtures, file: f, corpus: false });
if (existsSync(corpus)) {
  for (const f of readdirSync(corpus).filter((x) => x.endsWith('.pdf')).sort()) jobs.push({ dir: corpus, file: f, corpus: true });
} else {
  console.log(`regress:compress: corpus not found at ${corpus}; running the committed fixtures only (set CORPUS_DIR).`);
}

const results = [];
for (const job of jobs) {
  if (only && !only.test(job.file)) continue;
  for (const level of LEVELS) {
    const spike = job.corpus ? baseline[job.file]?.[level] : undefined;
    // Raster runs where the spike measured it (the fixtures: always).
    if (level === 'raster' && job.corpus && !spike) continue;
    const r = await runOne(job.dir, job.file, level);
    r.source = job.corpus ? 'corpus' : 'fixture';
    // "Baseline": spike numbers for the normal levels, the MozJPEG raster baseline for raster (spike ms kept for timing).
    r.spike = level === 'raster' && job.corpus ? { ...rasterBaseline[job.file], ms: spike?.ms } : (spike ?? null);
    r.problems = judge(r, job.corpus);
    r.ok = r.problems.length === 0;
    r.slow = Boolean(spike?.ms && r.ms > 2 * spike.ms);
    results.push(r);
    console.log(
      `${r.ok ? 'PASS' : 'FAIL'} ${r.file} [${level}] ${r.error ? `error ${r.error}` : `${r.inMB} → ${r.outMB} MB (${r.reduction} %${r.kept ? ', kept' : ''}) SSIMmin ${r.ssimMin} text ${r.text} img ${r.images} ${r.ms} ms`}${r.problems.length ? ` — ${r.problems.join('; ')}` : ''}`,
    );
  }
}

const fmt = (v) => (v === undefined || v === null ? '–' : v);
const rows = results.map((r) => {
  const s = r.spike;
  const spikeRed = s ? (s.error ? 'ERR' : `${s.reduction}${s.kept ? ' (kept)' : ''}`) : '–';
  const spikeSsim = s && !s.error ? s.ssimMin : '–';
  return `| ${r.file} | ${r.level} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.error ? `error ${r.error}` : `${r.reduction}${r.kept ? ' (kept)' : ''}`} | ${spikeRed} | ${fmt(r.ssimMin)} | ${spikeSsim} | ${fmt(r.text)} | ${fmt(r.images)} | ${fmt(r.ms)}${r.slow ? ' ⚠' : ''} | ${s?.ms ?? '–'} | ${r.inMB} → ${fmt(r.outMB)} | ${r.problems.join('; ')} |`;
});
const table = [
  '| File | Level | Result | Reduction % | Baseline % | SSIMmin | Baseline SSIMmin | Text | Images | ms | Spike ms | MB in → out | Problems |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows,
].join('\n');
const failed = results.filter((r) => !r.ok).length;
const slow = results.filter((r) => r.slow).map((r) => `${r.file} [${r.level}] ${r.ms} ms vs spike ${r.spike.ms} ms`);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'compress.json'), JSON.stringify(results, null, 1));
writeFileSync(
  join(outDir, 'compress.md'),
  `${table}\n\n${results.length - failed}/${results.length} pass.${slow.length ? `\n\nSlower than 2 × spike (flag, not a failure):\n${slow.map((s) => `- ${s}`).join('\n')}` : ''}\n`,
);
console.log(`\n${results.length - failed}/${results.length} pass. Table: regress-out/compress.md`);
process.exit(failed ? 1 : 0);
