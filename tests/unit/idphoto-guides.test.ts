// IDCAM1022 Step A: the pure guide geometry shared by the /id-photo/ overlay and the camera page.
import { describe, expect, it } from 'vitest';
import { PRESETS, customPreset, getPreset, type IdPreset } from '../../src/data/id-photo-presets';
import { EYE_FRAC } from '../../src/lib/idphoto/calibration';
import { CROWN_FRAC, HEAD_FRAC } from '../../src/lib/idphoto/frame';
import { LABELS, guides } from '../../src/lib/idphoto/guides';

const passport = getPreset('passport_online')!;
const driver = getPreset('driver_license')!;
const saramin = getPreset('saramin')!;

describe('guides', () => {
  it('defaults to output pixels: passport 413x531 crown, head and band', () => {
    const gd = guides(passport);
    expect(gd.crownY).toBeCloseTo(CROWN_FRAC * 531, 9);
    expect(gd.head).toBeCloseTo(HEAD_FRAC * 531, 9);
    expect(gd.bandTop).toBeCloseTo(gd.crownY + (32 / 45) * 531, 9);
    expect(gd.bandBottom).toBeCloseTo(gd.crownY + (36 / 45) * 531, 9);
    expect(gd.centerX).toBe(413 / 2);
    expect(gd.eyeY).toBeCloseTo(gd.crownY + EYE_FRAC * gd.head, 9);
  });

  it('keeps every guide inside the frame and in order for every preset', () => {
    for (const p of PRESETS) {
      const gd = guides(p);
      expect(gd.crownY, p.id).toBeGreaterThan(0);
      expect(gd.eyeY, p.id).toBeGreaterThan(gd.crownY);
      expect(gd.eyeY, p.id).toBeLessThan(gd.bandTop);
      expect(gd.bandTop, p.id).toBeLessThan(gd.bandBottom);
      expect(gd.bandBottom, p.id).toBeLessThanOrEqual(p.outH);
      expect(gd.oval.cx, p.id).toBe(p.outW / 2);
      expect(gd.oval.cy - gd.oval.ry, p.id).toBeCloseTo(gd.crownY, 9);
      expect(gd.oval.cy + gd.oval.ry, p.id).toBeCloseTo(gd.crownY + gd.head, 9);
      expect(gd.oval.rx, p.id).toBeCloseTo(gd.head * 0.34, 9);
      expect(gd.oval.rx * 2, p.id).toBeLessThan(p.outW);
    }
  });

  it('scales linearly with the drawing size (overlay canvas at devicePixelRatio)', () => {
    const a = guides(saramin);
    const k = 2.75;
    const b = guides(saramin, { w: saramin.outW * k, h: saramin.outH * k });
    for (const key of ['crownY', 'eyeY', 'head', 'bandTop', 'bandBottom', 'centerX'] as const) expect(b[key]).toBeCloseTo(a[key] * k, 6);
    expect(b.oval.rx).toBeCloseTo(a.oval.rx * k, 6);
  });

  it('matches the pre-refactor overlay arithmetic bit for bit (pixel-identical overlay)', () => {
    const sizes = [
      { w: 360, h: 463 },
      { w: 827, h: 1063 },
      { w: 1080, h: 1388 },
      { w: 301, h: 401 },
    ];
    for (const p of PRESETS) {
      for (const { w: W, h: H } of sizes) {
        const gd = guides(p, { w: W, h: H });
        const crownY = CROWN_FRAC * H;
        const head = HEAD_FRAC * H;
        expect(gd.crownY).toBe(crownY);
        expect(gd.head).toBe(head);
        expect(gd.bandTop).toBe(crownY + p.headBand.minFrac * H);
        expect(gd.bandBottom).toBe(crownY + p.headBand.maxFrac * H);
        expect(gd.eyeY).toBe(crownY + EYE_FRAC * head);
        expect(gd.oval).toEqual({ cx: W / 2, cy: crownY + head / 2, rx: head * 0.34, ry: head / 2 });
        expect(gd.centerX).toBe(W / 2);
      }
    }
  });

  it('labels the band official only where the preset quotes its own rule', () => {
    for (const p of [passport, driver]) {
      const gd = guides(p);
      expect(gd.official, p.id).toBe(true);
      expect(gd.labels.chin, p.id).toBe(LABELS.chinOfficial);
    }
    for (const p of PRESETS.filter((x) => x.headBand.kind !== 'official')) {
      const gd = guides(p);
      expect(gd.official, p.id).toBe(false);
      expect(gd.labels.chin, p.id).toBe(LABELS.chinReference);
    }
    const custom = customPreset(300, 400)!;
    expect(guides(custom).labels.chin).toBe(LABELS.chinReference);
  });

  it('names the crown or the top of the hair by headBand.measure', () => {
    expect(guides(passport).labels.crown).toBe(LABELS.crown);
    expect(guides(passport).labels.eye).toBe(LABELS.eye);
    const hair: IdPreset = { ...saramin, headBand: { ...saramin.headBand, measure: 'hair' } };
    expect(guides(hair).labels.crown).toBe(LABELS.hair);
  });
});
