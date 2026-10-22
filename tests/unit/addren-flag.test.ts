// 영문주소 변환기 build flag and privacy gate (ADDREN1016 decisions 2-3; scripts/lib/addren.mjs).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flaggedRuntimePages } from '../../scripts/gen-sw.mjs';
import { addrEnFlag, addrEnOn, API_PATH, DEFAULT, privacyGate } from '../../scripts/lib/addren.mjs';

describe('PUBLIC_ADDR_EN', () => {
  it('is off by default; only "1" (trimmed) turns it on', () => {
    expect(DEFAULT).toBe('0');
    expect(addrEnFlag(undefined)).toBe(false);
    expect(addrEnFlag('')).toBe(false);
    expect(addrEnFlag('0')).toBe(false);
    expect(addrEnFlag('true')).toBe(false);
    expect(addrEnFlag('yes')).toBe(false);
    expect(addrEnFlag('1')).toBe(true);
    expect(addrEnFlag(' 1 ')).toBe(true);
    expect(addrEnOn({})).toBe(false);
    expect(addrEnOn({ PUBLIC_ADDR_EN: '1' })).toBe(true);
    expect(API_PATH).toBe('/api/addr-en');
  });

  it('privacy gate: nothing to check when off; officer and a valid contact required when on', () => {
    expect(privacyGate({})).toEqual([]);
    expect(privacyGate({ PUBLIC_ADDR_EN: '0' })).toEqual([]);
    const both = privacyGate({ PUBLIC_ADDR_EN: '1' });
    expect(both).toHaveLength(2);
    expect(both[0]).toMatch(/PUBLIC_PRIVACY_OFFICER/);
    expect(both[1]).toMatch(/PUBLIC_CONTACT_EMAIL/);
    expect(privacyGate({ PUBLIC_ADDR_EN: '1', PUBLIC_PRIVACY_OFFICER: '홍길동', PUBLIC_CONTACT_EMAIL: 'not-an-email' })).toHaveLength(1);
    expect(privacyGate({ PUBLIC_ADDR_EN: '1', PUBLIC_PRIVACY_OFFICER: ' ', PUBLIC_CONTACT_EMAIL: 'a@b.co' })).toHaveLength(1);
    expect(privacyGate({ PUBLIC_ADDR_EN: '1', PUBLIC_PRIVACY_OFFICER: '홍길동', PUBLIC_CONTACT_EMAIL: 'a@b.co' })).toEqual([]);
  });
});

describe('service worker (acting-Arch Q1)', () => {
  it('names /english-address/ only in a build with PUBLIC_ADDR_EN on; sw.ts itself never does', () => {
    // IDCAM1022: /id-photo-camera/ is flag-gated the same way (PUBLIC_ID_CAMERA, default on; off here).
    const off = { PUBLIC_ID_CAMERA: '0' };
    expect(flaggedRuntimePages(off)).toEqual([]);
    expect(flaggedRuntimePages({ ...off, PUBLIC_ADDR_EN: '0' })).toEqual([]);
    expect(flaggedRuntimePages({ ...off, PUBLIC_ADDR_EN: '1' })).toEqual(['/english-address/']);
    expect(flaggedRuntimePages({ PUBLIC_ADDR_EN: '1' })).toEqual(['/english-address/', '/id-photo-camera/']);
    expect(readFileSync(join(__dirname, '..', '..', 'src', 'sw', 'sw.ts'), 'utf8')).not.toContain('english-address');
  });
});
