// PDF 글자 넣기·편집 (TOOLS1015 E1) end to end. Text, today's date and white boxes are placed on generated PDFs; the saved
// PDF is read with pdf.js in Node (text content: the inserted text is real text, brief claim c) and drawn with
// @napi-rs/canvas: dark pixels inside the box as placed and none just outside it, on a plain page, /Rotate 90 and
// /Rotate 270 with a CropBox at (36,36) (claim e). The fonts come from /fonts/hwp/ in the worker, same origin (claim d:
// the no-upload fixture stays on). Also: blue text, honest white boxes, encrypted and signed inputs, a character no face
// has, a font that cannot be fetched, the next steps.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Download, Page } from '@playwright/test';
import { PDFDocument, StandardFonts, degrees } from '@cantoo/pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { expect, gotoReady, test } from './no-upload';
import { RUNTIME_DIR, runtimePath } from './paths';

const DIR = join(RUNTIME_DIR, `ed-${process.pid}`);
const FORM = join(DIR, 'form.pdf');
const ROT90 = join(DIR, 'rot90.pdf');
const CROP270 = join(DIR, 'crop270.pdf');

test.beforeAll(async () => {
  mkdirSync(DIR, { recursive: true });
  // Two pages; page 1 carries OLDTEXT (Helvetica 20 pt, baseline at y 700 → seen from y ≈ 86 to 100).
  const form = await PDFDocument.create();
  const font = await form.embedFont(StandardFonts.Helvetica);
  form.addPage([600, 800]).drawText('OLDTEXT', { x: 100, y: 700, size: 20, font });
  form.addPage([600, 800]);
  writeFileSync(FORM, await form.save());
  const r90 = await PDFDocument.create();
  r90.addPage([600, 800]).setRotation(degrees(90));
  writeFileSync(ROT90, await r90.save());
  const c270 = await PDFDocument.create();
  const p = c270.addPage([600, 800]);
  p.setCropBox(36, 36, 500, 700);
  p.setRotation(degrees(270));
  writeFileSync(CROP270, await c270.save());
});

const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
};

async function open(page: Page, pdf: string): Promise<void> {
  await gotoReady(page, '/pdf-edit/');
  await page.setInputFiles('#ed-input', pdf);
  await expect(page.locator('#ed-tool')).toHaveAttribute('data-state', /ready|locked/);
}

/** The stage has its page picture and a stable size. */
async function stageReady(page: Page): Promise<void> {
  const size = () => page.locator('#ed-stage').evaluate((e) => `${e.clientWidth}x${e.clientHeight}`);
  await expect(page.locator('#ed-stage canvas.sign-page')).toHaveCount(1);
  await expect(async () => {
    const a = await size();
    await page.waitForTimeout(100);
    expect(await size()).toBe(a);
  }).toPass();
}

/** Box `n` (0-based) in page points as seen, once two reads 150 ms apart agree (the face arrives and the box is re-measured). */
async function boxOf(page: Page, n: number, pageW: number): Promise<{ x: number; y: number; w: number; h: number }> {
  const read = () =>
    page.locator('#ed-stage').evaluate((stage, [i, pw]) => {
      const s = stage.getBoundingClientRect();
      // The box itself: the button minus the padding a small box gets (page-stage MIN_TARGET).
      const b = stage.querySelectorAll<HTMLElement>('.sign-box')[i]!;
      const r = b.getBoundingClientRect();
      const px = parseFloat(b.style.getPropertyValue('--px')) || 0;
      const py = parseFloat(b.style.getPropertyValue('--py')) || 0;
      const k = pw / s.width;
      return [r.left - s.left + px, r.top - s.top + py, r.width - 2 * px, r.height - 2 * py].map((v) => Math.round(v * k * 10) / 10);
    }, [n, pageW] as const);
  let last = '';
  await expect(async () => {
    const a = JSON.stringify(await read());
    await page.waitForTimeout(150);
    const b = JSON.stringify(await read());
    expect(b).toBe(a);
    last = b;
  }).toPass();
  const [x, y, w, h] = JSON.parse(last) as number[];
  return { x: x!, y: y!, w: w!, h: h! };
}

async function addText(page: Page, text: string): Promise<void> {
  await page.locator('#ed-add-text').click();
  await expect(page.locator('#ed-text')).toBeFocused();
  await page.locator('#ed-text').fill(text);
}

/** Waits until the page stops scrolling (the result scrolls into view smoothly). */
const settled = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => {
    let y = scrollY;
    let since = performance.now();
    const tick = (now: number) => {
      if (scrollY !== y) {
        y = scrollY;
        since = now;
      }
      if (now - since >= 250) r();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));

async function save(page: Page): Promise<{ name: string; bytes: Uint8Array }> {
  await page.locator('#ed-run').click();
  await expect(page.locator('#ed-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await settled(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#ed-download').click()]);
  const d = download as Download;
  return { name: d.suggestedFilename(), bytes: new Uint8Array(readFileSync((await d.path())!)) };
}

interface Seen {
  text: string;
  /** Pixel (r, g, b) at a point of the page as seen. */
  at(x: number, y: number): number[];
  /** Dark pixels (any channel under 140) in a rectangle as seen. */
  dark(x: number, y: number, w: number, h: number): number;
}

async function pagesSeen(bytes: Uint8Array): Promise<Seen[]> {
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  const out: Seen[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const vp = pg.getViewport({ scale: 1 });
    const c = createCanvas(Math.round(vp.width), Math.round(vp.height));
    const ctx = c.getContext('2d');
    await pg.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, canvas: c as unknown as HTMLCanvasElement, viewport: vp }).promise;
    const tc = await pg.getTextContent();
    const text = tc.items.map((it) => ('str' in it ? it.str : '')).join('');
    const W = c.width;
    const H = c.height;
    const data = ctx.getImageData(0, 0, W, H).data;
    const px = (x: number, y: number) => {
      const o = (Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)))) * 4;
      return [data[o]!, data[o + 1]!, data[o + 2]!];
    };
    out.push({
      text,
      at: px,
      dark: (x, y, w, h) => {
        let n = 0;
        for (let yy = Math.max(0, Math.round(y)); yy < Math.min(H, Math.round(y + h)); yy++)
          for (let xx = Math.max(0, Math.round(x)); xx < Math.min(W, Math.round(x + w)); xx++) if (px(xx, yy).some((v) => v < 140)) n++;
        return n;
      },
    });
  }
  await task.destroy();
  return out;
}

/** Each side within half a point (the preview's CSS pixels read back as points). */
function near(got: { x: number; y: number; w: number; h: number }, want: { x: number; y: number; w: number; h: number }): void {
  for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(got[k] - want[k]), `${k}: ${got[k]} vs ${want[k]}`).toBeLessThan(0.5);
}

const PAD = 3;
/** Ink inside the box (± PAD points) and none in a band just outside it. */
function expectInBox(seen: Seen, b: { x: number; y: number; w: number; h: number }, label: string): void {
  expect(seen.dark(b.x - PAD, b.y - PAD, b.w + 2 * PAD, b.h + 2 * PAD), `${label}: ink in the box`).toBeGreaterThan(30);
  // Bands 12 points wide around the padded box.
  expect(seen.dark(b.x - PAD - 12, b.y - PAD, 12, b.h + 2 * PAD), `${label}: left`).toBe(0);
  expect(seen.dark(b.x + b.w + PAD, b.y - PAD, 12, b.h + 2 * PAD), `${label}: right`).toBe(0);
  expect(seen.dark(b.x - PAD, b.y - PAD - 12, b.w + 2 * PAD, 12), `${label}: above`).toBe(0);
  expect(seen.dark(b.x - PAD, b.y + b.h + PAD, b.w + 2 * PAD, 12), `${label}: below`).toBe(0);
}

test('글자 and 오늘 날짜 on page 1: real text where placed, page count kept, {base}_작성.pdf; the controller is not loaded with the page', async ({ page, network }) => {
  await gotoReady(page, '/pdf-edit/');
  expect(network.requests.some((r) => /\/_astro\/controller\./.test(r.url())), 'no controller before use').toBe(false);
  await page.setInputFiles('#ed-input', FORM);
  await expect(page.locator('#ed-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#ed-run')).toBeDisabled();
  await expect(page.locator('#ed-page-count')).toContainText('/ 2쪽');
  await stageReady(page);
  await page.locator('#ed-add-text').click();
  await expect(page.locator('#ed-hint')).toHaveText('비어 있는 글자 칸이 있습니다. 글자를 쓰거나 그 칸을 빼 주세요.');
  await page.locator('#ed-text').fill('홍길동');
  // Away from OLDTEXT and from each other: Shift+arrow = 10 points.
  const before = await boxOf(page, 0, 600);
  await page.locator('.sign-box').first().focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press('Shift+ArrowDown');
  await page.locator('#ed-add-date').click();
  await expect(page.locator('#ed-text')).toHaveValue(today());
  await page.locator('.sign-box').nth(1).focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowDown');
  await expect(page.locator('#ed-hint')).toHaveText('1쪽에 2개를 넣어 저장합니다.');
  const name = await boxOf(page, 0, 600);
  const date = await boxOf(page, 1, 600);
  expect(Math.abs(name.y - before.y - 200)).toBeLessThan(0.5);
  const { name: file, bytes } = await save(page);
  expect(file).toBe('form_작성.pdf');
  const seen = await pagesSeen(bytes);
  expect(seen).toHaveLength(2);
  expect(seen[0]!.text.replace(/\s+/g, '')).toContain('홍길동');
  expect(seen[0]!.text.replace(/\s+/g, '')).toContain(today().replace(/\s+/g, ''));
  expectInBox(seen[0]!, name, 'name');
  expectInBox(seen[0]!, date, 'date');
  expect(seen[1]!.text).toBe('');
  await expect(page.locator('#ed-summary')).toContainText('1쪽에 2개를 넣었습니다');
  await expect(page.locator('#ed-notes')).toBeHidden();
  // 이어서 하기: sign, compress, lock.
  await expect(page.getByRole('group', { name: '이 파일로 이어서 하기' }).getByRole('button')).toHaveText(['PDF 서명·도장 넣기', 'PDF 용량 줄이기', 'PDF 암호 걸기']);
});

test('파랑 and size: blue ink; the size slider grows the box; 이 글자 빼기 removes it', async ({ page }) => {
  await open(page, FORM);
  await stageReady(page);
  await addText(page, 'BLUE 파랑');
  await page.locator('label.chip', { hasText: '파랑' }).click();
  await page.locator('#ed-size').fill('24');
  await expect(page.locator('#ed-size-out')).toHaveText('24');
  const b = await boxOf(page, 0, 600);
  expect(b.h).toBeCloseTo(24 * 1.3, 0);
  await page.locator('#ed-add-text').click();
  await expect(page.locator('.sign-box')).toHaveCount(2);
  await page.locator('#ed-remove').click();
  await expect(page.locator('.sign-box')).toHaveCount(1);
  await expect(page.locator('#ed-add-text')).toBeFocused();
  const seen = (await pagesSeen((await save(page)).bytes))[0]!;
  let blue = 0;
  for (let y = b.y; y < b.y + b.h; y += 1) for (let x = b.x; x < b.x + b.w; x += 1) {
    const [r, g, bl] = seen.at(x, y);
    if (bl! > 150 && r! < 120 && g! < 140) blue++;
  }
  expect(blue).toBeGreaterThan(20);
});

test('흰 상자 over old text: white on the page, and the note says the old text stays in the file (it does)', async ({ page }) => {
  await open(page, FORM);
  await stageReady(page);
  await expect(page.locator('#ed-white-note')).toBeHidden();
  await page.locator('#ed-add-white').click();
  await expect(page.locator('#ed-white-note')).toContainText('흰 상자는 위에 덮는 것이라 밑의 글자는 파일 안에 남습니다.');
  // The box starts at (60, 80) on a 600 × 800 page, 120 × 24: over OLDTEXT (x 100…, seen y ≈ 86…100).
  near(await boxOf(page, 0, 600), { x: 60, y: 80, w: 120, h: 24 });
  await page.locator('.sign-box').focus();
  await page.keyboard.press('ArrowRight');
  await expect(async () => near(await boxOf(page, 0, 600), { x: 61, y: 80, w: 120, h: 24 })).toPass();
  const { bytes } = await save(page);
  await expect(page.locator('#ed-notes')).toContainText('흰 상자로 가린 곳의 원래 글자는 파일 안에 그대로 남아 있습니다.');
  const seen = (await pagesSeen(bytes))[0]!;
  expect(seen.dark(61, 80, 120, 24)).toBe(0);
  expect(seen.text).toContain('OLDTEXT');
});

test('흰 상자 corner: width and height change apart (free resize)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mouse drag; the keyboard and slider paths cover phones.');
  await open(page, FORM);
  await stageReady(page);
  await page.locator('#ed-add-white').click();
  await page.locator('#ed-stage').evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const before = await boxOf(page, 0, 600);
  const h = (await page.locator('.sign-handle').boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 60, h.y + h.height / 2 + 10, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#ed-status')).toHaveText('흰 상자 크기를 바꿨습니다.');
  const after = await boxOf(page, 0, 600);
  expect(after.w / before.w).toBeGreaterThan(1.3);
  expect(after.h / before.h).toBeLessThan(after.w / before.w);
});

for (const [label, file, w] of [
  ['/Rotate 90', ROT90, 800],
  ['/Rotate 270 with a CropBox at (36,36)', CROP270, 700],
] as const) {
  test(`${label}: the text sits where it was placed, upright as seen`, async ({ page }) => {
    await open(page, file);
    await stageReady(page);
    await addText(page, '가나다 ABC 123');
    const b = await boxOf(page, 0, w);
    const seen = (await pagesSeen((await save(page)).bytes))[0]!;
    expect(seen.text.replace(/\s+/g, '')).toContain('가나다ABC123');
    expectInBox(seen, b, label);
  });
}

test('a character no face has: the item names it and saving waits until it is gone', async ({ page }) => {
  await open(page, FORM);
  await stageReady(page);
  await addText(page, '확인 😀');
  await expect(page.locator('#ed-text-error')).toHaveText('넣을 수 없는 글자: 😀');
  await expect(page.locator('#ed-text')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#ed-run')).toBeDisabled();
  await expect(page.locator('#ed-hint')).toContainText('넣을 수 없는 글자가 있습니다: 😀');
  await page.locator('#ed-text').fill('확인');
  await expect(page.locator('#ed-run')).toBeEnabled();
  await expect(page.locator('#ed-text-error')).toHaveText('');
});

test('fonts that cannot be fetched: a clear message, nothing saved, the items stay', async ({ page }) => {
  await gotoReady(page, '/pdf-edit/');
  await page.route('**/fonts/hwp/**', (r) => r.abort());
  await page.setInputFiles('#ed-input', FORM);
  await expect(page.locator('#ed-tool')).toHaveAttribute('data-state', 'ready');
  await stageReady(page);
  await addText(page, '홍길동');
  await page.locator('#ed-run').click();
  await expect(page.locator('#ed-error')).toHaveText('글꼴을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 저장해 주세요.', { timeout: 30_000 });
  await expect(page.locator('#ed-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('.sign-box')).toHaveCount(1);
});

test('encrypted PDF: password prompt, then saved without a password with the PDF 암호 해제·설정 link', async ({ page }) => {
  await open(page, runtimePath('encrypted_userpw_1234'));
  await expect(page.locator('#ed-tool')).toHaveAttribute('data-state', 'locked');
  await page.locator('#ed-pw-input').fill('1234');
  await page.locator('#ed-pw-input').press('Enter');
  await expect(page.locator('#ed-tool')).toHaveAttribute('data-state', 'ready');
  await stageReady(page);
  await addText(page, '확인');
  const { name, bytes } = await save(page);
  expect(name).toBe('encrypted_userpw_1234_작성.pdf');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  expect(doc.isEncrypted).toBe(false);
  expect(doc.getPageCount()).toBe(7);
  await expect(page.locator('#ed-notes')).toHaveText('암호 없이 저장했습니다. 다시 걸려면 PDF 암호 해제·설정을 쓰세요.');
  await expect(page.locator('#ed-notes a')).toHaveAttribute('href', '/pdf-password/');
});

test('signed PDF: the result warns that the signature is no longer valid', async ({ page }) => {
  await open(page, runtimePath('signed_fake'));
  await expect(page.locator('#ed-tool')).toHaveAttribute('data-state', 'ready');
  await stageReady(page);
  await addText(page, '확인');
  await save(page);
  await expect(page.locator('#ed-notes')).toContainText('전자서명이 들어 있는 문서입니다. 글자를 넣어 새로 저장하면 전자서명이 더 이상 유효하지 않습니다.');
});

test('axe: the editor with text and a white box, and the result, have no serious or critical violations', async ({ page }) => {
  const serious = async () =>
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ') + ' ' + n.failureSummary).join(' | ')}`);
  await open(page, FORM);
  await stageReady(page);
  await page.locator('#ed-add-white').click();
  await page.locator('#ed-add-date').click();
  await settled(page);
  expect(await serious()).toEqual([]);
  await save(page);
  expect(await serious()).toEqual([]);
});

test('이어서 하기: a merged PDF opens here as if picked (PDF 합치기 → PDF 글자 넣기·편집)', async ({ page }) => {
  await gotoReady(page, '/pdf-merge/');
  await page.setInputFiles('#merge-input', [FORM, ROT90]);
  await expect(page.locator('#merge-list > li .info', { hasText: '쪽' })).toHaveCount(2);
  await page.getByRole('button', { name: /^PDF \d+개 합치기$/ }).click();
  await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'done', { timeout: 45_000 });
  await page.getByRole('group', { name: '이 파일로 이어서 하기' }).getByRole('button', { name: 'PDF 글자 넣기·편집' }).click();
  await expect(page).toHaveURL(/\/pdf-edit\/$/);
  await expect(page.locator('#ed-notice')).toHaveText('방금 만든 파일을 가져왔습니다.');
  await expect(page.locator('#ed-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#ed-page-count')).toContainText('/ 3쪽');
});

test('E2 「그림으로 바꿔 저장」: off by default and shown only with a white box; on, the covered page keeps no text, the other pages keep theirs', async ({ page }) => {
  await open(page, FORM);
  await stageReady(page);
  await expect(page.locator('#ed-flatten-box')).toBeHidden();
  await page.locator('#ed-add-white').click();
  await expect(page.locator('#ed-flatten-box')).toBeVisible();
  await expect(page.locator('#ed-flatten')).not.toBeChecked();
  await expect(page.locator('#ed-white-note')).toContainText('남지 않게 하려면 아래 「그림으로 바꿔 저장」을 켜세요.');
  // Page 2 gets text only: it stays real text.
  await page.locator('#ed-next').click();
  await expect(page.locator('#ed-goto')).toHaveValue('2');
  await stageReady(page);
  await addText(page, '둘째 쪽');
  await page.locator('#ed-flatten').check();
  const { bytes } = await save(page);
  await expect(page.locator('#ed-notes')).toContainText('1쪽을 그림으로 바꿔 저장했어요. 그 쪽의 글자는 복사할 수 없어요.');
  await expect(page.locator('#ed-notes')).not.toContainText('그대로 남아 있습니다');
  const seen = await pagesSeen(bytes);
  expect(seen).toHaveLength(2);
  expect(seen[0]!.text).toBe('');
  expect(seen[0]!.dark(60, 80, 120, 24)).toBe(0);
  expect(seen[1]!.text.replace(/\s+/g, '')).toContain('둘째쪽');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  expect(doc.getPage(0).getSize()).toEqual({ width: 600, height: 800 });
});
