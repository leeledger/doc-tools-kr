// 여권·증명사진 pure modules (brief Step 4 Test map): jfif, presets, crop, frame, warnings, background, guard.
import { describe, expect, it } from 'vitest';
import { CUSTOM_BOUNDS, PRESETS, customPreset, getPreset, limitBytes, outputName, validatePreset, type IdPreset } from '../../src/data/id-photo-presets';
import { ATTEMPT_KEY, clearAttempt, markAttempt, shouldTryAutoFrame, type GuardStorage } from '../../src/lib/face/guard';
import type { FaceMeasure } from '../../src/lib/face/types';
import { JfifError, readJfif, setJfifDpi } from '../../src/lib/image/jfif';
import { sniffImage } from '../../src/lib/image/sniff';
import { checkBackground } from '../../src/lib/idphoto/background';
import { C, EYE_FRAC, K } from '../../src/lib/idphoto/calibration';
import { clampZoom, corners, headLength, inside, minZoom, pan, pinch, rotate, snapRotation, toOutput, toSource, zoomAt, type CropState } from '../../src/lib/idphoto/crop';
import { CROWN_FRAC, HEAD_FRAC, autoFrame, estimateHead, manualFrame } from '../../src/lib/idphoto/frame';
import { BLINK_MAX, COPY, JAW_MAX, PITCH_MAX, ROLL_MAX, SMILE_MAX, YAW_MAX, checklist, limitLabel } from '../../src/lib/idphoto/warnings';
import { nodeCodecs } from '../helpers/photo-deps';

const passport = getPreset('passport_online')!;
const gosi = getPreset('gosi')!;
const saramin = getPreset('saramin')!;
const out = (p: IdPreset) => ({ w: p.outW, h: p.outH });

async function tinyJpeg(w = 16, h = 12): Promise<Uint8Array> {
  const c = await nodeCodecs();
  const img = new ImageData(new Uint8ClampedArray(w * h * 4).fill(200), w, h);
  return c.mozjpeg(img, 80);
}

/** Drops the APP0 JFIF segment of a JPEG. */
function withoutApp0(b: Uint8Array): Uint8Array {
  if (b[2] !== 0xff || b[3] !== 0xe0) return b;
  const len = (b[4]! << 8) | b[5]!;
  const outB = new Uint8Array(b.length - 2 - len);
  outB.set(b.subarray(0, 2), 0);
  outB.set(b.subarray(4 + len), 2);
  return outB;
}

describe('jfif', () => {
  it('patches an existing APP0 JFIF (units 1, x = y = dpi) and keeps the size', async () => {
    const src = await tinyJpeg();
    expect(readJfif(src)).not.toBeNull();
    const outB = setJfifDpi(src, 300);
    expect(outB.length).toBe(src.length);
    expect(readJfif(outB)).toEqual({ units: 1, x: 300, y: 300 });
    const s = sniffImage(outB);
    expect([s.width, s.height]).toEqual([16, 12]);
  });

  it('inserts a JFIF APP0 after SOI when there is none', async () => {
    const bare = withoutApp0(await tinyJpeg());
    expect(readJfif(bare)).toBeNull();
    const outB = setJfifDpi(bare, 99);
    expect(outB.length).toBe(bare.length + 18);
    expect([outB[2], outB[3], outB[4], outB[5]]).toEqual([0xff, 0xe0, 0x00, 0x10]);
    expect(readJfif(outB)).toEqual({ units: 1, x: 99, y: 99 });
    const s = sniffImage(outB);
    expect([s.width, s.height]).toEqual([16, 12]);
  });

  it('is idempotent', async () => {
    const once = setJfifDpi(await tinyJpeg(), 96);
    expect(setJfifDpi(once, 96)).toEqual(once);
    const bare = setJfifDpi(withoutApp0(await tinyJpeg()), 96);
    expect(setJfifDpi(bare, 96)).toEqual(bare);
  });

  it('throws on a non-JPEG and on a bad dpi', async () => {
    expect(() => setJfifDpi(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 300)).toThrow(JfifError);
    expect(() => readJfif(new Uint8Array([1, 2, 3, 4]))).toThrow(JfifError);
    const j = await tinyJpeg();
    expect(() => setJfifDpi(j, 0)).toThrow(JfifError);
    expect(() => setJfifDpi(j, 70000)).toThrow(JfifError);
  });
});

describe('presets', () => {
  it('every shipped preset passes the schema', () => {
    for (const p of PRESETS) expect(validatePreset(p), p.id).toEqual([]);
    expect(PRESETS.map((p) => p.id)).toEqual(['passport_online', 'gosi', 'qnet', 'saramin', 'jobkorea', 'half_card']);
  });

  it('rejects a secondary status and a missing quote or URL', () => {
    const bad = { ...passport, status: 'secondary' } as unknown as IdPreset;
    expect(validatePreset(bad).join()).toMatch(/not shippable/);
    expect(validatePreset({ ...passport, quote: undefined }).join()).toMatch(/without a quote/);
    expect(validatePreset({ ...passport, sourceUrls: [] }).join()).toMatch(/without a source URL/);
    expect(validatePreset({ ...passport, sourceUrls: ['http://x.kr/'] }).join()).toMatch(/not https/);
    expect(validatePreset({ ...passport, retrieved: '29-09-2026' }).join()).toMatch(/ISO date/);
    expect(validatePreset({ ...passport, fileTag: '여권' }).join()).toMatch(/ASCII/);
    expect(validatePreset({ ...passport, outW: 440 }).join()).toMatch(/outside the accepted range/);
    expect(validatePreset({ ...gosi, headBand: { ...gosi.headBand, kind: 'official' } }).join()).toMatch(/only the passport band/);
  });

  it('source URLs are https and dates ISO', () => {
    for (const p of PRESETS) {
      for (const u of p.sourceUrls) expect(u).toMatch(/^https:\/\//);
      expect(p.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('byte limits: 이하 = KB × 1000, 미만 = KB × 1000 − 1', () => {
    expect(passport.limitBytes).toBe(500_000);
    expect(gosi.limitBytes).toBe(349_999);
    expect(getPreset('qnet')!.limitBytes).toBe(200_000);
    expect(saramin.limitBytes).toBe(10_000_000);
    expect(getPreset('jobkorea')!.limitBytes).toBe(5_000_000);
    expect(getPreset('half_card')!.limitBytes).toBeUndefined();
    expect(limitBytes(350, 'lt')).toBe(349_999);
    expect(limitLabel(gosi)).toBe('350 KB 미만');
    expect(limitLabel(passport)).toBe('500 KB 이하');
    expect(limitLabel(saramin)).toBe('10 MB 이하');
  });

  it('output px lie inside the accepted range; aspect matches the print size within 1.5 %', () => {
    const r = passport.pxRange!;
    expect(passport.outW).toBeGreaterThanOrEqual(r.w[0]);
    expect(passport.outW).toBeLessThanOrEqual(r.w[1]);
    expect(passport.outH).toBeGreaterThanOrEqual(r.h[0]);
    expect(passport.outH).toBeLessThanOrEqual(r.h[1]);
    for (const p of PRESETS) if (p.mm) expect(Math.abs(p.outW / p.outH / (p.mm.w / p.mm.h) - 1), p.id).toBeLessThanOrEqual(0.015);
  });

  it('file names are ASCII preset tags', () => {
    expect(PRESETS.map(outputName)).toEqual(['passport_413x531.jpg', 'gosi_137x177.jpg', 'qnet_413x531.jpg', 'saramin_100x140.jpg', 'jobkorea_150x210.jpg', 'halfcard_354x472.jpg']);
    expect(outputName(customPreset(200, 250, 50)!)).toBe('photo_200x250.jpg');
    for (const p of PRESETS) expect(outputName(p)).toMatch(/^[a-z0-9_]+\.jpg$/);
  });

  it('custom bounds: 49/2001 px and 9/10,001 KB are rejected', () => {
    expect(customPreset(49, 100)).toBeNull();
    expect(customPreset(100, 2001)).toBeNull();
    expect(customPreset(50, 2000)).not.toBeNull();
    expect(customPreset(200, 250, 9)).toBeNull();
    expect(customPreset(200, 250, 10_001)).toBeNull();
    expect(customPreset(200, 250, 10)!.limitBytes).toBe(10_000);
    expect(customPreset(200, 250, 10_000)!.limitBytes).toBe(10_000_000);
    expect(customPreset(200.5, 250)).toBeNull();
    expect(customPreset(200, 250)!.limitBytes).toBeUndefined();
    expect(CUSTOM_BOUNDS).toEqual({ minPx: 50, maxPx: 2000, minKb: 10, maxKb: 10_000 });
    expect(validatePreset(customPreset(200, 250, 50)!)).toEqual([]);
  });

  it('dpi values: 300, 99, 96', () => {
    expect(Object.fromEntries(PRESETS.map((p) => [p.id, p.dpi]))).toEqual({ passport_online: 300, gosi: 99, qnet: 300, saramin: 96, jobkorea: 96, half_card: 300 });
    expect(customPreset(200, 250)!.dpi).toBe(96);
  });

  it('only the passport band is official; qnet has no print size (Flag Q1)', () => {
    expect(PRESETS.filter((p) => p.headBand.kind === 'official').map((p) => p.id)).toEqual(['passport_online']);
    expect(getPreset('qnet')!.mm).toBeUndefined();
    expect(passport.headBand.minFrac * 45).toBeCloseTo(32, 9);
    expect(passport.headBand.maxFrac * 45).toBeCloseTo(36, 9);
  });
});

describe('crop', () => {
  const o = out(passport);
  const base: CropState = { cx: 1000, cy: 1200, s: 0.3, rotDeg: 0 };

  it.each([0, 5, -5, 2.5])('toSource/toOutput round-trip at rot %s', (rotDeg) => {
    const st = { ...base, rotDeg };
    for (const [u, v] of [[0, 0], [413, 531], [100, 400], [206.5, 265.5]] as const) {
      const p = toSource(st, o, u, v);
      const q = toOutput(st, o, p.x, p.y);
      expect(q.x).toBeCloseTo(u, 9);
      expect(q.y).toBeCloseTo(v, 9);
    }
    const c = toSource(st, o, o.w / 2, o.h / 2);
    expect(c.x).toBeCloseTo(st.cx, 9);
    expect(c.y).toBeCloseTo(st.cy, 9);
  });

  it('a positive rotation turns the photo counter-clockwise (straightens a positive face roll)', () => {
    const st = { ...base, rotDeg: 5 };
    // Two source points on a line that falls 5° to the right end on one output row.
    const a = toOutput(st, o, 1000, 1200);
    const d = { x: Math.cos((5 * Math.PI) / 180) * 100, y: Math.sin((5 * Math.PI) / 180) * 100 };
    const b = toOutput(st, o, 1000 + d.x, 1200 + d.y);
    expect(b.y).toBeCloseTo(a.y, 9);
  });

  it('corners inside and outside at each edge, with rotation', () => {
    const W = 3000;
    const H = 4000;
    const st: CropState = { cx: 1500, cy: 2000, s: 0.3, rotDeg: 0 };
    expect(inside(st, o, W, H)).toBe(true);
    const cw = o.w / st.s;
    const ch = o.h / st.s;
    // Exactly at the left edge: inside; 1 px further: outside.
    expect(inside({ ...st, cx: cw / 2 }, o, W, H)).toBe(true);
    expect(inside({ ...st, cx: cw / 2 - 1 }, o, W, H)).toBe(false);
    expect(inside({ ...st, cx: W - cw / 2 + 1 }, o, W, H)).toBe(false);
    expect(inside({ ...st, cy: ch / 2 - 1 }, o, W, H)).toBe(false);
    expect(inside({ ...st, cy: H - ch / 2 + 1 }, o, W, H)).toBe(false);
    // Flush with the left edge at rot 0, a 5° rotation pushes a corner out.
    expect(inside({ ...st, cx: cw / 2, rotDeg: 5 }, o, W, H)).toBe(false);
    expect(inside({ ...st, rotDeg: 5 }, o, W, H)).toBe(true);
    const cs = corners({ ...st, rotDeg: 0 }, o);
    expect(cs[0]!.x).toBeCloseTo(1500 - cw / 2, 9);
    expect(cs[2]!.y).toBeCloseTo(2000 + ch / 2, 9);
  });

  it('s ≤ 1 clamp and the zoom floor', () => {
    expect(clampZoom(1.4, 0.1)).toBe(1);
    expect(clampZoom(0.05, 0.1)).toBe(0.1);
    expect(clampZoom(0.5, 0.1)).toBe(0.5);
    expect(minZoom(o, 3000, 4000)).toBeCloseTo(Math.min(413 / 3000, 531 / 4000) * 0.5, 12);
    expect(zoomAt(base, o, 10, { x: 200, y: 200 }, 0.1).s).toBe(1);
  });

  it('zoomAt keeps the anchor fixed', () => {
    for (const rotDeg of [0, 3.5]) {
      const st = { ...base, rotDeg };
      const anchor = { x: 120, y: 80 };
      const before = toSource(st, o, anchor.x, anchor.y);
      const z = zoomAt(st, o, 1.37, anchor, 0.05);
      const after = toSource(z, o, anchor.x, anchor.y);
      expect(z.s).toBeCloseTo(0.3 * 1.37, 12);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
    }
  });

  it('pan moves the content by output px', () => {
    for (const rotDeg of [0, -4]) {
      const st = { ...base, rotDeg };
      const p = toOutput(st, o, 900, 1100);
      const moved = pan(st, 10, -7);
      const q = toOutput(moved, o, 900, 1100);
      expect(q.x - p.x).toBeCloseTo(10, 9);
      expect(q.y - p.y).toBeCloseTo(-7, 9);
    }
  });

  it('rotate clamps to ±5 and snaps to 0.5', () => {
    expect(rotate(base, 0.5).rotDeg).toBe(0.5);
    expect(rotate({ ...base, rotDeg: 4.5 }, 1).rotDeg).toBe(5);
    expect(rotate({ ...base, rotDeg: -4.5 }, -2).rotDeg).toBe(-5);
    expect(snapRotation(1.26)).toBe(1.5);
    expect(snapRotation(-0.2)).toBe(0);
    expect(Object.is(snapRotation(-0.2), -0)).toBe(false);
  });

  it('pinch zooms about the midpoint and follows it', () => {
    const p0 = { x: 100, y: 200 };
    const p1 = { x: 200, y: 200 };
    const q0 = { x: 90, y: 210 };
    const q1 = { x: 240, y: 210 };
    const src = toSource(base, o, 150, 200);
    const r = pinch(base, o, p0, p1, q0, q1, 0.05);
    expect(r.s).toBeCloseTo(0.3 * 1.5, 12);
    const at = toOutput(r, o, src.x, src.y);
    expect(at.x).toBeCloseTo(165, 9);
    expect(at.y).toBeCloseTo(210, 9);
  });

  it('headLength in mm and as a fraction of the height', () => {
    const st: CropState = { cx: 500, cy: 600, s: 0.5, rotDeg: 0 };
    const h = headLength({ x: 500, y: 300 }, { x: 500, y: 900 }, st, o, 45);
    expect(h.frac).toBeCloseTo(300 / 531, 12);
    expect(h.mm).toBeCloseTo((300 / 531) * 45, 12);
    expect(headLength({ x: 0, y: 0 }, { x: 0, y: 100 }, st, o).mm).toBeNull();
  });
});

/** A synthetic frontal face: eye at y 1000, chin at y 1400, IPD 200, centred at x 1000. */
function face(over: Partial<FaceMeasure> = {}): FaceMeasure {
  return {
    faces: 1,
    eye: { x: 1000, y: 1000 },
    eyeR: { x: 900, y: 1000 },
    eyeL: { x: 1100, y: 1000 },
    chin: { x: 1000, y: 1400 },
    cheekR: { x: 780, y: 1100 },
    cheekL: { x: 1220, y: 1100 },
    centerX: 1000,
    roll: 0,
    ipd3d: 200,
    pose: { yaw: 0, pitch: 0, roll: 0 },
    blend: { mouthSmileLeft: 0.02, mouthSmileRight: 0.02, jawOpen: 0.01, eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 },
    ...over,
  };
}

describe('frame', () => {
  it('the crown estimate averages the chin and IPD estimates', () => {
    const h = estimateHead(face());
    expect(h.crown.y).toBeCloseTo(1000 - (K * 400 + C * 200) / 2, 9);
    expect(h.px).toBeCloseTo(400 + (K * 400 + C * 200) / 2, 9);
    expect(EYE_FRAC).toBeCloseTo(0.468, 3);
  });

  it('synthetic landmarks → head 34.0 mm with the crown 4.5 mm below the top', () => {
    const W = 2000;
    const H = 3000;
    const f = face();
    const r = autoFrame(f, out(passport), W, H);
    expect(r.lowres).toBe(false);
    expect(r.outside).toBe(false);
    const head = estimateHead(f);
    const crown = toOutput(r.state, out(passport), head.crown.x, head.crown.y);
    const chin = toOutput(r.state, out(passport), head.chin.x, head.chin.y);
    const mmPerPx = 45 / 531;
    expect((chin.y - crown.y) * mmPerPx).toBeCloseTo(34.0, 1);
    expect(Math.abs((chin.y - crown.y) * mmPerPx - 34)).toBeLessThan(0.05);
    expect(crown.y * mmPerPx).toBeCloseTo(4.5, 6);
    expect(crown.x).toBeCloseTo(413 / 2, 6);
    expect(HEAD_FRAC).toBeCloseTo(34 / 45, 12);
    expect(CROWN_FRAC).toBeCloseTo(4.5 / 45, 12);
  });

  it('lowres when the head needs s > 1 (never upscale)', () => {
    // A tiny head: 40 px eye-to-chin.
    const f = face({ eye: { x: 200, y: 200 }, chin: { x: 200, y: 240 }, ipd3d: 20, centerX: 200 });
    const r = autoFrame(f, out(passport), 500, 700);
    expect(r.lowres).toBe(true);
    expect(r.state.s).toBe(1);
  });

  it('manualFrame gives the largest centred crop of the output aspect', () => {
    const r = manualFrame(out(passport), 3000, 3000);
    expect(r.lowres).toBe(false);
    expect(r.outside).toBe(false);
    // Height-limited: crop 3000 tall → s = 531/3000.
    expect(r.state.s).toBeCloseTo(531 / 3000, 12);
    const cs = corners(r.state, out(passport));
    expect(cs[0]!.y).toBeCloseTo(0, 6);
    expect(cs[2]!.y).toBeCloseTo(3000, 6);
    // A wide photo is height-limited; a tall one is width-limited.
    const tall = manualFrame(out(passport), 1000, 4000);
    expect(tall.state.s).toBeCloseTo(413 / 1000, 12);
    expect(manualFrame(out(passport), 300, 375).lowres).toBe(true);
  });

  it('works for the gosi and saramin aspects', () => {
    for (const p of [gosi, saramin]) {
      const r = autoFrame(face(), out(p), 2000, 3000);
      const head = estimateHead(face());
      const a = toOutput(r.state, out(p), head.crown.x, head.crown.y);
      const b = toOutput(r.state, out(p), head.chin.x, head.chin.y);
      expect((b.y - a.y) / p.outH).toBeCloseTo(34 / 45, 9);
      expect(a.y / p.outH).toBeCloseTo(4.5 / 45, 9);
      expect(r.outside).toBe(false);
      const m = manualFrame(out(p), 2000, 3000);
      expect(m.state.s).toBeCloseTo(Math.max(p.outW / 2000, p.outH / 3000), 12);
    }
  });
});

describe('warnings', () => {
  const W = 2000;
  const H = 3000;
  const framed = autoFrame(face(), out(passport), W, H).state;
  const run = (f: FaceMeasure | null, over: Partial<Parameters<typeof checklist>[0]> = {}) =>
    checklist({ face: f, state: framed, preset: passport, srcW: W, srcH: H, lowres: false, bg: null, ...over });
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  const e = 1e-6;

  it('a clean frontal face: no warnings, no blocks', () => {
    const c = run(face());
    expect(c.blocks).toEqual([]);
    expect(c.warns).toEqual([]);
    expect(ids(c.oks)).toEqual(['size', 'pose', 'bytes', 'inside']);
  });

  it.each([
    ['yaw', { pose: { yaw: YAW_MAX + e, pitch: 0, roll: 0 } }, { pose: { yaw: YAW_MAX - e, pitch: 0, roll: 0 } }],
    ['yaw', { pose: { yaw: -YAW_MAX - e, pitch: 0, roll: 0 } }, { pose: { yaw: -YAW_MAX + e, pitch: 0, roll: 0 } }],
    ['pitch', { pose: { yaw: 0, pitch: PITCH_MAX + e, roll: 0 } }, { pose: { yaw: 0, pitch: PITCH_MAX - e, roll: 0 } }],
    ['roll', { roll: ROLL_MAX + e }, { roll: ROLL_MAX - e }],
    ['expression', { blend: { mouthSmileLeft: SMILE_MAX + e, mouthSmileRight: SMILE_MAX + e } }, { blend: { mouthSmileLeft: SMILE_MAX - e, mouthSmileRight: SMILE_MAX - e } }],
    ['expression', { blend: { jawOpen: JAW_MAX + e } }, { blend: { jawOpen: JAW_MAX - e } }],
    ['eyes', { blend: { eyeBlinkLeft: BLINK_MAX + e, eyeBlinkRight: BLINK_MAX + e } }, { blend: { eyeBlinkLeft: BLINK_MAX - e, eyeBlinkRight: BLINK_MAX - e } }],
  ] as [string, Partial<FaceMeasure>, Partial<FaceMeasure>][])('%s fires just above its threshold, not just below', (id, over, under) => {
    expect(ids(run(face(over)).warns)).toContain(id);
    expect(ids(run(face(under)).warns)).not.toContain(id);
  });

  it('residual roll uses the rotation: roll 7° with rotDeg 5 is fine, rotDeg −1 warns', () => {
    const f = face({ roll: 7 });
    expect(ids(run(f, { state: { ...framed, rotDeg: 5 } }).warns)).not.toContain('roll');
    expect(ids(run(f, { state: { ...framed, rotDeg: -1 } }).warns)).toContain('roll');
    expect(run(f, { state: { ...framed, rotDeg: -1 } }).warns.find((w) => w.id === 'roll')!.text).toBe(COPY.roll(8));
  });

  it('faces > 1 is a warning, not a block', () => {
    const c = run(face({ faces: 2 }));
    expect(ids(c.warns)).toEqual(['multi']);
    expect(c.blocks).toEqual([]);
  });

  it('head band per preset kind: official mm, reference mm, reference %', () => {
    const zoomed = { ...framed, s: framed.s * 1.1 };
    const official = run(face(), { state: zoomed }).warns.find((w) => w.id === 'head')!;
    expect(official.text).toMatch(/^추정 머리 길이가 37\.4 mm로 규격\(32–36 mm\) 밖입니다\./);
    const gFramed = autoFrame(face(), out(gosi), W, H).state;
    const ref = checklist({ face: face(), state: { ...gFramed, s: gFramed.s * 1.1 }, preset: gosi, srcW: W, srcH: H, lowres: false, bg: null }).warns.find((w) => w.id === 'head')!;
    expect(ref.text).toMatch(/참고 범위\(32–36 mm\)/);
    const sFramed = autoFrame(face(), out(saramin), W, H).state;
    const pct = checklist({ face: face(), state: { ...sFramed, s: sFramed.s * 0.9 }, preset: saramin, srcW: W, srcH: H, lowres: false, bg: null }).warns.find((w) => w.id === 'head')!;
    expect(pct.text).toBe(COPY.headReferencePct(68));
    // Inside the band: no head warning.
    expect(ids(run(face(), { state: { ...framed, s: framed.s * 1.02 } }).warns)).not.toContain('head');
  });

  it('blocks: outside, lowres, invalid custom; the note in manual mode', () => {
    const outside = run(null, { state: { ...framed, cx: 10 } });
    expect(ids(outside.blocks)).toEqual(['outside']);
    expect(outside.blocks[0]!.text).toBe(COPY.outside);
    const low = run(null, { lowres: true });
    expect(low.blocks).toEqual([{ id: 'lowres', text: '사진 해상도가 낮아 413×531 px로 만들 수 없습니다. 흐려지지 않게 키우지 않으니 더 큰 원본 사진을 선택해 주세요.' }]);
    expect(ids(run(null, { customError: '50–2,000 px' }).blocks)).toEqual(['custom']);
    expect(ids(run(null, { manualReason: 'noface' }).warns)).toEqual(['manual']);
    expect(run(null, { manualReason: 'skipped' }).warns).toEqual([]);
  });

  it('the background warning follows the check', () => {
    expect(ids(run(face(), { bg: { ok: false, meanL: 70, meanChroma: 3, stdL: 2 } }).warns)).toEqual(['background']);
    expect(run(face(), { bg: { ok: true, meanL: 97, meanChroma: 1, stdL: 1 } }).warns).toEqual([]);
  });
});

describe('background', () => {
  const W = 120;
  const H = 160;
  const fill = (px: (x: number, y: number) => [number, number, number]) => {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const [r, g, b] = px(x, y);
        data.set([r, g, b, 255], (y * W + x) * 4);
      }
    return { data, width: W, height: H };
  };
  // A dark "person" in the middle never counts: only the top strip and the outer side strips are sampled.
  const person = (x: number, y: number) => x > W * 0.2 && x < W * 0.8 && y > H * 0.15;

  it('white and light grey pass', () => {
    expect(checkBackground(fill((x, y) => (person(x, y) ? [40, 30, 30] : [255, 255, 255]))).ok).toBe(true);
    expect(checkBackground(fill((x, y) => (person(x, y) ? [40, 30, 30] : [228, 228, 228]))).ok).toBe(true);
  });

  it('mid grey, blue and a busy texture warn', () => {
    const grey = checkBackground(fill(() => [150, 150, 150]));
    expect(grey.ok).toBe(false);
    expect(grey.meanL).toBeLessThan(88);
    const blue = checkBackground(fill(() => [200, 220, 255]));
    expect(blue.ok).toBe(false);
    expect(blue.meanChroma).toBeGreaterThan(10);
    // Sparse dark marks on white: bright on average, but uneven.
    const busy = checkBackground(fill((x, y) => (((x >> 2) + 3 * (y >> 2)) % 7 === 0 ? [70, 70, 70] : [255, 255, 255])));
    expect(busy.ok).toBe(false);
    expect(busy.meanL).toBeGreaterThanOrEqual(88);
    expect(busy.meanChroma).toBeLessThanOrEqual(10);
    expect(busy.stdL).toBeGreaterThan(12);
  });
});

describe('guard', () => {
  const store = (init: Record<string, string> = {}): GuardStorage & { data: Record<string, string> } => {
    const data = { ...init };
    return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
  };

  it('flag 0 never tries', () => {
    expect(shouldTryAutoFrame({ flag: false, deviceMemory: 8, storage: store() })).toBe(false);
  });

  it.each([
    [1, false],
    [2, false],
    [4, true],
    [undefined, true],
  ])('deviceMemory %s → %s', (mem, want) => {
    expect(shouldTryAutoFrame({ flag: true, deviceMemory: mem, storage: store() })).toBe(want);
  });

  it('the crash flag sends the next load to manual; clear after success', () => {
    const s = store();
    markAttempt(s);
    expect(s.data[ATTEMPT_KEY]).toBe('1');
    expect(shouldTryAutoFrame({ flag: true, storage: s })).toBe(false);
    clearAttempt(s);
    expect(shouldTryAutoFrame({ flag: true, storage: s })).toBe(true);
  });

  it('blocked storage does not throw', () => {
    const broken: GuardStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(shouldTryAutoFrame({ flag: true, storage: broken })).toBe(true);
    expect(() => markAttempt(broken)).not.toThrow();
    expect(() => clearAttempt(broken)).not.toThrow();
    expect(shouldTryAutoFrame({ flag: true, storage: null })).toBe(true);
  });
});
