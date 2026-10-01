// 여권·증명사진 규격 맞추기 e2e (brief Step 4 "E2E"). Every test runs under the no-upload fixture and records
// securitypolicyviolation events; any violation fails the test. Downloads are parsed in Node (sniff, JFIF,
// marker walk). The main build has auto-framing on (PUBLIC_ID_PHOTO_AUTOFRAME=1); the kill-switch test serves
// the flag-0 build from dist-noauto/.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { PRESETS } from '../../src/data/id-photo-presets';
import { readJfif } from '../../src/lib/image/jfif';
import { sniffImage } from '../../src/lib/image/sniff';
import { jpegMarkers } from '../../src/lib/idphoto/encode';
import { expect, gotoReady, test } from './no-upload';
import { photoFixture, photoRuntime } from './paths';
import { startServer } from './serve.mjs';

const PORTRAIT = photoFixture('portrait_pd.jpg');
const CORPUS = (id: string) => join(process.cwd(), 'tests', 'corpus', 'id-photo', `${id}.jpg`);
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const MP = /\/vendor\/mediapipe\/|\/_astro\/vision_bundle|\/_astro\/autoframe/;
const ENCODE = /\/_astro\/encode\.worker|mozjpeg_enc/;
const MANUAL_READOUT = '직접 맞추기: 안내선에 정수리와 턱을 맞추세요';
const NOTICES = [
  '이 도구는 자르기·기울기 조정·크기 조정·재압축만 합니다. 얼굴·피부·배경을 수정하지 않습니다.',
  '외교부 안내: 「사진 편집 프로그램, 사진 필터 기능 등을 사용하여 임의로 보정된 사진(AI를 활용한 편집·가공·합성·창조 제작물 포함)은 허용 불가함」 (2026-09-29 기준)',
  '배경을 흰색으로 바꾸거나 지우지 않습니다. 배경이 흰색이 아니면 흰 배경에서 다시 찍어 주세요.',
  '머리 길이는 추정값입니다. 머리카락에 가려진 정수리 위치는 사진으로 정확히 알 수 없으니 안내선을 보고 직접 확인하세요.',
  '최종 적합 여부는 접수 기관 심사로 결정되며, 이 도구는 통과를 보장하지 않습니다.',
  '여권 사진은 제출 전에 외교부 「온라인 여권 사진 검증」에서 한 번 더 확인할 수 있습니다. (외교부 사이트로 이동하며, 그곳에서는 사진을 외교부로 보냅니다.) 온라인 여권 사진 검증 (새 창)',
];
const CONFIRM = '규격 확인은 제출처 기준을 따릅니다. 정수리(머리카락 제외)와 턱 위치를 안내선에서 직접 확인했습니다.';

test.describe.configure({ timeout: 150_000 });

/**
 * The `manual-chromium` project runs this suite against the shipping build (PUBLIC_ID_PHOTO_AUTOFRAME=0,
 * dist-noauto/): every test that needs the face model skips there with the reason, every other one runs, and
 * each test also asserts that no MediaPipe request was made (Step 4 round 2).
 */
const isManualBuild = (): boolean => test.info().project.name === 'manual-chromium';
const NEEDS_MODEL = 'Needs the face model; the manual-only build has none (this is the auto-framing build).';
const skipIfManual = (): void => test.skip(isManualBuild(), NEEDS_MODEL);

// CSP: every test records violations from the first script on; the afterEach requires none.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
});
test.afterEach(async ({ page, network }) => {
  if (isManualBuild()) expect(network.requests.filter((r) => MP.test(r.url())).map((r) => r.url()), 'MediaPipe request in the manual-only build').toEqual([]);
  if (page.isClosed() || page.url() === 'about:blank') return;
  const v = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []).catch(() => []);
  expect(v, 'securitypolicyviolation events').toEqual([]);
});

const tool = (page: Page) => page.locator('#idp-tool');

/** A 404 that keeps the real response headers (the no-upload fixture requires the CSP on every response). */
async function notFound(route: import('@playwright/test').Route): Promise<void> {
  const res = await route.fetch();
  await route.fulfill({ status: 404, headers: { ...res.headers(), 'content-type': 'text/plain' }, body: 'not found' });
}

async function open(page: Page, path = '/id-photo/'): Promise<void> {
  await gotoReady(page, path);
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
}

/** Picks a photo and waits for adjust, blocked or error. */
async function pick(page: Page, file: string, want: RegExp = /^(adjust|blocked)$/): Promise<void> {
  await page.setInputFiles('#idp-input', file);
  await expect(tool(page)).toHaveAttribute('data-state', want, { timeout: 90_000 });
}

async function choosePreset(page: Page, id: string): Promise<void> {
  await page.selectOption('#idp-preset', id);
}

async function save(page: Page): Promise<{ bytes: Uint8Array; name: string }> {
  await page.locator('#idp-confirm').check();
  await expect(page.locator('#idp-save')).toBeEnabled();
  await page.locator('#idp-save').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  const link = page.locator('#idp-download');
  await expect(link).toHaveAttribute('href', /^blob:/);
  await link.scrollIntoViewIfNeeded();
  const [d] = await Promise.all([page.waitForEvent('download'), link.click()]);
  return { bytes: new Uint8Array(readFileSync((await d.path())!)), name: d.suggestedFilename() };
}

/** The download against the spec: size, limit, SOF0, JFIF density, no APP1/Exif/GPS, nothing after EOI. */
function expectSpec(b: Uint8Array, w: number, h: number, limit: number | undefined, dpi: number): void {
  const s = sniffImage(b);
  expect([s.format, s.width, s.height]).toEqual(['jpeg', w, h]);
  if (limit !== undefined) expect(b.length).toBeLessThanOrEqual(limit);
  const markers = jpegMarkers(b);
  expect(markers.find((m) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)).toBe(0xc0);
  expect(markers).not.toContain(0xe1);
  expect(readJfif(b)).toEqual({ units: 1, x: dpi, y: dpi });
  const buf = Buffer.from(b);
  expect(buf.includes(Buffer.from('Exif'))).toBe(false);
  expect(buf.includes(Buffer.from('GPS'))).toBe(false);
  expect([b.at(-2), b.at(-1)]).toEqual([0xff, 0xd9]);
}

const readout = (page: Page) => page.locator('#idp-readout');
async function headMm(page: Page): Promise<number> {
  const t = (await readout(page).textContent()) ?? '';
  const m = t.match(/추정 머리 길이 ([\d.]+) mm/);
  if (!m) throw new Error(`no head readout: ${t}`);
  return Number(m[1]);
}

// ---------- 1 lazy load ----------

test('lazy load: nothing MediaPipe before the photo; assets and progress after; the encoder only on save', async ({ page, network }) => {
  skipIfManual();
  await open(page);
  await page.waitForTimeout(500);
  expect(network.requests.filter((r) => MP.test(r.url())).map((r) => r.url())).toEqual([]);
  // Slow the model a little so the progress state is observable.
  await page.route(/face_landmarker-[0-9a-f]{8}\.task$/, async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await page.setInputFiles('#idp-input', PORTRAIT);
  await expect(page.locator('#idp-loading')).toBeVisible();
  await expect(page.locator('#idp-loading-text')).toContainText(/얼굴 위치를 찾는 준비 중입니다 \([\d.]+ \/ [\d.]+ MB\)/);
  await expect(page.locator('#idp-skip')).toBeVisible();
  await expect(tool(page)).toHaveAttribute('data-state', 'adjust', { timeout: 90_000 });
  const urls = network.requests.map((r) => r.url());
  expect(urls.some((u) => /\/vendor\/mediapipe\/1\.0\.1\/vision_wasm(_nosimd)?_internal\.wasm$/.test(u))).toBe(true);
  expect(urls.some((u) => /\/vendor\/mediapipe\/1\.0\.1\/vision_wasm(_nosimd)?_internal\.js$/.test(u))).toBe(true);
  expect(urls.some((u) => /face_landmarker-[0-9a-f]{8}\.task$/.test(u))).toBe(true);
  expect(urls.some((u) => /vision_wasm_module_internal/.test(u))).toBe(false);
  expect(urls.filter((u) => ENCODE.test(u))).toEqual([]);
  await expect(page.locator('#idp-loading')).toBeHidden();
  await save(page);
  expect(network.requests.map((r) => r.url()).some((u) => ENCODE.test(u))).toBe(true);
});

test('the wasm is fetched once from the network; MediaPipe loads it from the HTTP cache', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP (Chromium) reports whether a response came from the cache.');
  skipIfManual();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const wasm: { url: string; cached: boolean }[] = [];
  cdp.on('Network.responseReceived', (e) => {
    if (/vision_wasm(_nosimd)?_internal\.wasm$/.test(e.response.url)) wasm.push({ url: e.response.url, cached: Boolean(e.response.fromDiskCache || e.response.fromServiceWorker) });
  });
  cdp.on('Network.requestServedFromCache', () => undefined);
  await open(page);
  await pick(page, PORTRAIT);
  expect(wasm.length).toBeGreaterThanOrEqual(1);
  expect(wasm.filter((w) => !w.cached).length, JSON.stringify(wasm)).toBe(1);
});

// ---------- 2 happy path ----------

test('happy path: passport from portrait_pd — overlay, readout in band, save gated by the box, exact file', async ({ page }) => {
  await open(page);
  await expect(page.locator('#idp-preset')).toHaveValue('passport_online');
  await pick(page, PORTRAIT, /^adjust$/);
  await expect(page.locator('#idp-overlay')).toBeVisible();
  if (isManualBuild()) {
    await expect(readout(page)).toHaveText(MANUAL_READOUT);
    await expect(page.locator('#idp-reset')).toHaveText('처음 위치로');
  } else {
    const mm = await headMm(page);
    expect(mm).toBeGreaterThanOrEqual(32);
    expect(mm).toBeLessThanOrEqual(36);
    await expect(readout(page)).toContainText('(규격 32–36 mm)');
  }
  await expect(page.locator('#idp-save')).toBeDisabled();
  await expect(page.locator('#idp-save-reason')).toHaveText('위의 확인란에 체크하면 저장할 수 있습니다.');
  const { bytes, name } = await save(page);
  expect(name).toBe('passport_413x531.jpg');
  expectSpec(bytes, 413, 531, 500_000, 300);
  await expect(page.locator('#idp-headline')).toHaveText(/^규격에 맞췄습니다 · [\d.]+ KB$/);
  await expect(page.locator('#idp-chips li')).toHaveText(['여권 (온라인 신청·정부24)', '413×531픽셀', '500 KB 이하', '촬영 위치 등 사진 정보 없음']);
});

// ---------- 3 every preset ----------

test('every shipped preset and a custom size: exact px, ≤ limit, the dpi, the file tag', async ({ page, isMobile }) => {
  const ids = isMobile ? ['passport_online', 'gosi'] : PRESETS.map((p) => p.id);
  await open(page);
  await pick(page, PORTRAIT);
  for (const id of ids) {
    const p = PRESETS.find((x) => x.id === id)!;
    await choosePreset(page, id);
    await expect(tool(page)).toHaveAttribute('data-state', 'adjust');
    const { bytes, name } = await save(page);
    expect(name).toBe(`${p.fileTag}_${p.outW}x${p.outH}.jpg`);
    expectSpec(bytes, p.outW, p.outH, p.limitBytes, p.dpi);
    await page.locator('#idp-again').click();
  }
  if (isMobile) return;
  await choosePreset(page, 'custom');
  await page.fill('#idp-w', '200');
  await page.fill('#idp-h', '250');
  await page.fill('#idp-kb', '50');
  const { bytes, name } = await save(page);
  expect(name).toBe('photo_200x250.jpg');
  expectSpec(bytes, 200, 250, 50_000, 96);
});

test('custom size: invalid input (49 px, "abc") disables save and shows the message', async ({ page }) => {
  await open(page);
  await pick(page, PORTRAIT);
  await choosePreset(page, 'custom');
  await page.fill('#idp-w', '49');
  await expect(page.locator('#idp-custom-error')).toHaveText('가로와 세로는 50–2,000픽셀 사이의 정수로 입력해 주세요.');
  await expect(page.locator('#idp-w')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#idp-confirm').check();
  await expect(page.locator('#idp-save')).toBeDisabled();
  await expect(page.locator('#idp-checklist')).toContainText('가로와 세로는 50–2,000픽셀');
  await page.fill('#idp-w', '200');
  await page.fill('#idp-kb', 'abc');
  await expect(page.locator('#idp-custom-error')).toHaveText('용량 한도는 10–10,000 KB 사이의 정수로 입력하거나 비워 두세요.');
  await page.locator('#idp-confirm').check();
  await expect(page.locator('#idp-save')).toBeDisabled();
});

// ---------- 4 adjust ----------

test('adjust: keys, nudge buttons and a mouse drag move the frame; each change clears the box', async ({ page, isMobile }) => {
  await open(page);
  await pick(page, PORTRAIT);
  const stage = page.locator('#idp-stage');
  const confirm = page.locator('#idp-confirm');
  const cleared = async (act: () => Promise<void>) => {
    await confirm.check();
    await act();
    await expect(confirm).not.toBeChecked();
  };
  const auto = !isManualBuild();
  const before = auto ? await headMm(page) : 0;
  const zoomBefore = Number(await page.locator('#idp-zoom').inputValue());
  await cleared(async () => {
    await stage.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('+');
  });
  if (auto) expect(await headMm(page)).toBeGreaterThan(before);
  expect(Number(await page.locator('#idp-zoom').inputValue())).toBeGreaterThan(zoomBefore);
  await cleared(async () => {
    await stage.focus();
    await page.keyboard.press('-');
  });
  await cleared(async () => {
    await stage.focus();
    await page.keyboard.press(']');
  });
  await expect(page.locator('#idp-rot-out')).toHaveText('0.5°');
  await expect(page.locator('#idp-rot')).toHaveValue('0.5');
  await cleared(async () => {
    await stage.focus();
    await page.keyboard.press('[');
    await page.keyboard.press('[');
  });
  await expect(page.locator('#idp-rot-out')).toHaveText('-0.5°');
  await cleared(async () => {
    await stage.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+ArrowUp');
  });
  await cleared(async () => {
    await stage.focus();
    await page.keyboard.press('Home');
  });
  await expect(page.locator('#idp-rot-out')).toHaveText('0.0°');
  if (auto) expect(await headMm(page)).toBeCloseTo(before, 1);
  expect(Number(await page.locator('#idp-zoom').inputValue())).toBe(zoomBefore);
  for (const name of ['위로 이동', '아래로 이동', '왼쪽으로 이동', '오른쪽으로 이동']) await cleared(() => page.getByRole('button', { name }).click());
  if (!isMobile) {
    await cleared(async () => {
      await stage.scrollIntoViewIfNeeded();
      const box = (await stage.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 5 });
      await page.mouse.up();
    });
  }
  await cleared(() => page.locator('#idp-reset').click());
  // Pinch is unit-tested (crop.pinch); Playwright has no multi-touch.
});

// ---------- 5 outside, 6 lowres ----------

test('outside: zoomed out and moved to an edge, the outside block shows and save is disabled', async ({ page }) => {
  await open(page);
  await pick(page, PORTRAIT);
  await page.locator('#idp-zoom').fill('0');
  const stage = page.locator('#idp-stage');
  await stage.focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('#idp-checklist .block')).toContainText('사진 바깥 부분이 들어갑니다.');
  await page.locator('#idp-confirm').check();
  await expect(page.locator('#idp-save')).toBeDisabled();
  await expect(page.locator('#idp-save-reason')).toHaveText('확인 목록에 저장을 막는 항목이 있습니다. 그 항목을 먼저 해결해 주세요.');
});

test('lowres: a 300 × 375 photo for passport is blocked; no download', async ({ page, network }) => {
  await open(page);
  await pick(page, photoRuntime('lowres_300x375.jpg'), /^blocked$/);
  await expect(page.locator('#idp-checklist .block')).toHaveText(/사진 해상도가 낮아 413×531픽셀로 만들 수 없습니다\./);
  await page.locator('#idp-confirm').check();
  await expect(page.locator('#idp-save')).toBeDisabled();
  expect(network.requests.map((r) => r.url()).some((u) => ENCODE.test(u))).toBe(false);
  // A smaller preset is still possible from the same photo.
  await choosePreset(page, 'gosi');
  await expect(tool(page)).toHaveAttribute('data-state', 'adjust');
});

// ---------- 7 fallbacks ----------

for (const [label, re] of [
  ['the wasm', /vision_wasm(_nosimd)?_internal\.wasm$/],
  ['the model', /face_landmarker-[0-9a-f]{8}\.task$/],
] as const) {
  test(`fallback: ${label} 404 → manual guide with the note, export still works`, async ({ page }) => {
    skipIfManual();
    await page.route(re, notFound);
    await open(page);
    await pick(page, PORTRAIT);
    await expect(readout(page)).toHaveText(MANUAL_READOUT);
    await expect(page.locator('#idp-reset')).toHaveText('처음 위치로');
    await expect(page.locator('#idp-status')).toContainText('자동 맞춤을 쓰지 못해 직접 맞추기로 바꿨습니다.');
    const { bytes } = await save(page);
    expectSpec(bytes, 413, 531, 500_000, 300);
  });
}

test('fallback: deviceMemory 1 → manual, and no MediaPipe request at all', async ({ page, network }) => {
  skipIfManual();
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 1, configurable: true }));
  await open(page);
  await pick(page, PORTRAIT);
  await expect(readout(page)).toHaveText(MANUAL_READOUT);
  expect(network.requests.filter((r) => MP.test(r.url())).map((r) => r.url())).toEqual([]);
});

test('fallback: the crash flag from an earlier attempt → manual, no MediaPipe request', async ({ page, network }) => {
  skipIfManual();
  await page.addInitScript(() => sessionStorage.setItem('idphoto-mp-attempt', '1'));
  await open(page);
  await pick(page, PORTRAIT);
  await expect(readout(page)).toHaveText(MANUAL_READOUT);
  expect(network.requests.filter((r) => MP.test(r.url())).map((r) => r.url())).toEqual([]);
});

test('fallback: "건너뛰고 직접 맞추기" during a slow load → manual at once', async ({ page }) => {
  skipIfManual();
  await page.route(/face_landmarker-[0-9a-f]{8}\.task$/, async (route) => {
    await new Promise((r) => setTimeout(r, 20_000));
    await route.continue().catch(() => undefined);
  });
  await open(page);
  await page.setInputFiles('#idp-input', PORTRAIT);
  await page.getByRole('button', { name: '건너뛰고 직접 맞추기' }).click();
  await expect(tool(page)).toHaveAttribute('data-state', 'adjust', { timeout: 10_000 });
  await expect(readout(page)).toHaveText(MANUAL_READOUT);
  await expect(page.locator('#idp-status')).not.toContainText('자동 맞춤을 쓰지 못해');
});

test('fallback: MozJPEG wasm 404 → the canvas encoder, with the note', async ({ page }) => {
  const workerCanvas = await page.evaluate(() => typeof OffscreenCanvas !== 'undefined');
  test.skip(!workerCanvas, 'No OffscreenCanvas here (Playwright WebKit on Windows): the canvas fallback cannot run, so the export ends in the engine panel; covered by the unit test.');
  await page.context().route(/mozjpeg_enc[^/]*\.wasm$/, notFound);
  await open(page);
  await pick(page, PORTRAIT);
  const { bytes } = await save(page);
  expectSpec(bytes, 413, 531, 500_000, 300);
  await expect(page.locator('#idp-fallback')).toHaveText('빠른 방식으로 저장했습니다. 규격과 용량은 같습니다.');
});

test('the controller loads on the first interaction, not on page load; if it cannot load, the engine panel shows', async ({ page, context, network }) => {
  await open(page);
  await page.waitForTimeout(1500);
  expect(network.requests.map((r) => r.url()).filter((u) => /\/_astro\/controller/.test(u))).toEqual([]);
  await context.route(/\/_astro\/controller[^/]*\.js/, (route) => route.abort());
  await page.setInputFiles('#idp-input', PORTRAIT);
  await expect(page.locator('#engine-error')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#engine-error')).toContainText('파일에는 문제가 없습니다.');
  await expect(page.locator('#idp-error')).toBeHidden();
});

// ---------- telemetry ----------

test('MediaPipe usage telemetry never leaves: 5 minutes later, no off-origin request and no CSP violation', async ({ page, browserName, network }) => {
  test.skip(browserName !== 'chromium', 'The logger timer is browser-independent JS; one engine is enough (the other projects still record CSP events).');
  skipIfManual();
  await page.clock.install();
  await open(page);
  await pick(page, PORTRAIT);
  await page.clock.runFor(5 * 60_000);
  await page.waitForTimeout(500);
  expect(network.requests.filter((r) => /googleapis|odml/.test(r.url())).map((r) => r.url())).toEqual([]);
});

// ---------- 8 warnings ----------

test.describe('warnings', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, 'Desktop projects (chromium, firefox, webkit) per the brief.');
  });
  for (const [label, file, text] of [
    ['yaw (p07)', CORPUS('p07'), '얼굴이 옆으로 약'],
    ['expression (p01)', CORPUS('p01'), '입을 다문 무표정이어야 합니다.'],
    ['multi (two_faces)', photoRuntime('two_faces.jpg'), '얼굴이 여러 개 보입니다.'],
    ['no face (scene)', photoRuntime('scene_noface.jpg'), '얼굴을 찾지 못해 직접 맞추기로 바꿨습니다.'],
    ['background (portrait_pd)', PORTRAIT, '배경이 흰색이 아닌 것 같습니다.'],
  ] as const) {
    test(`${label}`, async ({ page }) => {
      test.skip(isManualBuild() && !label.startsWith('background'), NEEDS_MODEL);
      await open(page);
      await pick(page, file);
      await expect(page.locator('#idp-checklist .warn')).toContainText([text], { timeout: 10_000 });
    });
  }
});

// ---------- 9 bad inputs, 10 orientation ----------

for (const [file, text] of [
  [photoRuntime('fake.heic'), '아이폰 사진 형식(HEIC)은 지금 쓰는 앱에서 열 수 없습니다.'],
  // UX-AUDIT-2 §7.3: this tool does not compress, so never "줄일 수 없습니다".
  [photoFixture('anim.gif'), '움직이는 이미지는 여권·증명사진으로 쓸 수 없습니다. 사진 파일을 선택해 주세요.'],
  [photoRuntime('truncated.jpg'), '파일이 중간에 끊겨 있습니다.'],
  [photoRuntime('not_image.txt'), '사진 파일이 아닙니다.'],
] as const) {
  test(`bad input ${file.split(/[\\/]/).pop()}: the Step 3 message, no MediaPipe`, async ({ page, network }) => {
    await open(page);
    await pick(page, file, /^error$/);
    await expect(page.locator('#idp-error')).toContainText(text);
    await expect(page.locator('#idp-error')).toHaveAttribute('role', 'alert');
    await expect(page.locator('#idp-drop')).toBeVisible();
    expect(network.requests.filter((r) => MP.test(r.url())).map((r) => r.url())).toEqual([]);
  });
}

test('orientation: exif6_gps.jpg is framed upright and the file carries no GPS', async ({ page }) => {
  await open(page);
  await pick(page, photoFixture('exif6_gps.jpg'));
  const ratio = await page.locator('#idp-stage').evaluate((e) => e.getBoundingClientRect().width / e.getBoundingClientRect().height);
  expect(ratio).toBeCloseTo(413 / 531, 2);
  await choosePreset(page, 'saramin');
  const { bytes } = await save(page);
  expectSpec(bytes, 100, 140, 10_000_000, 96);
});

// ---------- 11 notices ----------

test('notices: the 6 texts verbatim, the checker link, the confirmation label', async ({ page }) => {
  await open(page);
  const items = page.locator('.idp-notices li');
  await expect(items).toHaveCount(6);
  const texts = (await items.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  expect(texts).toEqual(NOTICES);
  const link = page.locator('#idp-verify-link');
  await expect(link).toHaveAttribute('href', 'https://www.passport.go.kr/home/kor/onlinePhotoVerify/index.do?menuPos=33');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(page.locator('label.idp-confirm-label')).toHaveText(CONFIRM);
  await expect(page.locator('.idp-notices')).toHaveAttribute('role', 'note');
  await expect(page.locator('#idp-source')).toContainText('기준일 2026-09-29 · 출처:');
  await expect(page.getByText('기관 안내가 바뀌었을 수 있습니다. 제출 전에 제출처 안내를 꼭 확인하세요.')).toBeVisible();
  await expect(page.locator('#idp-rot-help')).toHaveText('사진 전체가 기울어졌을 때만 쓰세요. 고개가 기울어졌다면 다시 찍는 것이 좋습니다.');
});

// ---------- 12 kill switch ----------

test.describe('kill switch', () => {
  const NOAUTO_PORT = 4180;
  const root = join(process.cwd(), 'dist-noauto');
  let server: { close(): Promise<void> } | null = null;
  test.use({ baseURL: `http://127.0.0.1:${NOAUTO_PORT}` });
  test.beforeAll(async ({ browserName }) => {
    // Not on manual-chromium (its test skips): a second server on the same port, started while the chromium
    // project's one is still open in a parallel worker, never resolved and hung the full run (Growth G gate).
    if (browserName !== 'chromium' || isManualBuild() || !existsSync(join(root, 'id-photo', 'index.html'))) return;
    server = await startServer({ root, port: NOAUTO_PORT });
  });
  test.afterAll(async () => {
    await server?.close();
  });

  test('the PUBLIC_ID_PHOTO_AUTOFRAME=0 build requests nothing of MediaPipe and exports manually', async ({ page, browserName, network }) => {
    test.skip(browserName !== 'chromium', 'One engine (brief: chromium).');
    test.skip(isManualBuild(), 'The manual-chromium project already runs the whole suite on this build.');
    test.skip(!server, 'dist-noauto/ is built by the gate run (PUBLIC_ID_PHOTO_AUTOFRAME=0 astro build --outDir dist-noauto).');
    await open(page);
    await expect(page.getByText('약 6 MB의 프로그램 파일')).toHaveCount(0);
    await page.setInputFiles('#idp-input', PORTRAIT);
    await expect(tool(page)).toHaveAttribute('data-state', 'adjust');
    await expect(readout(page)).toHaveText(MANUAL_READOUT);
    await expect(page.locator('#idp-skip')).toBeHidden();
    const { bytes } = await save(page);
    expectSpec(bytes, 413, 531, 500_000, 300);
    expect(network.requests.filter((r) => MP.test(r.url())).map((r) => r.url())).toEqual([]);
    const lic = await (await page.request.get('/licenses/')).text();
    expect(lic).not.toContain('mediapipe');
    expect(lic).not.toContain('Eigen');
  });
});

// ---------- done state below the sticky header (Polish Q, UX-AUDIT-2 P1-1) ----------

test('done: the headline, the chips and 내려받기 are fully below the sticky header and inside the viewport (390/360, 768, 200 %)', async ({ page, isMobile }) => {
  // Phones: the device size and 360 × 740. Desktop engines: a tablet (768 × 1024) and a 1440 px window at 200 % (720 × 450).
  const sizes = isMobile ? [page.viewportSize()!, { width: 360, height: 740 }] : [{ width: 768, height: 1024 }, { width: 720, height: 450 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await open(page);
    await pick(page, PORTRAIT);
    await page.locator('#idp-confirm').check();
    await page.locator('#idp-save').click();
    await expect(tool(page)).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
    await expect(page.locator('#idp-headline')).toBeFocused();
    const box = await page.evaluate(() => {
      const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      return { header: r('header.top').bottom, headline: r('#idp-headline'), chips: r('#idp-chips'), download: r('#idp-download'), vh: innerHeight };
    });
    for (const key of ['headline', 'chips', 'download'] as const) {
      expect(box[key].top, `${size.width}×${size.height} ${key} top`).toBeGreaterThanOrEqual(box.header - 0.5);
      expect(box[key].bottom, `${size.width}×${size.height} ${key} bottom`).toBeLessThanOrEqual(box.vh + 0.5);
    }
  }
});

// ---------- 13 keyboard only ----------

test('keyboard only: preset, file, adjust, confirm, save, download', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Keyboard-only flow is a desktop scenario.');
  await open(page);
  await page.locator('#idp-preset').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#idp-preset')).toHaveValue('gosi');
  await page.setInputFiles('#idp-input', PORTRAIT);
  await expect(tool(page)).toHaveAttribute('data-state', 'adjust', { timeout: 90_000 });
  await expect(page.locator('#idp-stage')).toBeFocused();
  await page.keyboard.press('+');
  // The manual start is the largest crop (no margin to move into); Home is the key it can take.
  await page.keyboard.press(isManualBuild() ? 'Home' : 'ArrowUp');
  // Tab to the confirmation box, then to save.
  for (let i = 0; i < 40 && !(await page.locator('#idp-confirm').evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(page.locator('#idp-confirm')).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(page.locator('#idp-save')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tool(page)).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await expect(page.locator('#idp-headline')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#idp-download')).toBeFocused();
  const [d] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(d.suggestedFilename()).toBe('gosi_137x177.jpg');
  expectSpec(new Uint8Array(readFileSync((await d.path())!)), 137, 177, 349_999, 99);
});

// ---------- 14 axe ----------

test('axe: empty, adjust (overlay and checklist) and done', async ({ page }) => {
  const serious = async () =>
    (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  await open(page);
  expect(await serious()).toEqual([]);
  await pick(page, PORTRAIT);
  await choosePreset(page, 'custom');
  expect(await serious()).toEqual([]);
  await choosePreset(page, 'passport_online');
  await save(page);
  expect(await serious()).toEqual([]);
});

// ---------- 15 mobile ----------

test('mobile at 360 px: no horizontal scroll; stage buttons, sliders and the checkbox label are ≥ 44 px', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Phone layout.');
  await page.setViewportSize({ width: 360, height: 780 });
  await open(page);
  await pick(page, PORTRAIT);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const sel of ['.idp-nudge', '#idp-reset', '#idp-zoom', '#idp-rot', 'label.idp-confirm-label', '#idp-save']) {
    for (const el of await page.locator(sel).all()) {
      const box = (await el.boundingBox())!;
      expect(box.height, sel).toBeGreaterThanOrEqual(44);
      if (sel === '.idp-nudge') expect(box.width, sel).toBeGreaterThanOrEqual(44);
    }
  }
});

// ---------- 16 SEO and wiring ----------

test('SEO: title, description, one H1, canonical, JSON-LD; home card; RelatedTools; the photo-compress FAQ link', async ({ page }) => {
  await open(page);
  await expect(page).toHaveTitle('여권사진·증명사진 사이즈 규격 맞추기 무료 | 문서딱');
  const desc = (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
  expect(desc).toBe('여권사진 규격(413×531 픽셀, 500KB 이하)과 공무원 시험·Q-Net·이력서 증명사진 사이즈에 맞춰 사진을 자르고 용량을 맞춥니다. 사진은 내 폰·컴퓨터 밖으로 보내지 않고, 보정하지 않습니다.');
  await expect(page.locator('h1')).toHaveText('여권·증명사진 규격 맞추기');
  expect(new URL((await page.locator('link[rel="canonical"]').getAttribute('href'))!).pathname).toBe('/id-photo/');
  const data = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((j) => JSON.parse(j));
  expect(data.find((d: { '@type': string }) => d['@type'] === 'WebApplication')).toMatchObject({ applicationCategory: 'UtilitiesApplication', inLanguage: 'ko' });
  // The other live tools (PDF 합치기, PDF 용량 줄이기, 사진 용량 줄이기, HWP PDF 변환).
  await expect(page.locator('.related a')).toHaveCount(4);
  await expect(page.locator('.faq details')).toHaveCount(6);
  // Round 2: the copy matches the build — a manual-only page never promises auto-framing.
  const body = (await page.locator('main').textContent()) ?? '';
  if (isManualBuild()) {
    for (const phrase of ['자동으로 잡아', '자동으로 맞춘', '자동 맞춤', '건너뛰고 직접 맞추기', '6 MB의 프로그램']) expect(body, phrase).not.toContain(phrase);
    await expect(page.locator('.lead')).toHaveText('여권사진과 증명사진 사이즈를 제출처 규격에 맞춥니다. 안내선을 보며 사진 위치를 직접 맞춘 뒤 제출처가 요구하는 크기와 용량의 사진 파일로 저장합니다.');
    expect(body).toContain('안내선이 나타나면 끌어서 옮기고 확대·축소해 정수리와 턱을 안내선에 맞춥니다.');
    expect(body).toContain('최종 적합 여부는 접수 기관 심사로 결정됩니다. 안내선을 보고 정수리와 턱 위치를 직접 확인해야 저장할 수 있습니다.');
  } else {
    await expect(page.locator('.lead')).toContainText('얼굴 위치를 자동으로 잡아 드리고');
    expect(body).toContain('얼굴 위치 자동 맞춤은 추정값이어서');
  }
  await gotoReady(page, '/');
  await expect(page.locator('.card.live').getByRole('link', { name: '여권·증명사진 규격 맞추기' })).toHaveAttribute('href', '/id-photo/');
  await gotoReady(page, '/photo-compress/');
  await page.getByText('증명사진 용량 줄이기에도 쓸 수 있나요?').click();
  await expect(page.locator('.faq').getByRole('link', { name: '여권·증명사진 규격 맞추기' })).toHaveAttribute('href', '/id-photo/');
  await gotoReady(page, '/licenses/');
  const lic = (await page.locator('main').textContent()) ?? '';
  for (const s of ['@mediapipe/tasks-vision', 'Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf', 'Eigen', 'MPL-2.0', 'Mozilla Public License Version 2.0', 'https://gitlab.com/libeigen/eigen/-/tree/dcbaf2d608f306450f1e74949eb87e9a22a7ef4b', 'XNNPACK', 'Protocol Buffers']) {
    // The manual-only build ships no MediaPipe, so its /licenses/ lists none of it.
    if (isManualBuild()) expect(lic, s).not.toContain(s);
    else expect(lic, s).toContain(s);
  }
});
