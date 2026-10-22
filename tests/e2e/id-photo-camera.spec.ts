// 증명사진 촬영 /id-photo-camera/ (IDCAM1022 Step B test map). Under the no-upload guard, with zero CSP violations and
// zero page errors on every test:
// - Chromium's own fake camera: id-photo-camera.fake.spec.ts (its launch flags need a file of their own).
// - A synthetic camera (getUserMedia replaced by a canvas stream with a dark block at the frame's left; every browser
//   with a camera path, i.e. not Playwright WebKit): the saved still is not mirrored although the preview is; the photo
//   lands in /id-photo/?preset=passport_online and saves as 413×531 within 500 KB; the handoff store is empty after.
// - No camera API (as in an in-app viewer; WebKit has no fake camera): the D7 message and the native camera input, whose
//   photo opens in /id-photo/ with the chosen preset.
// - Camera refused (NotAllowedError): the D7 message and the native input.
// - /id-photo/: the 「카메라로 찍기」 link follows the preset; a plain visit loads no handoff code; the widget has no link.
// - Step C live hints (synthetic scenes drawn with the guide's face oval): white background none, dark face 'dark',
//   bright background 'backlight', a sideways roll from deviceorientation 'level'; a hint never stops 찍기.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { PRESETS } from '../../src/data/id-photo-presets';
import { sniffImage } from '../../src/lib/image/sniff';
import { HINTS } from '../../src/tools/id-photo-camera/copy';
import { CAMERA_ERRORS } from '../../src/tools/id-photo-camera/errors';
import { AXE_TAGS, CAMERA_POLICY, SITE_POLICY, arrived, guard, shootNow, stored, syntheticCamera, tool, type Win } from './idcam';
import { expect, gotoReady, test } from './no-upload';
import { photoFixture } from './paths';

const PORTRAIT = photoFixture('portrait_pd.jpg');
const HANDOFF_CHUNK = /\/_astro\/handoff\.[^/]+\.js$/;
const PASSPORT = PRESETS.find((p) => p.id === 'passport_online')!;

guard();

/** Replaces getUserMedia with a canvas stream of a still scene: `bg` everywhere, a `face` oval where the guide's is. */
async function sceneCamera(page: Page, bg: string, face: string): Promise<void> {
  await page.addInitScript(
    ([b, f]) => {
      const win = window as unknown as Win;
      const fake = async (): Promise<MediaStream> => {
        const cv = document.createElement('canvas');
        cv.width = 432;
        cv.height = 560;
        const g = cv.getContext('2d')!;
        const paint = (): void => {
          g.fillStyle = b;
          g.fillRect(0, 0, 432, 560);
          g.fillStyle = f;
          g.beginPath();
          g.ellipse(216, 267, 150, 190, 0, 0, Math.PI * 2);
          g.fill();
        };
        paint();
        setInterval(paint, 100);
        const s = (cv as HTMLCanvasElement & { captureStream(fps: number): MediaStream }).captureStream(10);
        win.__tracks = s.getTracks();
        return s;
      };
      if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: fake, configurable: true });
    },
    [bg, face] as const,
  );
}

/** 카메라 켜기 -> live. */
async function cameraOn(page: Page): Promise<void> {
  await gotoReady(page, '/id-photo-camera/?preset=passport_online');
  await page.locator('#cam-on').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'live', { timeout: 20_000 });
}

/** Mean luma of a small square of the review still at (fx, fy) (fractions of its size). */
const stillLuma = (page: Page, fx: number, fy: number): Promise<number> =>
  page.evaluate(
    ([x, y]) => {
      const img = document.getElementById('cam-still') as HTMLImageElement;
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const px = g.getImageData(Math.round(x * c.width) - 2, Math.round(y * c.height) - 2, 4, 4).data;
      let s = 0;
      for (let i = 0; i < px.length; i += 4) s += 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
      return s / (px.length / 4);
    },
    [fx, fy] as const,
  );

test('the page: camera allowed on this route only, nothing starts before the tap, axe clean', async ({ page }) => {
  const res = await gotoReady(page, '/id-photo-camera/');
  expect(res?.headers()['permissions-policy']).toBe(CAMERA_POLICY);
  await expect(page.locator('h1')).toHaveText('증명사진 촬영');
  await expect(tool(page)).toHaveAttribute('data-state', 'idle');
  await expect(page.locator('#cam-live')).toBeHidden();
  await expect(page.locator('#cam-fallback')).toBeHidden();
  // The passport preset is the default: its 외교부 note shows.
  await expect(page.locator('#cam-passport')).toBeVisible();
  await page.selectOption('#cam-preset', 'saramin');
  await expect(page.locator('#cam-passport')).toBeHidden();
  expect(page.url()).toMatch(/\/id-photo-camera\/\?preset=saramin$/);
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  for (const path of ['/id-photo/', '/', '/embed/id-photo/']) {
    const r = await page.request.get(path);
    expect(r.headers()['permissions-policy'], path).toBe(SITE_POLICY);
  }
});

test.describe('synthetic camera', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'Playwright WebKit has no camera path; the no-API test covers it.');

  test('preview mirrored, still not; the photo saves in /id-photo/ as 413×531 within 500 KB; the store is emptied', async ({ page }) => {
    test.setTimeout(150_000);
    await syntheticCamera(page);
    await gotoReady(page, '/id-photo-camera/?preset=passport_online');
    await shootNow(page);
    await expect(page.locator('#cam-stage')).toHaveAttribute('data-mirror', '1');
    // The block is near the frame's left edge: it stays on the left of the still.
    expect(await stillLuma(page, 0.12, 0.17)).toBeLessThan(60);
    expect(await stillLuma(page, 0.88, 0.17)).toBeGreaterThan(200);
    await expect(page.locator('#cam-lowres')).toBeHidden();
    // Step D (D8b): this build has no 배경 지우기, so no 「배경을 흰색으로 바꾸기」 (remove-background.spec covers it on).
    await expect(page.locator('#cam-bg')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as Win).__tracks!.every((t) => t.readyState === 'ended'))).toBe(true);
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);

    await page.locator('#cam-use').click();
    await arrived(page, 'passport_online');
    expect(await stored(page)).toBe(0);
    await page.locator('#idp-confirm').check();
    await expect(page.locator('#idp-save')).toBeEnabled();
    await page.locator('#idp-save').click();
    await expect(page.locator('#idp-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
    const link = page.locator('#idp-download');
    await expect(link).toHaveAttribute('href', /^blob:/);
    await link.scrollIntoViewIfNeeded();
    const [d] = await Promise.all([page.waitForEvent('download'), link.click()]);
    const bytes = new Uint8Array(readFileSync((await d.path())!));
    const s = sniffImage(bytes);
    expect([s.format, s.width, s.height]).toEqual(['jpeg', 413, 531]);
    expect(bytes.length).toBeLessThanOrEqual(PASSPORT.limitBytes!);
  });

  test('review: one capture per tap (double tap on 바로), 제출처 fixed until 다시 찍기, Back (bfcache) re-enables the hand-over', async ({ page }) => {
    await syntheticCamera(page);
    await page.addInitScript(() => {
      const w = window as unknown as { __urls: { made: number; revoked: number } };
      w.__urls = { made: 0, revoked: 0 };
      const make = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (o: Blob | MediaSource) => (w.__urls.made++, make(o));
      URL.revokeObjectURL = (u: string) => (w.__urls.revoked++, revoke(u));
    });
    await gotoReady(page, '/id-photo-camera/');
    await page.locator('#cam-on').click();
    await expect(tool(page)).toHaveAttribute('data-state', 'live', { timeout: 20_000 });
    await expect(page.locator('#cam-video')).toHaveJSProperty('paused', false);
    await page.getByLabel('바로').check();
    // Two taps before the first capture finishes: one still.
    await page.locator('#cam-shoot').evaluate((b: HTMLButtonElement) => {
      b.click();
      b.click();
    });
    await expect(tool(page)).toHaveAttribute('data-state', 'review', { timeout: 20_000 });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { __urls: { made: number } }).__urls.made)).toBe(1);
    // The still was cut for this 제출처: the choice is fixed on the review screen.
    await expect(page.locator('#cam-preset')).toBeDisabled();
    // Back from /id-photo/ restores the page from the back-forward cache with the hand-over button pressed: usable again.
    await page.evaluate(() => {
      (document.getElementById('cam-use') as HTMLButtonElement).disabled = true;
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await expect(page.locator('#cam-use')).toBeEnabled();
    // 다시 찍기: the old still's address is released and the 제출처 can change again.
    await page.locator('#cam-retake').click();
    await expect(tool(page)).toHaveAttribute('data-state', 'live', { timeout: 20_000 });
    await expect(page.locator('#cam-preset')).toBeEnabled();
    expect(await page.evaluate(() => (window as unknown as { __urls: { revoked: number } }).__urls.revoked)).toBe(1);
  });

  test('the page hidden mid-countdown stops the camera and the timer; 「카메라 켜기」 shows again', async ({ page }) => {
    await syntheticCamera(page);
    await gotoReady(page, '/id-photo-camera/');
    await page.locator('#cam-on').click();
    await expect(tool(page)).toHaveAttribute('data-state', 'live', { timeout: 20_000 });
    await page.getByLabel('10초').check();
    await page.locator('#cam-shoot').click();
    await expect(tool(page)).toHaveAttribute('data-state', 'countdown');
    await expect(page.locator('#cam-count')).toHaveText('10');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(tool(page)).toHaveAttribute('data-state', 'idle');
    await expect(page.locator('#cam-on')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as Win).__tracks!.every((t) => t.readyState === 'ended'))).toBe(true);
    await page.waitForTimeout(1500);
    await expect(tool(page)).toHaveAttribute('data-state', 'idle');
  });
});

test.describe('live hints (Step C)', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'Playwright WebKit has no camera path.');

  test('white background, lit face: no hint', async ({ page }) => {
    await sceneCamera(page, '#f5f5f5', '#c8a08c');
    await cameraOn(page);
    // Eight analyses at 4 per second: none settles.
    await page.waitForTimeout(2000);
    await expect(page.locator('#cam-hint')).toHaveText('');
  });

  test('dark face: the dark hint', async ({ page }) => {
    await sceneCamera(page, '#787878', '#323232');
    await cameraOn(page);
    await expect(page.locator('#cam-hint')).toHaveText(HINTS.dark, { timeout: 10_000 });
  });

  test('bright background: the backlight hint; 찍기 still works and the hint goes with the camera', async ({ page }) => {
    await sceneCamera(page, '#ffffff', '#464646');
    await cameraOn(page);
    await expect(page.locator('#cam-hint')).toHaveText(HINTS.backlight, { timeout: 10_000 });
    await expect(page.locator('#cam-shoot')).toBeEnabled();
    await page.getByLabel('바로').check();
    await page.locator('#cam-shoot').click();
    await expect(tool(page)).toHaveAttribute('data-state', 'review', { timeout: 20_000 });
    await expect(page.locator('#cam-still')).toHaveAttribute('src', /^blob:/);
    await expect(page.locator('#cam-hint')).toHaveText('');
  });

  test('a sideways roll (deviceorientation, no prompt): the level hint; upright again clears it', async ({ page }) => {
    await sceneCamera(page, '#f5f5f5', '#c8a08c');
    await cameraOn(page);
    const tilt = (beta: number, gamma: number) =>
      page.evaluate(
        ([b, g]) => {
          const w = window as unknown as { __tilt?: ReturnType<typeof setInterval> };
          clearInterval(w.__tilt);
          w.__tilt = setInterval(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: b, gamma: g })), 100);
        },
        [beta, gamma] as const,
      );
    await tilt(80, 90);
    await expect(page.locator('#cam-hint')).toHaveText(HINTS.level, { timeout: 10_000 });
    await tilt(90, 0);
    await expect(page.locator('#cam-hint')).toHaveText('', { timeout: 10_000 });
  });
});

test('no camera API: the message and the native camera input, whose photo opens in /id-photo/ with the preset', async ({ page }) => {
  await page.addInitScript(() => {
    if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: undefined, configurable: true });
  });
  await gotoReady(page, '/id-photo-camera/');
  await page.selectOption('#cam-preset', 'saramin');
  await page.locator('#cam-on').click();
  await expect(page.locator('#cam-error')).toHaveText(CAMERA_ERRORS.nosupport);
  await expect(page.locator('#cam-fallback')).toBeVisible();
  await expect(page.locator('#cam-file')).toHaveAttribute('capture', 'user');
  await expect(page.locator('#cam-file')).toHaveAttribute('accept', 'image/*');
  await expect(tool(page)).toHaveAttribute('data-state', 'idle');
  await page.setInputFiles('#cam-file', PORTRAIT);
  await arrived(page, 'saramin');
  expect(page.url()).toMatch(/\/id-photo\/\?preset=saramin$/);
});

test('camera refused (NotAllowedError): the D7 message and the native input; nothing else starts', async ({ page }) => {
  await page.addInitScript(() => {
    const deny = (): Promise<MediaStream> => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: deny, configurable: true });
  });
  await gotoReady(page, '/id-photo-camera/');
  await page.locator('#cam-on').click();
  await expect(page.locator('#cam-error')).toHaveText(CAMERA_ERRORS.denied);
  await expect(page.locator('#cam-fallback')).toBeVisible();
  await expect(page.locator('#cam-live')).toBeHidden();
  await expect(page.locator('#cam-on')).toBeEnabled();
});

test('/id-photo/: 「카메라로 찍기」 follows the preset; a plain visit loads no handoff code; the widget has no link', async ({ page, network }) => {
  await gotoReady(page, '/id-photo/');
  const link = page.locator('#idp-camera');
  await expect(link).toHaveText('카메라로 찍기');
  await expect(link).toHaveAttribute('href', '/id-photo-camera/');
  await page.selectOption('#idp-preset', 'gosi');
  await expect(link).toHaveAttribute('href', '/id-photo-camera/?preset=gosi');
  await page.waitForTimeout(500);
  expect(network.requests.map((r) => r.url()).filter((u) => HANDOFF_CHUNK.test(u))).toEqual([]);
  await link.click();
  await page.waitForURL(/\/id-photo-camera\/\?preset=gosi$/);
  await expect(page.locator('#cam-preset')).toHaveValue('gosi');
  await gotoReady(page, '/embed/id-photo/');
  await expect(page.locator('#idp-camera')).toHaveCount(0);
});
