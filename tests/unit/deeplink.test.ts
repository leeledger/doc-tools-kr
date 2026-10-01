// Growth G.5 (T1): deep-link parse/serialize, whitelist and bounds.
import { describe, expect, it } from 'vitest';
import { MAX_PARAM_LENGTH, parse, parseHref, serialize } from '../../src/lib/ui/deeplink';
import { DEFAULT_PRESET, PRESETS } from '../../src/data/id-photo-presets';
import { DEFAULT_PRESET_ID, PRESET_IDS } from '../../src/data/preset-ids';
import { LIVE_TOOLS } from '../../src/data/tools';

const live = LIVE_TOOLS.map((t) => t.slug);

describe('deeplink (T1)', () => {
  it('round-trips each tool', () => {
    for (const p of PRESETS.filter((x) => x.id !== 'passport_online')) {
      const q = serialize('id-photo', { preset: p.id });
      expect(q).toBe(`?preset=${p.id}`);
      expect(parse('id-photo', q)).toEqual({ preset: p.id });
    }
    for (const kb of [10, 200, 349, 20000]) expect(parse('photo-compress', serialize('photo-compress', { target: kb }))).toEqual({ target: kb });
    for (const mb of [0.5, 10, 25, 99.9, 100]) expect(parse('pdf-compress', serialize('pdf-compress', { target: mb }))).toEqual({ target: mb });
  });

  it('defaults are omitted; a default still parses', () => {
    expect(serialize('photo-compress', { target: 500 })).toBe('');
    expect(serialize('id-photo', { preset: 'passport_online' })).toBe('');
    expect(parse('photo-compress', '?target=500')).toEqual({ target: 500 });
    expect(serialize('pdf-compress', null)).toBe('');
    expect(serialize('pdf-merge', { target: 5 })).toBe('');
  });

  it('invalid, oversized and unknown params give null', () => {
    expect(parse('id-photo', '?preset=../../x')).toBeNull();
    expect(parse('id-photo', '?preset=custom')).toBeNull();
    expect(parse('id-photo', '?preset=GOSI')).toBeNull();
    expect(parse('id-photo', '?foo=gosi')).toBeNull();
    expect(parse('photo-compress', '?target=abc')).toBeNull();
    expect(parse('photo-compress', `?target=${'1'.repeat(MAX_PARAM_LENGTH + 1)}`)).toBeNull();
    expect(parse('photo-compress', '?target=<script>')).toBeNull();
    expect(parse('pdf-merge', '?target=10')).toBeNull();
    expect(parse('nope', '?target=10')).toBeNull();
    expect(parse('photo-compress', '')).toBeNull();
  });

  it('photo target bounds: 10 and 20000 in; 9, 20001, 1e3 and 200.5 out', () => {
    for (const ok of ['10', '20000']) expect(parse('photo-compress', `?target=${ok}`)).toEqual({ target: Number(ok) });
    for (const bad of ['9', '20001', '1e3', '200.5', '-5', ' 200']) expect(parse('photo-compress', new URLSearchParams({ target: bad })), bad).toBeNull();
  });

  it('pdf target bounds: 0.5 and 100 in; 0.45 and 100.1 out', () => {
    expect(parse('pdf-compress', '?target=0.5')).toEqual({ target: 0.5 });
    expect(parse('pdf-compress', '?target=100')).toEqual({ target: 100 });
    for (const bad of ['0.45', '100.1', '0.4', '1e1', '10,5', 'abc']) expect(parse('pdf-compress', new URLSearchParams({ target: bad })), bad).toBeNull();
  });

  it('the id list the deep links check equals the presets (src/data/preset-ids.ts)', () => {
    expect([...PRESET_IDS]).toEqual(PRESETS.map((p) => p.id));
    expect(DEFAULT_PRESET_ID).toBe(DEFAULT_PRESET);
  });

  it('parseHref: live tool paths only, and exactly one valid param', () => {
    expect(parseHref('/pdf-merge/', live)).toEqual({ slug: 'pdf-merge', state: null });
    expect(parseHref('/id-photo/?preset=gosi', live)).toEqual({ slug: 'id-photo', state: { preset: 'gosi' } });
    expect(parseHref('/photo-compress/?target=500', live)).toEqual({ slug: 'photo-compress', state: { target: 500 } });
    for (const bad of ['/nope/', '/pdf-merge/?target=5', '/id-photo/?preset=gosi&x=1', '/photo-compress/?target=0200', 'https://docttak.com/pdf-merge/', '/pdf-merge']) {
      expect(parseHref(bad, live), bad).toBeNull();
    }
  });
});
