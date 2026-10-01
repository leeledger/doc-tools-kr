// Ink key of 전자서명·도장 이미지 (Sprint C, C1-core): every step on tiny synthetic planes, exact expectations.
import { describe, expect, it } from 'vitest';
import {
  INK,
  INK_COLORS,
  applyModeFilter,
  areaCheck,
  colorGuess,
  cropAndResize,
  cropRect,
  despeckle,
  gaussBlur,
  gaussBoxes,
  keyInk,
  maxFilter,
  minFilter,
  outputSize,
  paperLevel,
  paperWindow,
  planes,
  processInk,
  rampAlpha,
  rampFor,
  renderInk,
  resolveColor,
  sizeOptions,
  smoothEdges,
  speckMin,
  transpose,
  type Rgba,
} from '../../src/lib/ink/key';
import { createInkHandler } from '../../src/lib/ink/worker-core';

/** Seeded LCG in 0..1. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** An RGBA image filled by `px(x, y) -> [r, g, b]`. */
function image(w: number, h: number, px: (x: number, y: number) => [number, number, number]): Rgba {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      data.set([r, g, b, 255], (y * w + x) * 4);
    }
  return { data, width: w, height: h };
}

function bruteExtremum(src: Float32Array, w: number, h: number, k: number, max: boolean): Float32Array {
  const r = (k - 1) / 2;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = max ? -Infinity : Infinity;
      for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++)
        for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) m = max ? Math.max(m, src[yy * w + xx]) : Math.min(m, src[yy * w + xx]);
      out[y * w + x] = m;
    }
  return out;
}

describe('paper estimate', () => {
  it('window k = max(31, round(longEdge / 8)) | 1', () => {
    expect(paperWindow(100, 50)).toBe(31);
    expect(paperWindow(1280, 960)).toBe(161);
    expect(paperWindow(960, 1280)).toBe(161);
    expect(paperWindow(2400, 1800)).toBe(301);
    expect(paperWindow(1600, 1200)).toBe(201);
  });

  it('planes: min(R,G,B), Rec.601 luma, redness R - max(G,B)', () => {
    const p = planes(image(2, 1, (x) => (x === 0 ? [255, 51, 0] : [0, 0, 255])));
    expect(p.mn[0]).toBe(0);
    expect(p.lum[0]).toBeCloseTo(0.299 + 0.587 * 0.2, 6);
    expect(p.red[0]).toBeCloseTo(0.8, 6);
    expect(p.lum[1]).toBeCloseTo(0.114, 6);
    expect(p.red[1]).toBe(-1);
  });

  it('transpose is exact', () => {
    const src = Float32Array.from({ length: 35 * 70 }, (_, i) => i);
    const t = transpose(src, 35, 70);
    expect(t[3 * 70 + 5]).toBe(src[5 * 35 + 3]);
    expect(transpose(t, 70, 35)).toEqual(src);
  });

  it('van Herk max / min filters equal the brute force (window cut at the borders)', () => {
    const r = rand(11);
    const src = Float32Array.from({ length: 23 * 17 }, () => r());
    for (const k of [1, 3, 5, 9, 31]) {
      expect(maxFilter(src, 23, 17, k)).toEqual(bruteExtremum(src, 23, 17, k, true));
      expect(minFilter(src, 23, 17, k)).toEqual(bruteExtremum(src, 23, 17, k, false));
    }
  });

  it('3 box widths are odd and match the Gaussian variance', () => {
    // Paper sigmas (k / 3, k >= 31).
    for (const sigma of [10.333, 53.67, 100.33]) {
      const b = gaussBoxes(sigma);
      expect(b).toHaveLength(3);
      for (const w of b) expect(w % 2).toBe(1);
      const variance = b.reduce((s, w) => s + (w * w - 1) / 12, 0);
      expect(Math.abs(Math.sqrt(variance) - sigma) / sigma).toBeLessThan(0.03);
    }
  });

  it('Gaussian blur keeps a constant plane and spreads an impulse symmetrically', () => {
    const c = gaussBlur(new Float32Array(40 * 30).fill(0.7), 40, 30, 4);
    for (const v of c) expect(v).toBeCloseTo(0.7, 6);
    const imp = new Float32Array(41 * 41);
    imp[20 * 41 + 20] = 1;
    const g = gaussBlur(imp, 41, 41, 3);
    expect(g[20 * 41 + 17]).toBeCloseTo(g[20 * 41 + 23], 7);
    expect(g[17 * 41 + 20]).toBeCloseTo(g[20 * 41 + 17], 7);
    expect(g.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
  });

  it('paper level ignores thin ink and follows a shadow step (closing, then Gaussian)', () => {
    const w = 64;
    const h = 48;
    const x = new Float32Array(w * h).fill(0.9);
    for (let y = 10; y < 40; y++) x[y * w + 30] = 0.1; // a 1 px ink stroke
    for (const v of paperLevel(x, w, h)) expect(v).toBeCloseTo(0.9, 5);
    // Shadow: right 40 columns at 60 % light. Far from the edge the level is the shadowed paper.
    const s = new Float32Array(w * h);
    for (let i = 0; i < s.length; i++) s[i] = i % w < 24 ? 0.9 : 0.54;
    const p = paperLevel(s, w, h);
    expect(p[24 * w + 63]).toBeLessThan(0.62);
    expect(p[24 * w + 0]).toBeGreaterThan(0.8);
  });
});

describe('alpha ramp, modes, AA, despeckle', () => {
  it('진하기 shifts lo and hi by 0.03 per step, clamped to -2..2', () => {
    expect(rampFor()).toEqual({ lo: 0.1, hi: 0.6 });
    expect(rampFor(2).lo).toBeCloseTo(0.04, 10);
    expect(rampFor(2).hi).toBeCloseTo(0.54, 10);
    expect(rampFor(-2).lo).toBeCloseTo(0.16, 10);
    expect(rampFor(-2).hi).toBeCloseTo(0.66, 10);
    expect(rampFor(9)).toEqual(rampFor(2));
  });

  it('a = clamp((d - lo) / (hi - lo)), d relative to the local paper', () => {
    const paper = Float32Array.from([1, 1, 1, 0.5, 0]);
    const x = Float32Array.from([0.9, 0.65, 0.3, 0.325, 0]);
    const a = rampAlpha(x, paper, 0.1, 0.6);
    expect(a[0]).toBeCloseTo(0, 6);
    expect(a[1]).toBeCloseTo(0.5, 6);
    expect(a[2]).toBe(1);
    expect(a[3]).toBeCloseTo(0.5, 6); // d = 0.35 relative to a dim paper of 0.5
    expect(a[4]).toBe(0); // paper floor 1e-3, no NaN
  });

  it('빨간 도장 keeps red ink only; 검정·파란 서명 drops red ink; 자동 filters nothing', () => {
    const red = Float32Array.from([0.2, 0.14, 0.08, 0.15, 0.225, 0.3]);
    const r = new Float32Array(6).fill(1);
    applyModeFilter(r, red, 'red');
    expect(Array.from(r).map((v) => +v.toFixed(6))).toEqual([1, 0.5, 0, 0.583333, 1, 1]);
    const s = new Float32Array(6).fill(1);
    applyModeFilter(s, red, 'sign');
    expect(Array.from(s).map((v) => +v.toFixed(6))).toEqual([0.666667, 1, 1, 1, 0.5, 0]);
    const a = new Float32Array(6).fill(1);
    applyModeFilter(a, red, 'auto');
    expect(Array.from(a)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('edge AA: hard 0/1 alpha is untouched; a partial pixel spreads with the 3x3 sigma-0.6 kernel', () => {
    const hard = new Float32Array(25);
    hard.fill(1, 0, 10);
    expect(smoothEdges(hard, 5, 5)).toEqual(hard);
    const one = new Float32Array(25);
    one[12] = 0.5;
    const g1 = Math.exp(-1 / 0.72);
    const g2 = Math.exp(-2 / 0.72);
    const sum = 1 + 4 * g1 + 4 * g2;
    const out = smoothEdges(one, 5, 5);
    expect(out[12]).toBeCloseTo(0.5 / sum, 7);
    expect(out[7]).toBeCloseTo((0.5 * g1) / sum, 7);
    expect(out[6]).toBeCloseTo((0.5 * g2) / sum, 7);
    expect(out[0]).toBe(0); // two pixels away: not an edge pixel
  });

  it('despeckle removes 8-connected components of a > 0.25 under max(12, 0.00002 W H) px', () => {
    expect(speckMin(20, 20)).toBe(12);
    expect(speckMin(2400, 1800)).toBeCloseTo(86.4, 6);
    const w = 20;
    const a = new Float32Array(w * 20);
    for (let i = 0; i < 11; i++) a[1 * w + 1 + i] = 1; // 11 px: removed
    for (let i = 0; i < 12; i++) a[5 + i + (5 + i) * w] = 0.8; // 12 px diagonal: one component, kept
    a[18 * w + 18] = 0.25; // not above 0.25: not a component, left alone
    despeckle(a, w, 20);
    expect(a[1 * w + 1]).toBe(0);
    expect(a[1 * w + 11]).toBe(0);
    expect(a[5 + 5 * w]).toBeCloseTo(0.8, 6);
    expect(a[16 + 16 * w]).toBeCloseTo(0.8, 6);
    expect(a[18 * w + 18]).toBe(0.25);
  });
});

describe('area check and colour guess', () => {
  it('share of a > 0.5: < 0.05 % no ink, > 60 % whole page', () => {
    const a = new Float32Array(10000);
    expect(areaCheck(a)).toEqual({ inkShare: 0, status: 'noink' });
    a.fill(0.51, 0, 4);
    expect(areaCheck(a).status).toBe('noink');
    a.fill(0.51, 0, 5);
    expect(areaCheck(a)).toEqual({ inkShare: 0.0005, status: 'ok' });
    a.fill(0.51, 0, 6000);
    expect(areaCheck(a).status).toBe('ok');
    a.fill(0.51, 0, 6001);
    expect(areaCheck(a).status).toBe('allpaper');
  });

  it('colour guess: weighted redness above 0.15 is red', () => {
    expect(colorGuess(Float32Array.from([1, 1]), Float32Array.from([0.3, 0.01]))).toBe('red');
    expect(colorGuess(Float32Array.from([1, 1]), Float32Array.from([0.29, 0]))).toBe('black');
    expect(colorGuess(new Float32Array(2), Float32Array.from([1, 1]))).toBe('black');
  });
});

describe('colour, crop and size', () => {
  it('fixed colours: 도장 #C8102E, 서명 검정 #111111, 서명 파랑 #1F3A93; 자동 follows the guess', () => {
    expect(INK_COLORS).toEqual({ red: [200, 16, 46], black: [17, 17, 17], blue: [31, 58, 147] });
    expect(resolveColor('auto', 'red')).toEqual([200, 16, 46]);
    expect(resolveColor('auto', 'black')).toEqual([17, 17, 17]);
    expect(resolveColor('blue', 'red')).toEqual([31, 58, 147]);
    expect(resolveColor('original', 'red')).toBeNull();
    const img = image(2, 1, () => [128, 128, 128]);
    const out = renderInk(img, Float32Array.from([1, 0.5]), 'blue', 'black');
    expect(Array.from(out)).toEqual([31, 58, 147, 255, 31, 58, 147, 128]);
  });

  it('원래 색 un-mixes the paper: F = (I - (1 - a) P) / max(a, 0.05)', () => {
    // Uniform paper 200; one pixel with a = 0.5 of ink 40 over it: I = 120.
    const w = 40;
    const img = image(w, 40, (x, y) => (x === 20 && y === 20 ? [120, 120, 120] : [200, 200, 200]));
    const a = new Float32Array(w * 40);
    a[20 * w + 20] = 0.5;
    const out = renderInk(img, a, 'original', 'black');
    const j = (20 * w + 20) * 4;
    expect(Array.from(out.subarray(j, j + 4))).toEqual([40, 40, 40, 128]);
    expect(Array.from(out.subarray(0, 4))).toEqual([200, 200, 200, 0]); // a <= 0.05: the photo colour
  });

  it('auto-crop: bbox of a > 0.1 plus max(8 px, 4 % of the long edge); 여백 없음 = 2 px; null when empty', () => {
    const w = 400;
    const h = 300;
    const a = new Float32Array(w * h);
    for (let y = 50; y < 100; y++) for (let x = 20; x < 320; x++) a[y * w + x] = 0.2;
    a[10 * w + 10] = 0.09; // not above 0.1
    expect(cropRect(a, w, h)).toEqual({ x: 8, y: 38, w: 324, h: 74 }); // 4 % of 300 = 12
    expect(cropRect(a, w, h, true)).toEqual({ x: 18, y: 48, w: 304, h: 54 });
    const small = new Float32Array(w * h);
    small[150 * w + 150] = 1;
    expect(cropRect(small, w, h)).toEqual({ x: 142, y: 142, w: 17, h: 17 });
    expect(cropRect(new Float32Array(w * h), w, h)).toBeNull();
  });

  it('sizes: downscale only, bigger options disabled, aspect kept', () => {
    const rect = { x: 0, y: 0, w: 800, h: 400 };
    expect(sizeOptions(rect)).toEqual([
      { size: null, enabled: true },
      { size: 1000, enabled: false },
      { size: 600, enabled: true },
      { size: 300, enabled: true },
    ]);
    expect(outputSize(rect, null)).toEqual({ w: 800, h: 400 });
    expect(outputSize(rect, 1000)).toEqual({ w: 800, h: 400 });
    expect(outputSize(rect, 300)).toEqual({ w: 300, h: 150 });
    expect(outputSize({ x: 0, y: 0, w: 2000, h: 1 }, 300)).toEqual({ w: 300, h: 1 });
  });

  it('resize is in premultiplied alpha: no dark fringe; outside the photo is transparent', () => {
    // Red ink (opaque) next to a fully transparent black pixel: the average is red at half alpha, not dark red.
    const rgba = Uint8ClampedArray.from([200, 16, 46, 255, 0, 0, 0, 0]);
    const out = cropAndResize(rgba, 2, 1, { x: 0, y: 0, w: 2, h: 1 }, 1);
    expect({ w: out.width, h: out.height }).toEqual({ w: 1, h: 1 });
    expect(Array.from(out.data)).toEqual([200, 16, 46, 128]);
    // A crop reaching past the photo pads with transparent pixels.
    const pad = cropAndResize(Uint8ClampedArray.from([10, 20, 30, 255]), 1, 1, { x: -1, y: -1, w: 3, h: 3 }, null);
    expect(pad.width).toBe(3);
    expect(Array.from(pad.data.subarray(16, 20))).toEqual([10, 20, 30, 255]);
    expect(pad.data[3]).toBe(0);
    // Area average of a 4x4 opaque grey ramp to 2x2.
    const g = new Uint8ClampedArray(64);
    for (let i = 0; i < 16; i++) g.set([i * 10, i * 10, i * 10, 255], i * 4);
    const half = cropAndResize(g, 4, 4, { x: 0, y: 0, w: 4, h: 4 }, 2);
    expect(Array.from(half.data.filter((_, i) => i % 4 === 0))).toEqual([25, 45, 105, 125]);
  });
});

describe('keyInk / processInk end to end', () => {
  const W = 120;
  const H = 90;
  // Off-white paper with light falloff, a red ring (도장) or a dark stroke (서명).
  const paperPx = (x: number): [number, number, number] => {
    const l = 1 - 0.15 * (x / W);
    return [Math.round(236 * l), Math.round(232 * l), Math.round(222 * l)];
  };
  const ring = image(W, H, (x, y) => {
    const d = Math.hypot(x - 60, y - 45);
    return d > 20 && d < 26 ? [200, 30, 30] : paperPx(x);
  });
  const stroke = image(W, H, (x, y) => (y >= 40 && y < 44 && x > 20 && x < 100 ? [25, 35, 110] : paperPx(x)));

  it('red stamp: found, guessed red, 도장.png, cropped to the ring', () => {
    const r = processInk(ring, { mode: 'auto' });
    expect(r.status).toBe('ok');
    expect(r.guess).toBe('red');
    expect(r.fileName).toBe('도장.png');
    // Ring bbox 35..85 x 20..70 (51 px, hard edges: no partial alpha), padding max(8, round(0.04 * 51)) = 8.
    expect(r.rect).toEqual({ x: 27, y: 12, w: 67, h: 67 });
    const at = (x: number, y: number) => Array.from(r.out?.data.subarray((y * 67 + x) * 4, (y * 67 + x) * 4 + 4) ?? []);
    expect(at(33, 33)[3]).toBe(0); // the paper inside the ring is transparent
    expect(at(37 - 27, 45 - 12)).toEqual([200, 16, 46, 255]); // a ring pixel in 도장 빨강
  });

  it('signature: guessed black, 서명.png; 빨간 도장 mode drops it (no ink)', () => {
    const r = processInk(stroke, { mode: 'auto' });
    expect(r.status).toBe('ok');
    expect(r.guess).toBe('black');
    expect(r.fileName).toBe('서명.png');
    expect(processInk(stroke, { mode: 'red' }).status).toBe('noink');
    // 서명 파랑: stroke 21..99 x 40..43, crop at (13, 32), width 79 + 2 * 8.
    const blue = processInk(stroke, { mode: 'sign', color: 'blue' });
    expect(blue.rect).toEqual({ x: 13, y: 32, w: 95, h: 20 });
    const j = ((41 - 32) * 95 + (50 - 13)) * 4;
    expect(Array.from(blue.out?.data.subarray(j, j + 4) ?? [])).toEqual([31, 58, 147, 255]);
  });

  it('검정·파란 서명 drops a red stamp; 빨간 도장 keeps it', () => {
    expect(keyInk(ring, { mode: 'sign' }).status).toBe('noink');
    expect(keyInk(ring, { mode: 'red' }).status).toBe('ok');
  });

  it('blank paper -> noink; a page of fine dark print -> allpaper; both without output', () => {
    const blank = processInk(image(W, H, paperPx), { mode: 'auto' });
    expect(blank.status).toBe('noink');
    expect(blank.out).toBeNull();
    const dense = processInk(
      image(W, H, (x, y) => (x % 4 === 0 && y % 2 === 0 ? paperPx(x) : [30, 30, 30])),
      { mode: 'auto' },
    );
    expect(dense.status).toBe('allpaper');
    expect(dense.out).toBeNull();
  });

  it('진하기 up keys more ink, down keys less', () => {
    const faint = image(W, H, (x, y) => (y >= 40 && y < 46 && x > 20 && x < 100 ? [150, 150, 150] : [230, 230, 230]));
    const share = (s: number) => keyInk(faint, { mode: 'auto', strength: s }).inkShare;
    expect(share(2)).toBeGreaterThanOrEqual(share(0));
    expect(share(0)).toBeGreaterThanOrEqual(share(-2));
    expect(share(2)).toBeGreaterThan(share(-2));
  });

  it('size choice scales the output long edge', () => {
    const r = processInk(ring, { mode: 'auto', size: 300 });
    expect(r.out?.width).toBe(67); // 300 > crop: downscale only
    // 8x: the crop is about 440 px, so 긴 변 300 px downscales.
    const big = image(W * 8, H * 8, (x, y) => {
      const j = ((y >> 3) * W + (x >> 3)) * 4;
      return [ring.data[j], ring.data[j + 1], ring.data[j + 2]];
    });
    const s = processInk(big, { mode: 'auto', size: 300 });
    expect(s.rect && Math.max(s.rect.w, s.rect.h)).toBeGreaterThan(300);
    expect(Math.max(s.out?.width ?? 0, s.out?.height ?? 0)).toBe(300);
  });

  it('defaults are the brief values', () => {
    expect(INK.lo).toBe(0.1);
    expect(INK.hi).toBe(0.6);
    expect(INK.minInk).toBe(0.0005);
    expect(INK.maxInk).toBe(0.6);
  });
});

describe('worker core', () => {
  it('run before load is an error; load then run answers with transferable pixels; re-runs are identical', () => {
    let t = 0;
    const handle = createInkHandler(() => (t += 5));
    expect(handle({ type: 'run', run: 1, opts: { mode: 'auto' } }).msg).toEqual({ type: 'error', run: 1, code: 'noimage' });
    const img = image(120, 90, (x, y) => (Math.hypot(x - 60, y - 45) < 8 ? [20, 20, 20] : [235, 235, 235]));
    const buf = img.data.slice().buffer;
    expect(handle({ type: 'load', pixels: buf, width: 120, height: 90 }).msg).toEqual({ type: 'loaded', width: 120, height: 90 });
    const a = handle({ type: 'run', run: 2, opts: { mode: 'auto' } });
    const b = handle({ type: 'run', run: 3, opts: { mode: 'auto' } });
    if (a.msg.type !== 'result' || b.msg.type !== 'result') throw new Error('expected results');
    expect(a.msg.status).toBe('ok');
    expect(a.msg.ms).toBe(5);
    expect(a.transfer).toEqual([a.msg.out?.pixels]);
    expect(new Uint8Array(a.msg.out!.pixels)).toEqual(new Uint8Array(b.msg.out!.pixels));
    const none = handle({ type: 'run', run: 4, opts: { mode: 'red' } });
    expect(none.msg.type === 'result' && none.msg.out).toBeNull();
    expect(none.transfer).toEqual([]);
  });
});
