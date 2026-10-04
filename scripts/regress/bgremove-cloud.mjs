// regress:bgremove --engine cloud (C2-cloud, brief handoff/ARCHITECT-BRIEF-C2-CLOUD.md §10 "Quality"). Owner PC only,
// never CI: every run posts the 16 GT photos to the preview's /api/remove-bg, about 16-20 of the month's 5,000 free
// Images transformations (re-sending the same bytes in the same month is not billed again: F9).
//
//   npm run regress:bgremove -- --engine cloud [--url https://c2-cloud.doc-tools-kr.pages.dev/api/remove-bg]
//
// What the page does, in Node: the photo at long edge <= 1024 as JPEG q90, one POST (Sec-Fetch-Site: same-origin, as
// a browser on the page sends it), the WebP answer's alpha scaled up bilinearly to the photo size, then MAE and IoU
// (alpha > 0.5) against the GT alpha. Requests are spaced 3.5 s apart (the Worker allows 3 per 10 s per IP); a 429 is
// waited out once. Gates (never lowered): GT mean MAE <= 0.0045 and mean IoU >= 0.955 (spike: 0.0038 / 0.966).
// Output: regress-out/bgremove-cloud.md and .json. Exit 1 when a gate fails or a photo gets no answer.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const URL_ = arg('--url') ?? process.env.BGREMOVE_CLOUD_URL ?? 'https://c2-cloud.doc-tools-kr.pages.dev/api/remove-bg';
const SPIKE = process.env.BGREMOVE_SPIKE ?? 'C:/dev/doc-tools-kr/spikes/bg-remove';
const GT_DIR = join(SPIKE, 'data', 'gt');
const GATE = { gtMae: 0.0045, gtIou: 0.955 };
const SEND_EDGE = 1024;
const SPACING_MS = 3500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(join(GT_DIR, 'img'))) {
  console.error(`regress:bgremove --engine cloud: needs the GT set at ${GT_DIR} (BGREMOVE_SPIKE).`);
  process.exit(1);
}
const { createCanvas, loadImage } = await import('@napi-rs/canvas');

/** RGBA pixels of an image file or buffer. */
async function pixels(src) {
  const img = await loadImage(src);
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  return { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
}

/** The copy the page sends: long edge <= 1024 on white, JPEG q90. */
async function copyOf(path) {
  const img = await loadImage(readFileSync(path));
  const s = Math.min(1, SEND_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * s));
  const h = Math.max(1, Math.round(img.height * s));
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, w, h);
  g.drawImage(img, 0, 0, w, h);
  return { bytes: await c.encode('jpeg', 90), w, h };
}

/** Bilinear resize of a float mask, half-pixel centres, edge clamping (the page's resizeMask, without the 8-bit step). */
function resize(a, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const sy = Math.max(0, (y + 0.5) * (sh / dh) - 0.5);
    const y0 = Math.min(Math.floor(sy), sh - 1);
    const y1 = Math.min(y0 + 1, sh - 1);
    const wy = sy - y0;
    for (let x = 0; x < dw; x++) {
      const sx = Math.max(0, (x + 0.5) * (sw / dw) - 0.5);
      const x0 = Math.min(Math.floor(sx), sw - 1);
      const x1 = Math.min(x0 + 1, sw - 1);
      const wx = sx - x0;
      const top = a[y0 * sw + x0] * (1 - wx) + a[y0 * sw + x1] * wx;
      const bot = a[y1 * sw + x0] * (1 - wx) + a[y1 * sw + x1] * wx;
      out[y * dw + x] = Math.round((top * (1 - wy) + bot * wy) * 255) / 255;
    }
  }
  return out;
}

async function post(bytes) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = Date.now();
    const res = await fetch(URL_, { method: 'POST', body: bytes, headers: { 'Content-Type': 'image/jpeg', 'Sec-Fetch-Site': 'same-origin' } });
    const ms = Date.now() - t0;
    if (res.status === 429 && attempt === 0) {
      await sleep(11_000);
      continue;
    }
    return { status: res.status, type: res.headers.get('content-type') ?? '', body: Buffer.from(await res.arrayBuffer()), ms };
  }
  throw new Error('unreachable');
}

const rows = [];
const fails = [];
const names = readdirSync(join(GT_DIR, 'img')).filter((f) => f.endsWith('.jpg')).sort();
console.log(`regress:bgremove --engine cloud: ${names.length} GT photos -> ${URL_}`);
for (const f of names) {
  const key = f.replace(/\.jpg$/, '');
  const copy = await copyOf(join(GT_DIR, 'img', f));
  const r = await post(copy.bytes);
  if (r.status !== 200 || !r.type.startsWith('image/webp')) {
    fails.push(`${key}: HTTP ${r.status} ${r.body.toString('utf8').slice(0, 80)}`);
    console.log(`  ${key.padEnd(8)} HTTP ${r.status}`);
    await sleep(SPACING_MS);
    continue;
  }
  const ans = await pixels(r.body);
  const alpha = Float32Array.from({ length: ans.w * ans.h }, (_, i) => ans.d[i * 4 + 3] / 255);
  const gtImg = await pixels(readFileSync(join(GT_DIR, 'alpha', `${key}.png`)));
  const gt = Float32Array.from({ length: gtImg.w * gtImg.h }, (_, i) => gtImg.d[i * 4] / 255);
  const up = resize(alpha, ans.w, ans.h, gtImg.w, gtImg.h);
  let mae = 0;
  let inter = 0;
  let union = 0;
  for (let i = 0; i < gt.length; i++) {
    mae += Math.abs(up[i] - gt[i]);
    const p = up[i] > 0.5;
    const g = gt[i] > 0.5;
    if (p && g) inter++;
    if (p || g) union++;
  }
  const row = { key, sent: `${copy.w}×${copy.h}`, sentKB: +(copy.bytes.length / 1024).toFixed(1), answer: `${ans.w}×${ans.h}`, ms: r.ms, mae: mae / gt.length, iou: union ? inter / union : 1 };
  rows.push(row);
  console.log(`  ${key.padEnd(8)} sent ${row.sent} (${row.sentKB} KB) answer ${row.answer} IoU ${row.iou.toFixed(4)} MAE ${row.mae.toFixed(4)} ${r.ms} ms`);
  await sleep(SPACING_MS);
}

const summary = { url: URL_, n: rows.length };
if (rows.length) {
  summary.gtMae = rows.reduce((a, r) => a + r.mae, 0) / rows.length;
  summary.gtIou = rows.reduce((a, r) => a + r.iou, 0) / rows.length;
  summary.medianMs = [...rows.map((r) => r.ms)].sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  if (summary.gtMae > GATE.gtMae) fails.push(`GT mean MAE ${summary.gtMae.toFixed(5)} > ${GATE.gtMae}`);
  if (summary.gtIou < GATE.gtIou) fails.push(`GT mean IoU ${summary.gtIou.toFixed(4)} < ${GATE.gtIou}`);
}
if (rows.length !== names.length) fails.push(`${names.length - rows.length} photo(s) without an answer`);
const out = join(root, 'regress-out');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'bgremove-cloud.json'), JSON.stringify({ summary, rows, fails }, null, 2));
writeFileSync(
  join(out, 'bgremove-cloud.md'),
  [
    `# regress:bgremove --engine cloud (${new Date().toISOString().slice(0, 10)})`,
    '',
    `Endpoint ${URL_}. GT mean MAE ${summary.gtMae?.toFixed(5) ?? '-'} (gate ≤ ${GATE.gtMae}), IoU ${summary.gtIou?.toFixed(4) ?? '-'} (gate ≥ ${GATE.gtIou}), median ${summary.medianMs ?? '-'} ms.`,
    '',
    '| image | sent | KB | answer | IoU | MAE | ms |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.key} | ${r.sent} | ${r.sentKB} | ${r.answer} | ${r.iou.toFixed(4)} | ${r.mae.toFixed(4)} | ${r.ms} |`),
    '',
    fails.length ? `FAIL\n${fails.map((f) => `- ${f}`).join('\n')}` : 'All gates pass.',
    '',
  ].join('\n'),
);
console.log(fails.length ? `FAIL\n${fails.map((f) => `- ${f}`).join('\n')}` : `All gates pass: GT mean MAE ${summary.gtMae.toFixed(5)}, IoU ${summary.gtIou.toFixed(4)}.`);
process.exit(fails.length ? 1 : 0);
