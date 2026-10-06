// Regression harness for 여권·증명사진 (brief Step 4 "Regression harness"). Local only, not CI.
// Starts a Vite dev server on scripts/regress/idphoto-harness/ (public/ served, so /vendor/mediapipe/ is the
// copied production asset set) and runs the production modules in Playwright (Chromium by default).
// Inputs: tests/corpus/id-photo/ + truth.json; with --full also the full-resolution spike corpus (CORPUS_DIR,
// default spikes/photo/corpus, PD files p01–p12 only) with the unscaled annotations.
// Usage: npm run regress:idphoto [-- --browser firefox|webkit] [-- --full]
// Needs a copy-vendor run with PUBLIC_ID_PHOTO_AUTOFRAME=1 (public/vendor/mediapipe/).
// Output: regress-out/idphoto.md and regress-out/idphoto.json. Exit 1 when any check fails.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const browserName = arg('--browser') ?? 'chromium';
const full = args.includes('--full');
const corpusDir = join(root, 'tests', 'corpus', 'id-photo');
const fullDir = resolve(root, process.env.CORPUS_DIR ?? 'spikes/photo/corpus');
const truth = JSON.parse(readFileSync(join(corpusDir, 'truth.json'), 'utf8'));

if (!existsSync(join(root, 'public', 'vendor', 'mediapipe', '1.0.1', 'vision_wasm_internal.wasm'))) {
  console.error('regress:idphoto: public/vendor/mediapipe/ is missing. Run `PUBLIC_ID_PHOTO_AUTOFRAME=1 node scripts/copy-vendor.mjs` first.');
  process.exit(1);
}
if (full && !existsSync(fullDir)) {
  console.error(`regress:idphoto: --full needs the corpus at ${fullDir} (CORPUS_DIR).`);
  process.exit(1);
}
const gtFull = full ? JSON.parse(readFileSync(join(root, 'spikes', 'photo', 'results', 'gt-manual.json'), 'utf8')) : {};

// Brief thresholds. Never lower them; misses are reported under Blocked in REVIEW-REQUEST.
const LANDMARK_MM = 1.0;
const HEAD_BAND = [32, 36];
const HEAD_MEAN_ABS = 1.2;
// Arch (Step 4 round 2, BUILD-LOG): Firefox's resampler measures 37.5 dB against lanczos3, so its floor is
// 37.0 dB; Chromium and WebKit keep 38.0.
const PSNR_MIN = browserName === 'firefox' ? 37 : 38;
const SPIKE = { initMs: 700, detectMs: 89 };
const MM_PER_PX = 45 / 531;
const POSE_WARNS = ['yaw', 'pitch', 'roll', 'expression'];

const { createServer } = await import('vite');
const pw = await import('@playwright/test');
const server = await createServer({
  root: join(root, 'scripts', 'regress', 'idphoto-harness'),
  publicDir: join(root, 'public'),
  configFile: false,
  logLevel: 'warn',
  server: { port: 0, host: '127.0.0.1', fs: { allow: [root, fullDir] } },
  worker: { format: 'es' },
  define: { __ID_PHOTO_AUTOFRAME__: 'true', __USAGE_STATS__: 'false', __USAGE_SAMPLE__: '1' },
  optimizeDeps: { noDiscovery: true, include: [] },
});
await server.listen();
const base = server.resolvedUrls.local[0];
const fsUrl = (p) => `/@fs/${p.split('\\').join('/').replace(/^\/+/, '')}`;
const { verifyOutput } = await server.ssrLoadModule(fsUrl(join(root, 'src', 'lib', 'idphoto', 'encode.ts')));
const { PRESETS, customPreset } = await server.ssrLoadModule(fsUrl(join(root, 'src', 'data', 'id-photo-presets.ts')));
const browser = await pw[browserName].launch();
const page = await browser.newPage();
page.setDefaultTimeout(0);
await page.goto(base);
await page.waitForFunction(() => window.harnessReady === true);

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const flags = [];

const { initMs } = await page.evaluate(() => window.harness.init());
const detectMs = [];
const ids = Object.keys(truth).filter((k) => /^p\d+$/.test(k));
const sets = [{ label: 'committed', dir: corpusDir, truth: (k) => truth[k] }];
if (full) {
  sets.push({
    label: 'full-res',
    dir: fullDir,
    truth: (k) => ({ ...(gtFull[k] ? { eye: gtFull[k].eye, chin: gtFull[k].chin, skull: gtFull[k].skull, conf: gtFull[k].conf } : {}), expectWarn: truth[k].expectWarn }),
  });
}

const rows = [];
const specs = [...PRESETS.map((p) => p.id), 'custom'];
const specOf = (id) => (id === 'custom' ? customPreset(200, 250, 50) : PRESETS.find((p) => p.id === id));
for (const set of sets) {
  for (const id of ids) {
    const info = await page.evaluate(([u]) => window.harness.prepare(u), [fsUrl(join(set.dir, `${id}.jpg`))]);
    // Annotations are in the file's px; the working bitmap may be capped at 4,096 px.
    const k = info.h / info.sourceH;
    const raw = set.truth(id);
    const t = raw && { ...raw, eye: raw.eye == null ? null : raw.eye * k, chin: raw.chin == null ? null : raw.chin * k, skull: raw.skull == null ? null : raw.skull * k };
    const d = await page.evaluate(() => window.harness.detect());
    detectMs.push(d.ms);
    const r = await page.evaluate(() => window.harness.run('passport_online', { encodeFile: false }));
    const row = { set: set.label, id, w: info.w, h: info.h, faces: d.faces, s: r.s, warns: r.warns, expectWarn: t?.expectWarn ?? [] };
    // The auto frame's scale before the s ≤ 1 clamp (the geometry of the estimate, whatever the resolution:
    // the 1,200 px committed files are too small for passport at some head sizes, which is check 4's lowres).
    const sRaw = d.faces > 0 ? ((34 / 45) * 531) / d.headPx : null;
    row.sRaw = sRaw;
    if (d.faces > 0 && t?.eye != null) {
      // Errors in mm at the auto frame's 34 mm head scale.
      row.eyeMm = (d.eyeY - t.eye) * sRaw * MM_PER_PX;
      row.chinMm = (d.chinY - t.chin) * sRaw * MM_PER_PX;
    }
    if (d.faces > 0 && t?.skull != null && ['high', 'med'].includes(t.conf)) {
      row.headMm = (t.chin - t.skull) * sRaw * MM_PER_PX;
      row.calib = true;
    }
    row.missingWarn = row.expectWarn.filter((w) => !r.warns.includes(w));
    // Exact output: every preset (committed set; the full-res set frames the same heads).
    if (set.label === 'committed') {
      row.outputs = [];
      for (const pid of specs) {
        const o = await page.evaluate(([p]) => window.harness.run(p), [pid]);
        if (o.lowres) row.outputs.push({ pid, lowres: true });
        else if (o.blocks.length) row.outputs.push({ pid, blocked: o.blocks });
        else {
          const p = specOf(pid);
          const bytes = new Uint8Array(o.bytes ?? []);
          const problems = o.error
            ? [`error ${o.error}: ${o.detail}`]
            : verifyOutput(bytes, { outW: p.outW, outH: p.outH, dpi: p.dpi, ...(p.limitBytes !== undefined ? { limitBytes: p.limitBytes } : {}) });
          row.outputs.push({ pid, bytes: bytes.length, q: o.q, fallback: o.fallback, problems });
        }
      }
      row.psnr = (await page.evaluate(() => window.harness.resample('passport_online'))).psnr;
    }
    rows.push(row);
    const f = (v) => (v === undefined ? '-' : v.toFixed(2));
    console.log(`${set.label} ${id}: faces ${d.faces}, eye ${f(row.eyeMm)} mm, chin ${f(row.chinMm)} mm, head ${f(row.headMm)} mm, warns [${r.warns}]`);
  }
}

// Scene (0 faces), two faces, and a 380 px wide portrait.
await page.evaluate(([u]) => window.harness.prepare(u), [fsUrl(join(root, 'tests', 'fixtures', 'photo', 'scene_cc0.jpg'))]);
const scene = await page.evaluate(() => window.harness.detect());
const sceneRun = await page.evaluate(() => window.harness.run('passport_online', { encodeFile: false }));
await page.evaluate(([a, b]) => window.harness.prepareTwo(a, b), [fsUrl(join(corpusDir, 'p05.jpg')), fsUrl(join(corpusDir, 'p09.jpg'))]);
const two = await page.evaluate(() => window.harness.detect());
const twoRun = await page.evaluate(() => window.harness.run('passport_online', { encodeFile: false }));
await page.evaluate(([u]) => window.harness.prepare(u, { width: 380 }), [fsUrl(join(corpusDir, 'p02.jpg'))]);
await page.evaluate(() => window.harness.detect());
const low = await page.evaluate(() => window.harness.run('passport_online'));

// ---------- judge ----------
const committed = rows.filter((r) => r.set === 'committed');
check('1 detection: 1 face on every portrait', rows.every((r) => r.faces === 1), rows.filter((r) => r.faces !== 1).map((r) => `${r.set}/${r.id}: ${r.faces}`).join(', '));
check('1 detection: 0 faces on the scene (manual note)', scene.faces === 0 && sceneRun.warns.includes('manual'), `faces ${scene.faces}`);
check('1 detection: ≥ 2 faces on two_faces, multi warning', two.faces >= 2 && twoRun.warns.includes('multi'), `faces ${two.faces}`);
const lm = rows.filter((r) => r.eyeMm !== undefined);
const lmBad = lm.filter((r) => Math.abs(r.eyeMm) > LANDMARK_MM || Math.abs(r.chinMm) > LANDMARK_MM);
const eyeMax = Math.max(...lm.map((r) => Math.abs(r.eyeMm)));
check(
  `2 landmarks: |eye| and |chin| ≤ ${LANDMARK_MM} mm (n=${lm.length})`,
  lm.length > 0 && lmBad.length === 0,
  `eye max ${eyeMax.toFixed(2)} mm, chin ${Math.min(...lm.map((r) => r.chinMm)).toFixed(2)} to ${Math.max(...lm.map((r) => r.chinMm)).toFixed(2)} mm${lmBad.length ? `; misses ${lmBad.map((r) => `${r.set}/${r.id}`).join(', ')}` : ''}`,
);
for (const set of sets) {
  const cal = rows.filter((r) => r.set === set.label && r.calib);
  const inBand = cal.filter((r) => r.headMm >= HEAD_BAND[0] && r.headMm <= HEAD_BAND[1]);
  const mae = cal.reduce((a, r) => a + Math.abs(r.headMm - 34), 0) / (cal.length || 1);
  // "≥ 5 of 6 on the spike set": at most one out-of-band head (n = the heads with a skull and conf high/med).
  check(`3 head ${set.label}: 32–36 mm on the calibration heads (≤ 1 miss)`, cal.length > 0 && cal.length - inBand.length <= 1, `${inBand.length}/${cal.length}: ${cal.map((r) => `${r.id} ${r.headMm.toFixed(2)}`).join(', ')}`);
  check(`3 head ${set.label}: mean abs error ≤ ${HEAD_MEAN_ABS} mm`, cal.length > 0 && mae <= HEAD_MEAN_ABS, `${mae.toFixed(2)} mm`);
  const outWarn = cal.filter((r) => (r.headMm < HEAD_BAND[0] || r.headMm > HEAD_BAND[1]) && !r.warns.some((w) => POSE_WARNS.includes(w)));
  check(`3 head ${set.label}: every out-of-band head carries a pose or expression warning`, outWarn.length === 0, outWarn.map((r) => r.id).join(', '));
}
const outs = committed.flatMap((r) => (r.outputs ?? []).map((o) => ({ ...o, id: r.id })));
const made = outs.filter((o) => !o.lowres && !o.blocked);
const bad = made.filter((o) => o.problems.length);
check(
  '4 exact output: every preset × portrait: exact px, ≤ limit, SOF0, JFIF dpi, no APP1',
  made.length > 0 && bad.length === 0,
  `${made.length - bad.length}/${made.length} files; lowres ${outs.filter((o) => o.lowres).length}, blocked (frame outside) ${outs.filter((o) => o.blocked).length}; fallback ${made.filter((o) => o.fallback).length}${bad.length ? `; ${bad.map((o) => `${o.id}/${o.pid}: ${o.problems.join(';')}`).join(' | ')}` : ''}`,
);
const miss = rows.filter((r) => r.missingWarn.length);
check('5 warnings: every expectWarn fires', miss.length === 0, miss.map((r) => `${r.set}/${r.id} missing ${r.missingWarn}`).join(', '));
const fp = rows.filter((r) => r.warns.some((w) => [...POSE_WARNS, 'eyes'].includes(w) && !r.expectWarn.includes(w)));
const psnrs = committed.map((r) => r.psnr);
check(`6 resampling: render.ts vs lanczos3 PSNR ≥ ${PSNR_MIN} dB at rot 0`, psnrs.every((p) => p >= PSNR_MIN), `min ${Math.min(...psnrs).toFixed(2)}, max ${Math.max(...psnrs).toFixed(2)} dB`);
check('7 lowres: a 380 px wide portrait at passport is blocked, no file', low.lowres === true && low.blocks.includes('lowres') && low.bytes === undefined, `s ${low.s.toFixed(3)}`);
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const detectMed = med(detectMs);
if (initMs > 2 * SPIKE.initMs) flags.push(`init ${initMs} ms > 2 × spike ${SPIKE.initMs} ms`);
if (detectMed > 2 * SPIKE.detectMs) flags.push(`detect median ${detectMed.toFixed(0)} ms > 2 × spike ${SPIKE.detectMs} ms`);

const f2 = (v) => (v === undefined ? '–' : v.toFixed(2));
const md = [
  `# regress:idphoto (${browserName}; ${full ? 'committed + full-res corpus' : 'committed corpus'})`,
  '',
  '| set | id | px | faces | eye mm | chin mm | true head mm (auto frame) | warnings | expected | PSNR dB | files ok |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${r.set} | ${r.id} | ${r.w}×${r.h} | ${r.faces} | ${f2(r.eyeMm)} | ${f2(r.chinMm)} | ${f2(r.headMm)} | ${r.warns.join(' ') || '–'} | ${r.expectWarn.join(' ') || '–'} | ${r.psnr === undefined ? '–' : r.psnr.toFixed(2)} | ${r.outputs ? `${r.outputs.filter((o) => o.problems && !o.problems.length).length}/${r.outputs.length}` : '–'} |`,
  ),
  '',
  `Scene: ${scene.faces} faces (${sceneRun.warns.join(' ')}). Two faces: ${two.faces} (${twoRun.warns.join(' ')}). Lowres 380 px: ${low.lowres ? 'blocked' : 'NOT blocked'}.`,
  '',
  `Timing: landmarker init ${initMs} ms (assets from the local dev server), detect median ${detectMed.toFixed(0)} ms (n=${detectMs.length}). Spike: 700 / 89 ms.${flags.length ? ` FLAG: ${flags.join('; ')}` : ''}`,
  '',
  `False positives (pose/expression/eyes warnings outside expectWarn; reported, not failures): ${fp.map((r) => `${r.set}/${r.id} [${r.warns.filter((w) => !r.expectWarn.includes(w))}]`).join(', ') || 'none'}`,
  '',
  '| check | result | detail |',
  '|---|---|---|',
  ...checks.map((c) => `| ${c.name} | ${c.ok ? 'PASS' : '**FAIL**'} | ${c.detail ?? ''} |`),
  '',
].join('\n');
const outDir = join(root, 'regress-out');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'idphoto.md'), md);
writeFileSync(join(outDir, 'idphoto.json'), JSON.stringify({ browser: browserName, rows, checks, initMs, detectMed, flags }, null, 1));
await browser.close();
await server.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks pass${flags.length ? `; flags: ${flags.join('; ')}` : ''}. Table: regress-out/idphoto.md`);
process.exit(failed.length ? 1 : 0);
