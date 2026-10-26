// 전자명함 만들기 (CARD1026 Step C) end to end, every project, no-upload guard on every test: a made-up sample (홍길동, a
// company with a comma and a semicolon, a 홈페이지 with a comma) → 연락처.vcf bytes (vCard 3.0, CRLF, UTF-8 without BOM,
// folded at 75 octets, unfolds to the exact text) → the QR PNG/SVG and the 명함 그림 PNG in both layouts decode (jsQR, raw
// bytes as strict UTF-8, tests/helpers/qr-decode.ts) to the unfolded vCard, the all-max card too; 보내기 with a stubbed
// navigator.share (ok / AbortError / other error) and hidden when canShare says no or before the controller has loaded;
// inline errors with focus; a first 받기 press is replayed; URL and storage never change; axe; 360 px.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { Download, Page } from '@playwright/test';
import { decodeQrText } from '../helpers/qr-decode';
import { expect, gotoReady, test } from './no-upload';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function download(page: Page, button: string): Promise<{ name: string; bytes: Buffer }> {
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

const serious = async (page: Page): Promise<string[]> =>
  (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

const SMALL_QR = '글자가 많아 명함 그림 속 QR이 작아요. 메모나 주소를 줄이면 더 잘 찍혀요. 연락처 파일을 같이 보내도 돼요.';

const SAMPLE: Record<string, string> = {
  last: '홍',
  first: '길동',
  org: '예시, 회사;본사',
  dept: '영업부',
  title: '과장',
  mobile: '010-1234-5678',
  email: 'hong@example.com',
  url: 'example.com/a,b',
  address: '서울특별시 중구 세종대로 110, 예시빌딩 3층 문서딱 사무실',
  note: '첫째 줄\n둘째 줄',
};
const VCARD = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:홍;길동;;;',
  'FN:홍길동',
  'ORG:예시\\, 회사\\;본사;영업부',
  'TITLE:과장',
  'TEL;TYPE=CELL:010-1234-5678',
  'EMAIL;TYPE=INTERNET:hong@example.com',
  'URL:https://example.com/a%2Cb',
  'ADR;TYPE=WORK:;;서울특별시 중구 세종대로 110\\, 예시빌딩 3층 문서딱 사무실;;;;',
  'NOTE:첫째 줄\\n둘째 줄',
  'END:VCARD',
]
  .map((l) => l + '\r\n')
  .join('');

async function fill(page: Page, values: Record<string, string>): Promise<void> {
  for (const [k, v] of Object.entries(values)) await page.locator(`#bc-c-${k}`).fill(v);
  // The 250 ms refresh after the last key.
  await page.waitForTimeout(400);
  await expect(page.locator('#bc-card')).toBeVisible();
  await expect(page.locator('#bc-card-empty')).toBeHidden();
}

/** A navigator.share stub: `mode` ok resolves, abort / other reject; canShare answers `can`. The shared file is kept as base64. */
async function stubShare(page: Page, mode: 'ok' | 'abort' | 'other', can = true): Promise<void> {
  await page.addInitScript(
    ([m, c]) => {
      const w = window as unknown as { __shared: { name: string; type: string; b64: string }[] };
      w.__shared = [];
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d: { files?: File[] }) => c && Boolean(d.files?.length) });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (d: { files: File[] }) => {
          const f = d.files[0]!;
          const bytes = new Uint8Array(await f.arrayBuffer());
          let bin = '';
          for (const b of bytes) bin += String.fromCharCode(b);
          w.__shared.push({ name: f.name, type: f.type, b64: btoa(bin) });
          if (m === 'abort') throw new DOMException('cancelled', 'AbortError');
          if (m === 'other') throw new DOMException('not allowed', 'NotAllowedError');
        },
      });
    },
    [mode, can] as const,
  );
}

test('sample card: 연락처.vcf is vCard 3.0 (CRLF, UTF-8, no BOM, folded at 75 octets; the URL comma as %2C); QR PNG/SVG and both card layouts decode to the unfolded vCard', async ({ page, network }) => {
  test.setTimeout(120_000);
  await gotoReady(page, '/business-card/');
  const url = page.url();
  const before = await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]);
  await fill(page, SAMPLE);

  const vcf = await download(page, '#bc-vcf');
  expect(vcf.name).toBe('연락처.vcf');
  expect([...vcf.bytes.subarray(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(vcf.bytes);
  expect(text.endsWith('\r\n')).toBe(true);
  expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  const physical = text.split('\r\n').slice(0, -1);
  for (const l of physical) expect(Buffer.byteLength(l, 'utf8'), l).toBeLessThanOrEqual(75);
  // The long 주소 line is folded (a continuation starts with one space); unfolding gives the exact text.
  expect(physical.some((l) => l.startsWith(' '))).toBe(true);
  expect(text.replace(/\r\n[ \t]/g, '')).toBe(VCARD);
  await expect(page.locator('#bc-status')).toHaveText('연락처 파일을 받았어요.');

  const qr = await download(page, '#bc-qr-png');
  expect(qr.name).toBe('연락처-QR.png');
  expect((await decodePng(qr.bytes)).text).toBe(VCARD);
  const svg = await download(page, '#bc-qr-svg');
  expect(svg.name).toBe('연락처-QR.svg');
  const s = svg.bytes.toString('utf8');
  expect(s).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 (\d+) \1"/);
  expect(await page.evaluate((x) => new DOMParser().parseFromString(x, 'image/svg+xml').getElementsByTagName('parsererror').length, s)).toBe(0);

  const wide = await download(page, '#bc-card-png');
  expect(wide.name).toBe('명함.png');
  expect(await decodePng(wide.bytes)).toEqual({ text: VCARD, w: 1800, h: 1000 });
  await page.locator('.bc-pick label.chip').filter({ hasText: /^세로$/ }).click();
  await page.locator('.bc-pick label.chip').filter({ hasText: /^초록$/ }).click();
  const tall = await download(page, '#bc-card-png');
  expect(await decodePng(tall.bytes)).toEqual({ text: VCARD, w: 1080, h: 1350 });
  await expect(page.locator('#bc-status')).toHaveText('명함 그림을 받았어요.');
  // An ordinary contact keeps 4 px or more modules even in 세로: no hint.
  await expect(page.locator('#bc-card-small')).toBeEmpty();

  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual(before);
  for (const r of network.requests) {
    for (const v of ['길동', encodeURIComponent('길동'), '1234-5678', 'example.com/a']) {
      expect(r.url()).not.toContain(v);
      expect(r.postData() ?? '').not.toContain(v);
    }
  }
});

test('the all-max card (every field at its limit) still gives a card in both layouts whose QR decodes to the whole vCard', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoReady(page, '/business-card/');
  const max = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll<HTMLInputElement>('[data-contact]')].map((el) => [el.dataset.contact!, el.maxLength])));
  const h = (k: string): string => '가'.repeat(max[k]!);
  const values: Record<string, string> = {
    last: h('last'),
    first: h('first'),
    org: h('org'),
    dept: h('dept'),
    title: h('title'),
    // 20 characters, 14 digits (the 전화 rule allows at most 15 digits).
    mobile: '+82 (010) 12345-6789'.slice(0, max.mobile!),
    work: '+82 (010) 12345-6789'.slice(0, max.work!),
    fax: '+82 (010) 12345-6789'.slice(0, max.fax!),
    email: `${'가'.repeat(max.email! - 4)}@가.가`,
    url: `a.kr/${'가'.repeat(max.url! - 5)}`,
    address: h('address'),
    note: h('note'),
  };
  await fill(page, values);
  await expect(page.locator('#bc-over')).toBeEmpty();
  const qr = await decodePng((await download(page, '#bc-qr-png')).bytes);
  expect(qr.text).toMatch(/^BEGIN:VCARD\r\nVERSION:3\.0\r\nN:가{10};가{20};;;\r\n/);
  for (const layout of ['가로', '세로']) {
    await page.locator('.bc-pick label.chip').filter({ hasText: new RegExp(`^${layout}$`) }).click();
    // Review C: version 40 gives modules under the 4 px floor in both layouts → the polite hint; downloads stay.
    await expect(page.locator('#bc-card-small'), layout).toHaveText(SMALL_QR);
    const card = await decodePng((await download(page, '#bc-card-png')).bytes);
    expect(card.text, layout).toBe(qr.text);
  }
});

test('보내기: hidden before the controller has loaded; shown when the device can share the card; the shared file is 명함.png and decodes to the vCard', async ({ page }) => {
  await stubShare(page, 'ok');
  await gotoReady(page, '/business-card/');
  await expect(page.locator('#bc-share')).toBeHidden();
  await expect(page.locator('#bc-tool')).not.toHaveAttribute('data-ready', '1');
  await fill(page, { last: '홍', first: '길동', mobile: '010-1234-5678' });
  await expect(page.locator('#bc-share')).toBeVisible();
  await page.locator('#bc-share').click();
  await expect(page.locator('#bc-status')).toHaveText('명함 그림 보내기를 했어요.');
  await expect(page.locator('#bc-share-error')).toBeEmpty();
  const shared = await page.evaluate(() => (window as unknown as { __shared: { name: string; type: string; b64: string }[] }).__shared);
  expect(shared.map((s) => [s.name, s.type])).toEqual([['명함.png', 'image/png']]);
  const r = await decodePng(Buffer.from(shared[0]!.b64, 'base64'));
  expect(r).toEqual({ text: 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:홍;길동;;;\r\nFN:홍길동\r\nTEL;TYPE=CELL:010-1234-5678\r\nEND:VCARD\r\n', w: 1800, h: 1000 });
  // Typing after the picture was made: the press shares the new card (made in the press), never the old one.
  await page.locator('#bc-c-first').fill('길순');
  await page.locator('#bc-share').click();
  const again = await page.evaluate(() => (window as unknown as { __shared: { b64: string }[] }).__shared);
  expect((await decodePng(Buffer.from(again[1]!.b64, 'base64'))).text).toContain('FN:홍길순');
  // The empty card hides it again.
  for (const k of ['last', 'first', 'mobile']) await page.locator(`#bc-c-${k}`).fill('');
  await expect(page.locator('#bc-share')).toBeHidden();
});

test('보내기 cancelled (AbortError): no message, no status', async ({ page }) => {
  await stubShare(page, 'abort');
  await gotoReady(page, '/business-card/');
  await fill(page, { org: '문서딱 상회' });
  await page.locator('#bc-share').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared.length)).toBe(1);
  await expect(page.locator('#bc-share-error')).toBeEmpty();
  await expect(page.locator('#bc-status')).toBeEmpty();
});

test('보내기 refused by the device: 「이 기기에서는 바로 보내기가 안 돼요…」 and the download works', async ({ page }) => {
  await stubShare(page, 'other');
  await gotoReady(page, '/business-card/');
  await fill(page, { org: '문서딱 상회' });
  await page.locator('#bc-share').click();
  await expect(page.locator('#bc-share-error')).toHaveText('이 기기에서는 바로 보내기가 안 돼요. 그림을 받아서 보내 주세요.');
  const card = await download(page, '#bc-card-png');
  expect(card.name).toBe('명함.png');
  expect((await decodePng(card.bytes)).text).toBe('BEGIN:VCARD\r\nVERSION:3.0\r\nN:;;;;\r\nFN:문서딱 상회\r\nORG:문서딱 상회;\r\nEND:VCARD\r\n');
});

test('canShare says no: 보내기 never shows; downloads work', async ({ page }) => {
  await stubShare(page, 'ok', false);
  await gotoReady(page, '/business-card/');
  await fill(page, { last: '홍' });
  await page.waitForTimeout(300);
  await expect(page.locator('#bc-share')).toBeHidden();
  expect((await download(page, '#bc-card-png')).name).toBe('명함.png');
});

test('errors: a hint while only a phone is written; a 받기 press asks for a name with focus and downloads nothing; a wrong phone and email show inline', async ({ page }) => {
  await gotoReady(page, '/business-card/');
  await expect(page.locator('#bc-card-empty')).toHaveText('쓰는 대로 여기에 명함이 나와요.');
  await page.locator('#bc-c-mobile').fill('010-1234-5678');
  await page.waitForTimeout(400);
  await expect(page.locator('#bc-card-empty')).toHaveText('이름이나 회사를 쓰면 명함이 나와요.');
  await expect(page.locator('#bc-card-empty')).toBeVisible();
  await expect(page.locator('#bc-qr-empty')).toHaveText('이름이나 회사를 쓰면 QR이 나와요.');
  await expect(page.locator('#bc-c-last-error')).toBeEmpty();
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.locator('#bc-vcf').click();
  await expect(page.locator('#bc-c-last-error')).toHaveText('이름이나 회사 중 하나는 써 주세요.');
  await expect(page.locator('#bc-c-last')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#bc-c-last')).toBeFocused();
  await page.locator('#bc-c-last').fill('홍');
  await page.locator('#bc-c-mobile').fill('010-abcd');
  await page.locator('#bc-c-email').fill('hong@example');
  await expect(page.locator('#bc-c-mobile-error')).toHaveText('전화번호는 숫자로 써 주세요.');
  await expect(page.locator('#bc-c-email-error')).toHaveText('이메일 주소를 확인해 주세요.');
  await expect(page.locator('#bc-card')).toBeHidden();
  await page.locator('#bc-card-png').click();
  await expect(page.locator('#bc-c-mobile')).toBeFocused();
  expect(downloads).toBe(0);
  expect(await serious(page)).toEqual([]);
});

test('the first interaction is a 받기 press: the controller loads, the press is replayed and 연락처.vcf downloads', async ({ page }) => {
  await gotoReady(page, '/business-card/');
  await page.locator('#bc-c-org').evaluate((el) => {
    (el as HTMLInputElement).value = '문서딱 상회';
  });
  await expect(page.locator('#bc-tool')).not.toHaveAttribute('data-ready', '1');
  const vcf = await download(page, '#bc-vcf');
  expect(vcf.name).toBe('연락처.vcf');
  expect(vcf.bytes.toString('utf8')).toBe('BEGIN:VCARD\r\nVERSION:3.0\r\nN:;;;;\r\nFN:문서딱 상회\r\nORG:문서딱 상회;\r\nEND:VCARD\r\n');
  await expect(page.locator('#bc-tool')).toHaveAttribute('data-ready', '1');
});

test('axe on the empty and the filled page (both layouts); 360 px has no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await gotoReady(page, '/business-card/');
  expect(await serious(page)).toEqual([]);
  await fill(page, SAMPLE);
  expect(await serious(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.locator('.bc-pick label.chip').filter({ hasText: /^세로$/ }).click();
  expect(await serious(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
