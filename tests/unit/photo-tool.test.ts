// 사진 용량 줄이기: options (KB × 1000, validation, display rounding), limits (every row of brief §3.4),
// the batch queue (crash, cancel) and the ZIP builder (dedupe, UTF-8 flag, failure path).
import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { capSize } from '../../src/lib/image/decode';
import { NOTES } from '../../src/lib/image/messages';
import { LIMITS, checkCount, checkDims, checkFileBytes, checkRun } from '../../src/tools/photo-compress/limits';
import { formatSize } from '../../src/lib/ui/format';
import { DEFAULT_FORM, parseOptions, parseWhole, reductionPercent, type FormState } from '../../src/tools/photo-compress/options';
import { cancelRun, crash, currentRow, startRun, type QueueRow } from '../../src/tools/photo-compress/queue';
import { doneSummary, outcomeOf, type OutcomeRow } from '../../src/tools/photo-compress/headline';
import { buildZip, dedupeNames } from '../../src/tools/photo-compress/zip';

const MB = 1024 * 1024;
const form = (over: Partial<FormState>): FormState => ({ ...DEFAULT_FORM, ...over });

describe('options', () => {
  it('target presets and free input are KB × 1000 bytes (1 MB = 1,000,000)', () => {
    expect(parseOptions(form({}))).toMatchObject({ ok: true, targetKb: 500, options: { mode: 'target', targetBytes: 500_000 } });
    expect(parseOptions(form({ target: '1000' }))).toMatchObject({ ok: true, options: { targetBytes: 1_000_000 } });
    expect(parseOptions(form({ target: 'custom', targetCustom: '150' }))).toMatchObject({ ok: true, options: { targetBytes: 150_000 } });
    expect(parseOptions(form({ target: 'custom', targetCustom: '20,000' }))).toMatchObject({ ok: true, options: { targetBytes: 20_000_000 } });
  });
  it('invalid free input is rejected with the range message', () => {
    for (const bad of ['5', 'abc', '', '20001', '1.5', '-10']) {
      const p = parseOptions(form({ target: 'custom', targetCustom: bad }));
      expect(p, bad).toMatchObject({ ok: false, field: 'targetCustom', message: '10부터 20,000 사이의 숫자(KB)를 입력해 주세요.' });
    }
    expect(parseOptions(form({ mode: 'percent', percent: 'custom', percentCustom: '95' }))).toMatchObject({ ok: false, field: 'percentCustom' });
    expect(parseOptions(form({ edge: 'custom', edgeCustom: '63' }))).toMatchObject({ ok: false, field: 'edgeCustom' });
    expect(parseOptions(form({ edge: 'custom', edgeCustom: '16385' }))).toMatchObject({ ok: false, field: 'edgeCustom' });
  });
  it('percent, quality and the max long edge', () => {
    expect(parseOptions(form({ mode: 'percent' }))).toMatchObject({ ok: true, options: { mode: 'percent', percent: 50 } });
    expect(parseOptions(form({ mode: 'percent', percent: 'custom', percentCustom: '10' }))).toMatchObject({ ok: true, options: { percent: 10 } });
    expect(parseOptions(form({ mode: 'quality' }))).toMatchObject({ ok: true, options: { mode: 'quality', quality: 80 } });
    expect(parseOptions(form({ edge: '1920' }))).toMatchObject({ ok: true, options: { maxLongEdge: 1920 } });
    expect(parseOptions(form({ edge: 'custom', edgeCustom: '64' }))).toMatchObject({ ok: true, options: { maxLongEdge: 64 } });
    expect(parseOptions(form({}))).toMatchObject({ ok: true, options: { maxLongEdge: null } });
  });
  it('fast mode never applies to WebP', () => {
    expect(parseOptions(form({ fast: true }))).toMatchObject({ ok: true, options: { fast: true, format: 'jpeg' } });
    expect(parseOptions(form({ fast: true, format: 'webp' }))).toMatchObject({ ok: true, options: { fast: false, format: 'webp' } });
  });
  it('parseWhole accepts digits and thousands commas only', () => {
    expect(parseWhole(' 1,500 ', 10, 20000)).toBe(1500);
    expect(parseWhole('1e3', 10, 20000)).toBeNull();
  });
  it('display sizes (shared formatSize, Polish P.14): 1024-based KB rounded up, MB by the formatMB rule', () => {
    expect(formatSize(498_995)).toBe('488 KB');
    expect(formatSize(1024 * 100)).toBe('100 KB');
    expect(formatSize(1024 * 100 + 1)).toBe('101 KB');
    expect(formatSize(200_000)).toBe('196 KB');
    expect(formatSize(3.2 * MB)).toBe('3.2 MB');
  });
  it('reduction percent is floored and clamped', () => {
    expect(reductionPercent(1000, 149)).toBe(85);
    expect(reductionPercent(1000, 1200)).toBe(0);
    expect(reductionPercent(1000, 0)).toBe(100);
  });
});

describe('limits (brief §3.4)', () => {
  it('photos per run: 50 on PC, 20 on a phone; extra files are left out with a message', () => {
    expect(checkCount(0, 50, 'desktop')).toEqual({ accept: 50, message: null });
    const d = checkCount(48, 5, 'desktop');
    expect(d.accept).toBe(2);
    expect(d.message).toContain('50장');
    expect(d.message).toContain('3장');
    const m = checkCount(0, 21, 'mobile');
    expect(m.accept).toBe(20);
    expect(m.message).toContain('20장');
  });
  it('bytes per file: > 100 MB on PC, > 50 MB on a phone', () => {
    expect(checkFileBytes(100 * MB, 'desktop')).toBeNull();
    expect(checkFileBytes(100 * MB + 1, 'desktop')).toContain('100 MB');
    expect(checkFileBytes(50 * MB, 'mobile')).toBeNull();
    expect(checkFileBytes(50 * MB + 1, 'mobile')).toContain('50 MB');
  });
  it('total bytes (soft): > 500 MB on PC, > 150 MB on a phone', () => {
    expect(checkRun(500 * MB, false, 'desktop')).toBeNull();
    expect(checkRun(500 * MB + 1, false, 'desktop')).toContain('500 MB');
    expect(checkRun(150 * MB + 1, false, 'mobile')).toContain('150 MB');
  });
  it('megapixels: soft > 50 MP on PC (none on a phone), hard > 150 MP / > 64 MP', () => {
    expect(checkDims(10000, 5000, 'desktop')).toEqual({ level: 'ok' });
    expect(checkDims(10000, 5001, 'desktop')).toMatchObject({ level: 'soft', message: expect.stringContaining('5,000만 화소(50 MP)') });
    expect(checkRun(1, true, 'desktop')).toContain('50 MP');
    expect(checkRun(1, true, 'mobile')).toBeNull();
    expect(checkDims(15000, 10000, 'desktop')).toMatchObject({ level: 'soft' });
    expect(checkDims(15000, 10001, 'desktop')).toMatchObject({ level: 'hard', message: expect.stringContaining('1억 5,000만 화소(150 MP)') });
    expect(checkDims(8000, 8000, 'mobile')).toEqual({ level: 'ok' });
    expect(checkDims(8000, 8001, 'mobile')).toMatchObject({
      level: 'hard',
      message: '휴대폰에서는 6,400만 화소(64 MP)까지 줄일 수 있습니다. 더 큰 사진은 처리하기에 너무 커서 화면이 멈출 수 있기 때문입니다.',
    });
  });
  it('long side: > 32,767 px on PC, > 16,384 px on a phone (the 20,000 × 1,000 panorama)', () => {
    expect(checkDims(20000, 1000, 'desktop')).toEqual({ level: 'ok' });
    expect(checkDims(32768, 100, 'desktop')).toMatchObject({ level: 'hard', message: expect.stringContaining('32,767픽셀') });
    expect(checkDims(20000, 1000, 'mobile')).toMatchObject({ level: 'hard', message: expect.stringContaining('16,384픽셀') });
  });
  it('working long edge: none on PC, 4,096 px on a phone; the cap keeps the aspect', () => {
    expect(LIMITS.desktop.workingLongEdge).toBeNull();
    expect(LIMITS.mobile.workingLongEdge).toBe(4096);
    expect(capSize(5000, 3750, 4096)).toEqual({ width: 4096, height: 3072 });
    expect(capSize(3000, 8000, 4096)).toEqual({ width: 1536, height: 4096 });
    expect(capSize(4000, 3000, 4096)).toEqual({ width: 4000, height: 3000 });
    expect(capSize(4000, 3000, null)).toEqual({ width: 4000, height: 3000 });
  });
});

describe('queue', () => {
  const rows = (...states: QueueRow['state'][]): QueueRow[] => states.map((state, i) => ({ id: i + 1, state }));

  it('a run takes every row that passed the pre-flight checks', () => {
    const r = rows('pending', 'invalid', 'done', 'error', 'kept');
    expect(startRun(r)).toEqual([1, 3, 4, 5]);
    expect(r.map((x) => x.state)).toEqual(['pending', 'invalid', 'pending', 'pending', 'pending']);
  });
  it('a crash fails the current row and hands the waiting rows to a fresh worker', () => {
    const r = rows('done', 'search', 'pending', 'pending');
    expect(currentRow(r, [1, 2, 3, 4])).toBe(2);
    expect(crash(r, [1, 2, 3, 4])).toEqual({ failed: 2, rest: [3, 4] });
    expect(r.map((x) => x.state)).toEqual(['done', 'error', 'pending', 'pending']);
    // Before any phase message: the first waiting row is the current one.
    const fresh = rows('pending', 'pending');
    expect(crash(fresh, [1, 2])).toEqual({ failed: 1, rest: [2] });
  });
  it('cancel keeps finished rows; running and waiting rows go back to 대기', () => {
    const r = rows('done', 'final', 'pending', 'invalid');
    expect(cancelRun(r)).toEqual({ anyFinished: true });
    expect(r.map((x) => x.state)).toEqual(['done', 'pending', 'pending', 'invalid']);
    expect(cancelRun(rows('decode', 'pending'))).toEqual({ anyFinished: false });
  });
});

describe('done summary (Polish Q: 줄임 / 그대로 / 늘어남 apart; never "줄였습니다" for a grown photo)', () => {
  const kb = (b: number): string => `${Math.round(b / 1000)} KB`;
  const res = (inBytes: number, outBytes: number): OutcomeRow => ({ outcome: outcomeOf('done', { inBytes, outBytes }), inBytes, outBytes });
  it('outcomes from the row state and the result sizes', () => {
    expect(outcomeOf('done', { inBytes: 10, outBytes: 5 })).toBe('reduced');
    expect(outcomeOf('done', { inBytes: 10, outBytes: 12 })).toBe('grown');
    expect(outcomeOf('done', { inBytes: 10, outBytes: 10 })).toBe('same');
    expect(outcomeOf('kept', null)).toBe('same');
    expect(outcomeOf('pending', null)).toBe('waiting');
    for (const st of ['error', 'invalid']) expect(outcomeOf(st, null)).toBe('failed');
  });
  it('one photo: its own sentence, never "1장 중 1장"', () => {
    expect(doneSummary([res(3_600_000, 192_000)], kb)).toEqual({ text: '사진을 줄였습니다.', sizes: '3600 KB → 192 KB' });
    expect(doneSummary([res(26_000, 87_000)], kb)).toEqual({ text: '다시 저장해 용량이 조금 늘었습니다.', sizes: '26 KB → 87 KB' });
    expect(doneSummary([{ outcome: 'same' }], kb).text).toBe('이미 충분히 작아서 그대로 두었어요. 원본을 받으셔도 됩니다.');
    expect(doneSummary([{ outcome: 'failed' }], kb)).toEqual({ text: '사진을 줄이지 못했습니다.', sizes: null });
  });
  it('the audit case (281 KB and 340 KB kept, 26 KB grown): no "줄였습니다", no total', () => {
    const s = doneSummary([{ outcome: 'same' }, { outcome: 'same' }, res(26_000, 87_000)], kb);
    expect(s).toEqual({ text: '사진 3장: 그대로 2장 · 늘어남 1장', sizes: null });
    expect(s.text).not.toContain('줄였');
  });
  it('mixed: counts apart; the total covers the reduced photos only', () => {
    const s = doneSummary([res(1_000_000, 200_000), res(500_000, 100_000), res(26_000, 87_000), { outcome: 'failed' }, { outcome: 'waiting' }], kb);
    expect(s).toEqual({ text: '사진 5장: 줄임 2장 · 늘어남 1장 · 못 줄임 1장 · 대기 1장', sizes: '(줄인 사진 1500 KB → 300 KB)' });
    expect(doneSummary([res(1_000_000, 200_000), res(500_000, 100_000)], kb)).toEqual({ text: '사진 2장을 모두 줄였습니다.', sizes: '1500 KB → 300 KB' });
  });
});

describe('zip', () => {
  it('dedupes names case-insensitively with _2, _3', () => {
    expect(dedupeNames(['a_압축.jpg', 'A_압축.jpg', 'a_압축.jpg', 'b.jpg', 'a_압축_2.jpg'])).toEqual(['a_압축.jpg', 'A_압축_2.jpg', 'a_압축_3.jpg', 'b.jpg', 'a_압축_2_2.jpg']);
    expect(dedupeNames(['noext', 'noext'])).toEqual(['noext', 'noext_2']);
  });
  it('stores the files (level 0) under UTF-8 names: bit 11 set in each local header', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([9, 9]);
    const zip = buildZip([
      { name: '사진_압축.jpg', bytes: a },
      { name: '사진_압축.jpg', bytes: b },
      { name: 'scene_압축.jpg', bytes: a },
    ]);
    const out = unzipSync(zip);
    expect(Object.keys(out)).toEqual(['사진_압축.jpg', '사진_압축_2.jpg', 'scene_압축.jpg']);
    expect(Array.from(out['사진_압축_2.jpg']!)).toEqual([9, 9]);
    const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    let headers = 0;
    for (let i = 0; i + 30 < zip.length; i++) {
      if (dv.getUint32(i, true) !== 0x04034b50) continue;
      headers++;
      expect(dv.getUint16(i + 6, true) & 0x0800, 'UTF-8 flag').toBe(0x0800);
      expect(dv.getUint16(i + 8, true), 'stored').toBe(0);
    }
    expect(headers).toBe(3);
  });
  it('a failing builder throws (the page shows the ZIP banner)', () => {
    const failing = (() => {
      throw new RangeError('Array buffer allocation failed');
    }) as unknown as typeof zipSync;
    expect(() => buildZip([{ name: 'a.jpg', bytes: new Uint8Array(1) }], failing)).toThrow(RangeError);
  });
});

describe('grown-file line (round 3)', () => {
  it('privacy reason only for a privacy/orientation re-save', () => {
    const line = NOTES.grown('25.4 KB', '86.4 KB', true, true);
    expect(line).toBe('25.4 KB → 86.4 KB (늘어남) — 위치 정보 등 개인정보를 지우고 방향을 바로잡느라 다시 저장했습니다. 목표 용량 안입니다.');
  });
  it('a clean PNG/BMP/GIF or CMYK JPEG converted to JPG gets the neutral line, never the privacy reason', () => {
    const line = NOTES.grown('8.7 KB', '43.5 KB', true, false);
    expect(line).toBe('8.7 KB → 43.5 KB (늘어남) — JPG로 바꾸느라 용량이 늘었습니다. 제출처가 원래 형식을 받는다면 원본을 쓰셔도 됩니다. 목표 용량 안입니다.');
    expect(line).not.toContain('개인정보');
  });
  it('" 목표 용량 안입니다." only when a target exists', () => {
    expect(NOTES.grown('1 KB', '2 KB', false, false)).toBe('1 KB → 2 KB (늘어남) — JPG로 바꾸느라 용량이 늘었습니다. 제출처가 원래 형식을 받는다면 원본을 쓰셔도 됩니다.');
    expect(NOTES.grown('1 KB', '2 KB', false, true)).toBe('1 KB → 2 KB (늘어남) — 위치 정보 등 개인정보를 지우고 방향을 바로잡느라 다시 저장했습니다.');
  });
});
