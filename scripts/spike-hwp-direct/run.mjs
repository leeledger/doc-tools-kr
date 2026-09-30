// SPIKE-HWP-DIRECT runner. Serves harness/ with Vite (public/ as in production), then per browser × approach ×
// file calls window.DIRECT and stores the PDF; `--baseline` instead runs the production print path
// (regress/hwp-harness RUN + Chromium page.pdf) = the "current print output" the SSIM compares against.
// Memory: summed working set of the browser's process tree (memwatch.ps1), peak minus the idle level before
// the file is opened. Mobile: Chromium Pixel 7 + 4x CPU throttle; WebKit iPhone 13 (no throttle available).
// Usage: node scripts/spike-hwp-direct/run.mjs [--baseline] [--browsers chromium,firefox,webkit]
//        [--approaches A,B,C,H] [--only <regex>] [--set fixtures|sample|all] [--mobile] [--dpi 200] [--enc rule]
//        [--tag name]
// Output: regress-out/direct/<tag>/<browser>-<approach>/<key>.pdf and regress-out/direct/<tag>/results.json
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const arg = (n, d = null) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const corpus = resolve(process.env.CORPUS_DIR ?? 'C:/dev/doc-tools-kr/spikes/hwp/corpus');
const fixturesDir = join(root, 'tests', 'corpus', 'hwp');
export const SAMPLE = ['kr01', 'kr03', 'kr08', 'kr10', 'kr17', 'kr18', 'kr36', 'kr45', 'adm01', 'adm04', 'adm06', 'adm10', 'adm11', 'adm12', 'adm16', 'adm21', 'adm29', 'law01', 'law04', 'law08', 'law11', 'law16', 'law19', 'law20', 'na02', 'na05', 'na07', 'nt02', 'nt03', 'nt08'];
const set = arg('--set', 'all');
const inputs = new Map();
if (set !== 'sample') for (const f of readdirSync(fixturesDir).filter((x) => /\.hwpx?$/.test(x))) inputs.set(f.replace(/\.hwpx?$/, ''), join(fixturesDir, f));
if (set !== 'fixtures') for (const f of readdirSync(corpus).filter((x) => /\.hwpx?$/.test(x))) {
  const k = f.replace(/\.hwpx?$/, '');
  if (SAMPLE.includes(k)) inputs.set(k, join(corpus, f));
}
let keys = [...inputs.keys()].sort();
const only = arg('--only') ? new RegExp(arg('--only')) : null;
if (only) keys = keys.filter((k) => only.test(k));
const baseline = args.includes('--baseline');
const browsers = (arg('--browsers', 'chromium')).split(',');
const approaches = baseline ? ['P'] : arg('--approaches', 'C').split(',');
const mobile = args.includes('--mobile');
const tag = arg('--tag', baseline ? 'print' : mobile ? 'mobile' : 'desktop');
const opts = { dpi: Number(arg('--dpi', 200)), enc: arg('--enc', 'rule') };
const TIMEOUT = Number(arg('--timeout', 600)) * 1000;
const outDir = join(root, 'regress-out', 'direct', tag);
mkdirSync(outDir, { recursive: true });
const resultsPath = join(outDir, 'results.json');
const results = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, 'utf8')) : {};

const { createServer } = await import('vite');
const { rhwpNoDefaultWasm } = await import('../lib/vite-rhwp.mjs');
const pw = await import('@playwright/test');
const server = await createServer({
  root: join(root, 'scripts', 'spike-hwp-direct', 'harness'),
  publicDir: join(root, 'public'),
  configFile: false,
  logLevel: 'warn',
  server: { port: 0, host: '127.0.0.1', fs: { allow: [root, corpus] } },
  worker: { format: 'es', plugins: () => [rhwpNoDefaultWasm()] },
  plugins: [rhwpNoDefaultWasm()],
  optimizeDeps: { include: ['@cantoo/pdf-lib', '@cantoo/fontkit', 'jspdf', 'svg2pdf.js', 'fflate'] },
});
await server.listen();
const base = server.resolvedUrls.local[0];
const fsUrl = (p) => `/@fs/${p.split('\\').join('/').replace(/^\/+/, '')}`;
const pretendard = join(root, 'node_modules', 'pretendard', 'dist', 'web', 'static', 'pretendard-dynamic-subset.css').split('\\').join('/');

function memWatch(pid) {
  const ps = spawn('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'spike-hwp-direct', 'memwatch.ps1'), String(pid)]);
  const samples = [];
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
  return {
    samples,
    since: (t) => samples.filter(([x]) => x >= t).map(([, b]) => b),
    stop: () => ps.kill(),
  };
}

async function launch(name) {
  const server = await pw[name].launchServer({});
  const browser = await pw[name].connect(server.wsEndpoint());
  const mem = memWatch(server.process().pid);
  return { server, browser, mem, close: async () => { mem.stop(); await browser.close().catch(() => {}); await server.close().catch(() => {}); } };
}

for (const bname of browsers) {
  let B = await launch(bname);
  const version = B.browser.version();
  for (const ap of approaches) {
    const dir = join(outDir, `${bname}-${ap}`);
    mkdirSync(dir, { recursive: true });
    for (const key of keys) {
      const id = `${bname}-${ap}-${key}`;
      if (results[id]?.ok && !args.includes('--force')) continue;
      const ctxOpts = mobile ? (bname === 'webkit' ? { ...pw.devices['iPhone 13'] } : { ...pw.devices['Pixel 7'] }) : {};
      if (bname === 'firefox') delete ctxOpts.isMobile;
      const ctx = await B.browser.newContext(ctxOpts);
      await ctx.addInitScript(([p, r]) => { window.PRETENDARD_CSS = p; window.ROOT = r; }, [pretendard, root.replaceAll(String.fromCharCode(92), '/')]);
      const page = await ctx.newPage();
      if (mobile && bname === 'chromium') {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      }
      const r = { key, browser: bname, version, approach: ap, mobile };
      try {
        await page.goto(`${base}index.html`);
        await page.waitForFunction(() => window.DIRECT_READY && window.READY, null, { timeout: 30_000 });
        await new Promise((res) => setTimeout(res, 400));
        const idle = B.mem.samples.length ? B.mem.samples[B.mem.samples.length - 1][1] : 0;
        const tStart = Date.now();
        let res;
        if (ap === 'P') {
          res = await Promise.race([page.evaluate((u) => window.RUN(u), fsUrl(inputs.get(key))), new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), TIMEOUT))]);
          if (res.ok) {
            await page.emulateMedia({ media: 'print' });
            const tp = Date.now();
            const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, timeout: TIMEOUT });
            res.pdfMs = Date.now() - tp;
            res.pdfBytes = pdf.length;
            res.totalMs = res.ms.ready + res.pdfMs;
            writeFileSync(join(dir, `${key}.pdf`), pdf);
          }
        } else {
          res = await Promise.race([page.evaluate(([u, a, o]) => window.DIRECT(u, a, o), [fsUrl(inputs.get(key)), ap, opts]), new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), TIMEOUT))]);
          if (res.ok) {
            writeFileSync(join(dir, `${key}.pdf`), Buffer.from(res.b64, 'base64'));
            delete res.b64;
            res.totalMs = res.ms.total;
          }
        }
        await new Promise((res2) => setTimeout(res2, 300));
        const during = B.mem.since(tStart);
        Object.assign(r, res, { memIdleMB: idle / 1048576, memPeakMB: during.length ? Math.max(...during) / 1048576 : null, memDeltaMB: during.length ? (Math.max(...during) - idle) / 1048576 : null });
      } catch (err) {
        r.ok = false;
        r.error = String(err?.message ?? err).slice(0, 400);
      }
      results[id] = r;
      console.log(id, r.ok ? `ok pages=${r.pages} bytes=${((r.pdfBytes ?? 0) / 1e6).toFixed(2)}MB ms=${Math.round(r.totalMs ?? 0)} memΔ=${Math.round(r.memDeltaMB ?? 0)}MB miss=${r.missingGlyphs ?? '-'} fb=${r.fallbackPages ?? '-'} uns=${JSON.stringify(r.unsupported ?? {}).slice(0, 80)}` : `FAIL ${r.error}`);
      writeFileSync(resultsPath, JSON.stringify(results, null, 1));
      await ctx.close().catch(() => {});
      if (!r.ok) {
        await B.close();
        B = await launch(bname);
      }
    }
  }
  await B.close();
}
await server.close();
process.exit(0);
