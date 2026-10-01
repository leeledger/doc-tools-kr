// Regression pass for /hwp-viewer/ (G2 A0 deploy gate): the built viewer must open every corpus file and draw
// every page, with the same page count as the converter's PDF in the last regress:hwp run.
// Local only, not CI. Serves dist/ (tests/e2e/serve.mjs, the real headers and CSP), opens /hwp-viewer/ in
// Playwright Chromium per file (a fresh context each, so memory never carries over), waits for the document,
// compares the page count with regress-out/hwp.json (stats.pages: the PDF regress:hwp wrote), then walks the
// page box through every page and waits until that page is drawn (not the "이 쪽을 표시하지 못했습니다" tile).
// Console errors, page errors and CSP violations fail the file.
// Inputs: the 10 fixtures (tests/corpus/hwp) always, plus every .hwp/.hwpx in CORPUS_DIR (default
// spikes/hwp/corpus) unless --fixtures-only. Run `npm run regress:hwp` first (same CORPUS_DIR).
// Usage: npm run regress:hwp-viewer [-- --fixtures-only] [-- --only <regex>]
// Output: regress-out/hwp-viewer.json and regress-out/hwp-viewer.md; exit 1 on any failing file.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { startServer } from '../../tests/e2e/serve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const fixturesOnly = args.includes('--fixtures-only');
const only = args.includes('--only') ? new RegExp(args[args.indexOf('--only') + 1]) : null;
const PORT = 4191;
const OPEN_MS = 300_000;
const PAGE_MS = 60_000;

const outDir = join(root, 'regress-out');
const converterPath = join(outDir, 'hwp.json');
if (!existsSync(join(root, 'dist', 'hwp-viewer', 'index.html'))) {
  console.error('regress:hwp-viewer: dist/hwp-viewer/ not found. Build first.');
  process.exit(1);
}
if (!existsSync(converterPath)) {
  console.error('regress:hwp-viewer: regress-out/hwp.json not found. Run npm run regress:hwp first.');
  process.exit(1);
}
const converter = JSON.parse(readFileSync(converterPath, 'utf8'));

const inputs = new Map();
const fixturesDir = join(root, 'tests', 'corpus', 'hwp');
for (const f of readdirSync(fixturesDir).filter((x) => /\.hwpx?$/.test(x))) inputs.set(f.replace(/\.hwpx?$/, ''), join(fixturesDir, f));
if (!fixturesOnly) {
  const corpus = resolve(root, process.env.CORPUS_DIR ?? 'spikes/hwp/corpus');
  if (!existsSync(corpus)) {
    console.error(`regress:hwp-viewer: CORPUS_DIR ${corpus} not found. Pass --fixtures-only for a PARTIAL run.`);
    process.exit(1);
  }
  for (const f of readdirSync(corpus).filter((x) => /\.hwpx?$/.test(x))) inputs.set(f.replace(/\.hwpx?$/, ''), join(corpus, f));
}
const keys = [...inputs.keys()].sort().filter((k) => !only || only.test(k));

const server = await startServer({ root: join(root, 'dist'), port: PORT });
const browser = await chromium.launch();
const results = [];
try {
  for (const key of keys) {
    const t0 = Date.now();
    const row = { key, file: inputs.get(key), ok: false, converterPages: converter[key]?.stats?.pages ?? null, viewerPages: null, drawn: 0, failedPages: [], mode: null, errors: [], ms: 0 };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR', serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && row.errors.push(m.text()));
    page.on('pageerror', (e) => row.errors.push(String(e)));
    try {
      await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP ${e.violatedDirective}`)));
      await page.goto(`http://127.0.0.1:${PORT}/hwp-viewer/`, { waitUntil: 'load' });
      await page.setInputFiles('#hw-input', row.file);
      await page.waitForFunction(() => ['convert', 'viewer-first', 'viewer-only', 'error'].includes(document.getElementById('hwp-tool').dataset.state), null, { timeout: OPEN_MS });
      row.mode = await page.locator('#hwp-tool').getAttribute('data-state');
      if (row.mode === 'error') throw new Error(`error panel: ${(await page.locator('#hw-error').textContent()) || 'engine'}`);
      await page.locator('#hv-bar').waitFor({ state: 'visible', timeout: 30_000 });
      row.viewerPages = await page.locator('#hw-preview .page').count();
      for (let i = 0; i < row.viewerPages; i++) {
        await page.locator('#hv-page').fill(String(i + 1));
        await page.locator('#hv-page').press('Enter');
        await page.locator(`#hw-preview .page[data-page="${i}"].rendered`).waitFor({ state: 'attached', timeout: PAGE_MS });
        const failed = await page.locator(`#hw-preview .page[data-page="${i}"]`).evaluate((el) => el.classList.contains('failed') || !el.querySelector(':scope > svg'));
        if (failed) row.failedPages.push(i + 1);
        else row.drawn++;
      }
      row.ok = row.converterPages !== null && row.viewerPages === row.converterPages && !row.failedPages.length && !row.errors.length;
    } catch (err) {
      row.errors.push(String(err instanceof Error ? err.message : err).split('\n')[0]);
    } finally {
      row.ms = Date.now() - t0;
      await ctx.close();
    }
    results.push(row);
    console.log(`${row.ok ? 'ok  ' : 'FAIL'} ${key}: viewer ${row.viewerPages ?? '-'} / converter ${row.converterPages ?? '-'} pages, drawn ${row.drawn}, ${row.mode ?? '-'}, ${row.ms} ms${row.failedPages.length ? `, failed pages ${row.failedPages.join(' ')}` : ''}${row.errors.length ? `, ${row.errors.slice(0, 2).join(' | ')}` : ''}`);
  }
} finally {
  await browser.close();
  await server.close();
}

mkdirSync(outDir, { recursive: true });
const bad = results.filter((r) => !r.ok);
const pagesTotal = results.reduce((a, r) => a + r.drawn, 0);
writeFileSync(join(outDir, 'hwp-viewer.json'), JSON.stringify({ fixturesOnly, files: results }, null, 1));
const md = [
  `# regress:hwp-viewer (${fixturesOnly ? 'fixtures only, PARTIAL' : 'full corpus'})`,
  '',
  `${results.length - bad.length}/${results.length} files pass; ${pagesTotal.toLocaleString('en-US')} pages drawn.`,
  '',
  '| key | ok | viewer pages | converter pages | drawn | mode | ms | notes |',
  '|---|---|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.key} | ${r.ok ? 'yes' : '**no**'} | ${r.viewerPages ?? '-'} | ${r.converterPages ?? '-'} | ${r.drawn} | ${r.mode ?? '-'} | ${r.ms} | ${[r.failedPages.length ? `failed ${r.failedPages.join(' ')}` : '', ...r.errors].filter(Boolean).join('; ').replace(/\|/g, '/')} |`),
].join('\n');
writeFileSync(join(outDir, 'hwp-viewer.md'), `${md}\n`);
console.log(`regress:hwp-viewer: ${results.length - bad.length}/${results.length} pass, ${pagesTotal} pages drawn`);
process.exit(bad.length ? 1 : 0);
