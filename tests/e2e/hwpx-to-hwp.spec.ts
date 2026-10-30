// HWPX HWP 변환 (HWPX2HWP brief, test map "E2E"). All 5 projects; the no-upload fixture runs on every test
// (./no-upload) and every test asserts zero CSP violations. The HWP bytes the page hands out are compared with what
// rhwp makes in Node from the same HWPX (byte-identical: the export is deterministic), and re-opened in /hwp-viewer/.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Download, Page } from '@playwright/test';
import { expect, gotoReady, test } from './no-upload';
import { hwpRuntime } from './hwp-fixtures';
import { loadRhwp } from '../helpers/rhwp-node';

const CORPUS = join(process.cwd(), 'tests', 'corpus', 'hwp');
const fx = (name: string): string => join(CORPUS, name);
const expected = JSON.parse(readFileSync(join(CORPUS, 'expected.json'), 'utf8')).files as Record<string, { pages: number }>;
const CSP = readFileSync(join(process.cwd(), 'public', '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)![1].trim();
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const HANCOM = '본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.';
const TRADEMARK = '한글, 한컴, HWP, HWPX는 (주)한컴(옛 한글과컴퓨터)의 상표입니다. 문서딱은 한컴과 제휴·후원·승인 관계가 없습니다.';
const EXPECT = '줄바꿈이나 표 모양이 조금 다를 수 있어요. 내기 전에 한글에서 한 번 열어 확인하세요.';
const PASSWORD = '비밀번호가 걸린 문서는 열 수 없습니다. 한글 프로그램에서 암호를 해제한 뒤 다시 시도해 주세요.';
const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const FINAL = /^(done|error)$/;
const WASM_RE = /\/vendor\/rhwp\/[^/]+\/rhwp_bg\.wasm$/;
const WORKER_RE = /hwp\.worker[^/]*\.js$/;

type Win = Window & { __csp: number };

const tool = (page: Page) => page.locator('#hwp-tool');
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

/** The HWP rhwp makes from a fixture in Node (exportHwpWithReport → takeBytes), the reference for the browser bytes. */
async function nodeHwp(file: string): Promise<Uint8Array> {
  const Doc = await loadRhwp();
  const doc = new Doc(new Uint8Array(readFileSync(fx(file))));
  try {
    const exp = doc.exportHwpWithReport();
    try {
      return exp.takeBytes();
    } finally {
      exp.free();
    }
  } finally {
    doc.free();
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Win;
    w.__csp = 0;
    document.addEventListener('securitypolicyviolation', () => w.__csp++);
  });
});

test.afterEach(async ({ page }) => {
  if (page.url().startsWith('http')) expect(await page.evaluate(() => (window as unknown as Win).__csp), 'CSP violations').toBe(0);
});

type Pick = string | { name: string; mimeType: string; buffer: Buffer };

async function convert(page: Page, file: Pick, state?: 'done' | 'error', timeout = 150_000): Promise<string> {
  if (!page.url().includes('/hwpx-to-hwp/')) await gotoReady(page, '/hwpx-to-hwp/');
  await page.setInputFiles('#hx-input', file);
  await expect(tool(page)).toHaveAttribute('data-state', FINAL, { timeout });
  const s = (await tool(page).getAttribute('data-state'))!;
  if (state) expect(s, (await page.locator('#hx-error').textContent()) ?? '').toBe(state);
  return s;
}

async function save(page: Page): Promise<{ d: Download; bytes: Uint8Array }> {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.locator('#hx-save').click()]);
  return { d, bytes: new Uint8Array(readFileSync((await d.path())!)) };
}

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

// ---------- lazy load ----------

test('lazy: no worker, wasm, viewer, HWP font or PDF chunk before a file is picked', async ({ page, network }) => {
  await gotoReady(page, '/hwpx-to-hwp/');
  await page.waitForTimeout(1500);
  const urls = network.requests.map((r) => r.url());
  expect(urls.filter((u) => /hwp\.worker|rhwp_bg|\/fonts\/hwp\/|export-chunk|\/_astro\/lazy[.-]/.test(u))).toEqual([]);
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
});

// ---------- the four fixtures ----------

for (const key of ['adm02', 'adm14', 'adm19', 'adm28']) {
  test(`${key}.hwpx → ${key}.hwp: an HWP 5 CFB byte-identical to rhwp in Node; it re-opens in /hwp-viewer/ with ${expected[key]!.pages} pages`, async ({ page, network }) => {
    test.setTimeout(300_000);
    await convert(page, fx(`${key}.hwpx`), 'done');
    await expect(page.locator('#hx-file-name')).toHaveText(new RegExp(`^${key}\\.hwp · [\\d,.]+ KB$`));
    await expect(page.locator('#hx-file-name')).toBeFocused();
    await expect(page.locator('#hx-loss')).toBeHidden();
    await expect(page.locator('#hx-result .hint')).toHaveText(EXPECT);
    // No preview, no fonts, no render: neither the viewer chunk nor the HWP document fonts were requested.
    expect(network.requests.map((r) => r.url()).filter((u) => /\/fonts\/hwp\/|export-chunk|\/_astro\/lazy[.-]/.test(u))).toEqual([]);
    const { d, bytes } = await save(page);
    expect(d.suggestedFilename()).toBe(`${key}.hwp`);
    expect([...bytes.subarray(0, 8)]).toEqual(CFB);
    expect(sha(bytes)).toBe(sha(await nodeHwp(`${key}.hwpx`)));
    await expect(page.locator('#hx-done-text')).toHaveText(`「${key}.hwp」를 내려받았어요. 「다운로드」 폴더를 확인하세요.`);
    // The downloaded file itself opens in /hwp-viewer/ with the source's page count.
    await gotoReady(page, '/hwp-viewer/');
    await page.setInputFiles('#hw-input', { name: `${key}.hwp`, mimeType: 'application/x-hwp', buffer: Buffer.from(bytes) });
    await expect(page.locator('#hwp-tool')).toHaveAttribute('data-state', /^(convert|viewer-first|viewer-only)$/, { timeout: 200_000 });
    await expect(page.locator('#hw-file-name')).toHaveText(`${key}.hwp · ${expected[key]!.pages}쪽`);
  });
}

// ---------- inputs that are not converted ----------

test('an .hwp is already HWP (no worker, no engine): the message, links to the viewer and HWP PDF 변환, focus on the message', async ({ page, network }) => {
  await convert(page, fx('law05.hwp'), 'error');
  await expect(page.locator('#hx-error')).toHaveText('이미 HWP 파일이에요. HWPX로 바꾸지 않아도 되고, 아래 버튼으로 바로 열어 보거나 PDF로 바꿀 수 있어요.');
  await expect(page.locator('#hx-error')).toBeFocused();
  await expect(page.locator('#hx-error-links a')).toHaveText(['바로 보기', 'PDF로 바꾸기']);
  // FAIL1030 C: buttons, not small hint links (tap target ≥ 44 px).
  for (const a of await page.locator('#hx-error-links a').all()) {
    await expect(a).toHaveClass(/\bbtn\b/);
    expect((await a.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator('#hx-error-links a').first()).toHaveAttribute('href', '/hwp-viewer/');
  await expect(page.locator('#hx-error-links a').last()).toHaveAttribute('href', '/hwp-to-pdf/');
  await expect(page.locator('#hx-drop')).toBeVisible();
  expect(network.requests.map((r) => r.url()).filter((u) => WORKER_RE.test(u) || WASM_RE.test(u))).toEqual([]);
});

test('noise and a text file are not HWPX; a password HWPX is refused before the engine loads; .hml is unsupported', async ({ page, network }) => {
  test.setTimeout(120_000);
  for (const [f, line] of [
    // FAIL1030 D: unknown bytes get the 보안 문서 hedge; a text file keeps the pick-a-.hwpx line.
    [hwpRuntime('noise.hwpx'), '한글 문서로 읽을 수 없는 파일이에요. 회사·기관에서 받은 보안 문서라면 보낸 곳에 PDF로 요청해 주세요.'],
    [hwpRuntime('notes.txt'), 'HWPX 파일이 아니에요. 확장자가 .hwpx인 한글 파일을 골라 주세요.'],
  ] as const) {
    await convert(page, f, 'error');
    await expect(page.locator('#hx-error')).toHaveText(line);
    await expect(page.locator('#hx-error-links')).toBeHidden();
    await expect(page.locator('#hx-error-actions')).toBeHidden();
  }
  await convert(page, hwpRuntime('adm14-password.hwpx'), 'error');
  await expect(page.locator('#hx-error')).toHaveText(PASSWORD);
  expect(network.requests.filter((r) => WASM_RE.test(r.url()))).toEqual([]);
  await convert(page, { name: 'a.hml', mimeType: 'application/xml', buffer: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><HWPML Version="2.8"></HWPML>') }, 'error');
  await expect(page.locator('#hx-error')).toContainText('이 형식의 한글 문서는 열 수 없습니다.');
});

test('too large on a phone: a 26 MB file is refused with the numbers before any read', async ({ page, isMobile, network }) => {
  test.skip(!isMobile, 'The 25 MB hard limit is the phone limit (150 MB on PC; the FAQ numbers are unit-tested).');
  await convert(page, hwpRuntime('big-26mb.hwp'), 'error');
  await expect(page.locator('#hx-error')).toHaveText('휴대폰에서는 25 MB까지 열 수 있습니다 (이 파일 26 MB). 컴퓨터에서 열어 주세요.');
  expect(network.requests.filter((r) => WASM_RE.test(r.url()) || WORKER_RE.test(r.url()))).toEqual([]);
});

test('engine: a wasm 404 shows the engine panel with 새로고침, not a file error', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.route(WASM_RE, (route) => route.fulfill({ status: 404, body: 'missing', headers: { 'Content-Security-Policy': CSP } }));
  await convert(page, fx('adm14.hwpx'), 'error');
  await expect(page.locator('#engine-error')).toBeVisible();
  await expect(page.locator('#engine-error').getByRole('button', { name: '새로고침' })).toBeFocused();
  await expect(page.locator('#hx-error')).toBeHidden();
});

// ---------- REQ1014-B: wrong files, the chain to the HWP pages ----------

test('a PDF and a Word file are named (PDF with 「PDF 열기」); no worker, no engine for the PDF', async ({ page, network }) => {
  await convert(page, hwpRuntime('report.pdf'), 'error');
  await expect(page.locator('#hx-error')).toHaveText('PDF 파일이에요. HWP로 바꿀 필요 없이 바로 열 수 있어요.');
  await expect(page.locator('#hx-error-actions').getByRole('link', { name: 'PDF 열기' })).toHaveAttribute('href', /^blob:/);
  await expect(page.locator('#hx-error-actions').getByRole('button', { name: 'PDF 쪽 보기·나누기' })).toBeVisible();
  await expect(page.locator('#hx-error-links')).toBeHidden();
  expect(network.requests.map((r) => r.url()).filter((u) => WORKER_RE.test(u) || WASM_RE.test(u))).toEqual([]);
  await convert(page, hwpRuntime('word.docx'), 'error');
  await expect(page.locator('#hx-error')).toHaveText('워드 파일(.docx)이에요. 확장자가 .hwpx인 한글 파일을 골라 주세요.');
  await expect(page.locator('#hx-error-actions')).toBeHidden();
  expect(network.requests.filter((r) => WASM_RE.test(r.url()))).toEqual([]);
});

test('「바로 보기」 hands the picked .hwp to /hwp-viewer/: it opens there without a second pick', async ({ page }) => {
  test.setTimeout(150_000);
  await convert(page, fx('law05.hwp'), 'error');
  await page.locator('#hx-error-links').getByRole('link', { name: '바로 보기' }).click();
  await expect(page).toHaveURL(/\/hwp-viewer\/$/);
  await expect(page.locator('#hw-arrived')).toHaveText('방금 만든 파일을 가져왔습니다.');
  await expect(page.locator('#hwp-tool')).toHaveAttribute('data-state', 'convert', { timeout: 120_000 });
  await expect(page.locator('#hw-preview .page').first()).toBeVisible();
  await expect(page.locator('#hw-file-name')).toContainText('law05.hwp');
});

test('a store failure on 「바로 보기」 follows the link (pick again there)', async ({ page }) => {
  await gotoReady(page, '/hwpx-to-hwp/');
  // IndexedDB refused (private mode): sendTo answers false.
  await page.evaluate(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => ({ open: () => { throw new DOMException('denied', 'SecurityError'); } }) });
  });
  await convert(page, fx('law05.hwp'), 'error');
  await page.locator('#hx-error-links').getByRole('link', { name: '바로 보기' }).click();
  await expect(page).toHaveURL(/\/hwp-viewer\/$/);
  await expect(page.locator('#hwp-tool')).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#hw-arrived')).toBeHidden();
});

// ---------- losses, a new pick mid-run ----------

test('losses > 0 (worker stub): the warning and a 기타 line above the button; the download still works', async ({ page, context }) => {
  const hwp = await nodeHwp('adm14.hwpx');
  // A stand-in for the HWP worker that answers open and export-hwp like the real one, with 2 losses.
  const stub = `const B=Uint8Array.from(atob(${JSON.stringify(Buffer.from(hwp).toString('base64'))}),c=>c.charCodeAt(0));
self.onmessage=(e)=>{const m=e.data;
if(m.type==='open'){self.postMessage({type:'scanned',format:'hwpx',equations:0,textboxes:0,imageBytes:0,distribution:false});self.postMessage({type:'parsed',pages:11,pageInfos:[],wasmBytes:0,measureCalls:0});}
else if(m.type==='export-hwp'){const b=B.slice().buffer;self.postMessage({type:'hwp',bytes:b,losses:2,pagesIn:11},[b]);}};`;
  await context.route(WORKER_RE, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'Content-Security-Policy': CSP }, body: stub }));
  await convert(page, fx('adm14.hwpx'), 'done');
  await expect(page.locator('#hx-loss')).toBeVisible();
  await expect(page.locator('#hx-loss-text')).toHaveText('HWP로 옮기지 못한 내용이 2곳 있어요. 한글에서 꼭 확인한 뒤 내세요.');
  await expect(page.locator('#hx-loss-list li')).toHaveText(['기타 2곳']);
  // Above the button, in reading order.
  const order = await page.evaluate(() => document.getElementById('hx-loss')!.compareDocumentPosition(document.getElementById('hx-save')!) & Node.DOCUMENT_POSITION_FOLLOWING);
  expect(order).toBeTruthy();
  expect(await serious(page)).toEqual([]);
  const { d, bytes } = await save(page);
  expect(d.suggestedFilename()).toBe('adm14.hwp');
  expect(sha(bytes)).toBe(sha(hwp));
});

test('a worker that cannot export is 「바꾸지 못했어요」 with the viewer / PDF links; a gate failure is unverified, never a download', async ({ page, context }) => {
  let code = 'export';
  await context.route(WORKER_RE, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      headers: { 'Content-Security-Policy': CSP },
      body: `self.onmessage=(e)=>{const m=e.data;if(m.type==='open'){self.postMessage({type:'scanned',format:'hwpx',equations:0,textboxes:0,imageBytes:0,distribution:false});self.postMessage({type:'parsed',pages:1,pageInfos:[],wasmBytes:0,measureCalls:0});}else if(m.type==='export-hwp'){self.postMessage({type:'error',code:${JSON.stringify(code)}});}};`,
    }),
  );
  await convert(page, fx('adm14.hwpx'), 'error');
  await expect(page.locator('#hx-error')).toHaveText('이 문서는 HWP로 바꾸지 못했어요. 아래에서 열어 보거나 PDF로 바꿀 수 있어요.');
  await expect(page.locator('#hx-error-links')).toBeVisible();
  code = 'unverified';
  await page.reload();
  await convert(page, fx('adm14.hwpx'), 'error');
  await expect(page.locator('#hx-error')).toHaveText('바꾼 파일을 다시 열어 확인하지 못해 내려받지 않았어요. 아래에서 원본을 열어 보거나 PDF로 바꿀 수 있어요.');
  await expect(page.locator('#hx-save')).toBeHidden();
});

/** A stand-in HWP worker: open answers scanned + parsed, export-hwp answers `hwp` with the given fields or an error. */
const exportStub = (answer: string): string =>
  `self.onmessage=(e)=>{const m=e.data;if(m.type==='open'){self.postMessage({type:'scanned',format:'hwpx',equations:0,textboxes:0,imageBytes:0,distribution:false});self.postMessage({type:'parsed',pages:11,pageInfos:[],wasmBytes:0,measureCalls:0});}else if(m.type==='export-hwp'){${answer}}};`;

test('REQ1014-B D10: a 1-page shift (worker stub) passes with the page warning; the download works', async ({ page, context }) => {
  const hwp = await nodeHwp('adm14.hwpx');
  const body = `const B=Uint8Array.from(atob(${JSON.stringify(Buffer.from(hwp).toString('base64'))}),c=>c.charCodeAt(0));` + exportStub(`const b=B.slice().buffer;self.postMessage({type:'hwp',bytes:b,losses:0,pagesIn:11,pageShift:true},[b]);`);
  await context.route(WORKER_RE, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'Content-Security-Policy': CSP }, body }));
  await convert(page, fx('adm14.hwpx'), 'done');
  await expect(page.locator('#hx-loss')).toBeVisible();
  await expect(page.locator('#hx-shift')).toHaveText('쪽 나눔이 원본과 조금 다를 수 있어요. 한글에서 꼭 확인한 뒤 내세요.');
  await expect(page.locator('#hx-loss-text')).toHaveText('');
  expect(await serious(page)).toEqual([]);
  const { d, bytes } = await save(page);
  expect(d.suggestedFilename()).toBe('adm14.hwp');
  expect(sha(bytes)).toBe(sha(hwp));
});

test('REQ1014-B D10: an unverified detail (reopen) shows the unverified line with the links, no download', async ({ page, context }) => {
  const body = exportStub(`self.postMessage({type:'error',code:'unverified',detail:'reopen'});`);
  await context.route(WORKER_RE, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'Content-Security-Policy': CSP }, body }));
  await convert(page, fx('adm14.hwpx'), 'error');
  await expect(page.locator('#hx-error')).toHaveText('바꾼 파일을 다시 열어 확인하지 못해 내려받지 않았어요. 아래에서 원본을 열어 보거나 PDF로 바꿀 수 있어요.');
  await expect(page.locator('#hx-error-links')).toBeVisible();
  await expect(page.locator('#hx-save')).toBeHidden();
});

// ---------- REQ1014-B D8/D9: the watchdog (page.clock drives the 90 s; stand-in workers) ----------

/** Open answers scanned + one engine progress, then (unless `silent`) parsed; export answers the adm14 HWP. */
const stallStub = (hwp: Uint8Array, silent: boolean, parsedAfterMs = 0): string =>
  `const B=Uint8Array.from(atob(${JSON.stringify(Buffer.from(hwp).toString('base64'))}),c=>c.charCodeAt(0));
self.onmessage=(e)=>{const m=e.data;
if(m.type==='open'){self.postMessage({type:'scanned',format:'hwpx',equations:0,textboxes:0,imageBytes:0,distribution:false});self.postMessage({type:'progress',phase:'engine',loaded:1,total:100});
${silent ? '' : `setTimeout(()=>self.postMessage({type:'parsed',pages:11,pageInfos:[],wasmBytes:0,measureCalls:0}),${parsedAfterMs});`}}
else if(m.type==='export-hwp'){const b=B.slice().buffer;self.postMessage({type:'hwp',bytes:b,losses:0,pagesIn:11,pageShift:false},[b]);}};`;

async function stallRun(page: Page, context: import('@playwright/test').BrowserContext, plan: boolean[], parsedAfterMs = 0): Promise<() => number> {
  const hwp = await nodeHwp('adm14.hwpx');
  let n = 0;
  await context.route(WORKER_RE, (route) => {
    const silent = plan[Math.min(n, plan.length - 1)]!;
    n++;
    return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'Content-Security-Policy': CSP }, body: stallStub(hwp, silent, parsedAfterMs) });
  });
  await page.clock.install();
  await gotoReady(page, '/hwpx-to-hwp/');
  await page.setInputFiles('#hx-input', fx('adm14.hwpx'));
  await expect(tool(page)).toHaveAttribute('data-state', 'engine');
  return () => n;
}

test('D9: the engine stage silent for 90 s once: a new worker opens the file again and the conversion succeeds', async ({ page, context }) => {
  const workers = await stallRun(page, context, [true, false]);
  await page.clock.fastForward(90_001);
  await expect(tool(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  expect(workers()).toBe(2);
  await expect(page.locator('#hx-error')).toBeHidden();
});

test('D9: silent twice: the timeout line after the second 90 s', async ({ page, context }) => {
  const workers = await stallRun(page, context, [true, true]);
  await page.clock.fastForward(90_001);
  await expect.poll(workers).toBe(2);
  await expect(tool(page)).toHaveAttribute('data-state', 'engine');
  await page.clock.fastForward(90_001);
  await expect(tool(page)).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#hx-error')).toHaveText('문서를 여는 데 너무 오래 걸려 멈췄습니다. 컴퓨터에서 열거나 Chrome·삼성 인터넷 등 다른 앱으로 열어 주세요.');
});

test('D8: hidden past 90 s, then visible: no timeout and no retry; the conversion finishes', async ({ page, context }) => {
  const workers = await stallRun(page, context, [false], 3000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(200_000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(tool(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  expect(workers()).toBe(1);
});

test('a new pick while the first file still waits for the engine: only the second result shows', async ({ page, context }) => {
  test.setTimeout(180_000);
  // Hold the engine download so the first conversion is still running when the second file is picked.
  let held = 0;
  await context.route(WASM_RE, async (route) => {
    if (held++ === 0) await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await gotoReady(page, '/hwpx-to-hwp/');
  await page.setInputFiles('#hx-input', fx('adm28.hwpx'));
  await expect(tool(page)).toHaveAttribute('data-state', /^(checking|engine)$/);
  await page.locator('#hx-cancel').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  await page.setInputFiles('#hx-input', fx('adm02.hwpx'));
  await expect(tool(page)).toHaveAttribute('data-state', 'done', { timeout: 150_000 });
  await expect(page.locator('#hx-file-name')).toHaveText(/^adm02\.hwp · /);
  // Long enough for the first (terminated) run to have answered had it survived.
  await page.waitForTimeout(3000);
  await expect(page.locator('#hx-file-name')).toHaveText(/^adm02\.hwp · /);
  await expect(tool(page)).toHaveAttribute('data-state', 'done');
  // The same while busy, without 취소: a second pick replaces the run directly.
  await page.locator('#hx-reset').click();
  await page.setInputFiles('#hx-input', fx('adm19.hwpx'));
  await page.setInputFiles('#hx-input', fx('adm14.hwpx'));
  await expect(tool(page)).toHaveAttribute('data-state', 'done', { timeout: 150_000 });
  await page.waitForTimeout(2000);
  await expect(page.locator('#hx-file-name')).toHaveText(/^adm14\.hwp · /);
});

// ---------- the password HWPX on the other HWP pages (decision 6) ----------

for (const path of ['/hwp-viewer/', '/hwp-to-pdf/']) {
  test(`regression: a password HWPX on ${path} says 비밀번호 (was 손상) and loads no engine`, async ({ page, network }) => {
    await gotoReady(page, path);
    await page.setInputFiles('#hw-input', hwpRuntime('adm14-password.hwpx'));
    await expect(page.locator('#hwp-tool')).toHaveAttribute('data-state', 'error', { timeout: 60_000 });
    await expect(page.locator('#hw-error')).toHaveText(PASSWORD);
    expect(network.requests.filter((r) => WASM_RE.test(r.url()))).toEqual([]);
  });
}

// ---------- layout, accessibility, SEO ----------

test('phone: the result card and the done line fit 360 px without horizontal scroll', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Phone layout.');
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await convert(page, fx('adm14.hwpx'), 'done');
  await save(page);
  await expect(page.locator('#hx-done-text')).toBeVisible();
  const r = await page.evaluate(() => {
    const b = document.getElementById('hx-result')!.getBoundingClientRect();
    return { right: b.right, vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth };
  });
  expect(r.right).toBeLessThanOrEqual(r.vw);
  expect(r.sw).toBeLessThanOrEqual(r.vw);
});

test('keyboard: 다른 파일 바꾸기 returns to the picker with focus; the result URL is revoked', async ({ page }) => {
  await page.addInitScript(() => {
    const revoke = URL.revokeObjectURL.bind(URL);
    (window as unknown as { __revoked: string[] }).__revoked = [];
    URL.revokeObjectURL = (u: string) => {
      (window as unknown as { __revoked: string[] }).__revoked.push(u);
      revoke(u);
    };
  });
  await convert(page, fx('adm14.hwpx'), 'done');
  await page.locator('#hx-reset').focus();
  await page.keyboard.press('Enter');
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#hx-input')).toBeFocused();
  expect((await page.evaluate(() => (window as unknown as { __revoked: string[] }).__revoked)).length).toBe(1);
});

test('axe: empty, done, error', async ({ page }) => {
  test.setTimeout(150_000);
  await gotoReady(page, '/hwpx-to-hwp/');
  expect(await serious(page)).toEqual([]);
  await convert(page, fx('adm14.hwpx'), 'done');
  expect(await serious(page)).toEqual([]);
  await save(page);
  await expect(page.locator('#hx-done')).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.locator('#hx-reset').click();
  await convert(page, fx('law05.hwp'), 'error');
  expect(await serious(page)).toEqual([]);
});

test('SEO and legal: title, description, one H1, canonical, FAQPage JSON-LD, the three steps, both notices twice, the expectation note', async ({ page }) => {
  await gotoReady(page, '/hwpx-to-hwp/');
  await expect(page).toHaveTitle('HWPX HWP 변환 — 한글 없이 hwp로 바꾸기, 무료 | 문서딱');
  const desc = (await page.locator('meta[name="description"]').getAttribute('content'))!;
  expect([...desc].length).toBeGreaterThanOrEqual(40);
  expect([...desc].length).toBeLessThanOrEqual(80);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('HWPX HWP 변환');
  expect(new URL((await page.locator('link[rel="canonical"]').getAttribute('href'))!).pathname).toBe('/hwpx-to-hwp/');
  const data = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((j) => JSON.parse(j));
  expect(data.find((d: { '@type': string }) => d['@type'] === 'FAQPage').mainEntity).toHaveLength(6);
  await expect(page.locator('.steps li strong')).toHaveText(['HWPX 파일 고르기', 'HWP로 바꾸기', 'HWP 내려받기']);
  await expect(page.locator('#hx-input')).toHaveAttribute('accept', '.hwpx,application/vnd.hancom.hwpx,application/hwp+zip');
  await expect(page.locator('.privacy-note')).toContainText('파일은 이 기기 밖으로 보내지 않습니다.');
  await expect(page.locator('.why')).toContainText(EXPECT);
  for (const text of [HANCOM, TRADEMARK]) {
    await expect(page.locator('.tool-legal')).toContainText(text);
    await expect(page.locator('.help')).toContainText(text);
  }
  const body = (await page.locator('body').textContent())!;
  expect(body).not.toMatch(/한컴뷰어|한컴오피스/);
  await expect(page.locator('.related-list a')).toHaveText(['HWP·HWPX 파일 보기', 'HWP PDF 변환']);
  // The two HWP pages link here (decision 13).
  for (const p of ['/hwp-viewer/', '/hwp-to-pdf/']) {
    await gotoReady(page, p);
    await expect(page.locator('.related-list a[href="/hwpx-to-hwp/"]')).toHaveText('HWPX HWP 변환');
  }
});
