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
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { PRESETS } from '../../src/data/id-photo-presets';
import { sniffImage } from '../../src/lib/image/sniff';
import { CAMERA_ERRORS } from '../../src/tools/id-photo-camera/errors';
import { AXE_TAGS, CAMERA_POLICY, SITE_POLICY, arrived, guard, shootNow, stored, tool, type Win } from './idcam';
import { expect, gotoReady, test } from './no-upload';
import { photoFixture } from './paths';

const PORTRAIT = photoFixture('portrait_pd.jpg');
const HANDOFF_CHUNK = /\/_astro\/handoff\.[^/]+\.js$/;
const PASSPORT = PRESETS.find((p) => p.id === 'passport_online')!;

guard();

/** Replaces getUserMedia with a canvas stream: a light frame, a grey head, a dark block near the left edge. */
async function syntheticCamera(page: Page, w = 432, h = 560): Promise<void> {
  await page.addInitScript(
    ([fw, fh]) => {
      const win = window as unknown as Win;
      const fake = async (): Promise<MediaStream> => {
        const cv = document.createElement('canvas');
        cv.width = fw;
        cv.height = fh;
        const g = cv.getContext('2d')!;
        let tick = 0;
        const paint = (): void => {
          tick++;
          g.fillStyle = tick % 2 ? '#fafafa' : '#f9f9f9';
          g.fillRect(0, 0, fw, fh);
          g.fillStyle = '#808080';
          g.beginPath();
          g.ellipse(fw / 2, fh * 0.45, fw * 0.25, fh * 0.27, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#101010';
          g.fillRect(Math.round(fw * 0.05), Math.round(fh * 0.1), Math.round(fw * 0.15), Math.round(fh * 0.15));
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
    [w, h] as const,
  );
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
