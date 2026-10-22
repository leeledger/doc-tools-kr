// 증명사진 촬영 (IDCAM1022 Step B test map): the capture geometry (overlay rectangle per preset aspect in portrait and
// landscape frames, unmirror, low resolution, black frame), the camera error copy, the PUBLIC_ID_CAMERA flag and its
// _headers block, the /id-photo/ D8c items for a photo from 배경 지우기, and the hand-over address.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRESETS, getPreset, type IdPreset } from '../../src/data/id-photo-presets';
import { BLACK_LUMA, isBlackFrame, isLowres, meanLuma, overlayRect, toBox, unmirrorRect } from '../../src/tools/id-photo-camera/capture';
import { CAMERA_ERRORS, cameraErrorMessage, cameraFailCode } from '../../src/tools/id-photo-camera/errors';
import { COPY, HINTS } from '../../src/tools/id-photo-camera/copy';
import { idPhotoUrl } from '../../src/tools/id-photo-camera/send';
import { constraints } from '../../src/tools/id-photo-camera/controller';
import { manualFrame } from '../../src/lib/idphoto/frame';
import { COPY as CHECK_COPY, checklist } from '../../src/lib/idphoto/warnings';
import { CAMERA_POLICY, DEFAULT, ID_CAMERA_PATH, SITE_POLICY, cameraHeaderProblems, cameraHeaders, idCameraFlag, idCameraOn, policyFor } from '../../scripts/lib/idcamera.mjs';
import { siteHeaders } from '../../scripts/gen-headers.mjs';
import { flaggedRuntimePages } from '../../scripts/gen-sw.mjs';
import { JARGON } from '../../scripts/lib/plain-words.mjs';
import { TOOLS as USAGE_TOOLS, validate } from '../../scripts/lib/usage.mjs';
import { ID_CAMERA_TOOL, TOOLS } from '../../src/data/tools';

const PUBLIC_HEADERS = readFileSync(join(__dirname, '..', '..', 'public', '_headers'), 'utf8');
const preset = (id: string): IdPreset => getPreset(id)!;

describe('overlayRect (D3)', () => {
  it('is the largest centred rectangle of the preset aspect, in whole pixels, inside portrait and landscape frames', () => {
    const frames = [
      { w: 1920, h: 1080 },
      { w: 1080, h: 1920 },
      { w: 2560, h: 1440 },
      { w: 1440, h: 2560 },
      { w: 640, h: 480 },
      { w: 480, h: 640 },
      { w: 432, h: 560 },
    ];
    for (const p of PRESETS) {
      for (const f of frames) {
        const r = overlayRect(f, { w: p.outW, h: p.outH });
        const label = `${p.id} ${f.w}x${f.h}`;
        expect(Number.isInteger(r.x) && Number.isInteger(r.y) && Number.isInteger(r.w) && Number.isInteger(r.h), label).toBe(true);
        expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= f.w && r.y + r.h <= f.h, label).toBe(true);
        // One side spans the frame; the aspect is the preset's within rounding.
        expect(r.w === f.w || r.h === f.h, label).toBe(true);
        expect(Math.abs(r.w / r.h - p.outW / p.outH), label).toBeLessThan(1.5 / Math.min(r.w, r.h));
        // Centred (to the pixel).
        expect(Math.abs(r.x - (f.w - r.x - r.w)), label).toBeLessThanOrEqual(1);
        expect(Math.abs(r.y - (f.h - r.y - r.h)), label).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the passport rectangle of a landscape 1920×1080 frame is 840×1080 at x 540; of a portrait 1080×1920, 1080×1389 at y 265', () => {
    expect(overlayRect({ w: 1920, h: 1080 }, { w: 413, h: 531 })).toEqual({ x: 540, y: 0, w: 840, h: 1080 });
    expect(overlayRect({ w: 1080, h: 1920 }, { w: 413, h: 531 })).toEqual({ x: 0, y: 265, w: 1080, h: 1389 });
  });

  it('/id-photo/ manualFrame of the still is the whole still: what was lined up is what opens', () => {
    for (const p of PRESETS) {
      const r = overlayRect({ w: 2560, h: 1440 }, { w: p.outW, h: p.outH });
      const fr = manualFrame({ w: p.outW, h: p.outH }, r.w, r.h);
      // The crop of the output aspect covers the still (within one pixel of rounding).
      expect(Math.abs((p.outW / fr.state.s) - r.w), p.id).toBeLessThanOrEqual(1.5);
      expect(Math.abs((p.outH / fr.state.s) - r.h), p.id).toBeLessThanOrEqual(1.5);
      expect(fr.state.cx).toBe(r.w / 2);
      expect(fr.state.cy).toBe(r.h / 2);
    }
  });

  it('an empty frame or aspect gives an empty rectangle', () => {
    expect(overlayRect({ w: 0, h: 0 }, { w: 413, h: 531 })).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(overlayRect({ w: 640, h: 480 }, { w: 0, h: 531 })).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe('unmirror, box, lowres, black frame (D5, Failure modes)', () => {
  it('a rectangle seen on the mirrored preview maps back to the frame; a centred one is unchanged', () => {
    expect(unmirrorRect({ x: 100, y: 20, w: 300, h: 400 }, 1000, true)).toEqual({ x: 600, y: 20, w: 300, h: 400 });
    expect(unmirrorRect({ x: 100, y: 20, w: 300, h: 400 }, 1000, false)).toEqual({ x: 100, y: 20, w: 300, h: 400 });
    const c = overlayRect({ w: 1920, h: 1080 }, { w: 413, h: 531 });
    expect(unmirrorRect(c, 1920, true)).toEqual(c);
    // Twice mirrored is the identity.
    const r = { x: 7, y: 3, w: 11, h: 13 };
    expect(unmirrorRect(unmirrorRect(r, 50, true), 50, true)).toEqual(r);
  });

  it('toBox scales frame pixels to the shown box', () => {
    expect(toBox({ x: 540, y: 0, w: 840, h: 1080 }, { w: 1920, h: 1080 }, { w: 960, h: 540 })).toEqual({ x: 270, y: 0, w: 420, h: 540 });
    expect(toBox({ x: 1, y: 1, w: 1, h: 1 }, { w: 0, h: 0 }, { w: 10, h: 10 })).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it('lowres: a 640×480 front camera cannot make 413×531; a 1280×720 one can', () => {
    const out = { w: 413, h: 531 };
    expect(isLowres(overlayRect({ w: 640, h: 480 }, out), out)).toBe(true);
    expect(isLowres(overlayRect({ w: 1280, h: 720 }, out), out)).toBe(false);
    expect(isLowres(overlayRect({ w: 432, h: 560 }, out), out)).toBe(false);
    expect(isLowres(overlayRect({ w: 640, h: 480 }, { w: 100, h: 140 }), { w: 100, h: 140 })).toBe(false);
  });

  it('mean luma and the black-frame refusal', () => {
    const px = (r: number, g: number, b: number, n = 4) => Uint8ClampedArray.from({ length: n * 4 }, (_, i) => [r, g, b, 255][i % 4]!);
    expect(meanLuma(px(255, 255, 255))).toBeCloseTo(255, 6);
    expect(meanLuma(px(0, 0, 0))).toBe(0);
    expect(meanLuma(new Uint8ClampedArray(0))).toBe(0);
    expect(isBlackFrame(px(0, 0, 0))).toBe(true);
    expect(isBlackFrame(px(BLACK_LUMA + 1, BLACK_LUMA + 1, BLACK_LUMA + 1))).toBe(false);
    expect(isBlackFrame(px(30, 30, 30))).toBe(false);
  });

  it('asks for the largest picture, the chosen side, and no sound', () => {
    expect(constraints('user')).toEqual({ video: { facingMode: 'user', width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false });
    expect((constraints('environment').video as MediaTrackConstraints).facingMode).toBe('environment');
  });
});

describe('camera errors (D7)', () => {
  it('maps each DOMException name to its copy', () => {
    const e = (name: string) => new DOMException('x', name);
    expect(cameraFailCode(e('NotAllowedError'))).toBe('denied');
    expect(cameraFailCode(e('SecurityError'))).toBe('denied');
    expect(cameraFailCode(e('NotFoundError'))).toBe('notfound');
    expect(cameraFailCode(e('OverconstrainedError'))).toBe('notfound');
    expect(cameraFailCode(e('NotReadableError'))).toBe('busy');
    expect(cameraFailCode(e('AbortError'))).toBe('other');
    expect(cameraFailCode(new TypeError('bad'))).toBe('other');
    expect(cameraFailCode(undefined)).toBe('other');
    expect(cameraFailCode(null)).toBe('nosupport');
    expect(cameraErrorMessage(e('NotAllowedError'))).toBe(CAMERA_ERRORS.denied);
    expect(CAMERA_ERRORS.denied).toBe('카메라를 쓸 수 없어요. 카메라 사용을 허용하지 않았거나 휴대폰 설정에서 막혀 있어요. 설정에서 카메라를 허용하거나, 아래 「휴대폰 카메라로 찍기」를 눌러 주세요.');
    expect(CAMERA_ERRORS.busy).toBe('다른 앱이 카메라를 쓰고 있어요. 그 앱을 닫고 다시 눌러 주세요.');
  });

  it('every message is plain: no 브라우저/권한/업로드/서버 or other jargon', () => {
    const texts = [...Object.values(CAMERA_ERRORS), ...Object.values(HINTS), ...Object.values(COPY).map((v) => (typeof v === 'function' ? (v as (a: number, b: number) => string)(413, 531) : v))];
    for (const t of texts) {
      expect(t, t).not.toMatch(/브라우저|권한|업로드|서버/);
      expect(t.match(JARGON), t).toBeNull();
    }
  });

  it('every usage code is a valid fail code for the tool', () => {
    for (const c of Object.keys(CAMERA_ERRORS)) expect(validate(JSON.stringify({ e: 'fail', t: 'id-photo-camera', c, p: 'load', via: 'direct', d: 'mobile', br: 'chrome 131', b: 'dev', w: 1 })), c).not.toBeNull();
    expect(USAGE_TOOLS).toContain('id-photo-camera');
    expect(validate(JSON.stringify({ e: 'next', t: 'id-photo-camera', o: 'next', v: 'id-photo', via: 'direct', d: 'mobile', b: 'dev', w: 1 }))).not.toBeNull();
    expect(validate(JSON.stringify({ e: 'start', t: 'id-photo-camera', o: 'preset', v: 'passport_online', via: 'direct', d: 'mobile', b: 'dev', w: 1 }))).not.toBeNull();
  });
});

describe('PUBLIC_ID_CAMERA (D9, D10)', () => {
  it('defaults on; only "1" is on', () => {
    expect(DEFAULT).toBe('1');
    expect(idCameraFlag(undefined)).toBe(true);
    expect(idCameraFlag('')).toBe(true);
    expect(idCameraFlag(' 1 ')).toBe(true);
    expect(idCameraFlag('0')).toBe(false);
    expect(idCameraFlag('true')).toBe(false);
    expect(idCameraOn({ PUBLIC_ID_CAMERA: '0' })).toBe(false);
    expect(idCameraOn({})).toBe(true);
  });

  it('the final _headers: camera=(self) on the camera route only; camera=() everywhere else, the embed widget included', () => {
    const on = siteHeaders(PUBLIC_HEADERS, {}).headers;
    expect(policyFor(on, ID_CAMERA_PATH)).toBe(CAMERA_POLICY);
    for (const p of ['/', '/id-photo/', '/embed/id-photo/', '/id-photo-camera-x/', '/guide/passport-photo/']) expect(policyFor(on, p), p).toBe(SITE_POLICY);
    expect(cameraHeaderProblems(on, true)).toEqual([]);
    const off = siteHeaders(PUBLIC_HEADERS, { PUBLIC_ID_CAMERA: '0' }).headers;
    expect(off).not.toContain(ID_CAMERA_PATH);
    expect(policyFor(off, ID_CAMERA_PATH)).toBe(SITE_POLICY);
    expect(cameraHeaderProblems(off, false)).toEqual([]);
    // Each check catches the other build.
    expect(cameraHeaderProblems(off, true).length).toBeGreaterThan(0);
    expect(cameraHeaderProblems(on, false).length).toBeGreaterThan(0);
    // A block without the detach would send both policies joined: caught.
    expect(cameraHeaderProblems(`${PUBLIC_HEADERS}${ID_CAMERA_PATH}*\n  Permissions-Policy: ${CAMERA_POLICY}\n`, true).join()).toContain(ID_CAMERA_PATH);
    expect(cameraHeaders(false)).toBe('');
  });

  it('the page is a live tool right after 여권·증명사진 규격 맞추기, and the service worker names it only when on', () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(slugs.indexOf('id-photo-camera')).toBe(slugs.indexOf('id-photo') + 1);
    expect(ID_CAMERA_TOOL.status).toBe('live');
    expect([...ID_CAMERA_TOOL.title].length).toBeLessThanOrEqual(40);
    expect([...ID_CAMERA_TOOL.description].length).toBeGreaterThanOrEqual(40);
    expect([...ID_CAMERA_TOOL.description].length).toBeLessThanOrEqual(80);
    expect(flaggedRuntimePages({ PUBLIC_ID_CAMERA: '0' })).toEqual([]);
    expect(flaggedRuntimePages({})).toEqual([ID_CAMERA_PATH]);
  });
});

describe('hand-over to /id-photo/ (D2)', () => {
  it('opens /id-photo/ with the chosen preset; an unknown id falls back to the default', () => {
    expect(idPhotoUrl('/id-photo/', 'passport_online')).toBe('/id-photo/?preset=passport_online');
    expect(idPhotoUrl('/id-photo/', 'saramin')).toBe('/id-photo/?preset=saramin');
    expect(idPhotoUrl('/id-photo/', '"><x')).toBe('/id-photo/?preset=passport_online');
  });
});

describe('/id-photo/ checklist for a photo from 배경 지우기 (D8c plumbing)', () => {
  const base = (id: string, from: string | null) =>
    checklist({ face: null, state: { cx: 500, cy: 600, s: 0.5, rotDeg: 0 }, preset: preset(id), srcW: 1000, srcH: 1200, lowres: false, bg: null, bgEdited: from === 'remove-background' });

  it('passport and driver licence: a blocking item quoting the rule', () => {
    const p = base('passport_online', 'remove-background');
    expect(p.blocks.map((b) => b.id)).toContain('bgremoved');
    expect(p.blocks.find((b) => b.id === 'bgremoved')!.text).toBe(CHECK_COPY.bgPassport);
    expect(CHECK_COPY.bgPassport).toContain('「배경이 흰색이 아니거나, 배경색을 사진 편집 프로그램으로 제거하여 사진이 변형된 경우」');
    const d = base('driver_license', 'remove-background');
    expect(d.blocks.find((b) => b.id === 'bgremoved')!.text).toBe(CHECK_COPY.bgLicense);
  });

  it('other official presets: a non-blocking note; 이력서, 기타 and custom: nothing', () => {
    for (const id of ['gosi', 'qnet', 'id_card']) {
      const c = base(id, 'remove-background');
      expect(c.blocks.some((b) => b.id === 'bgremoved'), id).toBe(false);
      expect(c.warns.map((w) => w.id), id).toContain('bgmaybe');
    }
    for (const id of ['saramin', 'jobkorea', 'half_card']) {
      const c = base(id, 'remove-background');
      expect([...c.blocks, ...c.warns].some((x) => x.id === 'bgremoved' || x.id === 'bgmaybe'), id).toBe(false);
    }
  });

  it('a photo from the camera or picked on the page: no item', () => {
    for (const from of ['id-photo-camera', null]) {
      const c = base('passport_online', from);
      expect([...c.blocks, ...c.warns].some((x) => x.id === 'bgremoved' || x.id === 'bgmaybe')).toBe(false);
    }
  });
});
