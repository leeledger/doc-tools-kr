import { describe, expect, it } from 'vitest';
import { DESC_MAX, DESC_MIN, OG_DESC_MAX, TITLE_MAX, decodeEntities, headMeta, metaLen, metaProblems } from '../../scripts/lib/meta-length.mjs';
import * as site from '../../src/data/site';
import { BG_REMOVE_TOOL, HOME_TITLE, LIVE_TOOLS, TOOLS } from '../../src/data/tools';

const page = (o: { title?: string; desc?: string; ogTitle?: string; twTitle?: string; ogDesc?: string; twDesc?: string; body?: string }) => {
  const m = (k: string, attr: string, v?: string) => (v === undefined ? '' : `<meta ${attr}="${k}" content="${v}">`);
  return `<!doctype html><html><head>${o.title === undefined ? '' : `<title>${o.title}</title>`}${m('description', 'name', o.desc)}${m('og:title', 'property', o.ogTitle ?? o.title)}${m('og:description', 'property', o.ogDesc)}${m('twitter:title', 'name', o.twTitle ?? o.title)}${m('twitter:description', 'name', o.twDesc)}</head><body>${o.body ?? ''}</body></html>`;
};
const D = (n: number) => '가'.repeat(n);
const ok = { title: D(40), desc: D(40), ogDesc: D(20), twDesc: D(20) };

describe('meta length rule (SEO-LENGTH)', () => {
  it('limits: 40 / 40–80 / 80, and src/data/site.ts holds the same numbers', () => {
    expect([TITLE_MAX, DESC_MIN, DESC_MAX, OG_DESC_MAX]).toEqual([40, 40, 80, 80]);
    expect([site.TITLE_MAX, site.DESC_MIN, site.DESC_MAX]).toEqual([TITLE_MAX, DESC_MIN, DESC_MAX]);
  });

  it('metaLen counts every code point once: space, "·", "—", "×", "|"', () => {
    expect(metaLen('a b·c—d×e|f')).toBe(11);
    expect(metaLen(' | 문서딱')).toBe(6);
  });

  it('decodeEntities: named, decimal and hex references', () => {
    expect(decodeEntities('A &amp; B &lt;&gt; &quot;x&quot; &#39;y&#39; &#183; &#xB7;')).toBe(`A & B <> "x" 'y' · ·`);
    expect(metaLen(decodeEntities('&amp;'.repeat(40)))).toBe(40);
  });

  it('headMeta reads the head only: an inline SVG title in the body is ignored', () => {
    const html = page({ ...ok, title: 'Head &amp; title', body: '<svg><title>a much longer body svg title that is not the page title at all</title></svg>' });
    const m = headMeta(html);
    expect(m.title).toBe('Head & title');
    expect(m.description).toBe(D(40));
    expect(headMeta('<html><head></head><body><svg><title>x</title></svg></body></html>').title).toBeUndefined();
  });

  it('boundaries: title 40 ok / 41 error; description 39 error, 40 and 80 ok, 81 error', () => {
    expect(metaProblems('a', page(ok))).toEqual([]);
    expect(metaProblems('a', page({ ...ok, title: D(41) })).join()).toContain('title 41 > 40');
    expect(metaProblems('a', page({ ...ok, desc: D(39) })).join()).toContain('description 39 < 40');
    expect(metaProblems('a', page({ ...ok, desc: D(80) }))).toEqual([]);
    expect(metaProblems('a', page({ ...ok, desc: D(81) })).join()).toContain('description 81 > 80');
    expect(metaProblems('a', page({ ...ok, title: `${D(36)}&amp;` }))).toEqual([]);
  });

  it('og/twitter: title mismatch, description mismatch, og:description over 80, missing description', () => {
    expect(metaProblems('a', page({ ...ok, ogTitle: 'x' })).join()).toContain('og:title');
    expect(metaProblems('a', page({ ...ok, twTitle: 'x' })).join()).toContain('twitter:title');
    expect(metaProblems('a', page({ ...ok, twDesc: 'x' })).join()).toContain('differs from twitter:description');
    expect(metaProblems('a', page({ ...ok, ogDesc: D(81), twDesc: D(81) })).join()).toContain('og:description 81 > 80');
    expect(metaProblems('a', page({ ...ok, desc: undefined })).join()).toContain('meta description missing');
    expect(metaProblems('a', page({ ...ok, title: undefined })).join()).toContain('title missing');
  });

  it('data: every tool title and the home title within 40, every tool description 40–80', () => {
    for (const t of [...TOOLS, BG_REMOVE_TOOL]) {
      expect(metaLen(t.title), t.title).toBeLessThanOrEqual(TITLE_MAX);
      expect(metaLen(t.description), t.description).toBeGreaterThanOrEqual(DESC_MIN);
      expect(metaLen(t.description), t.description).toBeLessThanOrEqual(DESC_MAX);
    }
    expect(HOME_TITLE).toBe('PDF 합치기·용량 줄이기, 사진 용량·증명사진 규격 무료 | 문서딱');
    expect(metaLen(HOME_TITLE)).toBeLessThanOrEqual(TITLE_MAX);
    for (const tools of [LIVE_TOOLS, [...LIVE_TOOLS, BG_REMOVE_TOOL]]) {
      const d = site.defaultDescription(tools);
      expect(metaLen(d), d).toBeGreaterThanOrEqual(DESC_MIN);
      expect(metaLen(d), d).toBeLessThanOrEqual(DESC_MAX);
    }
  });
});
