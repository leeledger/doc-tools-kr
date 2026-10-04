// Regression harness for 사진 배경 지우기 (Sprint C, C2 test map; gates = brief C2.0 step 8). Starts a Vite dev server on
// scripts/regress/bgremove-harness/ (public/ served, so /vendor/onnxruntime-web/ and /vendor/birefnet-lite-512/ are
// the copied production files; COOP/COEP set so the WASM engine gets threads) and runs the production modules in
// Playwright Chromium: the asset loader, decode, the model input, one engine session for all images, as the page keeps it.
//
//   npm run regress:bgremove -- --fixtures-only     (CI) the committed CC0 fixtures, tests/fixtures/bgremove/
//   npm run regress:bgremove                         (owner PC) + the spike sets: 16 GT and the 49 real photos
//   npm run regress:bgremove -- --engine cloud       (owner PC, never CI) the cloud path against GT: bgremove-cloud.mjs
//   options: --backend wasm|webgpu|auto (default auto: WebGPU when Chromium offers an adapter), --channel chrome,
//            --opt all|basic|disabled (session graph optimisation; default: the page's OPT_LEVEL), --only a01,b02
//
// Gates (never lowered):
//   every image: mean |browser mask − Python fp16 mask| ≤ 0.002 (Python = parity.py / build-bgremove.py, ORT CPU)
//   fixtures: GT IoU and MAE within 0.005 of the Python values (meta.json)
//   full: 16 GT mean MAE ≤ 0.0050 and IoU ≥ 0.940; empty masks (area > 0.5 under 1 %) on the 49 real photos ≤ 3
//         (the 50 spike photos minus l04, a paper letterhead: Arch C2.0 ruling)
//   blur-fusion at 4 MP ≤ 1,500 ms (brief build order 5; reported, fails the run when over)
// Needs `PUBLIC_BG_REMOVE=1 node scripts/copy-vendor.mjs` (public/vendor/…). Full run: BGREMOVE_SPIKE (default
// C:/dev/doc-tools-kr/spikes/bg-remove) and the parity.py masks (scripts/model/birefnet/out/parity-<exportId>/).
// Output: regress-out/bgremove.md and regress-out/bgremove.json. Exit 1 when any gate fails.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const fixturesOnly = args.includes('--fixtures-only');
const backend = arg('--backend') ?? 'auto';
const EXPORT = 'aa62cd87-714d0a62';
const FIX = join(root, 'tests', 'fixtures', 'bgremove');
const SPIKE = process.env.BGREMOVE_SPIKE ?? 'C:/dev/doc-tools-kr/spikes/bg-remove';
const PARITY = join(root, 'scripts', 'model', 'birefnet', 'out', `parity-${EXPORT}`, 'masks_fp16');
const OFF_TOPIC = new Set(['l04']);
const GATE = { browserMean: 0.002, fixtureDelta: 0.005, gtMae: 0.005, gtIou: 0.94, emptyMax: 3, fusionMs: 1500 };

// C2-cloud: --engine cloud measures the Cloudflare path instead (owner PC only; scripts/regress/bgremove-cloud.mjs).
if (arg('--engine') === 'cloud') {
  await import('./bgremove-cloud.mjs');
}

if (!existsSync(join(root, 'public', 'vendor', 'birefnet-lite-512', EXPORT, 'model.part0'))) {
  console.error('regress:bgremove: public/vendor/ has no model. Run `PUBLIC_BG_REMOVE=1 node scripts/copy-vendor.mjs` first.');
  process.exit(1);
}
if (!fixturesOnly && (!existsSync(join(SPIKE, 'data', 'raw')) || !existsSync(PARITY))) {
  console.error(`regress:bgremove: the full run needs ${SPIKE}/data (BGREMOVE_SPIKE) and ${PARITY} (run parity.py). Use --fixtures-only otherwise.`);
  process.exit(1);
}

const { createCanvas, loadImage } = await import('@napi-rs/canvas');
/** Alpha (0..1) of a grey PNG, as float32. */
async function grey(path) {
  const img = await loadImage(readFileSync(path));
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data;
  return { w: img.width, h: img.height, a: Float32Array.from({ length: img.width * img.height }, (_, i) => d[i * 4] / 255) };
}
/** A .npy float32 array (little endian, C order). */
function npy(path) {
  const b = readFileSync(path);
  const hl = b.readUInt16LE(8);
  const header = b.subarray(10, 10 + hl).toString('latin1');
  if (!header.includes("'<f4'")) throw new Error(`${path}: not float32`);
  const off = 10 + hl;
  return new Float32Array(b.buffer.slice(b.byteOffset + off, b.byteOffset + b.length));
}
const u16 = (path) => Float32Array.from(new Uint16Array(new Uint8Array(gunzipSync(readFileSync(path))).buffer), (v) => v / 65535);

const { createServer } = await import('vite');
const pw = await import('@playwright/test');
const isolation = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };
/**
 * /vendor/ as plain static files, before Vite's own middlewares: the engine script is imported at run time (as in
 * production), and Vite would otherwise answer that import of a public/ file with an error (`?import`).
 */
const MIME = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
const vendorStatic = {
  name: 'bgremove-vendor-static',
  configureServer(srv) {
    srv.middlewares.use((req, res, next) => {
      const path = decodeURIComponent((req.url ?? '').split('?')[0]);
      if (!path.startsWith('/vendor/') || path.includes('..')) return next();
      const file = join(root, 'public', ...path.split('/').filter(Boolean));
      if (!existsSync(file)) return next();
      const ext = file.slice(file.lastIndexOf('.'));
      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', ...isolation });
      res.end(readFileSync(file));
    });
  },
};
const server = await createServer({
  plugins: [vendorStatic],
  root: join(root, 'scripts', 'regress', 'bgremove-harness'),
  publicDir: join(root, 'public'),
  configFile: false,
  logLevel: 'warn',
  server: { port: 0, host: '127.0.0.1', fs: { allow: [root, SPIKE] }, headers: isolation },
  worker: { format: 'es' },
  optimizeDeps: { noDiscovery: true, include: [] },
});
await server.listen();
const base = server.resolvedUrls.local[0];
const fsUrl = (p) => `/@fs/${p.split('\\').join('/').replace(/^\/+/, '')}`;
const { resizeMask, maskArea } = await server.ssrLoadModule(fsUrl(join(root, 'src', 'lib', 'bgremove', 'infer.ts')));

const launchArgs = backend === 'wasm' ? [] : ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--ignore-gpu-blocklist'];
// --channel chrome: the installed Google Chrome (Playwright's own Chromium has no WebGPU adapter on this PC).
const browser = await pw.chromium.launch({ args: launchArgs, ...(arg('--channel') ? { channel: arg('--channel') } : {}) });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(base);
const env = await page.evaluate(([b, o]) => window.harness.setup(b, o), [backend, arg('--opt')]);
console.log(`regress:bgremove: ${env.backend}, crossOriginIsolated ${env.coi}, export ${env.exportId}, session create ${Math.round(env.createMs)} ms`);

/** GT metrics of a 512 mask against an alpha (spike metrics: MAE and IoU at 0.5 on the GT grid). */
function gtMetrics(mask, gt) {
  const up = resizeMask(mask, 512, 512, gt.w, gt.h);
  let mae = 0;
  let inter = 0;
  let union = 0;
  for (let i = 0; i < gt.a.length; i++) {
    const p = up[i] / 255;
    mae += Math.abs(p - gt.a[i]);
    const a = p > 0.5;
    const b = gt.a[i] > 0.5;
    if (a && b) inter++;
    if (a || b) union++;
  }
  return { mae: mae / gt.a.length, iou: union ? inter / union : 1 };
}
const meanDiff = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
};

const items = [];
const meta = JSON.parse(readFileSync(join(FIX, 'meta.json'), 'utf8')).fixtures;
for (const k of Object.keys(meta).filter((k) => k.startsWith('cc0-'))) {
  items.push({ key: k, set: 'fixture', img: join(FIX, `${k}.jpg`), ref: () => u16(join(FIX, `${k}.mask.u16.gz`)), gt: join(FIX, `${k}.alpha.png`), py: meta[k].pythonGt });
}
if (!fixturesOnly) {
  for (const f of readdirSync(join(SPIKE, 'data', 'gt', 'img')).filter((f) => f.endsWith('.jpg')).sort()) {
    const k = f.replace(/\.jpg$/, '');
    items.push({ key: k, set: 'gt', img: join(SPIKE, 'data', 'gt', 'img', f), ref: () => npy(join(PARITY, `${k}.npy`)), gt: join(SPIKE, 'data', 'gt', 'alpha', `${k}.png`) });
  }
  for (const f of readdirSync(join(SPIKE, 'data', 'raw')).filter((f) => f.endsWith('.jpg')).sort()) {
    const k = f.replace(/\.jpg$/, '');
    items.push({ key: k, set: OFF_TOPIC.has(k) ? 'off' : 'raw', img: join(SPIKE, 'data', 'raw', f), ref: () => npy(join(PARITY, `${k}.npy`)) });
  }
}

// --only a01,b02: a quick re-check of some images (the set gates are then not judged).
const only = arg('--only')?.split(',');
const rows = [];
const fails = [];
for (const it of only ? items.filter((x) => only.includes(x.key)) : items) {
  const r = await page.evaluate((u) => window.harness.runImage(u), fsUrl(it.img));
  const mask = Float32Array.from(r.mask);
  const ref = it.ref();
  const row = { key: it.key, set: it.set, diff: meanDiff(mask, ref), area: maskArea(mask), inputMs: Math.round(r.inputMs), runMs: Math.round(r.runMs) };
  if (row.diff > GATE.browserMean) fails.push(`${it.key}: browser vs Python mean ${row.diff.toFixed(5)} > ${GATE.browserMean}`);
  if (it.gt) {
    Object.assign(row, gtMetrics(mask, await grey(it.gt)));
    if (it.py) {
      if (Math.abs(row.iou - it.py.iou) > GATE.fixtureDelta) fails.push(`${it.key}: IoU ${row.iou.toFixed(4)} vs Python ${it.py.iou.toFixed(4)}`);
      if (Math.abs(row.mae - it.py.mae) > GATE.fixtureDelta) fails.push(`${it.key}: MAE ${row.mae.toFixed(4)} vs Python ${it.py.mae.toFixed(4)}`);
    }
  }
  rows.push(row);
  console.log(`  ${it.key.padEnd(12)} ${it.set.padEnd(8)} diff ${row.diff.toFixed(5)} area ${row.area.toFixed(4)}${row.iou !== undefined ? ` IoU ${row.iou.toFixed(4)} MAE ${row.mae.toFixed(4)}` : ''} input ${row.inputMs} ms run ${row.runMs} ms`);
}

const summary = { backend: env.backend, coi: env.coi, exportId: env.exportId, n: rows.length, maxDiff: Math.max(...rows.map((r) => r.diff)) };
const gt = rows.filter((r) => r.set === 'gt');
if (gt.length && !only) {
  summary.gtMae = gt.reduce((a, r) => a + r.mae, 0) / gt.length;
  summary.gtIou = gt.reduce((a, r) => a + r.iou, 0) / gt.length;
  if (summary.gtMae > GATE.gtMae) fails.push(`GT mean MAE ${summary.gtMae.toFixed(5)} > ${GATE.gtMae}`);
  if (summary.gtIou < GATE.gtIou) fails.push(`GT mean IoU ${summary.gtIou.toFixed(4)} < ${GATE.gtIou}`);
}
const raw = rows.filter((r) => r.set === 'raw');
if (raw.length && !only) {
  summary.realN = raw.length;
  summary.empty = raw.filter((r) => r.area < 0.01).map((r) => r.key);
  summary.offTopic = rows.filter((r) => r.set === 'off').map((r) => ({ key: r.key, area: r.area }));
  if (raw.length !== 49) fails.push(`real set has ${raw.length} photos, expected 49`);
  if (summary.empty.length > GATE.emptyMax) fails.push(`empty masks on the real set: ${summary.empty.length} (${summary.empty.join(', ')}) > ${GATE.emptyMax}`);
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
summary.createMs = Math.round(env.createMs);
summary.inputMsMedian = med(rows.map((r) => r.inputMs));
summary.runMsMedian = med(rows.map((r) => r.runMs));
summary.fusionMs4MP = Math.round(await page.evaluate(() => window.harness.fusionMs(2309, 1732)));
if (summary.fusionMs4MP > GATE.fusionMs) fails.push(`blur-fusion at 4 MP took ${summary.fusionMs4MP} ms > ${GATE.fusionMs}`);
await browser.close();
await server.close();

mkdirSync(join(root, 'regress-out'), { recursive: true });
writeFileSync(join(root, 'regress-out', 'bgremove.json'), JSON.stringify({ summary, gates: GATE, rows, fails }, null, 1));
const md = [
  `# regress:bgremove (${fixturesOnly ? 'fixtures only' : 'full'})`,
  '',
  `Engine ${summary.backend}, crossOriginIsolated ${summary.coi}, export ${summary.exportId}, ${summary.n} images.`,
  '',
  '| image | set | mean diff vs Python | area | IoU | MAE | input ms | run ms |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.key} | ${r.set} | ${r.diff.toFixed(5)} | ${r.area.toFixed(4)} | ${r.iou?.toFixed(4) ?? '-'} | ${r.mae?.toFixed(4) ?? '-'} | ${r.inputMs} | ${r.runMs} |`),
  '',
  '```json',
  JSON.stringify(summary, null, 1),
  '```',
  '',
  fails.length ? `FAIL\n${fails.map((f) => `- ${f}`).join('\n')}` : 'All gates pass.',
].join('\n');
writeFileSync(join(root, 'regress-out', 'bgremove.md'), `${md}\n`);
console.log(JSON.stringify(summary));
if (fails.length) {
  console.error(`regress:bgremove: FAIL\n  ${fails.join('\n  ')}`);
  process.exit(1);
}
console.log('regress:bgremove: OK');
