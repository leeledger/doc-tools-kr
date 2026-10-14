// @vitest-environment jsdom
// REQ1014-A D5/D6: src/lib/ui/utm-land.ts sends the home/guide landing without importing usage.ts (chunk graph).
// These tests keep its copies equal to scripts/lib/usage.mjs / src/lib/ui/usage.ts and its payload valid.
import { describe, expect, it, vi } from 'vitest';
import { LAND_CAMPAIGN, LAND_PATH, LAND_SOURCES, LAND_STASH_KEY, land, landDevice, landPayload, landTarget, landUtm } from '../../src/lib/ui/utm-land';
import { UTM_STASH_KEY, buildPayload, readUtmStash } from '../../src/lib/ui/usage';
import { detectDevice } from '../../src/lib/ui/device';
import { CAMPAIGN_RE, USAGE_PATH, UTM_SOURCES, sampleWeight, utmOf, validate } from '../../scripts/lib/usage.mjs';

const SEARCHES = [
  '?utm_source=naver_blog&utm_campaign=history-exam-photo',
  '?utm_source=TISTORY&utm_campaign=Bad Name',
  '?utm_source=play&utm_medium=twa',
  '?utm_source=evil',
  '?utm_campaign=x',
  '?utm_source=tistory&utm_campaign=' + 'a'.repeat(61),
  '?utm_source=tistory&utm_campaign=%ED%95%9C',
  '',
];

describe('utm-land == usage.mjs / usage.ts', () => {
  it('copied constants and rules are equal', () => {
    expect(LAND_PATH).toBe(USAGE_PATH);
    expect(LAND_SOURCES).toEqual(UTM_SOURCES);
    expect(LAND_CAMPAIGN.source).toBe(CAMPAIGN_RE.source);
    expect(LAND_STASH_KEY).toBe(UTM_STASH_KEY);
    expect(landDevice()).toBe(detectDevice());
    for (const s of SEARCHES) expect(landUtm(s), s).toEqual(utmOf(s));
    for (const rate of [1, 0.5, 0.3, 0.1, 0.01]) expect(landPayload({ t: 'home' }, { us: 'play', uc: 'none' }, { device: 'desktop', build: 'dev', rate }).w).toBe(sampleWeight(rate));
  });

  it("the payload is buildPayload's (keys, order, values) and passes validate() within 512 bytes", () => {
    const ctx = { device: 'mobile' as const, build: 'abc1234', rate: 0.5 };
    const cases = [
      [{ t: 'home' as const }, { us: 'play', uc: 'none' }],
      [{ t: 'guide' as const, g: 'history-exam-photo' }, { us: 'tistory', uc: 'other' }],
      [{ t: 'guide' as const }, { us: 'naver_blog', uc: 'a'.repeat(60) }],
    ] as const;
    for (const [target, utm] of cases) {
      const ours = landPayload(target, utm, ctx);
      const theirs = buildPayload({ e: 'land', ...target, ...utm }, { via: 'guide', ua: 'x', device: 'mobile', build: 'abc1234', w: 2 });
      expect(JSON.stringify(ours)).toBe(JSON.stringify(theirs));
      expect(validate(JSON.stringify(ours))).toMatchObject({ e: 'land', t: target.t, us: utm.us, uc: utm.uc, via: 'direct' });
      expect(new TextEncoder().encode(JSON.stringify(ours)).length).toBeLessThanOrEqual(512);
    }
    expect(landPayload({ t: 'home' }, { us: 'play', uc: 'none' }, { device: 'desktop', build: 'nope', rate: 1 }).b).toBe('dev');
  });

  it.each([
    ['/', { t: 'home' }],
    ['/guide/history-exam-photo/', { t: 'guide', g: 'history-exam-photo' }],
    ['/guide/', { t: 'guide' }],
    ['/guide/a/b/', null],
    ['/privacy/', null],
    ['/id-photo/', null],
    ['/en/', null],
    ['/embed/id-photo/', null],
  ])('landTarget(%s)', (path, want) => {
    expect(landTarget(path)).toEqual(want);
  });
});

describe('land()', () => {
  const T0 = 1_760_000_000_000;
  const run = (over: Record<string, unknown> = {}) => {
    document.documentElement.lang = 'ko';
    document.head.innerHTML = '<meta name="build-id" content="abc1234">';
    const sent: [string, string][] = [];
    const m = new Map<string, string>();
    land({ rate: 1, random: () => 0, send: (p: string, b: string) => (sent.push([p, b]), true), lang: 'ko', pathname: '/', search: '?utm_source=play&utm_medium=twa', storage: { setItem: (k: string, v: string) => void m.set(k, v) }, now: () => T0, ...over } as never);
    return { sent, m, bodies: sent.map((s) => JSON.parse(s[1]) as Record<string, unknown>) };
  };

  it('home: one land to /api/usage and the stash the tracker reads', () => {
    const r = run();
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0]![0]).toBe('/api/usage');
    expect(r.bodies[0]).toEqual({ e: 'land', t: 'home', us: 'play', uc: 'none', via: 'direct', d: 'desktop', b: 'abc1234', w: 1 });
    const stash = r.m.get(UTM_STASH_KEY)!;
    expect(readUtmStash({ getItem: () => stash, setItem: () => undefined, removeItem: () => undefined }, T0 + 1000)).toEqual({ us: 'play', uc: 'none' });
  });

  it('a guide gives t guide with g; the guide index has no g', () => {
    expect(run({ pathname: '/guide/history-exam-photo/', search: '?utm_source=tistory&utm_campaign=Bad Name' }).bodies[0]).toMatchObject({ t: 'guide', g: 'history-exam-photo', us: 'tistory', uc: 'other' });
    expect(run({ pathname: '/guide/', search: '?utm_source=tistory' }).bodies[0]).not.toHaveProperty('g');
  });

  it('nothing on other pages, without utm_source, or on a non-Korean page', () => {
    for (const over of [{ pathname: '/privacy/' }, { search: '?utm_campaign=x' }, { search: '' }, { lang: 'en' }]) {
      const r = run(over);
      expect(r.sent, JSON.stringify(over)).toHaveLength(0);
      expect(r.m.size).toBe(0);
    }
  });

  it('not sampled: stashed, no beacon; a throwing storage or send never throws and still sends', () => {
    const r = run({ rate: 0.5, random: () => 0.9 });
    expect(r.sent).toHaveLength(0);
    expect(r.m.size).toBe(1);
    const sent: string[] = [];
    expect(() => land({ rate: 1, random: () => 0, lang: 'ko', pathname: '/', search: '?utm_source=play', storage: { setItem: () => { throw new Error('quota'); } }, send: (_p, b) => (sent.push(b), true) })).not.toThrow();
    expect(sent).toHaveLength(1);
    expect(() => land({ rate: 1, random: () => 0, lang: 'ko', pathname: '/', search: '?utm_source=play', storage: null, send: () => { throw new Error('blocked'); } })).not.toThrow();
  });

  it('defaults read the page: lang, path, query and sessionStorage', () => {
    const send = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: send });
    document.documentElement.lang = 'ko';
    window.history.replaceState(null, '', '/?utm_source=naver_blog&utm_campaign=x');
    land({ rate: 1, random: () => 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem(UTM_STASH_KEY)!)).toMatchObject({ s: 'naver_blog', c: 'x' });
    vi.unstubAllGlobals();
  });
});
