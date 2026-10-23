// Shared by the 증명사진 촬영 specs (IDCAM1022): the CSP and page-error guards, the capture steps and the arrival in
// /id-photo/.
import type { Page } from '@playwright/test';
import { expect, test } from './no-upload';

export const ARRIVED = '방금 만든 파일을 가져왔습니다.';
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
export const CAMERA_POLICY = 'camera=(self), microphone=(), geolocation=()';
export const SITE_POLICY = 'camera=(), microphone=(), geolocation=()';

export type Win = Window & { __csp: string[]; __tracks?: MediaStreamTrack[] };
type Guarded = Page & { __errors?: string[] };

/** Every test of the calling spec: zero CSP violations, zero uncaught errors and zero console errors. */
export function guard(): void {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Win;
      w.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    (page as Guarded).__errors = errors;
  });
  test.afterEach(async ({ page }) => {
    if (page.isClosed() || page.url() === 'about:blank') return;
    const v = await page.evaluate(() => (window as unknown as Win).__csp ?? []).catch(() => []);
    expect(v, 'securitypolicyviolation events').toEqual([]);
    expect((page as Guarded).__errors ?? [], 'page and console errors').toEqual([]);
  });
}

export const tool = (page: Page) => page.locator('#cam-tool');

/** Replaces getUserMedia with a canvas stream: a light frame, a grey head, a dark block near the left edge. */
export async function syntheticCamera(page: Page, w = 432, h = 560): Promise<void> {
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

/** 카메라 켜기 -> 바로 -> 찍기 -> the review shows the still. */
export async function shootNow(page: Page): Promise<void> {
  await page.locator('#cam-on').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'live', { timeout: 20_000 });
  await expect(page.locator('#cam-video')).toHaveJSProperty('paused', false);
  await page.getByLabel('바로').check();
  await page.locator('#cam-shoot').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'review', { timeout: 20_000 });
  await expect(page.locator('#cam-still')).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => page.evaluate(() => (document.getElementById('cam-still') as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
}

/** /id-photo/ shows the handed-over photo with `preset` chosen and the 이어서 하기 notice. */
export async function arrived(page: Page, preset: string): Promise<void> {
  await page.waitForURL(/\/id-photo\/(\?preset=[a-z_]+)?$/, { timeout: 20_000 });
  await expect(page.locator('#idp-tool')).toHaveAttribute('data-state', /^(adjust|blocked)$/, { timeout: 90_000 });
  await expect(page.locator('#idp-preset')).toHaveValue(preset);
  await expect(page.locator('#idp-notice')).toHaveText(ARRIVED);
}

/** Records in the handoff store (the database is created empty when missing). */
export const stored = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const r = indexedDB.open('docttak-handoff', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'key' });
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const c = db.transaction('files').objectStore('files').count();
          c.onsuccess = () => {
            db.close();
            resolve(c.result);
          };
          c.onerror = () => reject(c.error);
        };
      }),
  );

/**
 * A file waiting for `to` in this tab, as sendTo leaves it (record + session marker): the receiver opens it on its next
 * load. For browsers without a synthetic camera (Playwright WebKit) and for receiver states the camera cannot set up.
 */
export async function seedHandoff(page: Page, to: string, from: string, file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  await page.evaluate(
    ([t, f, name, type, bytes]) =>
      new Promise<void>((resolve, reject) => {
        const key = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
        const r = indexedDB.open('docttak-handoff', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'key' });
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').put({ key, to: t, from: f, name, type, blob: new Uint8Array(bytes).buffer, at: Date.now() });
          tx.oncomplete = () => {
            db.close();
            localStorage.setItem('docttak:handoff-sweep', '1');
            sessionStorage.setItem('docttak:handoff', JSON.stringify({ to: t, key }));
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [to, from, file.name, file.mimeType, Array.from(file.buffer)] as const,
  );
}
