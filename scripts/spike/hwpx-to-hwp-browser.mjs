// TOOLS5 U4 spike (report only, never shipped): HWPX → HWP with rhwp inside Playwright Chromium, desktop and
// phone emulation (Pixel 7 viewport + 4x CPU throttle). The page is served from a fake origin by page.route
// (rhwp.js + the vendored wasm + the input file); the engine runs in a dedicated module Worker as the product's
// HWP worker does. Per file: open, exportHwpVerify, exportHwpWithReport, reload, page counts, times, the
// worker's wasm linear memory (the engine's peak working set; it never shrinks), and the SHA-256 of the produced bytes (compared with the Node run when --node-dir has <key>.hwp).
// Usage: node scripts/spike/hwpx-to-hwp-browser.mjs [--node-dir DIR] [--out DIR]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const nodeDir = arg('--node-dir');
const outDir = resolve(arg('--out') ?? join(root, 'regress-out', 'hwpx-to-hwp-browser'));
const keys = ['adm02', 'adm14', 'adm19', 'adm28'];
const core = join(root, 'node_modules', '@rhwp', 'core');
const ORIGIN = 'https://spike.test'; // secure context: crypto.subtle

const WORKER = `
import init, { HwpDocument } from '/rhwp.js';
let ctx;
globalThis.measureTextWidth = (font, text) => {
  ctx ??= new OffscreenCanvas(1, 1).getContext('2d');
  ctx.font = font;
  return ctx.measureText(text).width;
};
onmessage = async (e) => {
  const r = { key: e.data.key };
  try {
    let t = performance.now();
    const wasm = await init({ module_or_path: '/rhwp_bg.wasm' });
    r.msEngine = Math.round(performance.now() - t);
    const bytes = new Uint8Array(await (await fetch('/in/' + e.data.key + '.hwpx')).arrayBuffer());
    t = performance.now();
    const src = new HwpDocument(bytes);
    r.pagesIn = src.pageCount();
    r.msOpen = Math.round(performance.now() - t);
    t = performance.now();
    r.verify = JSON.parse(src.exportHwpVerify());
    r.msVerify = Math.round(performance.now() - t);
    t = performance.now();
    const exp = src.exportHwpWithReport();
    r.contentLoss = JSON.parse(exp.contentLoss());
    const out = exp.takeBytes();
    exp.free();
    r.msExport = Math.round(performance.now() - t);
    src.free();
    t = performance.now();
    const back = new HwpDocument(out);
    r.pagesOut = back.pageCount();
    r.msReload = Math.round(performance.now() - t);
    back.free();
    r.wasmHeapMB = Math.round(wasm.memory.buffer.byteLength / 1048576);
    const h = await crypto.subtle.digest('SHA-256', out);
    r.sha256 = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
    r.outBytes = out.length;
    postMessage(r);
  } catch (err) {
    r.error = String(err && (err.message || err));
    postMessage(r);
  }
};`;
const PAGE = `<!doctype html><meta charset="utf-8"><title>spike</title><script type="module">
window.runOne = (key) => new Promise((res) => {
  const t0 = performance.now();
  const w = new Worker('/worker.js', { type: 'module' });
  w.onmessage = (e) => { e.data.msTotal = Math.round(performance.now() - t0); w.terminate(); res(e.data); };
  w.onerror = (e) => { w.terminate(); res({ key, error: 'worker error: ' + e.message }); };
  w.postMessage({ key });
});
</script>`;

const types = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html' };
async function run(profile) {
  const browser = await chromium.launch();
  const context = await browser.newContext(profile === 'phone' ? { ...devices['Pixel 7'] } : {});
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === '/') return route.fulfill({ body: PAGE, contentType: types['.html'] });
    if (p === '/worker.js') return route.fulfill({ body: WORKER, contentType: types['.js'] });
    if (p === '/rhwp.js') return route.fulfill({ body: readFileSync(join(core, 'rhwp.js')), contentType: types['.js'] });
    if (p === '/rhwp_bg.wasm') return route.fulfill({ body: readFileSync(join(core, 'rhwp_bg.wasm')), contentType: types['.wasm'] });
    if (p.startsWith('/in/')) return route.fulfill({ body: readFileSync(join(root, 'tests', 'corpus', 'hwp', p.slice(4))) });
    return route.fulfill({ status: 404, body: '' });
  });
  const cdp = await context.newCDPSession(page);
  if (profile === 'phone') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => typeof window.runOne === 'function');
  const rows = [];
  for (const key of keys) {
    const r = await page.evaluate((k) => window.runOne(k), key);
    r.profile = profile;
    if (nodeDir && existsSync(join(nodeDir, `${key}.hwp`))) {
      r.sameAsNode = createHash('sha256').update(readFileSync(join(nodeDir, `${key}.hwp`))).digest('hex') === r.sha256;
    }
    console.log(JSON.stringify(r));
    rows.push(r);
  }
  await browser.close();
  return rows;
}

mkdirSync(outDir, { recursive: true });
const all = [...(await run('desktop')), ...(await run('phone'))];
writeFileSync(join(outDir, 'browser.json'), JSON.stringify({ chromium: chromium.name(), results: all }, null, 1));
console.log(`wrote ${join(outDir, 'browser.json')}`);
