// EN1 (brief handoff/ARCHITECT-BRIEF-EN.md, build order 5 and "Test map"): the check-dist rules for the English pages
// (scripts/lib/en-check.mjs) on pass/fail fixtures, the English catalogs (key parity with Korean, no Hangul, marks),
// the English meta limits, the English registry (titles, FAQ numbers from the limits, twins) and the usage guard.
// A last block runs every rule on dist/ when a build is there.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  CATALOG_MARK,
  EN_TOOL_PAGES,
  KO_ONLY_IDS,
  catalogProblems,
  cssProblems,
  enHeadProblems,
  hangulProblems,
  idParityProblems,
  precacheProblems,
  readableText,
  sitemapEntries,
  sitemapProblems,
} from '../../scripts/lib/en-check.mjs';
import { EN_LIMITS, metaLen, metaProblems, pageLang } from '../../scripts/lib/meta-length.mjs';
import { NOT_PRECACHED } from '../../scripts/gen-sw.mjs';
import { EN_DIRS, uiCharSets } from '../../scripts/lib/ui-font-chars.mjs';
import * as siteEn from '../../src/i18n/en/site';
import { ENGINE_EN, NEXT_EN, nonPdfEn, pagesEn } from '../../src/i18n/en/shared';
import { EN as MERGE_EN, EN_CATALOG_MARK as MERGE_MARK } from '../../src/i18n/en/tools/pdf-merge';
import { EN as CMP_EN, EN_CATALOG_MARK as CMP_MARK, LEVEL_COPY_EN } from '../../src/i18n/en/tools/pdf-compress';
import { EN as IJ_EN, EN_CATALOG_MARK as IJ_MARK } from '../../src/i18n/en/tools/image-to-jpg';
import { HOME_DESCRIPTION_EN, HOME_TITLE_EN, TOOLS_EN, enTwin, getToolEn, koTwin } from '../../src/i18n/en/tools';
import og from '../../src/i18n/en/og.json';
import { KO as MERGE_KO } from '../../src/tools/pdf-merge/messages.ko';
import { KO as CMP_KO } from '../../src/tools/pdf-compress/messages.ko';
import { KO as IJ_KO } from '../../src/tools/image-to-jpg/messages.ko';
import { LEVEL_COPY } from '../../src/tools/pdf-compress/level-copy';
import { LIMITS as MERGE_LIMITS, MAX_FILES } from '../../src/tools/pdf-merge/limits';
import { LIMITS as CMP_LIMITS } from '../../src/tools/pdf-compress/limits';
import { LIMITS as IJ_LIMITS } from '../../src/tools/image-to-jpg/limits';
import { getTool } from '../../src/data/tools';
import { createTracker } from '../../src/lib/ui/usage';

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const ROOT = join(import.meta.dirname, '..', '..');
const DIST = join(ROOT, 'dist');

// ---------- fixtures ----------

const enPage = (o: { head?: string; body?: string; lang?: string } = {}) =>
  `<!doctype html><html lang="${o.lang ?? 'en'}"><head><title>Merge PDF Files Online Free, No Sign-up | Docttak</title><meta name="description" content="d"><meta property="og:locale" content="en_US"><link rel="stylesheet" href="/_astro/site.A.css">${o.head ?? ''}</head><body>${o.body ?? '<p>Hello</p>'}</body></html>`;
const koPage = (body = '<p>안녕</p>', head = '') => `<!doctype html><html lang="ko"><head><title>t</title><link rel="stylesheet" href="/_astro/site.A.css">${head}</head><body>${body}</body></html>`;

describe('en-check (a): head and monetization rules', () => {
  it('a clean English page passes', () => {
    expect(enHeadProblems('en/index.html', enPage())).toEqual([]);
  });

  it('fails: not lang="en", a font preload, Google Analytics, Coupang, sponsored, a link block, an ad slot, no en_US locale', () => {
    expect(enHeadProblems('p', enPage({ lang: 'ko' })).join()).toContain('is not lang="en"');
    expect(enHeadProblems('p', enPage({ head: '<link rel="preload" href="/_astro/anolim-ui-400.x.woff2" as="font" type="font/woff2" crossorigin>' })).join()).toContain('1 font preload(s), expected 0');
    expect(enHeadProblems('p', enPage({ head: '<script is:inline defer src="/ga.js" data-site-ga></script>' })).join()).toContain('Google Analytics');
    expect(enHeadProblems('p', enPage({ body: "<script>window.dataLayer=[];gtag('js',new Date())</script>" })).join()).toContain('gtag( call');
    expect(enHeadProblems('p', enPage({ body: '<a href="https://link.coupang.com/a/x">x</a>' })).join()).toContain('a Coupang link');
    expect(enHeadProblems('p', enPage({ body: '<a href="https://example.com" rel="noopener SPONSORED">x</a>' })).join()).toContain('a sponsored link');
    expect(enHeadProblems('p', enPage({ body: '<div class="result out-links"></div>' })).join()).toContain('a link block');
    expect(enHeadProblems('p', enPage({ body: '<div class="ad-slot ad-rect"></div>' })).join()).toContain('an ad slot');
    expect(enHeadProblems('p', enPage().replace('<meta property="og:locale" content="en_US">', '<meta property="og:locale" content="ko_KR">')).join()).toContain('og:locale is not en_US');
  });
});

describe('en-check (b): no Hangul outside lang="ko"', () => {
  it('passes with Korean only inside lang="ko" elements (the switch, a Korean name)', () => {
    const html = enPage({ body: '<a href="/" hreflang="ko" lang="ko">한국어</a><p>Officer: <span lang="ko">이종림</span>.</p><script>const s = "새로고침";</script>' });
    expect(hangulProblems('en/privacy/index.html', html)).toEqual([]);
    expect(readableText(html)).not.toMatch(HANGUL);
  });

  it('fails on Hangul in text, in an aria-label, in the title or in the description', () => {
    expect(hangulProblems('p', enPage({ body: '<p>Done 완료</p>' })).join()).toContain('Hangul outside a lang="ko" element');
    expect(hangulProblems('p', enPage({ body: '<button aria-label="삭제">x</button>' }))).toHaveLength(1);
    expect(hangulProblems('p', enPage().replace('<title>Merge', '<title>합치기 Merge'))).toHaveLength(1);
    expect(hangulProblems('p', enPage().replace('content="d"', 'content="설명"'))).toHaveLength(1);
  });

  it('fails on Hangul in JSON-LD, og:image:alt or twitter:image:alt (shown by search engines and share previews)', () => {
    const clean = enPage({ head: '<meta property="og:image:alt" content="Docttak: Merge PDF"><meta name="twitter:image:alt" content="Docttak: Merge PDF"><script type="application/ld+json">{"name":"Merge PDF"}</script>' });
    expect(hangulProblems('p', clean)).toEqual([]);
    expect(hangulProblems('p', clean.replace('{"name":"Merge PDF"}', '{"name":"PDF 합치기"}'))).toHaveLength(1);
    expect(hangulProblems('p', clean.replace('property="og:image:alt" content="Docttak: Merge PDF"', 'property="og:image:alt" content="문서딱: PDF 합치기"'))).toHaveLength(1);
    expect(hangulProblems('p', clean.replace('name="twitter:image:alt" content="Docttak: Merge PDF"', 'name="twitter:image:alt" content="문서딱"'))).toHaveLength(1);
  });
});

describe('en-check (c): catalog marks in the page JS graphs', () => {
  const pages = new Map([
    ['pdf-merge/index.html', 'KO'],
    ['en/pdf-merge/index.html', 'EN'],
  ]);
  it('passes when each page carries only its own catalog', () => {
    const graph = (html: string) => (html === 'KO' ? `x ${CATALOG_MARK.ko} y` : `x ${CATALOG_MARK.en} y`);
    expect(catalogProblems(pages, graph)).toEqual([]);
  });
  it('fails: a Korean page with the English catalog, an English page with the Korean one, a twin without its catalog', () => {
    expect(catalogProblems(pages, () => `${CATALOG_MARK.ko} ${CATALOG_MARK.en}`)).toEqual([
      'pdf-merge/index.html: its JS contains the English catalog (catalog-mark:en)',
      'en/pdf-merge/index.html: its JS contains the Korean catalog (catalog-mark:ko)',
    ]);
    expect(catalogProblems(pages, () => '')).toEqual([
      'en/pdf-merge/index.html: its JS has no English catalog (catalog-mark:en)',
      'pdf-merge/index.html: its JS has no Korean catalog (catalog-mark:ko)',
    ]);
  });
  it('the marks are the ones the catalogs carry', () => {
    for (const m of [MERGE_MARK, CMP_MARK, IJ_MARK]) expect(m).toBe(CATALOG_MARK.en);
    for (const k of [MERGE_EN, CMP_EN, IJ_EN]) expect(k.mark).toBe(CATALOG_MARK.en);
    for (const k of [MERGE_KO, CMP_KO, IJ_KO]) expect(k.mark).toBe(CATALOG_MARK.ko);
  });
});

describe('en-check (d): id parity with the Korean twin', () => {
  const tool = (ids: string[]) => `<html><head></head><body>${ids.map((i) => `<div id="${i}"></div>`).join('')}</body></html>`;
  const pages = (ko: string[], en: string[]) =>
    new Map(EN_TOOL_PAGES.flatMap((p) => [[p.replace('en/', ''), tool(ko)] as [string, string], [p, tool(en)] as [string, string]]));
  const allow = { 'en/pdf-merge/index.html': ['merge-next'], 'en/pdf-compress/index.html': ['merge-next'], 'en/image-to-jpg/index.html': ['merge-next'] };
  it('passes: same ids minus the allowlist', () => {
    expect(idParityProblems(pages(['a', 'b', 'merge-next'], ['a', 'b']), allow)).toEqual([]);
  });
  it('passes: the ids of the Korean tool notes (CONTENT1021 D8) are not asked of the English page', () => {
    const ko = tool(['a', 'merge-next']).replace('</body>', '<section class="tool-notes" aria-labelledby="이럴-때"><h2 id="이럴-때">이럴 때</h2></section></body>');
    const withNotes = new Map(EN_TOOL_PAGES.flatMap((p) => [[p.replace('en/', ''), ko] as [string, string], [p, tool(['a'])] as [string, string]]));
    expect(idParityProblems(withNotes, allow)).toEqual([]);
  });
  it('fails: a missing id, an extra id, a stale allowlist entry, a missing page', () => {
    expect(idParityProblems(pages(['a', 'b', 'merge-next'], ['a']), allow)[0]).toBe('en/pdf-merge/index.html: ids of the Korean twin missing: b');
    expect(idParityProblems(pages(['a', 'merge-next'], ['a', 'z']), allow)[0]).toBe('en/pdf-merge/index.html: ids the Korean twin does not have: z');
    expect(idParityProblems(pages(['a'], ['a']), allow)[0]).toBe('en/pdf-merge/index.html: KO_ONLY_IDS entries that no longer apply: merge-next');
    expect(idParityProblems(new Map(), allow)[0]).toBe('en/pdf-merge/index.html: missing');
  });
  it('the allowlist names one entry per English tool page', () => {
    expect(Object.keys(KO_ONLY_IDS).sort()).toEqual([...EN_TOOL_PAGES].sort());
  });
});

describe('en-check (e): sitemap alternates and canonicals', () => {
  const S = 'https://docttak.com';
  const alt = (ko: string, en: string) =>
    `<xhtml:link rel="alternate" hreflang="ko" href="${S}${ko}"/><xhtml:link rel="alternate" hreflang="en" href="${S}${en}"/><xhtml:link rel="alternate" hreflang="x-default" href="${S}${ko}"/>`;
  const url = (p: string, links = '') => `<url><loc>${S}${p}</loc><lastmod>2026-10-13</lastmod>${links}</url>`;
  const xml = (...urls: string[]) => `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join('')}</urlset>`;
  const good = xml(url('/pdf-merge/', alt('/pdf-merge/', '/en/pdf-merge/')), url('/en/pdf-merge/', alt('/pdf-merge/', '/en/pdf-merge/')), url('/guide/'));
  const page = (canonical?: string) => `<html lang="en"><head>${canonical ? `<link rel="canonical" href="${canonical}">` : ''}</head><body></body></html>`;
  const pages = new Map([
    ['en/pdf-merge/index.html', page(`${S}/en/pdf-merge/`)],
    ['en/404.html', page()],
  ]);

  it('reads entries with their alternates', () => {
    expect(sitemapEntries(good)[0]).toEqual({ loc: `${S}/pdf-merge/`, alt: { ko: `${S}/pdf-merge/`, en: `${S}/en/pdf-merge/`, 'x-default': `${S}/pdf-merge/` } });
  });
  it('passes: reciprocal ko/en/x-default (= ko, ADS1020 D13) on both twins, self canonical, the 404 left out', () => {
    expect(sitemapProblems(pages, good)).toEqual([]);
  });
  it('fails: one-way pair, x-default to English, an English page without a twin or not listed, a wrong canonical, no namespace', () => {
    const oneWay = xml(url('/pdf-merge/', alt('/pdf-merge/', '/en/pdf-merge/')), url('/en/pdf-merge/'));
    expect(sitemapProblems(pages, oneWay).join()).toContain('/en/pdf-merge/ alternates {}');
    const enDefault = good.replaceAll(`hreflang="x-default" href="${S}/pdf-merge/"`, `hreflang="x-default" href="${S}/en/pdf-merge/"`);
    expect(sitemapProblems(pages, enDefault)).toHaveLength(2);
    expect(sitemapProblems(pages, xml(url('/en/pdf-merge/'))).join()).toContain('/en/pdf-merge/ has no Korean twin /pdf-merge/');
    expect(sitemapProblems(pages, xml(url('/guide/'))).join()).toContain('en/pdf-merge/index.html: not in the sitemap');
    expect(sitemapProblems(new Map([['en/pdf-merge/index.html', page(`${S}/pdf-merge/`)]]), good).join()).toContain('canonical https://docttak.com/pdf-merge/ is not /en/pdf-merge/');
    expect(sitemapProblems(pages, good.replace(' xmlns:xhtml="http://www.w3.org/1999/xhtml"', ''))[0]).toBe('sitemap.xml: no xmlns:xhtml namespace');
    expect(sitemapProblems(pages, xml(url('/guide/', alt('/guide/', '/en/guide/')), url('/pdf-merge/', alt('/pdf-merge/', '/en/pdf-merge/')), url('/en/pdf-merge/', alt('/pdf-merge/', '/en/pdf-merge/')))).join()).toContain('/guide/ has alternates but no twin');
  });
});

describe('en-check (f, g, h): meta length by language, precache, one stylesheet', () => {
  it('(f) English pages are measured with the English limits; Korean ones keep theirs', () => {
    const p = (lang: string, title: string, desc: string) =>
      `<html lang="${lang}"><head><title>${title}</title><meta name="description" content="${desc}"><meta property="og:title" content="${title}"><meta name="twitter:title" content="${title}"></head></html>`;
    expect(pageLang(p('en', 't', 'd'))).toBe('en');
    expect(pageLang('<html><head></head></html>')).toBe('ko');
    expect(metaProblems('en', p('en', 'a'.repeat(60), 'b'.repeat(70)))).toEqual([]);
    expect(metaProblems('en', p('en', 'a'.repeat(61), 'b'.repeat(155))).join()).toContain('title 61 > 60');
    expect(metaProblems('en', p('en', 'a', 'b'.repeat(69))).join()).toContain('description 69 < 70');
    expect(metaProblems('en', p('en', 'a', 'b'.repeat(156))).join()).toContain('description 156 > 155');
    expect(metaProblems('ko', p('ko', '가'.repeat(41), '나'.repeat(40))).join()).toContain('title 41 > 40');
  });
  it('(f) the limits equal src/i18n/en/site.ts', () => {
    expect(EN_LIMITS).toEqual({ title: siteEn.TITLE_MAX_EN, descMin: siteEn.DESC_MIN_EN, descMax: siteEn.DESC_MAX_EN, ogDescMax: siteEn.OG_DESC_MAX_EN });
    expect(EN_LIMITS).toEqual({ title: 60, descMin: 70, descMax: 155, ogDescMax: 155 });
  });
  it('(g) no English page in the precache; gen-sw leaves every /en/ path out', () => {
    expect(precacheProblems(['/', '/pdf-merge/', '/_astro/a.js'])).toEqual([]);
    expect(precacheProblems(['/', '/en/pdf-merge/'])).toEqual(['precache: /en/pdf-merge/ (English pages are network-only)']);
    for (const p of ['/en/', '/en/pdf-merge/', '/en/privacy/']) expect(NOT_PRECACHED(p), p).toBe(true);
    expect(NOT_PRECACHED('/pdf-merge/')).toBe(false);
  });
  it('(h) the home, the Korean twins and the English pages link only the home stylesheet', () => {
    const pages = new Map([
      ['index.html', koPage()],
      ['pdf-merge/index.html', koPage()],
      ['en/index.html', enPage()],
      ['en/pdf-merge/index.html', enPage()],
      ['guide/index.html', koPage('', '<link rel="stylesheet" href="/_astro/guide.B.css">')],
    ]);
    expect(cssProblems(pages)).toEqual([]);
    pages.set('en/pdf-merge/index.html', enPage({ head: '<link rel="stylesheet" href="/_astro/app.C.css">' }));
    pages.set('pdf-merge/index.html', koPage().replace('site.A.css', 'site.D.css'));
    expect(cssProblems(pages)).toEqual([
      'pdf-merge/index.html: stylesheets /_astro/site.D.css, expected only /_astro/site.A.css (the Korean home\'s)',
      'en/pdf-merge/index.html: stylesheets /_astro/site.A.css, /_astro/app.C.css, expected only /_astro/site.A.css (the Korean home\'s)',
    ]);
  });
});

// ---------- the English catalogs ----------

/** Every leaf of a catalog as text: strings as they are, functions called with sample arguments. */
function leaves(v: unknown, path = ''): [string, string][] {
  if (typeof v === 'string') return [[path, v]];
  if (typeof v === 'function') {
    const samples: Record<number, unknown[]> = {
      0: [],
      1: ['report.pdf'],
      2: [3, 2],
      3: [104857600, 'desktop', 4],
    };
    const n = (v as (...a: unknown[]) => unknown).length;
    const args = n === 1 && /names/.test(String(v)) ? [['a.txt', 'b.txt', 'c.txt', 'd.txt']] : samples[n] ?? [];
    let out: [string, string][] = [];
    for (const a of [args, n === 1 ? [7] : args, n === 1 ? [{ kind: 'scaled', width: 4000, height: 3000 }] : args]) {
      try {
        const r = (v as (...x: unknown[]) => unknown)(...a);
        if (typeof r === 'string') out.push([`${path}()`, r]);
      } catch {
        // A sample that does not fit this function's arguments.
      }
    }
    return out;
  }
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => leaves(x, path ? `${path}.${k}` : k));
  return [];
}

/** The key tree of a catalog (functions and strings are leaves). */
const shape = (v: unknown): unknown =>
  v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape((v as Record<string, unknown>)[k])])) : typeof v;

describe('English catalogs', () => {
  it('have the keys of the Korean catalogs (runtime; the type is checked by satisfies Messages)', () => {
    expect(shape(MERGE_EN)).toEqual(shape(MERGE_KO));
    expect(shape(CMP_EN)).toEqual(shape(CMP_KO));
    // The Korean photo catalog reuses the whole shared ERRORS table (two keys more than Messages types); compare the rest.
    expect(shape({ ...IJ_EN, errors: null })).toEqual(shape({ ...IJ_KO, errors: null }));
    expect(Object.keys(IJ_EN.errors).sort()).toEqual(['corrupt', 'empty', 'heic', 'not-image', 'oom', 'truncated', 'unknown', 'zip']);
    for (const k of Object.keys(IJ_EN.errors)) expect(IJ_KO.errors, k).toHaveProperty([k]);
  });

  it('contain no Hangul in any value, including what their functions return', () => {
    for (const [name, cat] of [['merge', MERGE_EN], ['compress', CMP_EN], ['image', IJ_EN], ['engine', ENGINE_EN], ['next', NEXT_EN]] as const) {
      const all = leaves(cat);
      expect(all.length, name).toBeGreaterThan(5);
      for (const [p, text] of all) expect(text, `${name}.${p}`).not.toMatch(HANGUL);
    }
    for (const l of LEVEL_COPY_EN) expect(`${l.label} ${l.desc}`).not.toMatch(HANGUL);
    expect(LEVEL_COPY_EN.map((l) => l.value)).toEqual(LEVEL_COPY.map((l) => l.value));
  });

  it('English wording: plurals, en-US numbers, file names', () => {
    expect(pagesEn(1)).toBe('1 page');
    expect(pagesEn(1500)).toBe('1,500 pages');
    expect(nonPdfEn(['a.txt'])).toBe('a.txt is not a PDF file, so it was not added. You can only add PDF files.');
    expect(nonPdfEn(['a', 'b', 'c', 'd', 'e'])).toBe('5 files are not PDFs, so they were not added: a, b, c and 2 more');
    expect(MERGE_EN.runButton(3)).toBe('Merge 3 PDFs');
    expect(MERGE_EN.limits.tooMany(50, 1)).toBe('You can merge up to 50 files at once, so 1 file was not added. Merge the rest separately.');
    expect(MERGE_EN.limits.softPages(1500)).toBe('The files have more than 1,500 pages in total. This much can take a long time or freeze the page. Merge anyway?');
    expect(MERGE_EN.fileName('report.pdf')).toBe('report_merged.pdf');
    expect(CMP_EN.fileName('scan.PDF', false)).toBe('scan_compressed.pdf');
    expect(CMP_EN.fileName('scan.pdf', true)).toBe('scan_images.pdf');
    expect(CMP_EN.done('10 MB → 2 MB', '80% smaller · 3 pages', '')).toBe('Compressing is done. 10 MB → 2 MB, 80% smaller · 3 pages.');
    expect(CMP_EN.done('10 MB → 2 MB', '80% smaller · 3 pages', CMP_EN.noteUnlocked)).toBe('Compressing is done. 10 MB → 2 MB, 80% smaller · 3 pages. The compressed file has no password.');
    expect(IJ_EN.runButton(1)).toBe('Convert 1 photo');
    expect(IJ_EN.runButton(1200)).toBe('Convert 1,200 photos');
    expect(IJ_EN.note({ kind: 'scaled', width: 16384, height: 9000 })).toBe('Saved smaller, at 16,384×9,000 pixels.');
  });
});

// ---------- the English registry and pages ----------

describe('English registry (src/i18n/en/tools.ts, og.json)', () => {
  it('titles end with " | Docttak" and fit 60; descriptions 70–155; share descriptions ≤ 155', () => {
    for (const t of [...TOOLS_EN.map((x) => x.title), HOME_TITLE_EN]) {
      expect(t.endsWith(siteEn.TITLE_SUFFIX_EN), t).toBe(true);
      expect(metaLen(t), t).toBeLessThanOrEqual(siteEn.TITLE_MAX_EN);
    }
    for (const d of [...TOOLS_EN.map((x) => x.description), HOME_DESCRIPTION_EN]) {
      expect(metaLen(d), d).toBeGreaterThanOrEqual(siteEn.DESC_MIN_EN);
      expect(metaLen(d), d).toBeLessThanOrEqual(siteEn.DESC_MAX_EN);
    }
    for (const p of Object.values(og.pages)) expect(metaLen(p.description), p.description).toBeLessThanOrEqual(siteEn.OG_DESC_MAX_EN);
    for (const t of TOOLS_EN) expect(og.pages, t.slug).toHaveProperty([`/en/${t.slug}/`]);
  });

  it('no "AI", "secure" or "military"; nothing Korean; each tool has the no-upload FAQ and the Korean icon', () => {
    const text = JSON.stringify([TOOLS_EN, og, HOME_TITLE_EN, HOME_DESCRIPTION_EN]);
    expect(text).not.toMatch(/\bAI\b|secure|military/i);
    expect(text).not.toMatch(HANGUL);
    for (const t of TOOLS_EN) {
      expect(t.faq.some((f) => /^Are my (files|photos) uploaded\?$/.test(f.q)), t.slug).toBe(true);
      expect(t.icon).toBe(getTool(t.slug).icon);
    }
  });

  it('FAQ numbers are read from the limits the tools use (en-US)', () => {
    const faq = (slug: string) => getToolEn(slug).faq.map((f) => f.a).join(' ');
    const mb = (b: number) => `${(b / 1048576).toLocaleString('en-US')} MB`;
    expect(faq('pdf-merge')).toContain(`up to ${MAX_FILES} files`);
    for (const b of [MERGE_LIMITS.desktop.hardBytes, MERGE_LIMITS.mobile.hardBytes, MERGE_LIMITS.desktop.softBytes]) expect(faq('pdf-merge')).toContain(mb(b));
    expect(faq('pdf-merge')).toContain(`${MERGE_LIMITS.desktop.softPages.toLocaleString('en-US')} pages`);
    for (const b of [CMP_LIMITS.desktop.hardBytes, CMP_LIMITS.mobile.hardBytes]) expect(faq('pdf-compress')).toContain(mb(b));
    expect(faq('pdf-compress')).toContain(`${CMP_LIMITS.desktop.rasterHardPages} pages on a computer`);
    expect(faq('image-to-jpg')).toContain(`Up to ${IJ_LIMITS.desktop.maxImages} photos on a computer and ${IJ_LIMITS.mobile.maxImages} on a phone`);
  });

  it('twins: Korean <-> English paths', () => {
    expect(enTwin('/')).toBe('/en/');
    expect(enTwin('/pdf-merge/')).toBe('/en/pdf-merge/');
    expect(enTwin('/privacy/')).toBe('/en/privacy/');
    expect(enTwin('/hwp-to-pdf/')).toBeNull();
    expect(enTwin('/guide/pdf-merge/')).toBeNull();
    expect(koTwin('/en/image-to-jpg/')).toBe('/image-to-jpg/');
    expect(koTwin('/en/')).toBe('/');
    expect(koTwin('/en/404/')).toBeNull();
    expect(koTwin('/pdf-merge/')).toBeNull();
  });

  it('English text is in neither UI font set (scripts/lib/ui-font-chars.mjs EN_DIRS)', () => {
    expect(EN_DIRS).toEqual(['i18n/', 'pages/en/']);
    const src = mkdtempSync(join(tmpdir(), 'en-font-'));
    mkdirSync(join(src, 'i18n', 'en'), { recursive: true });
    mkdirSync(join(src, 'pages', 'en'), { recursive: true });
    writeFileSync(join(src, 'i18n', 'en', 'copy.ts'), "export const A = 'Ω';");
    writeFileSync(join(src, 'pages', 'en', 'index.astro'), '<p>Ж</p>');
    writeFileSync(join(src, 'pages', 'index.astro'), '<p>가</p>');
    const { core, late } = uiCharSets(src);
    expect(core).toContain('가'.codePointAt(0));
    for (const ch of ['Ω', 'Ж']) expect([...core, ...late]).not.toContain(ch.codePointAt(0));
    rmSync(src, { recursive: true, force: true });
  });
});

describe('usage guard (src/lib/ui/usage.ts, brief EN decision 10)', () => {
  const deps = (lang: string) => {
    const send = vi.fn((_p: string, _b: string) => true);
    return { send, deps: { rate: 1, random: () => 0, send, ua: 'x', device: 'desktop' as const, build: 'abc1234', referrer: '', origin: 'https://docttak.com', pathname: '/en/pdf-merge/', search: '', lang } };
  };
  it('an English page sends nothing; a Korean page sends', () => {
    const en = deps('en');
    const t = createTracker(en.deps);
    t.start('pdf-merge');
    t.track({ e: 'pick', t: 'pdf-merge' });
    expect(en.send).not.toHaveBeenCalled();
    const ko = deps('ko');
    createTracker(ko.deps).track({ e: 'pick', t: 'pdf-merge' });
    expect(ko.send).toHaveBeenCalledTimes(1);
  });
});

// ---------- the build ----------

describe('built output (dist/)', () => {
  const built = existsSync(join(DIST, 'en', 'index.html'));
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

  it.skipIf(!built)('every English page passes rules a, b, e; the twins pass d; the sitemap pairs all twins', () => {
    const pages = new Map(
      walk(DIST)
        .filter((f) => f.endsWith('.html') && !f.includes(`${sep}vendor${sep}`))
        .map((f) => [relative(DIST, f).split(sep).join('/'), readFileSync(f, 'utf8')] as [string, string]),
    );
    const en = [...pages].filter(([p]) => p.startsWith('en/'));
    expect(en.map(([p]) => p).sort()).toEqual(['en/404.html', 'en/image-to-jpg/index.html', 'en/index.html', 'en/pdf-compress/index.html', 'en/pdf-merge/index.html', 'en/privacy/index.html', 'en/terms/index.html']);
    for (const [p, html] of en) expect([...enHeadProblems(p, html), ...hangulProblems(p, html)], p).toEqual([]);
    expect(idParityProblems(pages)).toEqual([]);
    const sitemap = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
    expect(sitemapProblems(pages, sitemap)).toEqual([]);
    const pairs = sitemapEntries(sitemap).filter((e) => Object.keys(e.alt).length).map((e) => new URL(e.loc).pathname);
    expect(pairs.sort()).toEqual(['/', '/en/', '/en/image-to-jpg/', '/en/pdf-compress/', '/en/pdf-merge/', '/en/privacy/', '/en/terms/', '/image-to-jpg/', '/pdf-compress/', '/pdf-merge/', '/privacy/', '/terms/']);
    // The Korean twins link their English page in the footer; other Korean pages do not.
    expect(pages.get('pdf-merge/index.html')).toContain('<a href="/en/pdf-merge/" hreflang="en" lang="en">English</a>');
    expect(pages.get('index.html')).toContain('<a href="/en/" hreflang="en" lang="en">English</a>');
    expect(pages.get('hwp-to-pdf/index.html')).not.toContain('hreflang="en"');
    // llms.txt lists the English pages.
    expect(readFileSync(join(DIST, 'llms.txt'), 'utf8')).toContain('## English');
  });
});
