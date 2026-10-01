// Regression harness for 전자서명·도장 이미지 (Sprint C, C1-core). Node only: the production ink key
// (src/lib/ink/key.ts, loaded through Vite SSR) on the committed GT fixtures (tests/fixtures/ink/, built by
// tests/fixtures/build-ink.py), plus the owner's real photos when present.
// Usage: npm run regress:ink [-- --fixtures-only] [-- --make-baseline]
//   Real photos: INK_PHOTOS_DIR (default tests/corpus/ink-photos, local only): <name>.jpg + <name>.json
//   {"mode": "auto"|"red"|"sign", "paperRects": [[x,y,w,h],...], "inkRect": [x,y,w,h]} in photo pixels.
//   Without them the run fails unless --fixtures-only is given (then the report says PARTIAL).
// Output: regress-out/ink.json, regress-out/ink.md, regress-out/ink-sheet.png (contact sheet for review).
// Exit 1 when any gate fails. Gates are the brief's (C1 Acceptance); never lower them.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const fixturesOnly = args.includes('--fixtures-only');
const makeBaseline = args.includes('--make-baseline');
const fixDir = join(root, 'tests', 'fixtures', 'ink');
const photoDir = resolve(root, process.env.INK_PHOTOS_DIR ?? 'tests/corpus/ink-photos');
const baselinePath = join(root, 'scripts', 'regress', 'ink-baseline.json');
const outDir = join(root, 'regress-out');

// Brief thresholds (C1 Acceptance). Never lower them.
const IOU_MIN = { gt14: 0.9, gt15: 0.9, gt16: 0.98 };
const IOU_HARD_MIN = 0.85;
const COMP_ERR_MAX = { gt15: 0.046 };
const BASELINE_SLACK = 0.01;
const RESIDUE_MAX = 0.002;
const INK_FOUND_MIN = 0.005;
const CROP_PAD = 0.06;
/** Brief: a 12 MP photo at work res (long edge 2400) in <= 600 ms on the dev PC (logged, not a CI gate). */
const PERF_TARGET_MS = 600;

const { createServer } = await import('vite');
const server = await createServer({ root, configFile: false, logLevel: 'warn', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
const ink = await server.ssrLoadModule('/src/lib/ink/key.ts');

async function decode(path) {
  const img = await loadImage(readFileSync(path));
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, img.width, img.height);
  return { data: new Uint8ClampedArray(id.data.buffer, id.data.byteOffset, id.data.byteLength), width: img.width, height: img.height };
}

/** GT alpha (8-bit grey PNG, decoded as RGBA by canvas: R = grey) in 0..1. */
async function decodeAlpha(path) {
  const { data, width, height } = await decode(path);
  const a = new Float32Array(width * height);
  for (let i = 0; i < a.length; i++) a[i] = data[i * 4] / 255;
  return a;
}

const iou = (pred, gt) => {
  let inter = 0;
  let uni = 0;
  for (let i = 0; i < gt.length; i++) {
    const p = pred[i] > 0.5;
    const g = gt[i] > 0.5;
    if (p && g) inter++;
    if (p || g) uni++;
  }
  return inter / Math.max(uni, 1);
};

/**
 * Spike metrics.band: pixels within w px (Euclidean) of the GT boundary (gt > 0.5 minus its 3x3 erosion), plus
 * every partial GT pixel (0.02 < gt < 0.98); w = max(3, int(0.006 * diagonal)).
 */
function band(gt, W, H) {
  const w = Math.max(3, Math.floor(0.006 * Math.hypot(W, H)));
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && gt[y * W + x] > 0.5;
  const out = new Uint8Array(W * H);
  const disc = [];
  for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) if (dx * dx + dy * dy <= w * w) disc.push([dx, dy]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (gt[i] > 0.02 && gt[i] < 0.98) out[i] = 1;
      if (!inside(x, y)) continue;
      let boundary = false;
      for (let dy = -1; dy <= 1 && !boundary; dy++) for (let dx = -1; dx <= 1; dx++) if (!inside(x + dx, y + dy) && x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) boundary = true;
      if (!boundary) continue;
      for (const [dx, dy] of disc) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) out[yy * W + xx] = 1;
      }
    }
  }
  return out;
}

/** Spike metrics.comp_err: mean |our composite - GT composite| over the band, on a solid background. */
function compErr(alpha, rgba, gt, ink, W, H, bg = [1, 1, 1]) {
  const b = band(gt, W, H);
  let s = 0;
  let n = 0;
  for (let i = 0; i < gt.length; i++) {
    if (!b[i]) continue;
    for (let c = 0; c < 3; c++) {
      const ours = alpha[i] * (rgba[i * 4 + c] / 255) + (1 - alpha[i]) * bg[c];
      const want = gt[i] * ink[c] + (1 - gt[i]) * bg[c];
      s += Math.abs(ours - want);
      n++;
    }
  }
  return s / n;
}

// ---------- contact sheet ----------
const TILE = 320;
const sheetRows = [];
/** The image scaled to fit TILE x TILE; keyed results on a checkerboard. */
function tile(img, alpha) {
  const s = TILE / Math.max(img.width, img.height);
  const c = createCanvas(Math.max(1, Math.round(img.width * s)), Math.max(1, Math.round(img.height * s)));
  const ctx = c.getContext('2d');
  const src = createCanvas(img.width, img.height);
  const sctx = src.getContext('2d');
  const id = sctx.createImageData(img.width, img.height);
  if (alpha) {
    // Checkerboard under the keyed result.
    for (let y = 0; y < c.height; y += 10) for (let x = 0; x < c.width; x += 10) {
      ctx.fillStyle = (x / 10 + y / 10) % 2 ? '#cccccc' : '#ffffff';
      ctx.fillRect(x, y, 10, 10);
    }
  }
  id.data.set(img.data);
  sctx.putImageData(id, 0, 0);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
function addRow(label, img, out) {
  const a = tile(img);
  const b = tile(out, true);
  sheetRows.push({ label, a, b, h: Math.max(a.height, b.height) });
}
function writeSheet() {
  const h = sheetRows.reduce((s, r) => s + r.h + 24, 0);
  const c = createCanvas(TILE * 2 + 30, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  let y = 0;
  for (const r of sheetRows) {
    ctx.fillStyle = '#000000';
    ctx.font = '14px sans-serif';
    ctx.fillText(r.label, 10, y + 16);
    ctx.drawImage(r.a, 10, y + 22);
    ctx.drawImage(r.b, TILE + 20, y + 22);
    y += r.h + 24;
  }
  writeFileSync(join(outDir, 'ink-sheet.png'), c.toBuffer('image/png'));
}

// ---------- run ----------
const checks = [];
const check = (name, ok, got, skipped = false) => {
  checks.push({ name, ok, got, skipped });
  console.log(`${skipped ? 'SKIP' : ok ? 'PASS' : 'FAIL'} ${name} — ${got}`);
};
const metrics = {};
const meta = JSON.parse(readFileSync(join(fixDir, 'meta.json'), 'utf8'));
for (const [id, m] of Object.entries(meta)) {
  const img = await decode(join(fixDir, `${id}.jpg`));
  const gt = await decodeAlpha(join(fixDir, m.alpha));
  const t0 = performance.now();
  const key = ink.keyInk(img, { mode: m.mode });
  const ms = performance.now() - t0;
  const v = iou(key.alpha, gt);
  const row = { iou: +v.toFixed(4), mode: m.mode, status: key.status, guess: key.guess, ms: Math.round(ms) };
  const min = m.variant === 'base' ? IOU_MIN[m.gt] : IOU_HARD_MIN;
  check(`${id} IoU@0.5 (${m.mode}) >= ${min}`, v >= min, v.toFixed(4));
  check(`${id} area status ok`, key.status === 'ok', `${key.status}, ink ${(key.inkShare * 100).toFixed(2)}%`);
  if (m.variant === 'base' && COMP_ERR_MAX[m.gt] !== undefined) {
    // Spike definition: our alpha with the un-mixed ink colour (원래 색), composited on white, edge band only.
    const orig = ink.renderInk(img, key.alpha, 'original', key.guess);
    const ce = compErr(key.alpha, orig, gt, m.ink, img.width, img.height);
    row.compErrWhite = +ce.toFixed(4);
    check(`${id} composite error on white (원래 색) <= ${COMP_ERR_MAX[m.gt]}`, ce <= COMP_ERR_MAX[m.gt], ce.toFixed(4));
    // Diagnostic: the default 색 맞추기 colour.
    const fixed = ink.renderInk(img, key.alpha, 'auto', key.guess);
    row.compErrWhiteFixed = +compErr(key.alpha, fixed, gt, m.ink, img.width, img.height).toFixed(4);
  }
  // Diagnostic (not a brief gate): the base fixtures in their dedicated mode too.
  const own = { gt14: 'sign', gt15: 'red' }[m.gt];
  if (m.variant === 'base' && own) {
    row[`iou_${own}`] = +iou(ink.keyInk(img, { mode: own }).alpha, gt).toFixed(4);
    console.log(`INFO ${id} IoU@0.5 in ${own} mode: ${row[`iou_${own}`]}`);
  }
  metrics[id] = row;
  const res = ink.processInk(img, { mode: m.mode });
  if (res.out) addRow(`${id}  IoU ${v.toFixed(3)}  guess ${res.guess}`, img, res.out);
}

// Real photos with uneven light (owner-only item; brief gates).
const photos = existsSync(photoDir) ? readdirSync(photoDir).filter((f) => /\.json$/.test(f)) : [];
if (photos.length === 0) {
  if (!fixturesOnly) {
    console.error(`regress:ink: no real photos at ${photoDir}. Set INK_PHOTOS_DIR, or pass --fixtures-only for a PARTIAL run.`);
    await server.close();
    process.exit(1);
  }
  check('real photos: residue, ink found, crop (6 owner photos)', true, 'skipped: no photos (PARTIAL run)', true);
}
for (const f of photos) {
  const spec = JSON.parse(readFileSync(join(photoDir, f), 'utf8'));
  const name = f.replace(/\.json$/, '');
  const jpg = ['.jpg', '.jpeg', '.png'].map((e) => join(photoDir, name + e)).find(existsSync);
  if (!jpg) {
    check(`${name} photo file`, false, 'missing');
    continue;
  }
  const img = await decode(jpg);
  const res = ink.processInk(img, { mode: spec.mode ?? 'auto' });
  const a = res.alpha;
  const W = img.width;
  let resid = 0;
  let area = 0;
  for (const [x, y, w, h] of spec.paperRects) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (a[yy * W + xx] > 0.1) resid++;
    area += w * h;
  }
  const [ix, iy, iw, ih] = spec.inkRect;
  let found = 0;
  for (let yy = iy; yy < iy + ih; yy++) for (let xx = ix; xx < ix + iw; xx++) if (a[yy * W + xx] > 0.5) found++;
  const padX = iw * CROP_PAD;
  const padY = ih * CROP_PAD;
  const r = res.rect;
  const cropOk = !!r && r.x >= ix - padX && r.y >= iy - padY && r.x + r.w <= ix + iw + padX && r.y + r.h <= iy + ih + padY;
  check(`${name} residue in paperRects <= 0.2%`, resid / area <= RESIDUE_MAX, `${((resid / area) * 100).toFixed(3)}%`);
  check(`${name} ink found in inkRect >= 0.5%`, found / (iw * ih) >= INK_FOUND_MIN, `${((found / (iw * ih)) * 100).toFixed(2)}%`);
  check(`${name} crop inside inkRect + 6%`, cropOk, r ? `${r.x},${r.y} ${r.w}x${r.h}` : 'no crop');
  metrics[name] = { residue: +(resid / area).toFixed(5), inkFound: +(found / (iw * ih)).toFixed(4), cropOk, status: res.status };
  if (res.out) addRow(name, img, res.out);
}

// Speed: a 12 MP photo at work res (desktop long edge 2400 -> 2400x1800), whole pipeline, warm run.
{
  const src = await decode(join(fixDir, 'gt15-shadow.jpg'));
  const c = createCanvas(2400, 1800);
  const ctx = c.getContext('2d');
  const s = createCanvas(src.width, src.height);
  const sctx = s.getContext('2d');
  const id = sctx.createImageData(src.width, src.height);
  id.data.set(src.data);
  sctx.putImageData(id, 0, 0);
  ctx.drawImage(s, 0, 0, 2400, 1800);
  const big = ctx.getImageData(0, 0, 2400, 1800);
  const img = { data: new Uint8ClampedArray(big.data.buffer), width: 2400, height: 1800 };
  ink.processInk(img, { mode: 'auto' });
  const times = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    ink.processInk(img, { mode: 'auto' });
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  metrics.perf2400 = { medianMs: Math.round(times[1]), targetMs: PERF_TARGET_MS, note: 'Node (V8), dev PC; informational' };
  console.log(`INFO 2400x1800 pipeline (key + colour + crop): median ${Math.round(times[1])} ms (target <= ${PERF_TARGET_MS} ms, logged)`);
}

// Baseline: any fixture metric worse than baseline by > 0.01 fails.
if (makeBaseline) {
  const base = {};
  for (const [id, m] of Object.entries(metrics)) if (meta[id]) base[id] = { iou: m.iou, ...(m.compErrWhite !== undefined ? { compErrWhite: m.compErrWhite } : {}) };
  writeFileSync(baselinePath, JSON.stringify(base, null, 1) + '\n');
  console.log(`regress:ink: baseline written to ${baselinePath}`);
} else if (existsSync(baselinePath)) {
  const base = JSON.parse(readFileSync(baselinePath, 'utf8'));
  for (const [id, b] of Object.entries(base)) {
    const m = metrics[id];
    if (!m) {
      check(`${id} present (baseline)`, false, 'missing');
      continue;
    }
    check(`${id} IoU vs baseline ${b.iou} (-${BASELINE_SLACK})`, m.iou >= b.iou - BASELINE_SLACK, String(m.iou));
    if (b.compErrWhite !== undefined) check(`${id} composite error vs baseline ${b.compErrWhite} (+${BASELINE_SLACK})`, m.compErrWhite <= b.compErrWhite + BASELINE_SLACK, String(m.compErrWhite));
  }
} else {
  check('baseline file present', false, `missing ${baselinePath} (run with --make-baseline once)`);
}

mkdirSync(outDir, { recursive: true });
writeSheet();
const failed = checks.filter((c) => !c.ok);
const partial = photos.length === 0;
writeFileSync(join(outDir, 'ink.json'), JSON.stringify({ partial, metrics, checks }, null, 1) + '\n');
const md = [
  `# regress:ink ${partial ? '(PARTIAL: fixtures only, no real photos)' : ''}`,
  '',
  '| Fixture | Mode | IoU@0.5 | Composite err (white) | Status |',
  '|---|---|---|---|---|',
  ...Object.entries(metrics)
    .filter(([id]) => meta[id])
    .map(([id, m]) => `| ${id} | ${m.mode} | ${m.iou} | ${m.compErrWhite ?? ''} | ${m.status} |`),
  '',
  `Pipeline 2400x1800: ${metrics.perf2400.medianMs} ms (target ${PERF_TARGET_MS} ms).`,
  '',
  ...checks.map((c) => `- ${c.skipped ? 'SKIP' : c.ok ? 'PASS' : 'FAIL'} ${c.name}: ${c.got}`),
  '',
].join('\n');
writeFileSync(join(outDir, 'ink.md'), md);
await server.close();
console.log(`regress:ink: ${checks.length - failed.length}/${checks.length} checks passed${partial ? ' (PARTIAL)' : ''}. Report: regress-out/ink.md, sheet: regress-out/ink-sheet.png`);
process.exit(failed.length ? 1 : 0);
