// npm run qa:visual -- --url BASE [--out DIR] [--only static|tools|net]
// Reproduces the UX-AUDIT-1 visual matrix (brief Polish P.20) into the OS temp folder, never the repo:
// static pages across browsers, viewports, colour schemes, fold / 200 % zoom / 320 px reflow, the PDF tool
// states, and Slow 4G + CPU×4 first-use timings. static.json records overflow, CLS, console errors, small
// targets, the weight probe, the mobile download check and the timings. The no-upload recorder runs on every
// page. Exits 1 on a hard failure. Not run in CI; the deploy gate runs it against the live site.
import { chromium, firefox, webkit } from '@playwright/test';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRuntimeFixtures, makeScanMultiFixture } from '../../tests/fixtures/build.mjs';

const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const BASE = (arg('--url') ?? '').replace(/\/+$/, '');
if (!BASE) {
  console.error('usage: npm run qa:visual -- --url BASE [--out DIR] [--only static|tools|net]');
  process.exit(2);
}
const ONLY = arg('--only');
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const OUT = arg('--out') ?? join(tmpdir(), 'visual-qa', `${today}-qa`);
mkdirSync(OUT, { recursive: true });
const ORIGIN = new URL(BASE).origin;
const FIX = join(process.cwd(), 'tests', 'fixtures');

const PAGES = [
  ['home', '/'],
  ['merge', '/pdf-merge/'],
  ['compress', '/pdf-compress/'],
  ['photo', '/photo-compress/'],
  ['hwp', '/hwp-to-pdf/'],
  ['hwpview', '/hwp-viewer/'],
  ['idphoto', '/id-photo/'],
  ['privacy', '/privacy/'],
  ['terms', '/terms/'],
  ['licenses', '/licenses/'],
  ['404', '/__qa-missing-page/'],
  // G2 A1: the topic-grouped index, both hubs and a new guide.
  ['guides', '/guide/'],
  ['hubphoto', '/guide/photo-sizes/'],
  ['hubupload', '/guide/upload-limits/'],
  ['admission', '/guide/admission-photo/'],
];
const MAIN = PAGES.slice(0, 3);
const VIEWPORTS = {
  d1440: { width: 1440, height: 900 },
  d1280: { width: 1280, height: 800 },
  t768: { width: 768, height: 1024 },
  m360: { width: 360, height: 740, mobile: true },
  m390: { width: 390, height: 844, mobile: true },
};

const report = { base: BASE, out: OUT, date: today, shots: [], weightProbe: {}, mobileDownload: [], timings: {}, skipped: [], hard: [] };
const hard = (msg) => report.hard.push(msg);
let shots = 0;

// ---------- runtime inputs (the e2e helpers' recipes, written into the output folder) ----------

async function inputs() {
  const dir = join(OUT, 'inputs');
  const made = await makeRuntimeFixtures(dir);
  const files = {
    law: join(FIX, 'kr_law_form.pdf'),
    fw9: join(FIX, 'irs_fw9.pdf'),
    scan: join(FIX, 'gen_scan_a6.pdf'),
    small: join(FIX, 'gen_already_small.pdf'),
    locked: join(dir, 'locked.pdf'),
    damaged: join(dir, 'damaged.pdf'),
    notes: join(dir, 'notes.txt'),
    resume: join(dir, '이력서_홍길동 (최종).pdf'),
  };
  copyFileSync(made.encrypted_userpw_1234, files.locked);
  copyFileSync(made.truncated, files.damaged);
  writeFileSync(files.notes, '회의 메모: PDF가 아닌 파일입니다.\n');
  copyFileSync(join(FIX, 'gen_photo_resume.pdf'), files.resume);
  if (!ONLY || ONLY === 'tools') files.multi = await makeScanMultiFixture(dir, 40);
  return files;
}

// ---------- instrumentation ----------

/** Records every request of the context; flags anything that could carry file data (P.20 hard failure). */
function recorder(context, label) {
  context.on('request', (r) => {
    const url = r.url();
    const scheme = url.slice(0, url.indexOf(':') + 1);
    const problems = [];
    if (!['GET', 'HEAD'].includes(r.method())) problems.push(`${r.method()} ${url}`);
    if (r.postDataBuffer() !== null) problems.push(`request body on ${url}`);
    if (scheme !== 'blob:' && scheme !== 'data:' && new URL(url).origin !== ORIGIN) problems.push(`third-party ${url}`);
    for (const p of problems) hard(`no-upload (${label}): ${p}`);
  });
}

const CLS_INIT = () => {
  window.__cls = 0;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    window.__cls = null; // not supported (Firefox, WebKit)
  }
};

async function measure(page) {
  return page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const small = [...document.querySelectorAll('a, button, input:not([type=hidden]), select, summary, label.btn, label.chip, label.radio, label.check')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        const style = getComputedStyle(e);
        if (!r.width || !r.height || style.visibility === 'hidden' || e.closest('[hidden]')) return false;
        if (e.matches('input.file-input, .file-input')) return false;
        // Links inside running text are exempt (WCAG 2.5.8 inline exception).
        if (e.tagName === 'A' && e.closest('p, li') && !e.classList.contains('btn')) return false;
        return r.width < 24 || r.height < 24;
      })
      .map((e) => (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 40));
    return { overflow, cls: window.__cls ?? null, small };
  });
}

async function newContext(browser, vp, scheme, extra = {}) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr ?? (vp.mobile ? 2 : 1),
    isMobile: Boolean(vp.mobile) && browser.browserType().name() !== 'firefox',
    hasTouch: Boolean(vp.mobile),
    colorScheme: scheme,
    locale: 'ko-KR',
    serviceWorkers: 'block',
    ...extra,
  });
  await ctx.addInitScript(CLS_INIT);
  return ctx;
}

async function shoot(page, name, { full = true, errors = [] } = {}) {
  await page.evaluate(() => document.fonts.ready);
  const m = await measure(page);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });
  shots++;
  report.shots.push({ name, ...m, consoleErrors: [...errors] });
  if (m.overflow > 0) hard(`${name}: horizontal overflow ${m.overflow} px`);
  for (const e of errors) hard(`${name}: console error: ${e}`);
  errors.length = 0;
  return m;
}

const withErrors = (page) => {
  const errors = [];
  page.on('console', (msg) => {
    // Resource failures the tool-state runs cause on purpose (aborted chunks, offline) are not page errors.
    if (msg.type() === 'error' && !/Failed to load resource|net::ERR_|NetworkError|dynamically imported module|Load failed/i.test(msg.text())) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
};

async function goto(page, path) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.readyState === 'complete');
}

// ---------- browsers ----------

async function launchAll() {
  const list = [
    ['chromium', () => chromium.launch()],
    ['firefox', () => firefox.launch()],
    ['webkit', () => webkit.launch()],
    ['chrome', () => chromium.launch({ channel: 'chrome' })],
    ['msedge', () => chromium.launch({ channel: 'msedge' })],
  ];
  const out = [];
  for (const [name, launch] of list) {
    try {
      out.push([name, await launch()]);
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err).split('\n')[0];
      console.log(`skipped: ${name}: ${msg}`);
      report.skipped.push({ browser: name, error: msg });
    }
  }
  return out;
}

// ---------- static matrix ----------

async function weightProbe(browser, name) {
  const ctx = await newContext(browser, VIEWPORTS.d1280, 'light');
  recorder(ctx, `${name} weight probe`);
  const page = await ctx.newPage();
  await goto(page, '/');
  const r = await page.evaluate(async () => {
    await document.fonts.load('400 32px "Anolim UI Sans"', '서류 파일 문서딱');
    await document.fonts.load('800 32px "Anolim UI Sans"', '서류 파일 문서딱');
    const probe = (w) => {
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 60;
      const g = c.getContext('2d');
      g.font = `${w} 32px "Anolim UI Sans"`;
      g.fillText('서류 파일 문서딱', 4, 44);
      let ink = 0;
      for (const [i, v] of g.getImageData(0, 0, 400, 60).data.entries()) if (i % 4 === 3) ink += v;
      return ink;
    };
    return { ratio: probe(800) / probe(400), check: document.fonts.check('800 16px "Anolim UI Sans"') };
  });
  report.weightProbe[name] = r;
  if (!r.check || r.ratio < 1.3) hard(`${name}: weight probe failed (800/400 ink ${r.ratio.toFixed(2)}, check ${r.check})`);
  await ctx.close();
}

async function staticMatrix(browsers) {
  for (const [name, browser] of browsers) {
    await weightProbe(browser, name);
    const combos = name === 'chromium'
      ? Object.entries(VIEWPORTS).flatMap(([vp]) => ['light', 'dark'].flatMap((scheme) => PAGES.map((p) => [vp, scheme, p])))
      : ['d1440', 'm390'].flatMap((vp) => MAIN.map((p) => [vp, 'light', p]));
    for (const [vpName, scheme, [pageName, path]] of combos) {
      const vp = VIEWPORTS[vpName];
      const ctx = await newContext(browser, vp, scheme);
      recorder(ctx, `${name}-${vpName}-${scheme}-${pageName}`);
      const page = await ctx.newPage();
      const errors = withErrors(page);
      await goto(page, path);
      await shoot(page, `${name}-${vpName}-${scheme}-${pageName}`, { errors });
      if (name === 'chromium' && scheme === 'light' && vp.mobile) await shoot(page, `fold-${vpName}-${pageName}`, { full: false, errors });
      await ctx.close();
    }
  }
  const [, chrome] = browsers.find(([n]) => n === 'chromium') ?? [];
  if (!chrome) return;
  for (const [pageName, path] of PAGES) {
    // 200 % zoom: 720 CSS px wide at DPR 2 (a 1440 px window at 200 %).
    for (const [label, vp] of [
      ['zoom200', { width: 720, height: 450, dpr: 2 }],
      ['reflow320', { width: 320, height: 640, mobile: true }],
    ]) {
      const ctx = await newContext(chrome, vp, 'light');
      recorder(ctx, `${label}-${pageName}`);
      const page = await ctx.newPage();
      const errors = withErrors(page);
      await goto(page, path);
      await shoot(page, `chromium-${label}-light-${pageName}`, { errors });
      await ctx.close();
    }
  }
}

// ---------- tool states ----------

async function stateRun(browser, mode, prefix, steps) {
  const vp = mode === 'm' ? VIEWPORTS.m390 : VIEWPORTS.d1280;
  const ctx = await newContext(browser, vp, 'light');
  recorder(ctx, `${prefix}-${mode}`);
  const page = await ctx.newPage();
  const errors = withErrors(page);
  const shot = (n, state, opts = {}) => shoot(page, `${prefix}-${mode}-${String(n).padStart(2, '0')}-${state}`, { errors, ...opts });
  try {
    await steps(page, ctx, shot, mode);
  } catch (err) {
    hard(`${prefix}-${mode}: ${String(err instanceof Error ? err.message : err).split('\n')[0]}`);
  }
  await ctx.close();
}

async function engineShown(page, label) {
  await page.locator('#engine-error').waitFor({ state: 'visible', timeout: 30_000 });
  if (await page.getByText('파일이 손상되었거나').count()) hard(`${label}: an engine failure was shown with the corrupt copy`);
}

/**
 * /id-photo/ done state (UX-AUDIT-2 P1-1): the headline, the chips and 내려받기 must be fully visible, with the
 * top edge below the sticky header and the bottom edge inside the viewport, and the headline focused.
 */
async function idpDoneInView(page, label) {
  const r = await page.evaluate(() => {
    const box = (sel) => document.querySelector(sel).getBoundingClientRect();
    const header = box('header.top').bottom;
    const parts = ['#idp-headline', '#idp-chips', '#idp-download'].map((sel) => ({ sel, top: box(sel).top, bottom: box(sel).bottom }));
    return { header, vh: innerHeight, parts, focused: document.activeElement?.id === 'idp-headline' };
  });
  const bad = r.parts.filter((p) => p.top < r.header - 0.5 || p.bottom > r.vh + 0.5).map((p) => `${p.sel} ${Math.round(p.top)}–${Math.round(p.bottom)}`);
  const ok = bad.length === 0 && r.focused;
  report.mobileDownload.push({ state: `${label}-done`, headerBottom: Math.round(r.header), viewport: r.vh, belowHeaderAndInViewport: bad.length === 0, headlineFocused: r.focused });
  if (!ok) hard(`${label} done: ${bad.length ? `hidden by the header or below the fold: ${bad.join(', ')}` : 'the headline is not focused'} (header bottom ${Math.round(r.header)}, viewport ${r.vh})`);
}

/** The /id-photo/ done state at 360, 768 and 200 % zoom (390 runs in the state matrix above). */
async function idpDoneMatrix(browser) {
  for (const [name, vp] of [['m360', VIEWPORTS.m360], ['t768', VIEWPORTS.t768], ['zoom200', { width: 720, height: 450, dpr: 2 }]]) {
    const ctx = await newContext(browser, vp, 'light');
    recorder(ctx, `idp-done-${name}`);
    const page = await ctx.newPage();
    try {
      await goto(page, '/id-photo/');
      await page.setInputFiles('#idp-input', join(FIX, 'photo', 'portrait_pd.jpg'));
      await page.locator('#idp-tool[data-state="adjust"]').waitFor({ timeout: 90_000 });
      await page.locator('#idp-confirm').check();
      await page.locator('#idp-save').click();
      await page.locator('#idp-tool[data-state="done"]').waitFor({ timeout: 60_000 });
      await shoot(page, `idp-${name}-done-fold`, { full: false });
      await idpDoneInView(page, `idp-${name}`);
    } catch (err) {
      hard(`idp-done-${name}: ${String(err instanceof Error ? err.message : err).split('\n')[0]}`);
    }
    await ctx.close();
  }
}

async function toolStates(browser, f) {
  for (const mode of ['d', 'm']) {
    await stateRun(browser, mode, 'merge', async (page, ctx, shot) => {
      await goto(page, '/pdf-merge/');
      await shot(1, 'empty');
      await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.items.add(new File(['%PDF-1.4'], 'x.pdf', { type: 'application/pdf' }));
        document.querySelector('#merge-drop').dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      });
      await shot(2, 'dragging');
      await page.setInputFiles('#merge-input', [f.notes, f.law]);
      await page.locator('#merge-error').waitFor({ state: 'visible' });
      await shot(3, 'nonpdf');
      await page.setInputFiles('#merge-input', [f.fw9, f.resume, f.locked]);
      await page.waitForFunction(() => document.querySelectorAll('#merge-list .info').length === 4 && ![...document.querySelectorAll('.thumb-ph')].some((e) => e.textContent === '확인 중'));
      await shot(4, 'files');
      const pw = page.getByLabel('비밀번호', { exact: true });
      await pw.fill('0000');
      await pw.press('Enter');
      await page.locator('.pw-error', { hasText: '비밀번호가 맞지 않습니다.' }).waitFor();
      await shot(5, 'pw-wrong');
      await pw.fill('1234');
      await pw.press('Enter');
      await page.locator('#merge-run:not([disabled])').waitFor();
      await page.locator('#merge-run').click();
      await page.locator('#merge-tool[data-state="done"]').waitFor({ timeout: 60_000 });
      await shot(6, 'done');
      await goto(page, '/pdf-merge/');
      await ctx.route(/\/_astro\/inspect[^/]*\.js/, (r) => r.abort());
      await page.setInputFiles('#merge-input', [f.law]);
      await engineShown(page, `merge-${mode} stale-chunk`);
      await shot(7, 'stale-chunk');
      await ctx.unroute(/\/_astro\/inspect[^/]*\.js/);
    });
    // Offline on first use needs a fresh context: after one use the engine comes from the cache and works.
    await stateRun(browser, mode, 'merge', async (page, ctx, shot) => {
      await goto(page, '/pdf-merge/');
      await ctx.setOffline(true);
      await page.setInputFiles('#merge-input', [f.law]);
      await engineShown(page, `merge-${mode} offline`);
      await shot(8, 'offline');
      await ctx.setOffline(false);
    });

    await stateRun(browser, mode, 'cmp', async (page, ctx, shot, m) => {
      const pick = async (file, ready = true) => {
        await goto(page, '/pdf-compress/');
        await page.setInputFiles('#cmp-input', file);
        if (ready) await page.locator('#cmp-info', { hasText: '쪽' }).waitFor();
      };
      const run = async (state = 'done') => {
        await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
        const go = page.getByRole('button', { name: '계속 줄이기' });
        if (await go.isVisible().catch(() => false)) await go.click();
        await page.locator(`#compress-tool[data-state="${state}"]`).waitFor({ timeout: 240_000 });
      };
      await pick(f.notes, false);
      await page.locator('#cmp-error').waitFor({ state: 'visible' });
      await shot(1, 'nonpdf');
      await pick(f.damaged, false);
      await page.locator('#compress-tool[data-state="error"]').waitFor();
      await shot(2, 'damaged');
      await pick(f.locked, false);
      await page.locator('#cmp-pw-input').waitFor({ state: 'visible' });
      await shot(3, 'locked');
      await pick(f.scan);
      await shot(4, 'ready');
      let release;
      const held = new Promise((r) => (release = r));
      await ctx.route(/compress\.worker[^/]*\.js/, async (r) => {
        await held;
        await r.continue().catch(() => undefined);
      });
      await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
      await page.locator('#compress-tool[data-state="working"]').waitFor();
      await shot(5, 'working');
      release();
      await page.locator('#compress-tool[data-state="done"]').waitFor({ timeout: 60_000 });
      await ctx.unroute(/compress\.worker[^/]*\.js/);
      await shot(6, 'done');
      const inView = await page.evaluate(() => {
        const r = document.querySelector('#cmp-download').getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight && document.activeElement?.id === 'cmp-headline';
      });
      report.mobileDownload.push({ state: `cmp-${m}-done`, inViewportAndHeadlineFocused: inView });
      if (m === 'm' && !inView) hard(`cmp-m done: 내려받기 is outside the viewport or the headline is not focused`);
      await shot(7, 'done-viewport', { full: false });
      await pick(f.small);
      await run('kept');
      await shot(8, 'kept');
      await pick(f.scan);
      await page.getByRole('radio', { name: '목표 용량으로 줄이기' }).check();
      await page.locator('#cmp-target-box').getByText('직접 입력', { exact: true }).click();
      await page.getByLabel('목표 용량 (MB)').fill('0.5');
      await run();
      await shot(9, 'target-hit');
      await pick(f.multi);
      await page.getByRole('radio', { name: '목표 용량으로 줄이기' }).check();
      await page.locator('#cmp-target-box').getByText('직접 입력', { exact: true }).click();
      await page.getByLabel('목표 용량 (MB)').fill('0.5');
      await run();
      await shot(10, 'target-miss');
      await pick(f.scan);
      await ctx.route(/compress\.worker[^/]*\.js/, (r) => r.abort());
      await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
      await engineShown(page, `cmp-${m} stale-chunk`);
      await shot(11, 'stale-chunk');
      await ctx.unroute(/compress\.worker[^/]*\.js/);
    });
    // /id-photo/ (Step 4): empty → adjust (overlay, checklist) → done; plus an unreadable file.
    await stateRun(browser, mode, 'idp', async (page, _ctx, shot) => {
      await goto(page, '/id-photo/');
      await shot(1, 'empty');
      await page.setInputFiles('#idp-input', join(FIX, 'photo', 'portrait_pd.jpg'));
      await page.locator('#idp-tool[data-state="adjust"]').waitFor({ timeout: 90_000 });
      await page.locator('#idp-stage').scrollIntoViewIfNeeded();
      await shot(2, 'adjust');
      await page.locator('#idp-confirm').check();
      await page.locator('#idp-save').click();
      await page.locator('#idp-tool[data-state="done"]').waitFor({ timeout: 60_000 });
      await shot(3, 'done');
      await idpDoneInView(page, `idp-${mode}`);
      await goto(page, '/id-photo/');
      await page.setInputFiles('#idp-input', join(FIX, 'photo', 'anim.gif'));
      await page.locator('#idp-error').waitFor({ state: 'visible' });
      await shot(4, 'error');
    });
    // /hwp-viewer/ (G2 A0): empty → a document (toolbar, page list) → search with a hit marked; phones: the sheet.
    await stateRun(browser, mode, 'hwpv', async (page, _ctx, shot) => {
      await goto(page, '/hwp-viewer/');
      await shot(1, 'empty');
      await page.setInputFiles('#hw-input', join(process.cwd(), 'tests', 'corpus', 'hwp', 'law10.hwp'));
      await page.locator('#hv-bar').waitFor({ state: 'visible', timeout: 150_000 });
      await page.locator('#hw-result').scrollIntoViewIfNeeded();
      await shot(2, 'document');
      await page.locator('#hv-find-toggle').click();
      await page.locator('#hv-q').fill('전산');
      await page.locator('#hv-q').press('Enter');
      await page.locator('#hw-preview .hv-mark').first().waitFor({ timeout: 120_000 });
      await shot(3, 'search');
      if (mode === 'm') {
        await page.locator('#hv-thumbs-toggle').click();
        await page.locator('#hv-thumbs').waitFor({ state: 'visible' });
        await shot(4, 'page-list');
      }
    });
    await stateRun(browser, mode, 'cmp', async (page, ctx, shot, m) => {
      await goto(page, '/pdf-compress/');
      await ctx.setOffline(true);
      await page.setInputFiles('#cmp-input', f.scan);
      await engineShown(page, `cmp-${m} offline`);
      await shot(12, 'offline');
      await ctx.setOffline(false);
    });
  }
}

// ---------- Slow 4G + CPU×4 first use (chromium CDP) ----------

async function timings(browser, f) {
  const ctx = await newContext(browser, VIEWPORTS.m390, 'light');
  recorder(ctx, 'timings');
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  // Lighthouse's Slow 4G: 150 ms RTT, 1.6 Mbps down, 750 kbps up; CPU slowed 4×.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await goto(page, '/pdf-merge/');
  let t = Date.now();
  await page.setInputFiles('#merge-input', [f.law]);
  await page.locator('#merge-list .info', { hasText: '쪽' }).waitFor({ timeout: 120_000 });
  report.timings.mergeFirstInspectMs = Date.now() - t;
  await goto(page, '/pdf-compress/');
  await page.setInputFiles('#cmp-input', f.scan);
  await page.locator('#cmp-info', { hasText: '쪽' }).waitFor({ timeout: 120_000 });
  t = Date.now();
  await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
  await page.locator('#compress-tool[data-state="done"]').waitFor({ timeout: 240_000 });
  report.timings.compressFirstRunMs = Date.now() - t;
  report.timings.conditions = 'Slow 4G (150 ms, 1.6 Mbps) + CPU×4, chromium CDP, m390, no preload interaction';
  await ctx.close();
}

// ---------- main ----------

const browsers = await launchAll();
const chrome = browsers.find(([n]) => n === 'chromium')?.[1];
const f = await inputs();
try {
  if (!ONLY || ONLY === 'static') await staticMatrix(browsers);
  if ((!ONLY || ONLY === 'tools') && chrome) {
    await toolStates(chrome, f);
    await idpDoneMatrix(chrome);
  }
  if ((!ONLY || ONLY === 'net') && chrome) await timings(chrome, f);
} finally {
  for (const [, b] of browsers) await b.close();
}
report.pngs = shots;
writeFileSync(join(OUT, 'static.json'), JSON.stringify(report, null, 2));
console.log(`qa:visual: ${shots} PNGs and static.json in ${OUT}`);
console.log(`  weight probe: ${Object.entries(report.weightProbe).map(([b, r]) => `${b} ${r.ratio.toFixed(2)}`).join(', ')}`);
if (report.timings.compressFirstRunMs) console.log(`  Slow 4G + CPU×4: merge first inspect ${report.timings.mergeFirstInspectMs} ms, compress first run ${report.timings.compressFirstRunMs} ms`);
const small = report.shots.filter((s) => s.small.length).length;
console.log(`  shots with targets under 24 px: ${small} (listed in static.json)`);
if (report.hard.length) {
  console.error(`qa:visual: FAIL — ${report.hard.length} hard failure(s)`);
  for (const h of report.hard) console.error(`  ${h}`);
  process.exit(1);
}
console.log('qa:visual: 0 hard failures');
