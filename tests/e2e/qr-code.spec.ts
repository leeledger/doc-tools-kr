// QR코드 만들기 (CARD1026 Step B) end to end, every project, no-upload guard on every test: each kind → preview → PNG
// download decoded (jsQR, raw bytes as strict UTF-8, tests/helpers/qr-decode.ts) equals the exact payload; the SVG file
// is well-formed; ?tab= opens a kind; inline errors with aria-invalid and focus on a download click; too much text;
// the dense hint; the URL and storage never change and no request carries a typed value; axe; 360 px.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { Download, Page } from '@playwright/test';
import { decodeQrText } from '../helpers/qr-decode';
import { expect, gotoReady, test } from './no-upload';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function download(page: Page, button: '#qr-png' | '#qr-svg'): Promise<{ name: string; bytes: Buffer }> {
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator(button).click()]);
  return { name: (d as Download).suggestedFilename(), bytes: readFileSync((await (d as Download).path())!) };
}

async function decodePng(png: Buffer): Promise<{ text: string | null; w: number; h: number }> {
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return { text: decodeQrText(new Uint8ClampedArray(ctx.getImageData(0, 0, img.width, img.height).data), img.width, img.height), w: img.width, h: img.height };
}

/** The PNG download decodes to `payload`; the PNG is square, about 1,200 px, and named QR코드.png. */
async function expectPng(page: Page, payload: string): Promise<void> {
  await expect(page.locator('#qr-preview svg')).toBeVisible();
  const { name, bytes } = await download(page, '#qr-png');
  expect(name).toBe('QR코드.png');
  const r = await decodePng(bytes);
  expect(r.text).toBe(payload);
  expect(r.w).toBe(r.h);
  expect(r.w).toBeLessThanOrEqual(1200);
  expect(r.w).toBeGreaterThan(900);
}

const pick = (page: Page, label: string) => page.locator('.qr-kinds label.chip').filter({ hasText: new RegExp(`^${label}$`) });
const serious = async (page: Page): Promise<string[]> =>
  (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

test('인터넷 주소 (default): no scheme gets https://, PNG decodes to the href, SVG is well-formed; URL and storage unchanged', async ({ page, network }) => {
  await gotoReady(page, '/qr-code/');
  await expect(page.locator('input[name="qr-kind"][value="url"]')).toBeChecked();
  await expect(page.locator('#qr-empty')).toBeVisible();
  const url = page.url();
  const before = await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]);
  await page.locator('#qr-url').fill('example.org/hello-qr');
  await expectPng(page, 'https://example.org/hello-qr');
  const svg = await download(page, '#qr-svg');
  expect(svg.name).toBe('QR코드.svg');
  const text = svg.bytes.toString('utf8');
  expect(text).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 (\d+) \1"/);
  expect(text).toContain('<title>QR 코드</title>');
  expect(await page.evaluate((s) => new DOMParser().parseFromString(s, 'image/svg+xml').getElementsByTagName('parsererror').length, text)).toBe(0);
  await expect(page.locator('#qr-status')).toHaveText('QR 그림을 받았어요.');
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual(before);
  for (const r of network.requests) {
    expect(r.url()).not.toContain('hello-qr');
    expect(r.postData() ?? '').not.toContain('hello-qr');
  }
});

test('글자: Hangul, an emoji and a line break decode exactly (UTF-8)', async ({ page }) => {
  await gotoReady(page, '/qr-code/');
  await pick(page, '글자').click();
  await expect(page.locator('#qr-text')).toBeVisible();
  await expect(page.locator('#qr-url')).toBeHidden();
  const value = '홍길동 문서딱 😀\n둘째 줄';
  await page.locator('#qr-text').fill(value);
  await expectPng(page, value);
});

test('?tab=wifi opens 와이파이: a semicolon and a colon in the password are escaped; 비밀번호 없음 hides the password; no hidden-network option', async ({ page }) => {
  await gotoReady(page, '/qr-code/?tab=wifi');
  await expect(page.locator('input[name="qr-kind"][value="wifi"]')).toBeChecked();
  await expect(page.locator('#qr-ssid')).toBeVisible();
  await expect(page.locator('#qr-p-wifi input[type="checkbox"]')).toHaveCount(0);
  await page.locator('#qr-ssid').fill('문서딱 손님');
  await page.locator('#qr-pw').fill('pa;ss:1');
  await expectPng(page, 'WIFI:T:WPA;S:문서딱 손님;P:pa\\;ss\\:1;;');
  await page.getByLabel('비밀번호 없음').check();
  await expect(page.locator('#qr-pw')).toBeHidden();
  await expectPng(page, 'WIFI:T:nopass;S:문서딱 손님;;');
  await page.getByLabel('WEP (오래된 공유기)').check();
  await expect(page.locator('#qr-pw')).toBeVisible();
  await expectPng(page, 'WIFI:T:WEP;S:문서딱 손님;P:pa\\;ss\\:1;;');
  expect(new URL(page.url()).search).toBe('?tab=wifi');
});

test('와이파이: a missing password shows only on a download click, with focus; nothing is downloaded', async ({ page }) => {
  await gotoReady(page, '/qr-code/?tab=wifi');
  await page.locator('#qr-ssid').fill('home');
  await page.waitForTimeout(300);
  await expect(page.locator('#qr-pw-error')).toBeEmpty();
  await expect(page.locator('#qr-preview svg')).toHaveCount(0);
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.locator('#qr-png').click();
  await expect(page.locator('#qr-pw-error')).toHaveText('비밀번호를 써 주세요. 비밀번호가 없으면 「비밀번호 없음」을 고르세요.');
  await expect(page.locator('#qr-pw')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#qr-pw')).toBeFocused();
  expect(downloads).toBe(0);
});

test('전화: separators are dropped (tel:digits); letters give the inline error, a download click focuses the field', async ({ page }) => {
  await gotoReady(page, '/qr-code/?tab=tel');
  await page.locator('#qr-tel').fill('010-1234-5678');
  await expectPng(page, 'tel:01012345678');
  await page.locator('#qr-tel').fill('010-abcd');
  await expect(page.locator('#qr-tel-error')).toHaveText('전화번호는 숫자로 써 주세요.');
  await expect(page.locator('#qr-tel')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#qr-preview svg')).toHaveCount(0);
  await page.locator('#qr-png').click();
  await expect(page.locator('#qr-tel')).toBeFocused();
  expect(await serious(page)).toEqual([]);
});

test('문자: SMSTO with the digits and the Hangul message', async ({ page }) => {
  await gotoReady(page, '/qr-code/');
  await pick(page, '문자').click();
  await page.locator('#qr-sms-to').fill('010 1234 5678');
  await page.locator('#qr-sms-text').fill('예약 문의합니다: 2명');
  await expectPng(page, 'SMSTO:01012345678:예약 문의합니다: 2명');
});

test('연락처: 홍길동 with a comma and a semicolon in 회사 decodes to the exact unfolded vCard 3.0; 「need」 on a download click', async ({ page }) => {
  await gotoReady(page, '/qr-code/?tab=contact');
  await page.locator('#qr-c-mobile').fill('010-1234-5678');
  await page.waitForTimeout(300);
  await expect(page.locator('#qr-c-last-error')).toBeEmpty();
  await page.locator('#qr-png').click();
  await expect(page.locator('#qr-c-last-error')).toHaveText('이름이나 회사 중 하나는 써 주세요.');
  await expect(page.locator('#qr-c-last')).toBeFocused();
  await page.locator('#qr-c-last').fill('홍');
  await page.locator('#qr-c-first').fill('길동');
  await page.locator('#qr-c-org').fill('예시, 회사;본사');
  await page.locator('#qr-c-email').fill('hong@example.com');
  await expectPng(
    page,
    'BEGIN:VCARD\r\nVERSION:3.0\r\nN:홍;길동;;;\r\nFN:홍길동\r\nORG:예시\\, 회사\\;본사;\r\nTEL;TYPE=CELL:010-1234-5678\r\nEMAIL;TYPE=INTERNET:hong@example.com\r\nEND:VCARD\r\n',
  );
  await page.locator('#qr-c-email').fill('hong@example');
  await expect(page.locator('#qr-c-email-error')).toHaveText('이메일 주소를 확인해 주세요.');
  expect(await serious(page)).toEqual([]);
});

test('인터넷 주소 errors: javascript: is refused inline; an empty download click asks for the address with focus', async ({ page }) => {
  await gotoReady(page, '/qr-code/');
  await page.locator('#qr-png').click();
  await expect(page.locator('#qr-url-error')).toHaveText('인터넷 주소를 써 주세요.');
  await expect(page.locator('#qr-url')).toBeFocused();
  await page.locator('#qr-url').fill('javascript:alert(1)');
  await expect(page.locator('#qr-url-error')).toHaveText('인터넷 주소를 확인해 주세요.');
  await expect(page.locator('#qr-url')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#qr-preview svg')).toHaveCount(0);
  expect(await serious(page)).toEqual([]);
});

test('too much text: 「글자가 너무 많아…」, no QR; many characters show the dense hint', async ({ page }) => {
  await gotoReady(page, '/qr-code/?tab=text');
  await page.locator('#qr-text').fill('가'.repeat(800));
  await expect(page.locator('#qr-over')).toHaveText('글자가 너무 많아 QR에 다 들어가지 않아요. 조금 줄여 주세요.');
  await expect(page.locator('#qr-preview svg')).toHaveCount(0);
  await page.locator('#qr-text').fill('a'.repeat(500));
  await expect(page.locator('#qr-over')).toBeEmpty();
  await expect(page.locator('#qr-dense')).toBeVisible();
  await page.locator('#qr-text').fill('a'.repeat(20));
  await expect(page.locator('#qr-dense')).toBeHidden();
});

test('axe on every kind; the arrow keys move between kinds; 360 px has no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await gotoReady(page, '/qr-code/');
  for (const kind of ['url', 'text', 'contact', 'wifi', 'tel', 'sms']) {
    await page.locator(`input[name="qr-kind"][value="${kind}"]`).check({ force: true });
    await expect(page.locator(`#qr-p-${kind}`)).toBeVisible();
    expect(await serious(page), kind).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), kind).toBeLessThanOrEqual(0);
  }
  await page.locator('input[name="qr-kind"][value="url"]').check({ force: true });
  await page.locator('input[name="qr-kind"][value="url"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('input[name="qr-kind"][value="text"]')).toBeChecked();
  await expect(page.locator('#qr-p-text')).toBeVisible();
});
