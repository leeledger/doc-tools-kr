// 신분증 사본 만들기 (TOOLS1015 I1): box geometry, crop/turn mapping, the watermark grid, dates and fixed names, and the one
// drawing pass on @napi-rs/canvas (photo -> black boxes -> watermark; the boxes leave no photo pixel; the PDF request
// carries only the copy's JPEG).
import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { LIMITS as IMG_JPG_LIMITS } from '../../src/tools/image-to-jpg/limits';
import { DECODE_EDGE, LIMITS } from '../../src/tools/id-copy/limits';
import {
  MAX_MASKS,
  clampRect,
  coverPixels,
  drawCopy,
  fullRect,
  minEdge,
  moveRect,
  nextRotation,
  pdfRequest,
  resizeRect,
  startMask,
  turnRect,
  turnedSize,
  type CopyPlan,
  type DrawCtx,
  type Rect,
  type Rotation,
} from '../../src/tools/id-copy/mask';
import { MARK_ANGLE, PLACE_MAX, cleanPlace, copyName, markDate, markFontPx, markLines, tileGrid } from '../../src/tools/id-copy/watermark';

const B: Rect = { x: 0, y: 0, w: 400, h: 250 };

describe('boxes', () => {
  it('clampRect keeps a box inside, at least the minimum, never larger than the bounds', () => {
    expect(clampRect({ x: -10, y: 300, w: 50, h: 20 }, B, 8)).toEqual({ x: 0, y: 230, w: 50, h: 20 });
    expect(clampRect({ x: 10, y: 10, w: 2, h: 1 }, B, 8)).toEqual({ x: 10, y: 10, w: 8, h: 8 });
    expect(clampRect({ x: 0, y: 0, w: 900, h: 900 }, B, 8)).toEqual(B);
    expect(clampRect({ x: Number.NaN, y: 5, w: Number.POSITIVE_INFINITY, h: 5 }, B, 8)).toEqual({ x: 0, y: 5, w: 400, h: 8 });
    // Bounds with an offset (the crop).
    const crop = { x: 100, y: 50, w: 200, h: 100 };
    expect(clampRect({ x: 0, y: 0, w: 40, h: 40 }, crop, 8)).toEqual({ x: 100, y: 50, w: 40, h: 40 });
  });

  it('moveRect and resizeRect stay inside; resize keeps the top-left corner and any shape', () => {
    expect(moveRect({ x: 380, y: 0, w: 40, h: 20 }, 50, -5, B, 8)).toEqual({ x: 360, y: 0, w: 40, h: 20 });
    expect(resizeRect({ x: 10, y: 20, w: 40, h: 20 }, 100, 5, B, 8)).toEqual({ x: 10, y: 20, w: 100, h: 8 });
    expect(resizeRect({ x: 300, y: 200, w: 40, h: 20 }, 500, 500, B, 8)).toEqual({ x: 300, y: 200, w: 100, h: 50 });
    expect(resizeRect({ x: 10, y: 20, w: 40, h: 20 }, -50, -50, B, 8)).toEqual({ x: 10, y: 20, w: 8, h: 8 });
  });

  it('startMask: inside the view, a strip in the middle, the next ones lower; at most MAX_MASKS (20)', () => {
    expect(MAX_MASKS).toBe(20);
    const view = { x: 40, y: 30, w: 300, h: 200 };
    const first = startMask(view, 0, 8);
    expect(first).toEqual({ x: 130, y: 118, w: 120, h: 24 });
    const second = startMask(view, 1, 8);
    expect(second.y).toBeGreaterThan(first.y);
    for (let i = 0; i < MAX_MASKS; i++) {
      const r = startMask(view, i, 8);
      expect(r.x).toBeGreaterThanOrEqual(view.x);
      expect(r.y + r.h).toBeLessThanOrEqual(view.y + view.h);
    }
  });

  it('minEdge: 2 % of the long edge, at least 4 pixels', () => {
    expect(minEdge(2000, 1260)).toBe(40);
    expect(minEdge(100, 60)).toBe(4);
  });

  it('coverPixels widens a box to whole output pixels', () => {
    expect(coverPixels({ x: 10.4, y: 5.6, w: 20.2, h: 3.1 }, 1)).toEqual({ x: 10, y: 5, w: 21, h: 4 });
    expect(coverPixels({ x: 10, y: 10, w: 10, h: 10 }, 0.5)).toEqual({ x: 5, y: 5, w: 5, h: 5 });
  });
});

describe('crop and turn mapping', () => {
  it('a quarter turn swaps the sides; four turns are the identity for the crop and the boxes', () => {
    expect(turnedSize(400, 250, 90)).toEqual({ w: 250, h: 400 });
    expect(turnedSize(400, 250, 180)).toEqual({ w: 400, h: 250 });
    expect(nextRotation(270)).toBe(0);
    const r = { x: 30, y: 40, w: 100, h: 20 };
    // 400 × 250 -> 250 × 400: the top-left corner (30, 40) goes to (250 - 40 - 20, 30).
    expect(turnRect(r, 250)).toEqual({ x: 190, y: 30, w: 20, h: 100 });
    let x = r;
    let w = 400;
    let h = 250;
    for (let i = 0; i < 4; i++) {
      x = turnRect(x, h);
      [w, h] = [h, w];
    }
    expect(x).toEqual(r);
    expect([w, h]).toEqual([400, 250]);
  });
});

describe('watermark', () => {
  const now = new Date(2026, 9, 5, 23, 59);

  it('lines: 「{place} 제출용」, 다른 용도 사용 금지, the local date (optional); none while empty', () => {
    expect(markLines('  회사  ', true, now)).toEqual(['회사 제출용', '다른 용도 사용 금지', '2026.10.05']);
    expect(markLines('은행 제출용', false, now)).toEqual(['은행 제출용', '다른 용도 사용 금지']);
    expect(markLines('   ', true, now)).toEqual([]);
    expect([...cleanPlace('가'.repeat(50))]).toHaveLength(PLACE_MAX);
    expect(markDate(new Date(2027, 0, 1))).toBe('2027.01.01');
  });

  it('font size follows the short edge, at least 10', () => {
    expect(markFontPx(2000, 1260)).toBe(57);
    expect(markFontPx(100, 80)).toBe(10);
  });

  it('the turned grid covers every corner of the canvas (3 shapes): each corner lies in some block cell', () => {
    const a = (MARK_ANGLE * Math.PI) / 180;
    for (const [w, h] of [[2000, 1260], [1260, 2000], [800, 800]] as const) {
      const sx = 600;
      const sy = 260;
      const grid = tileGrid(w, h, sx, sy, MARK_ANGLE);
      for (const [px, py] of [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2], [0, 0]]) {
        // Canvas point -> the grid's frame (the grid is drawn turned by `a`).
        const gx = px * Math.cos(-a) - py * Math.sin(-a);
        const gy = px * Math.sin(-a) + py * Math.cos(-a);
        expect(grid.some((c) => Math.abs(c.x - gx) <= sx / 2 && Math.abs(c.y - gy) <= sy / 2), `${w}×${h} (${px}, ${py})`).toBe(true);
      }
    }
  });
});

describe('names and limits', () => {
  it('fixed names with the local date, never the picked file name', () => {
    const d = new Date(2026, 9, 15, 0, 1);
    expect(copyName(d, 'jpg')).toBe('신분증_사본_20261015.jpg');
    expect(copyName(d, 'pdf')).toBe('신분증_사본_20261015.pdf');
  });

  it('limits are the 사진 JPG 변환 single-photo numbers; decode at most 2,000 on the long side', () => {
    expect(LIMITS.desktop.maxFileBytes).toBe(IMG_JPG_LIMITS.desktop.maxFileBytes);
    expect(LIMITS.mobile.maxFileBytes).toBe(IMG_JPG_LIMITS.mobile.maxFileBytes);
    expect(DECODE_EDGE).toBe(2000);
  });

  it('the PDF request carries the copy itself, upright, on A4 portrait (no second source)', () => {
    const jpeg = new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' });
    const req = pdfRequest(jpeg, 8192);
    expect(req.items).toHaveLength(1);
    expect(req.items[0]!.file).toBe(jpeg);
    expect(req.items[0]!.rotation).toBe(0);
    expect(req).toMatchObject({ type: 'build', layout: { page: 'a4', orient: 'portrait', marginMm: 10 }, size: 'original', maxEdge: 8192 });
  });
});

describe('drawCopy (one pass, @napi-rs/canvas)', () => {
  // A 200 × 100 photo: left half red, right half blue.
  const photo = () => {
    const c = createCanvas(200, 100);
    const g = c.getContext('2d');
    g.fillStyle = '#ff0000';
    g.fillRect(0, 0, 100, 100);
    g.fillStyle = '#0000ff';
    g.fillRect(100, 0, 100, 100);
    return c;
  };
  const render = (plan: CopyPlan, scale = 1) => {
    const w = Math.round(plan.crop.w * scale);
    const h = Math.round(plan.crop.h * scale);
    const c = createCanvas(w, h);
    const g = c.getContext('2d');
    drawCopy(g as unknown as DrawCtx, plan, scale, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    return { w, h, at: (x: number, y: number) => Array.from(d.subarray((y * w + x) * 4, (y * w + x) * 4 + 3)) };
  };
  const base = (over: Partial<CopyPlan> = {}): CopyPlan => ({ src: photo(), srcW: 200, srcH: 100, rotation: 0, crop: fullRect(200, 100), masks: [], mark: [], ...over });
  const near = (got: number[], want: number[], tol = 12) => got.every((v, i) => Math.abs(v - want[i]!) <= tol);

  it('the photo as is, then a box: every pixel under it is black', () => {
    const out = render(base({ masks: [{ x: 20.5, y: 10.5, w: 40, h: 30 }] }));
    expect(near(out.at(5, 50), [255, 0, 0])).toBe(true);
    expect(near(out.at(150, 50), [0, 0, 255])).toBe(true);
    for (const [x, y] of [[20, 10], [40, 25], [60, 40]]) expect(out.at(x, y), `${x},${y}`).toEqual([0, 0, 0]);
  });

  it('turned a quarter: the red half is on top; crop: only the kept part, boxes in the turned photo', () => {
    const turned = render(base({ rotation: 90 as Rotation, crop: fullRect(100, 200) }));
    expect([turned.w, turned.h]).toEqual([100, 200]);
    expect(near(turned.at(50, 20), [255, 0, 0])).toBe(true);
    expect(near(turned.at(50, 180), [0, 0, 255])).toBe(true);
    const cropped = render(base({ crop: { x: 100, y: 0, w: 100, h: 100 }, masks: [{ x: 150, y: 0, w: 50, h: 100 }] }));
    expect([cropped.w, cropped.h]).toEqual([100, 100]);
    expect(near(cropped.at(10, 50), [0, 0, 255])).toBe(true);
    expect(cropped.at(80, 50)).toEqual([0, 0, 0]);
  });

  it('scaled output: boxes still cover whole pixels', () => {
    const out = render(base({ masks: [{ x: 33, y: 33, w: 33, h: 33 }] }), 0.37);
    const p = coverPixels({ x: 33, y: 33, w: 33, h: 33 }, 0.37);
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) expect(out.at(x, y)).toEqual([0, 0, 0]);
  });

  it('the watermark goes over everything, last: tile area pixels change, a box stays dark', () => {
    const plain = render(base({ crop: fullRect(200, 100), masks: [{ x: 0, y: 0, w: 200, h: 100 }] }));
    const marked = render(base({ crop: fullRect(200, 100), masks: [{ x: 0, y: 0, w: 200, h: 100 }], mark: ['회사 제출용', '다른 용도 사용 금지', '2026.10.15'] }));
    let changed = 0;
    let brightest = 0;
    for (let y = 0; y < 100; y++)
      for (let x = 0; x < 200; x++) {
        const a = plain.at(x, y);
        const b = marked.at(x, y);
        if (a.some((v, i) => v !== b[i])) changed++;
        brightest = Math.max(brightest, ...b);
      }
    expect(changed).toBeGreaterThan(50);
    // Grey at 35 % over black: never close to the photo's colours.
    expect(brightest).toBeLessThan(60);
  });
});
