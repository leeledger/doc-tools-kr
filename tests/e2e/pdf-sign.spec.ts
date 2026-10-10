// PDF 서명·도장 넣기 (TOOLS5 U3) end to end: a four-colour PNG (top-left red, top-right blue, bottom-left green,
// bottom-right black) is placed on generated PDFs and the saved PDF is drawn with pdf.js in Node (@napi-rs/canvas): each
// quarter's colour must sit at its place inside the expected box, which proves position and that the picture is upright,
// on plain pages, /Rotate 90, and /Rotate 270 with a CropBox at (36,36) (brief unverified claim d). Also: keys and drag,
// 모든 쪽 / 쪽 범위, encrypted and signed inputs, a picture that is not an image, the hand-over from /stamp-signature/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import type { Download, Page } from '@playwright/test';
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { expect, gotoReady, test } from './no-upload';
import { RUNTIME_DIR, runtimePath } from './paths';

// One copy per worker process (a shared path can be rewritten by another worker's beforeAll while this one reads it).
const DIR = join(RUNTIME_DIR, `sg-${process.pid}`);
const THREE = join(DIR, 'three.pdf');
const ROT90 = join(DIR, 'rot90.pdf');
const CROP270 = join(DIR, 'crop270.pdf');
const MIXED = join(DIR, 'mixed.pdf');
const QUAD = join(DIR, 'quad.png');
const NOT_IMAGE = join(DIR, 'note.txt');

/** A PNG (RGB, 8 bit) drawn by `px(x, y)`. */
function png(w: number, h: number, px: (x: number, y: number) => [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(px(x, y), y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const RED: [number, number, number] = [255, 0, 0];
const BLUE: [number, number, number] = [0, 0, 255];
const GREEN: [number, number, number] = [0, 200, 0];
const BLACK: [number, number, number] = [0, 0, 0];

test.beforeAll(async () => {
  mkdirSync(DIR, { recursive: true });
  const three = await PDFDocument.create();
  for (let i = 0; i < 3; i++) three.addPage([600, 800]);
  writeFileSync(THREE, await three.save());
  const r90 = await PDFDocument.create();
  r90.addPage([600, 800]).setRotation(degrees(90));
  writeFileSync(ROT90, await r90.save());
  const c270 = await PDFDocument.create();
  const p = c270.addPage([600, 800]);
  p.setCropBox(36, 36, 500, 700);
  p.setRotation(degrees(270));
  writeFileSync(CROP270, await c270.save());
  const mixed = await PDFDocument.create();
  mixed.addPage([600, 800]);
  mixed.addPage([200, 300]);
  writeFileSync(MIXED, await mixed.save());
  writeFileSync(QUAD, png(200, 100, (x, y) => (y < 50 ? (x < 100 ? RED : BLUE) : x < 100 ? GREEN : BLACK)));
  writeFileSync(NOT_IMAGE, 'not a picture');
});

/** The default box of a 200×100 picture on a page seen as `w` × `h` points (place.ts startBox). */
const startBox = (w: number, h: number) => {
  const bw = Math.min(w * 0.25, 150);
  return { x: w - 36 - bw, y: h - 36 - bw / 2, w: bw, h: bw / 2 };
};

async function open(page: Page, pdf: string): Promise<void> {
  await gotoReady(page, '/pdf-sign/');
  await page.setInputFiles('#sg-input', pdf);
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', /ready|locked/);
}

/**
 * data-state=ready comes before a page render sizes the stage: waits for the page picture, two equal stage size reads
 * 100 ms apart, and the drawn boxes.
 */
async function stageReady(page: Page, boxes = 1): Promise<void> {
  const stageSize = () => page.locator('#sg-stage').evaluate((e) => `${e.clientWidth}x${e.clientHeight}`);
  await expect(page.locator('#sg-stage canvas.sign-page')).toHaveCount(1);
  await expect(async () => {
    const a = await stageSize();
    await page.waitForTimeout(100);
    expect(await stageSize()).toBe(a);
  }).toPass();
  await expect(page.locator('.sign-box')).toHaveCount(boxes);
}

async function pickImage(page: Page, path = QUAD): Promise<void> {
  await page.setInputFiles('#sg-image-input', path);
  await expect(page.locator('.sign-box')).toHaveCount(1);
}

/** Waits until the page stops scrolling (the result scrolls into view smoothly). */
const settled = (page: Page) =>
  page.waitForFunction(() => new Promise<boolean>((r) => {
    const y = scrollY;
    requestAnimationFrame(() => requestAnimationFrame(() => r(scrollY === y)));
  }));

async function save(page: Page): Promise<{ name: string; bytes: Uint8Array }> {
  await page.locator('#sg-run').click();
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await settled(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#sg-download').click()]);
  const d = download as Download;
  return { name: d.suggestedFilename(), bytes: new Uint8Array(readFileSync((await d.path())!)) };
}

/** Pixel reader of each page of `bytes` as seen (pdf.js viewport at scale 1, rotation and CropBox applied). */
async function pagesSeen(bytes: Uint8Array): Promise<((x: number, y: number) => number[])[]> {
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  const out: ((x: number, y: number) => number[])[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const vp = pg.getViewport({ scale: 1 });
    const c = createCanvas(Math.round(vp.width), Math.round(vp.height));
    const ctx = c.getContext('2d');
    await pg.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, canvas: c as unknown as HTMLCanvasElement, viewport: vp }).promise;
    out.push((x, y) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3));
  }
  await task.destroy();
  return out;
}

const near = (got: number[], want: number[], tol = 70): boolean => got.every((v, i) => Math.abs(v - want[i]!) <= tol);

/** The four quarters of the picture are where the box says, upright; the page is white just outside the box (± 2 pt). */
function expectStamp(at: (x: number, y: number) => number[], box: { x: number; y: number; w: number; h: number }, label: string, paper = true): void {
  const q = (u: number, v: number) => at(box.x + box.w * u, box.y + box.h * v);
  expect(near(q(0.25, 0.25), RED), `${label} top-left ${q(0.25, 0.25)}`).toBe(true);
  expect(near(q(0.75, 0.25), BLUE), `${label} top-right ${q(0.75, 0.25)}`).toBe(true);
  expect(near(q(0.25, 0.75), GREEN), `${label} bottom-left ${q(0.25, 0.75)}`).toBe(true);
  expect(near(q(0.75, 0.75), BLACK), `${label} bottom-right ${q(0.75, 0.75)}`).toBe(true);
  // Inside the corners (2 pt in) is the picture; 2 pt outside each edge is paper.
  expect(near(at(box.x + 2, box.y + 2), RED), `${label} inner corner`).toBe(true);
  expect(near(at(box.x + box.w - 2, box.y + box.h - 2), BLACK), `${label} inner far corner`).toBe(true);
  if (!paper) return;
  for (const [x, y] of [[box.x - 2, box.y + box.h / 2], [box.x + box.w + 2, box.y + box.h / 2], [box.x + box.w / 2, box.y - 2], [box.x + box.w / 2, box.y + box.h + 2]]) {
    expect(near(at(x!, y!), [255, 255, 255], 20), `${label} paper at ${x},${y}: ${at(x!, y!)}`).toBe(true);
  }
}

function expectBlank(at: (x: number, y: number) => number[], box: { x: number; y: number; w: number; h: number }, label: string): void {
  expect(near(at(box.x + box.w / 2, box.y + box.h / 2), [255, 255, 255], 20), label).toBe(true);
}

test('PNG on page 1: lower right by default, upright, page count kept, {base}_서명.pdf; the controller is not loaded with the page', async ({ page, network }) => {
  await gotoReady(page, '/pdf-sign/');
  expect(network.requests.some((r) => /\/_astro\/controller\./.test(r.url())), 'no controller before use').toBe(false);
  await page.setInputFiles('#sg-input', THREE);
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#sg-run')).toBeDisabled();
  await expect(page.locator('#sg-hint')).toHaveText('서명·도장 그림을 골라 주세요.');
  await expect(page.locator('#sg-page-count')).toContainText('/ 3쪽');
  await pickImage(page);
  await expect(page.locator('.sign-box')).toBeFocused();
  await expect(page.locator('#sg-hint')).toHaveText('1쪽에 그림 1개를 넣어 저장합니다.');
  await expect(page.locator('#sg-size-out')).toHaveText('쪽 너비의 25%');
  const { name, bytes } = await save(page);
  expect(name).toBe('three_서명.pdf');
  const seen = await pagesSeen(bytes);
  expect(seen).toHaveLength(3);
  const box = startBox(600, 800);
  expectStamp(seen[0]!, box, 'page 1');
  expectBlank(seen[1]!, box, 'page 2');
  expectBlank(seen[2]!, box, 'page 3');
  await expect(page.locator('#sg-summary')).toContainText('1쪽에 그림을 넣었습니다');
  await expect(page.locator('#sg-notes')).toBeHidden();
});

test('arrow keys move the picture 1 pt, Shift 10 pt; 모든 쪽 puts it on every page; 쪽 범위 on the listed pages', async ({ page }) => {
  await open(page, THREE);
  await pickImage(page);
  const b = page.locator('.sign-box');
  await b.focus();
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowLeft');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowUp');
  await page.locator('label.chip', { hasText: '모든 쪽' }).click();
  await expect(page.locator('#sg-hint')).toHaveText('3쪽에 그림 3개를 넣어 저장합니다.');
  const moved = { ...startBox(600, 800) };
  moved.x -= 20;
  moved.y -= 5;
  let seen = await pagesSeen((await save(page)).bytes);
  for (const [i, at] of seen.entries()) expectStamp(at, moved, `모든 쪽, page ${i + 1}`);

  await page.locator('#sg-again').click();
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'ready');
  await page.locator('.sign-box').click();
  await page.locator('label.chip', { hasText: '쪽 범위' }).click();
  await expect(page.locator('#sg-range')).toBeFocused();
  await page.locator('#sg-range').fill('9');
  await expect(page.locator('#sg-range-error')).toHaveText('이 PDF는 3쪽까지입니다. 1부터 3 사이의 쪽 번호를 입력해 주세요.');
  await expect(page.locator('#sg-run')).toBeDisabled();
  await page.locator('#sg-range').fill('2-3');
  await expect(page.locator('#sg-hint')).toHaveText('2쪽에 그림 2개를 넣어 저장합니다.');
  seen = await pagesSeen((await save(page)).bytes);
  expectBlank(seen[0]!, moved, 'range, page 1');
  expectStamp(seen[1]!, moved, 'range, page 2');
  expectStamp(seen[2]!, moved, 'range, page 3');
});

for (const [label, file, w, h] of [
  ['/Rotate 90', ROT90, 800, 600],
  ['/Rotate 270 with a CropBox at (36,36)', CROP270, 700, 500],
] as const) {
  test(`${label}: the picture sits where it was placed, upright as seen`, async ({ page }) => {
    await open(page, file);
    await pickImage(page);
    const seen = await pagesSeen((await save(page)).bytes);
    expectStamp(seen[0]!, startBox(w, h), label);
  });
}

test('pointer drag moves the picture; the corner handle and the size slider resize it; 이 그림 빼기 / 그림 하나 더 넣기', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mouse drag; the keyboard path covers phones.');
  await open(page, THREE);
  await pickImage(page);
  const b = page.locator('.sign-box');
  // The mouse does not scroll: the stage must be on screen, with room above the picture for the drag.
  await page.locator('#sg-stage').evaluate((e) => e.scrollIntoView({ block: 'end', behavior: 'instant' }));
  // The move is measured on the page preview, not the window. CI Firefox read r1.y - r0.y = -119 on all three tries
  // while x was exact: a vertical-only 1 px shift of the whole stage in the window, not the drag, whose offset is
  // pointer delta / scale (not reproduced on Windows or WSL Firefox).
  const onStage = async () => {
    const [box, stage] = await Promise.all([b.boundingBox(), page.locator('#sg-stage').boundingBox()]);
    return { x: box!.x - stage!.x, y: box!.y - stage!.y };
  };
  const r0 = (await b.boundingBox())!;
  const s0 = await onStage();
  await page.mouse.move(r0.x + r0.width / 2, r0.y + r0.height / 2);
  await page.mouse.down();
  await page.mouse.move(r0.x + r0.width / 2 - 80, r0.y + r0.height / 2 - 120, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('#sg-status')).toHaveText('그림을 옮겼습니다.');
  const s1 = await onStage();
  expect(Math.round(s1.x - s0.x)).toBe(-80);
  expect(Math.round(s1.y - s0.y)).toBe(-120);
  const r1 = (await b.boundingBox())!;
  const h = (await page.locator('.sign-handle').boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 40, h.y + h.height / 2, { steps: 4 });
  await page.mouse.up();
  const r2 = (await b.boundingBox())!;
  expect(r2.width).toBeGreaterThan(r1.width + 30);
  expect(r2.height / r2.width).toBeCloseTo(0.5, 1);
  await page.locator('#sg-size').fill('50');
  await expect(page.locator('#sg-size-out')).toHaveText('쪽 너비의 50%');
  await page.locator('#sg-add').click();
  await expect(page.locator('.sign-box')).toHaveCount(2);
  await expect(page.locator('#sg-hint')).toHaveText('1쪽에 그림 2개를 넣어 저장합니다.');
  await page.locator('#sg-remove').click();
  await expect(page.locator('.sign-box')).toHaveCount(1);
  await expect(page.locator('#sg-add')).toBeFocused();
});

test('page navigation: the picture made on page 1 stays there; 다음 쪽 shows page 2 without it', async ({ page }) => {
  await open(page, THREE);
  await pickImage(page);
  await page.locator('#sg-next').click();
  await expect(page.locator('#sg-goto')).toHaveValue('2');
  await expect(page.locator('.sign-box')).toHaveCount(0);
  await expect(page.locator('#sg-add')).toHaveText('이 쪽에 그림 넣기');
  await page.locator('#sg-goto').fill('1');
  await page.locator('#sg-goto').press('Enter');
  await expect(page.locator('.sign-box')).toHaveCount(1);
  await expect(page.locator('#sg-prev')).toBeDisabled();
});

test('mixed page sizes: looking at a smaller page never moves a 모든 쪽 picture on the larger one (round 2)', async ({ page }) => {
  await open(page, MIXED);
  await pickImage(page);
  await page.locator('label.chip', { hasText: '모든 쪽' }).click();
  // Position and size relative to the page picture (the preview scale may change when a scroll bar appears). Read from
  // the stage in one step: a redraw replaces the box, and a box resolved before it has no parent (CI chromium flake).
  const rel = () => page.locator('#sg-stage').evaluate((stage) => {
    const s = stage.getBoundingClientRect();
    const r = stage.querySelector('.sign-box')!.getBoundingClientRect();
    return [r.left - s.left, r.top - s.top, r.width].map((v) => Math.round((v / s.width) * 1000));
  });
  await stageReady(page);
  const before = await rel();
  await page.locator('#sg-next').click();
  await expect(page.locator('#sg-goto')).toHaveValue('2');
  await expect(page.locator('.sign-box')).toHaveCount(1);
  await page.locator('#sg-prev').click();
  await expect(page.locator('#sg-goto')).toHaveValue('1');
  await expect.poll(rel).toEqual(before);
  const seen = await pagesSeen((await save(page)).bytes);
  expectStamp(seen[0]!, startBox(600, 800), 'large page');
  // The 150 × 75 box clamped into the 200 × 300 page: pushed left and up to its lower right corner.
  // (It touches the page's right and bottom edges, so there is no paper outside to check.)
  expectStamp(seen[1]!, { x: 50, y: 225, w: 150, h: 75 }, 'small page', false);
});

test('mixed page sizes: on the smaller page the first arrow key and the size slider act on the box as shown (round 3)', async ({ page }) => {
  await open(page, MIXED);
  await pickImage(page);
  await page.locator('label.chip', { hasText: '모든 쪽' }).click();
  await page.locator('#sg-next').click();
  await expect(page.locator('#sg-goto')).toHaveValue('2');
  await stageReady(page);
  const box = page.locator('.sign-box');
  // The shared 150 × 75 box shows clamped at (50, 225) on the 200 × 300 page; one press left moves it to x 49.
  const pos = () => box.evaluate((b) => {
    const s = b.parentElement!.getBoundingClientRect();
    const r = b.getBoundingClientRect();
    return [((r.left - s.left) / s.width) * 200, ((r.top - s.top) / s.height) * 300, (r.width / s.width) * 200].map((v) => Math.round(v));
  });
  await expect.poll(pos).toEqual([50, 225, 150]);
  await box.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(pos).toEqual([49, 225, 150]);
  // Size slider: 50 % of this page's width from the box as shown (top-left kept).
  await page.locator('#sg-size').fill('50');
  await expect(page.locator('#sg-size-out')).toHaveText('쪽 너비의 50%');
  await expect.poll(pos).toEqual([49, 225, 100]);
  const seen = await pagesSeen((await save(page)).bytes);
  expectStamp(seen[1]!, { x: 49, y: 225, w: 100, h: 50 }, 'small page after key and slider');
});

test('encrypted PDF: password prompt, then the result says it was saved without a password and links PDF 암호 해제·설정', async ({ page }) => {
  await open(page, runtimePath('encrypted_userpw_1234'));
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'locked');
  await page.locator('#sg-pw-input').fill('1234');
  await page.locator('#sg-pw-input').press('Enter');
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#sg-info')).toHaveText(/^7쪽 · /);
  await pickImage(page);
  const { name, bytes } = await save(page);
  expect(name).toBe('encrypted_userpw_1234_서명.pdf');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  expect(doc.isEncrypted).toBe(false);
  expect(doc.getPageCount()).toBe(7);
  await expect(page.locator('#sg-notes')).toHaveText('암호 없이 저장했습니다. 다시 걸려면 PDF 암호 해제·설정을 쓰세요.');
  await expect(page.locator('#sg-notes a')).toHaveAttribute('href', '/pdf-password/');
});

test('signed PDF: the result warns that the signature is no longer valid; a picture that is not an image gets a message', async ({ page }) => {
  await open(page, runtimePath('signed_fake'));
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'ready');
  await page.setInputFiles('#sg-image-input', NOT_IMAGE);
  await expect(page.locator('#sg-error')).toHaveText('사진 파일이 아닙니다. JPG·PNG·WebP 파일을 선택해 주세요.');
  await expect(page.locator('.sign-box')).toHaveCount(0);
  await pickImage(page);
  await save(page);
  await expect(page.locator('#sg-notes')).toContainText('전자서명이 들어 있는 문서입니다. 그림을 넣어 새로 저장하면 전자서명이 더 이상 유효하지 않습니다.');
});

test('from /stamp-signature/: 「PDF에 넣기」 opens this page with the drawn signature, read once', async ({ page }) => {
  await gotoReady(page, '/stamp-signature/');
  await page.getByRole('tab', { name: '직접 그리기' }).click();
  const pad = (await page.locator('#ss-pad').boundingBox())!;
  await page.mouse.move(pad.x + 30, pad.y + 40);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(pad.x + 30 + i * 20, pad.y + 40 + (i % 2 ? 20 : -10));
  await page.mouse.up();
  await expect(page.locator('#ss-pad-to-pdf')).toBeEnabled();
  await Promise.all([page.waitForURL('**/pdf-sign/'), page.locator('#ss-pad-to-pdf').click()]);
  await expect(page.locator('#sg-notice')).toHaveText('전자서명·도장 이미지 만들기에서 만든 그림을 가져왔습니다. 이제 PDF 파일을 고르세요.');
  expect(await page.evaluate(() => sessionStorage.getItem('docttak:sign-png'))).toBeNull();
  await page.setInputFiles('#sg-input', THREE);
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#sg-image-info')).toHaveText('전자서명·도장 이미지 만들기에서 가져온 그림');
  await expect(page.locator('.sign-box')).toHaveCount(1);
  await expect(page.locator('#sg-run')).toBeEnabled();
  const doc = await PDFDocument.load((await save(page)).bytes, { updateMetadata: false });
  expect(doc.getPageCount()).toBe(3);
  // Read once: a reload starts without the picture.
  await page.reload();
  await page.setInputFiles('#sg-input', THREE);
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#sg-hint')).toHaveText('서명·도장 그림을 골라 주세요.');
});

test('axe: the editor with a picture and the result have no serious or critical violations', async ({ page }) => {
  const serious = async () =>
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ') + ' ' + n.failureSummary).join(' | ')}`);
  await open(page, THREE);
  await pickImage(page);
  await page.locator('label.chip', { hasText: '쪽 범위' }).click();
  await page.locator('#sg-range').fill('9');
  // The focused field is not under the actions bar (sticky at phone widths; scroll-padding-bottom keeps it clear).
  const field = (await page.locator('#sg-range').boundingBox())!;
  expect(field.y + field.height).toBeLessThanOrEqual((await page.locator('#sg-actions').boundingBox())!.y + 1);
  expect(await serious()).toEqual([]);
  await page.locator('#sg-range').fill('1');
  await save(page);
  expect(await serious()).toEqual([]);
});
