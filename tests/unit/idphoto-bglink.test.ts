// IDCAM1022 Step D (D8b/c): 증명사진 촬영 -> 사진 배경 지우기 -> 여권·증명사진 규격 맞추기. The preset allowlist (passport and
// driver's licence never pass), the addresses both ways, and where a handed-over photo stops on /remove-background/.
import { describe, expect, it } from 'vitest';
import { PRESETS, getPreset } from '../../src/data/id-photo-presets';
import { parse } from '../../src/lib/ui/deeplink';
import { BG_FALLBACK, BG_PRESETS, bgOffered, bgPreset, bgUrl, idPhotoBack, parseBgLink } from '../../src/lib/idphoto/bglink';
import { BG_FORBIDDEN, checklist } from '../../src/lib/idphoto/warnings';
import { COPY as CAM_COPY } from '../../src/tools/id-photo-camera/copy';
import { COPY, HELD_START, TO_ID_PHOTO } from '../../src/tools/remove-background/copy';
import { BACK_FAILED } from '../../src/tools/remove-background/back';
import { move, startsAtOnce, view, type Phase } from '../../src/tools/remove-background/model';
import { JARGON } from '../../scripts/lib/plain-words.mjs';

describe('preset allowlist (D8b)', () => {
  it('is 이력서 (saramin, jobkorea) and 반명함 (half_card), all real presets in groups without a background rule', () => {
    expect([...BG_PRESETS].sort()).toEqual(['half_card', 'jobkorea', 'saramin']);
    for (const id of BG_PRESETS) expect(['이력서', '기타'], id).toContain(getPreset(id)?.group);
    expect(BG_PRESETS).toContain(BG_FALLBACK);
  });

  it('the camera offers it for those and custom only; never for passport, driver licence or another official preset', () => {
    const offered = PRESETS.filter((p) => bgOffered(p.id)).map((p) => p.id).sort();
    expect(offered).toEqual(['half_card', 'jobkorea', 'saramin']);
    expect(bgOffered('custom')).toBe(true);
    for (const id of BG_FORBIDDEN) expect(bgOffered(id), id).toBe(false);
  });

  it('passes an allowed id through; anything else (passport, driver licence, custom, junk, none) becomes saramin', () => {
    for (const id of BG_PRESETS) expect(bgPreset(id)).toBe(id);
    for (const raw of ['passport_online', 'driver_license', 'gosi', 'custom', '"><x', '', null, undefined]) expect(bgPreset(raw), String(raw)).toBe('saramin');
  });
});

describe('addresses (D8b)', () => {
  it('camera -> /remove-background/?bg=white&preset=<allowed id>', () => {
    expect(bgUrl('/remove-background/', 'jobkorea')).toBe('/remove-background/?bg=white&preset=jobkorea');
    expect(bgUrl('/remove-background/', 'passport_online')).toBe('/remove-background/?bg=white&preset=saramin');
  });

  it('/remove-background/ reads ?bg=white and the preset; no preset param = no way back to /id-photo/', () => {
    expect(parseBgLink('?bg=white&preset=half_card')).toEqual({ white: true, preset: 'half_card' });
    expect(parseBgLink('?bg=blue&preset=driver_license')).toEqual({ white: false, preset: 'saramin' });
    expect(parseBgLink('?preset=')).toEqual({ white: false, preset: 'saramin' });
    expect(parseBgLink('')).toEqual({ white: false, preset: null });
  });

  it('the way back is a /id-photo/ deep link that opens the allowed preset (never passport or driver licence)', () => {
    for (const raw of ['saramin', 'jobkorea', 'half_card', 'passport_online', 'driver_license', 'custom']) {
      const url = idPhotoBack('/id-photo/', raw);
      const state = parse('id-photo', url.slice(url.indexOf('?')));
      expect(state?.preset, raw).toBe(bgPreset(raw));
      expect(BG_FORBIDDEN, raw).not.toContain(state?.preset);
    }
  });

  it('a photo coming back on an allowed preset gets no 배경 item on /id-photo/ (D8c)', () => {
    for (const id of BG_PRESETS) {
      const c = checklist({ face: null, state: { cx: 500, cy: 600, s: 0.5, rotDeg: 0 }, preset: getPreset(id)!, srcW: 1000, srcH: 1200, lowres: false, bg: null, bgEdited: true });
      expect([...c.blocks, ...c.warns].some((x) => x.id === 'bgremoved' || x.id === 'bgmaybe'), id).toBe(false);
    }
  });
});

describe('/remove-background/ receiver: a handed-over photo never starts by itself (D8b)', () => {
  it('on this device it waits at the consent panel even with the engine ready; a photo picked here starts as before', () => {
    expect(startsAtOnce(true, true)).toBe(false);
    expect(startsAtOnce(false, true)).toBe(false);
    expect(startsAtOnce(true, false)).toBe(true);
    expect(startsAtOnce(false, false)).toBe(false);
  });

  it('from opening the photo the first stop is ready (cloud) or consent: both show a panel waiting for a press, nothing busy', () => {
    for (const stop of ['ready', 'consent'] as Phase[]) {
      expect(move('opening', stop)).toBe(stop);
      const v = view(stop);
      expect(v.progress || v.cancel || v.result).toBe(false);
      expect(v.ready || v.consent).toBe(true);
    }
  });

  it('copy is plain Korean', () => {
    for (const t of [COPY.held, HELD_START, TO_ID_PHOTO, BACK_FAILED, CAM_COPY.sendingBg]) expect(t.match(JARGON), t).toBeNull();
  });
});
