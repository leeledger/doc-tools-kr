// IDCAM1022 Step C test map: live.ts on synthetic pixels — face L*, backlight, checkBackground reuse, the phone's roll,
// the hint order and debounce, and the burst's sharpness picking the sharp frame of three.
import { describe, expect, it } from 'vitest';
import { getPreset } from '../../src/data/id-photo-presets';
import { checkBackground, srgbToLab } from '../../src/lib/idphoto/background';
import { guides } from '../../src/lib/idphoto/guides';
import {
  BACKLIGHT_DL,
  DARK_L,
  SETTLED_START,
  analyseFrame,
  fitSize,
  isTilted,
  ovalMeanL,
  pickHint,
  rollDeg,
  settle,
  sharpness,
  type LiveResult,
  type Pixels,
} from '../../src/lib/idphoto/live';
import { HINTS } from '../../src/tools/id-photo-camera/copy';

const PASSPORT = getPreset('passport_online')!;
const W = 105; // 35:45 at 3 px per mm
const H = 135;

type RGB = [number, number, number];
const grey = (v: number): RGB => [v, v, v];

/** A frame of the preset aspect: `bg` everywhere, `face` inside the guide oval (the guide's own geometry). */
function scene(bg: RGB, face: RGB, w = W, h = H): Pixels {
  const { oval } = guides(PASSPORT, { w, h });
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - oval.cx) / oval.rx;
      const dy = (y + 0.5 - oval.cy) / oval.ry;
      const c = dx * dx + dy * dy <= 1 ? face : bg;
      data.set([...c, 255], (y * w + x) * 4);
    }
  }
  return { data, width: w, height: h };
}

const L = (v: number): number => srgbToLab(v, v, v)[0];

describe('ovalMeanL / analyseFrame', () => {
  it('reads the face oval only: L* of the face colour, whatever the background', () => {
    const img = scene(grey(250), grey(120));
    const { oval } = guides(PASSPORT, { w: W, h: H });
    expect(ovalMeanL(img, { ...oval, rx: oval.rx * 0.8, ry: oval.ry * 0.8 })).toBeCloseTo(L(120), 5);
    expect(ovalMeanL(img, { cx: 10, cy: 10, rx: 0, ry: 5 })).toBeNaN();
  });

  it('white background, normally lit face: no hint', () => {
    const r = analyseFrame(scene(grey(245), [200, 160, 140]), PASSPORT);
    expect(r.background.ok).toBe(true);
    expect(r.dark).toBe(false);
    expect(r.backlight).toBe(false);
    expect(pickHint(r, false)).toBeNull();
  });

  it('face L* under DARK_L: dark (dim room, background not much brighter)', () => {
    const r = analyseFrame(scene(grey(120), grey(50)), PASSPORT);
    expect(r.faceL).toBeLessThan(DARK_L);
    expect(r.background.meanL - r.faceL).toBeLessThanOrEqual(BACKLIGHT_DL);
    expect(r.dark).toBe(true);
    expect(r.backlight).toBe(false);
    expect(pickHint(r, false)).toBe('dark');
  });

  it('background L* more than BACKLIGHT_DL above the face: backlight, shown before dark', () => {
    const r = analyseFrame(scene(grey(255), grey(70)), PASSPORT);
    expect(r.background.meanL - r.faceL).toBeGreaterThan(BACKLIGHT_DL);
    expect(r.backlight).toBe(true);
    expect(pickHint(r, true)).toBe('backlight');
    // Just under the line: not backlit.
    const near = analyseFrame(scene(grey(255), grey(160)), PASSPORT);
    expect(near.background.meanL - near.faceL).toBeLessThan(BACKLIGHT_DL);
    expect(near.backlight).toBe(false);
  });

  it('the background check is checkBackground itself (same thresholds as /id-photo/)', () => {
    for (const bg of [grey(245), grey(180), [240, 200, 200] as RGB]) {
      const img = scene(bg, grey(150));
      expect(analyseFrame(img, PASSPORT).background).toEqual(checkBackground(img));
    }
    const r = analyseFrame(scene([170, 200, 230], [200, 160, 140]), PASSPORT);
    expect(r.background.ok).toBe(false);
    expect(pickHint(r, true)).toBe('background');
  });

  it('works at any size of the preset aspect (the ≤160 px live copy)', () => {
    const s = fitSize(1440, 1851, 160);
    expect(Math.max(s.w, s.h)).toBe(160);
    expect(analyseFrame(scene(grey(255), grey(70), s.w, s.h), PASSPORT).backlight).toBe(true);
    expect(fitSize(100, 50, 160)).toEqual({ w: 100, h: 50 });
  });
});

describe('phone level', () => {
  it('upright portrait or landscape is level; a sideways lean past TILT_DEG is not', () => {
    expect(rollDeg(90, 0)).toBeCloseTo(0, 5);
    expect(isTilted(rollDeg(90, 0))).toBe(false);
    // Upright, leaning back 10°: still level (pitch is not roll).
    expect(isTilted(rollDeg(80, 0))).toBe(false);
    // Upright, rolled 10° in the screen plane (reported as gamma 90, beta 80).
    expect(rollDeg(80, 90)).toBeCloseTo(10, 5);
    expect(isTilted(rollDeg(80, 90))).toBe(true);
    expect(isTilted(rollDeg(87, 90))).toBe(false);
    // Landscape (on its side, beta 0, gamma 90): a quarter turn is level.
    expect(rollDeg(0, 90)).toBeCloseTo(90, 5);
    expect(isTilted(rollDeg(0, 90))).toBe(false);
  });

  it('no angles or a phone lying flat: no level hint', () => {
    expect(rollDeg(null, null)).toBeNull();
    expect(rollDeg(undefined, 3)).toBeNull();
    expect(rollDeg(5, 5)).toBeNull();
    expect(isTilted(null)).toBe(false);
    expect(pickHint(null, false)).toBeNull();
    expect(pickHint(null, true)).toBe('level');
  });
});

describe('settle', () => {
  it('a hint shows after two analyses in a row and goes the same way', () => {
    let s = settle(SETTLED_START, 'dark');
    expect(s.shown).toBeNull();
    s = settle(s, 'dark');
    expect(s.shown).toBe('dark');
    s = settle(s, null);
    expect(s.shown).toBe('dark');
    s = settle(s, 'dark');
    expect(s.shown).toBe('dark');
    s = settle(settle(s, null), null);
    expect(s.shown).toBeNull();
  });

  it('every hint has plain copy without numbers', () => {
    for (const t of Object.values(HINTS)) expect(t).not.toMatch(/[0-9]|브라우저|권한|업로드|서버/);
    const r: LiveResult = { background: { meanL: 0, meanChroma: 0, stdL: 0, ok: false }, faceL: 50, dark: false, backlight: false };
    expect(HINTS[pickHint(r, false)!]).toBe(HINTS.background);
  });
});

describe('sharpness (burst)', () => {
  /** A checkerboard of 4 px squares, box-blurred `blur` times (3×3). */
  function board(blur: number, w = 64, h = 64): Pixels {
    let l = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) l[y * w + x] = ((x >> 2) + (y >> 2)) % 2 ? 230 : 30;
    for (let k = 0; k < blur; k++) {
      const o = new Float32Array(l);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          let s = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += l[(y + dy) * w + x + dx]!;
          o[y * w + x] = s / 9;
        }
      }
      l = o;
    }
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set([l[i]!, l[i]!, l[i]!, 255], i * 4);
    return { data, width: w, height: h };
  }

  it('picks the sharp frame of three', () => {
    const frames = [board(2), board(0), board(1)];
    const scores = frames.map(sharpness);
    expect(scores.indexOf(Math.max(...scores))).toBe(1);
    expect(scores[2]!).toBeGreaterThan(scores[0]!);
  });

  it('a flat or tiny frame scores 0', () => {
    expect(sharpness({ data: new Uint8ClampedArray(16 * 16 * 4).fill(128), width: 16, height: 16 })).toBe(0);
    expect(sharpness({ data: new Uint8ClampedArray(2 * 2 * 4), width: 2, height: 2 })).toBe(0);
  });
});
