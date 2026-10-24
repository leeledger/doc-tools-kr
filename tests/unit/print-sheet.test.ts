// 인화용 모아찍기 (brief handoff/ARCHITECT-BRIEF-PRINT1023.md, Step B test map): the pure layout, renderOutput's scale,
// the sheet builder with fake and real surfaces, the copy and the usage whitelist.
import { createCanvas } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DOWNLOAD_SETTING, SETTINGS, SHEET_PRESETS, validate } from '../../scripts/lib/usage.mjs';
import { stripComments } from '../../scripts/lib/ui-font-chars.mjs';
import { PRESETS, customPreset, getPreset, type IdPreset } from '../../src/data/id-photo-presets';
import { SHEET_COPY } from '../../src/data/print-sheet';
import type { CropState } from '../../src/lib/idphoto/crop';
import { verifyOutput, encodeIdPhoto } from '../../src/lib/idphoto/encode';
import { readJfif } from '../../src/lib/image/jfif';
import { sniffImage } from '../../src/lib/image/sniff';
import { drawCrop, renderOutput } from '../../src/lib/idphoto/render';
import { OUTLINE, SHEET_GAP, SHEET_MARGIN, sheetPlan, sheetUpscales, tileSize, type Rect, type SheetPlan } from '../../src/lib/idphoto/sheet';
import { buildSheet, composeSheet, type SheetCanvas, type SheetDeps } from '../../src/tools/id-photo/sheet-build';
import { buildPayload } from '../../src/lib/ui/usage';
import { nodeCodecs } from '../helpers/photo-deps';

const preset = (id: string): IdPreset => getPreset(id)!;
const withMm = PRESETS.filter((p) => p.mm);

const EXPECTED: Record<string, { tile: [number, number]; n: number; orientation: 'landscape' | 'portrait' }> = {
  passport_online: { tile: [413, 531], n: 8, orientation: 'landscape' },
  id_card: { tile: [413, 531], n: 8, orientation: 'landscape' },
  driver_license: { tile: [413, 531], n: 8, orientation: 'landscape' },
  jlpt: { tile: [413, 531], n: 8, orientation: 'landscape' },
  gosi: { tile: [411, 531], n: 8, orientation: 'landscape' },
  kuksiwon: { tile: [413, 530], n: 8, orientation: 'landscape' },
  police: { tile: [354, 472], n: 9, orientation: 'portrait' },
  half_card: { tile: [354, 472], n: 9, orientation: 'portrait' },
  hanja: { tile: [350, 472], n: 9, orientation: 'portrait' },
};

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('sheetPlan (P1-P5)', () => {
  it('covers exactly the presets with a paper size', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(withMm.map((p) => p.id).sort());
  });

  it.each(Object.entries(EXPECTED))('%s: tile and count', (id, e) => {
    const plan = sheetPlan(preset(id))!;
    expect([plan.tile.w, plan.tile.h]).toEqual(e.tile);
    expect(plan.n).toBe(e.n);
    expect(plan.rects).toHaveLength(e.n);
    expect(plan.orientation).toBe(e.orientation);
    expect(plan.orientation === 'landscape' ? [plan.W, plan.H] : [plan.H, plan.W]).toEqual([1800, 1200]);
  });

  it('no paper size, no sheet: the presets without mm and 직접 입력', () => {
    for (const p of PRESETS.filter((x) => !x.mm)) {
      expect(tileSize(p), p.id).toBeNull();
      expect(sheetPlan(p), p.id).toBeNull();
    }
    expect(sheetPlan(customPreset(413, 531, null)!)).toBeNull();
    expect(sheetPlan({ ...customPreset(413, 531, null)!, mm: { w: 35, h: 45 } })).toBeNull();
  });

  it.each(withMm.map((p) => [p.id, p] as const))('%s: inside the margins, gaps kept, centred, outlines only in the gaps', (_id, p) => {
    const plan = sheetPlan(p)!;
    for (const r of plan.rects) {
      expect(r.x).toBeGreaterThanOrEqual(SHEET_MARGIN);
      expect(r.y).toBeGreaterThanOrEqual(SHEET_MARGIN);
      expect(r.x + r.w).toBeLessThanOrEqual(plan.W - SHEET_MARGIN);
      expect(r.y + r.h).toBeLessThanOrEqual(plan.H - SHEET_MARGIN);
    }
    for (let i = 0; i < plan.rects.length; i++) {
      for (let j = i + 1; j < plan.rects.length; j++) {
        const a = plan.rects[i]!;
        const b = plan.rects[j]!;
        const gap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
        expect(gap).toBeGreaterThanOrEqual(SHEET_GAP);
      }
    }
    const left = Math.min(...plan.rects.map((r) => r.x));
    const right = plan.W - Math.max(...plan.rects.map((r) => r.x + r.w));
    const top = Math.min(...plan.rects.map((r) => r.y));
    const bottom = plan.H - Math.max(...plan.rects.map((r) => r.y + r.h));
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    expect(Math.abs(top - bottom)).toBeLessThanOrEqual(1);
    // Each outline is a ring OUTLINE px wide around its own tile, touching no other tile, with white between neighbours.
    plan.outlines.forEach((o, i) => {
      const r = plan.rects[i]!;
      expect(o).toEqual({ x: r.x - OUTLINE, y: r.y - OUTLINE, w: r.w + 2 * OUTLINE, h: r.h + 2 * OUTLINE });
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.y).toBeGreaterThanOrEqual(0);
      plan.rects.forEach((other, j) => {
        if (j !== i) expect(overlaps(o, other)).toBe(false);
      });
      plan.outlines.forEach((other, j) => {
        if (j !== i) expect(overlaps(o, other)).toBe(false);
      });
    });
  });

  it('orientation: the larger count wins and a tie goes portrait', () => {
    // A square tile fits the same count either way.
    const square: IdPreset = { ...preset('passport_online'), outW: 413, outH: 413, mm: { w: 35, h: 35 } };
    const plan = sheetPlan(square)!;
    expect(plan.orientation).toBe('portrait');
    expect(plan.n).toBe(8);
  });

  it('upscale note: crop scale × k above 1 only', () => {
    const gosi = sheetPlan(preset('gosi'))!;
    expect(sheetUpscales(0.3, gosi)).toBe(false);
    expect(sheetUpscales(0.34, gosi)).toBe(true);
    const passport = sheetPlan(preset('passport_online'))!;
    expect(sheetUpscales(1, passport)).toBe(false);
    expect(sheetUpscales(1.01, passport)).toBe(true);
  });
});

/** renderOutput in Node: @napi-rs/canvas stands in for OffscreenCanvas. */
describe('renderOutput scale (P3, P8)', () => {
  const g = globalThis as { OffscreenCanvas?: unknown };
  const had = g.OffscreenCanvas;
  afterEach(() => {
    g.OffscreenCanvas = had;
  });

  function source(): ImageBitmap {
    const c = createCanvas(600, 800);
    const x = c.getContext('2d');
    for (let y = 0; y < 800; y += 20) {
      for (let i = 0; i < 600; i += 20) {
        x.fillStyle = `rgb(${(i * 7) % 256},${(y * 3) % 256},${(i + y) % 256})`;
        x.fillRect(i, y, 20, 20);
      }
    }
    return c as unknown as ImageBitmap;
  }
  const st: CropState = { cx: 300, cy: 400, s: 0.6, rotDeg: 2 };

  it('scale omitted = scale 1 = the drawCrop pixels of today; scale k = round(outW·k) × round(outH·k), opaque', async () => {
    g.OffscreenCanvas = class {
      constructor(w: number, h: number) {
        return createCanvas(w, h);
      }
    };
    const bmp = source();
    const a = await renderOutput(bmp, st, 137, 177);
    const b = await renderOutput(bmp, st, 137, 177, 1);
    const ref = createCanvas(137, 177);
    const rc = ref.getContext('2d');
    drawCrop(rc as never, bmp, 600, 800, st, 137, 177);
    const today = rc.getImageData(0, 0, 137, 177);
    expect([a.width, a.height]).toEqual([137, 177]);
    expect(Buffer.from(a.data).equals(Buffer.from(today.data))).toBe(true);
    expect(Buffer.from(b.data).equals(Buffer.from(today.data))).toBe(true);
    const k = tileSize(preset('gosi'))!.k;
    const big = await renderOutput(bmp, st, 137, 177, k);
    expect([big.width, big.height]).toEqual([Math.round(137 * k), Math.round(177 * k)]);
    for (let i = 3; i < big.data.length; i += 4) if (big.data[i] !== 255) throw new Error(`transparent pixel at ${(i - 3) / 4}`);
  });
});

/** A 2D context over a plain RGBA buffer: the four calls composeSheet makes. */
function fakeCanvas(log: { zeroed: number }): SheetDeps['canvas'] {
  return (w, h) => {
    const data = new Uint8ClampedArray(w * h * 4);
    let fill = [0, 0, 0];
    const ctx = {
      set fillStyle(v: string) {
        fill = v === '#fff' ? [255, 255, 255] : v === '#999' ? [0x99, 0x99, 0x99] : [1, 2, 3];
      },
      fillRect(x: number, y: number, rw: number, rh: number) {
        for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) data.set([...fill, 255], (j * w + i) * 4);
      },
      putImageData(img: ImageData, x: number, y: number) {
        for (let j = 0; j < img.height; j++) data.set(img.data.subarray(j * img.width * 4, (j + 1) * img.width * 4), ((y + j) * w + x) * 4);
      },
      getImageData(x: number, y: number, gw: number, gh: number) {
        expect([x, y, gw, gh]).toEqual([0, 0, w, h]);
        return new ImageData(data.slice(), w, h);
      },
    };
    const c = {
      width: w,
      height: h,
      getContext: () => ctx,
    };
    return new Proxy(c, {
      set(t, k, v) {
        if ((k === 'width' || k === 'height') && v === 0) log.zeroed++;
        return Reflect.set(t, k, v);
      },
    }) as unknown as SheetCanvas;
  };
}

function solidTile(plan: SheetPlan, rgb: [number, number, number]): ImageData {
  const img = new ImageData(plan.tile.w, plan.tile.h);
  for (let i = 0; i < img.data.length; i += 4) img.data.set([...rgb, 255], i);
  return img;
}

const px = (img: ImageData, x: number, y: number): number[] => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)];

describe('sheet builder (P5, P8)', () => {
  const st: CropState = { cx: 0, cy: 0, s: 1, rotDeg: 0 };
  const bmp = {} as ImageBitmap;

  it('composes white, grey outlines and the tile at every place; the canvas is zeroed', () => {
    const plan = sheetPlan(preset('passport_online'))!;
    const log = { zeroed: 0 };
    const out = composeSheet(plan, solidTile(plan, [10, 120, 200]), fakeCanvas(log));
    expect([out.width, out.height]).toEqual([1800, 1200]);
    for (const r of plan.rects) expect(px(out, r.x + (r.w >> 1), r.y + (r.h >> 1))).toEqual([10, 120, 200]);
    const r0 = plan.rects[0]!;
    expect(px(out, r0.x - 1, r0.y + 10)).toEqual([0x99, 0x99, 0x99]);
    expect(px(out, r0.x - OUTLINE - 1, r0.y + 10)).toEqual([255, 255, 255]);
    expect(px(out, 2, 2)).toEqual([255, 255, 255]);
    expect(log.zeroed).toBe(2);
  });

  it('a failing surface (no 2d context, render or encode throwing) is an error result, never a throw', async () => {
    const pass = preset('passport_online');
    const plan = sheetPlan(pass)!;
    const ok: SheetDeps = {
      render: async () => solidTile(plan, [1, 2, 3]),
      canvas: fakeCanvas({ zeroed: 0 }),
      encode: async () => new Uint8Array([1]),
    };
    let zeroed = 0;
    const noCtx: SheetDeps['canvas'] = () =>
      new Proxy({ width: 1, height: 1, getContext: () => null } as SheetCanvas, {
        set(t, k, v) {
          if (v === 0) zeroed++;
          return Reflect.set(t, k, v);
        },
      });
    expect(await buildSheet(bmp, st, pass, { ...ok, canvas: noCtx })).toEqual({ ok: false });
    expect(zeroed).toBe(2);
    expect(await buildSheet(bmp, st, pass, { ...ok, render: () => Promise.reject(new Error('oom')) })).toEqual({ ok: false });
    expect(await buildSheet(bmp, st, pass, { ...ok, encode: () => Promise.reject(new Error('engine')) })).toEqual({ ok: false });
    // A tile of the wrong size never reaches the sheet.
    expect(await buildSheet(bmp, st, pass, { ...ok, render: async () => new ImageData(10, 10) })).toEqual({ ok: false });
    // No paper size: refused before anything runs.
    expect(await buildSheet(bmp, st, preset('saramin'), { ...ok, render: () => Promise.reject(new Error('must not run')) })).toEqual({ ok: false });
  });

  it('success: the render gets the sheet scale, the encoder the W×H pixels at 300 dpi', async () => {
    const pass = preset('gosi');
    const plan = sheetPlan(pass)!;
    const calls: unknown[] = [];
    const r = await buildSheet(bmp, st, pass, {
      render: async (_b, _s, w, h, scale) => {
        calls.push([w, h, scale]);
        return solidTile(plan, [9, 9, 9]);
      },
      canvas: fakeCanvas({ zeroed: 0 }),
      encode: async (pixels, spec) => {
        calls.push([pixels.width, pixels.height, spec]);
        return new Uint8Array([7]);
      },
    });
    expect(r).toMatchObject({ ok: true, bytes: new Uint8Array([7]) });
    expect(calls).toEqual([
      [137, 177, plan.tile.k],
      [1800, 1200, { outW: 1800, outH: 1200, dpi: 300 }],
    ]);
  });

  it('real MozJPEG: a 1800×1200 sheet passes verifyOutput at 300 dpi (no size limit)', async () => {
    const c = await nodeCodecs();
    const plan = sheetPlan(preset('passport_online'))!;
    const src = await c.decodeJpeg(new Uint8Array(readFileSync(join(__dirname, '..', 'fixtures', 'photo', 'portrait_pd.jpg'))));
    const tile = await c.resize(src, plan.tile.w, plan.tile.h);
    const pixels = composeSheet(plan, tile, fakeCanvas({ zeroed: 0 }));
    const spec = { outW: 1800, outH: 1200, dpi: 300 };
    const r = await encodeIdPhoto(pixels, spec, { mozjpeg: (img, q) => c.mozjpeg(img, q), canvas: () => Promise.reject(new Error('unused')) });
    expect(verifyOutput(r.bytes, spec)).toEqual([]);
    expect(r.q).toBe(95);
    expect(sniffImage(r.bytes)).toMatchObject({ format: 'jpeg', width: 1800, height: 1200 });
    expect(readJfif(r.bytes)).toMatchObject({ units: 1, x: 300, y: 300 });
  });
});

describe('SHEET_COPY (P10)', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'src', 'data', 'print-sheet.ts'), 'utf8');

  it('is stripped from the UI font sources and has no closing brace in a value', () => {
    for (const v of Object.values(SHEET_COPY)) {
      expect(v).not.toContain('}');
      expect(stripComments(src)).not.toContain(v);
    }
  });

  it('plain words only: no banned word, no pixel or dpi number, no promise', () => {
    const all = Object.values(SHEET_COPY).join('\n');
    for (const w of ['업로드', '서버', '브라우저', '키오스크', '편의점', '픽셀', 'dpi', 'px', '300', '1800', '1200', '통과', '보장']) expect(all, w).not.toContain(w);
  });
});

describe('usage: the sheet download (P12)', () => {
  const BASE = { e: 'download', t: 'id-photo', via: 'direct', d: 'desktop', b: 'dev', w: 1 };
  const body = (o: Record<string, unknown>): string => JSON.stringify(o);

  it('SETTINGS.sheet = the presets with a paper size', () => {
    expect([...SHEET_PRESETS]).toEqual(withMm.map((p) => p.id));
    expect(SETTINGS.sheet).toBe(SHEET_PRESETS);
    expect(DOWNLOAD_SETTING['id-photo' as keyof typeof DOWNLOAD_SETTING]).toBe('sheet');
  });

  it('accepts id-photo download o=sheet with a sheet preset; rejects other presets, tools and events', () => {
    expect(validate(body({ ...BASE, o: 'sheet', v: 'passport_online' }))).toMatchObject({ e: 'download', t: 'id-photo', o: 'sheet', v: 'passport_online' });
    expect(validate(body(BASE))).not.toBeNull();
    for (const v of ['saramin', 'custom', 'qnet', '']) expect(validate(body({ ...BASE, o: 'sheet', v })), v).toBeNull();
    expect(validate(body({ ...BASE, t: 'photo-compress', o: 'sheet', v: 'passport_online' }))).toBeNull();
    expect(validate(body({ ...BASE, t: 'id-photo-camera', o: 'sheet', v: 'passport_online' }))).toBeNull();
    expect(validate(body({ ...BASE, e: 'start', o: 'sheet', v: 'passport_online' }))).toBeNull();
    expect(validate(body({ ...BASE, o: 'preset', v: 'passport_online' }))).toBeNull();
  });

  it('the client payload carries o/v only for a sheet preset', () => {
    const ctx = { via: 'direct' as const, ua: '', device: 'desktop' as const, build: 'dev', w: 1 };
    expect(buildPayload({ e: 'download', t: 'id-photo', o: 'sheet', v: 'jlpt' }, ctx)).toMatchObject({ e: 'download', t: 'id-photo', o: 'sheet', v: 'jlpt' });
    const bad = buildPayload({ e: 'download', t: 'id-photo', o: 'sheet', v: 'saramin' }, ctx);
    expect(bad).not.toHaveProperty('o');
    expect(bad).not.toHaveProperty('v');
  });
});
