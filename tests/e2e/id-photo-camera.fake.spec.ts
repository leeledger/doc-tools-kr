// 증명사진 촬영 with Chromium's own fake camera (IDCAM1022 Step B test map; chromium and mobile-chrome). The launch flags
// are file-wide (they need their own worker), so this file holds only this test; other browsers skip it without
// launching. The real getUserMedia runs: the route's Permissions-Policy (camera=(self)) lets the page use the camera,
// the still is the guide rectangle of the frame Chromium delivers, every track has ended after the capture, and the
// photo opens in /id-photo/ (no-upload guard, zero CSP violations and page errors).
import { arrived, guard, stored, tool, type Win } from './idcam';
import { expect, gotoReady, test } from './no-upload';

test.skip(({ browserName }) => browserName !== 'chromium', 'Only Chromium has a built-in fake camera in Playwright.');
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

guard();

test('켜기 -> 바로 -> review: the still is the guide rectangle; every track ended; it opens in /id-photo/', async ({ page }) => {
  // Keep a handle on the tracks the real call returns.
  await page.addInitScript(() => {
    const md = navigator.mediaDevices;
    const real = md.getUserMedia.bind(md);
    Object.defineProperty(md, 'getUserMedia', {
      configurable: true,
      value: async (c: MediaStreamConstraints) => {
        const s = await real(c);
        (window as unknown as Win).__tracks = s.getTracks();
        return s;
      },
    });
  });
  await gotoReady(page, '/id-photo-camera/');
  await page.locator('#cam-on').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'live', { timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (document.getElementById('cam-video') as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
  const frame = await page.evaluate(() => {
    const v = document.getElementById('cam-video') as HTMLVideoElement;
    return { width: v.videoWidth, height: v.videoHeight };
  });
  // The frame is big enough for the passport size, so the review shows no low-resolution note.
  expect(Math.min(frame.width, frame.height)).toBeGreaterThanOrEqual(531);
  await page.getByLabel('바로').check();
  await page.locator('#cam-shoot').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'review', { timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (document.getElementById('cam-still') as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('#cam-lowres')).toBeHidden();
  const still = await page.evaluate(() => {
    const img = document.getElementById('cam-still') as HTMLImageElement;
    return { w: img.naturalWidth, h: img.naturalHeight };
  });
  // The largest centred rectangle of 413:531 inside the frame: one side spans the frame.
  expect(still.w === frame.width || still.h === frame.height).toBe(true);
  expect(Math.abs(still.w / still.h - 413 / 531)).toBeLessThan(0.01);
  expect(await page.evaluate(() => (window as unknown as Win).__tracks!.map((t) => t.readyState))).toEqual(['ended']);
  await expect(page.locator('#cam-video')).toHaveJSProperty('srcObject', null);
  await page.locator('#cam-use').click();
  await arrived(page, 'passport_online');
  expect(await stored(page)).toBe(0);
});
