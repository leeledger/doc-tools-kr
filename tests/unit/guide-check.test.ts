// CONTENT1021 D5 (check-dist rules, pure functions) and the repository side of D1, D3, D9: merged guides gone behind
// 301s, guide images safe and backed by their guide's sources.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import {
  MERGED_GUIDES,
  RASTER_MAX,
  SVG_MAX,
  duplicateImages,
  elements,
  figureProblems,
  imageSize,
  lengthProblems,
  longBlocks,
  oldPathHits,
  sharedBlocks,
  svgProblems,
  svgText,
} from '../../scripts/lib/guide-check.mjs';
import { allowedFacts, numberUnits, unsourcedFacts } from '../../src/data/guide-facts';
import { JARGON } from '../../scripts/lib/plain-words.mjs';
import { publishedGuideSchema } from '../../src/data/guide-schema';
import { hubSchema } from '../../src/data/hub-schema';
import { HUB_SLUGS, hubRows } from '../../src/data/hubs';
import { FLAGGED_GUIDE_IMAGES, FLAGGED_GUIDE_IMAGE_DIR, syncFlaggedGuideImages } from '../../scripts/gen-brand.mjs';

const ROOT = join(__dirname, '..', '..');
const IMG = join(ROOT, 'public', 'img', 'guide');
// Figures of a guide behind a release flag live here and are copied to IMG only when the flag is on (gen-brand).
const FLAGGED_IMG = join(ROOT, 'src', 'assets', 'flagged', 'img', 'guide');
/** The folder of a guide's figures: the committed flagged source for a flagged slug (never a stale public copy), else public/img/guide/<slug>. */
const imgDir = (d: string) => (d in FLAGGED_GUIDE_IMAGES ? join(FLAGGED_IMG, d) : join(IMG, d));

/** A minimal valid SVG of the given size. */
const svg = (w: number, h: number, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"><title>그림</title><rect width="${w}" height="${h}" fill="#fff"/>${extra}</svg>`;
const fig = (src: string, attrs = 'width="720" height="360"', cap = '<figcaption>설명</figcaption>', alt = '설명이 열 글자 넘는 대체 글') =>
  `<figure class="guide-fig"><img src="${src}" ${attrs} alt="${alt}" loading="lazy" decoding="async">${cap}</figure>`;
const page = (body: string) => `<div class="guide-body"><h2>첫 제목</h2>${body}</div><section class="guide-faq"></section>`;
const files = (map: Record<string, Buffer>) => (p: string) => map[p] ?? null;

describe('D5.1/D5.2 length rule', () => {
  it('under the bar fails and a missing page fails, with no exemption; at or over the bar passes', () => {
    const errors = lengthProblems(
      [
        { key: 'a', chars: 2499 },
        { key: 'b', chars: 100 },
        { key: 'c', chars: null },
        { key: '/t/', chars: 2600 },
        { key: 'd', chars: 2500 },
      ],
      2500,
      'guide',
    );
    expect(errors).toEqual(['guide a: 2499 characters < 2500', 'guide b: 100 characters < 2500', 'guide c: not in dist or no counted body']);
  });
});

describe('D5.3 figures', () => {
  const a = Buffer.from(svg(720, 360));
  const b = Buffer.from(svg(720, 361, '<circle r="1"/>'));
  const ok = files({ 'img/guide/g/1-a.svg': a, 'img/guide/g/2-b.svg': b });

  it('two valid own figures after the first H2 pass and report their hashes', () => {
    const r = figureProblems(page(fig('/img/guide/g/1-a.svg') + fig('/img/guide/g/2-b.svg')), 'g', ok);
    expect(r.problems).toEqual([]);
    expect(r.images.map((i: { src: string }) => i.src)).toEqual(['/img/guide/g/1-a.svg', '/img/guide/g/2-b.svg']);
  });

  it('fails: one figure, a figure before the first H2, another slug, missing file, missing attributes, short alt, no caption, aspect off', () => {
    const one = figureProblems(page(fig('/img/guide/g/1-a.svg')), 'g', ok).problems;
    expect(one).toContain('1 valid own figure(s), needs 2');
    const before = figureProblems(`<div class="guide-body">${fig('/img/guide/g/1-a.svg')}<h2>x</h2>${fig('/img/guide/g/2-b.svg')}</div>`, 'g', ok).problems;
    expect(before.join()).toContain('before the first H2');
    expect(figureProblems(page(fig('/img/guide/h/1-a.svg') + fig('/img/guide/g/2-b.svg')), 'g', files({ 'img/guide/h/1-a.svg': a, 'img/guide/g/2-b.svg': b })).problems.join()).toContain('not under /img/guide/g/');
    expect(figureProblems(page(fig('/img/guide/g/1-a.svg') + fig('/img/guide/g/3-c.svg')), 'g', ok).problems.join()).toContain('file not in dist');
    expect(figureProblems(page(fig('/img/guide/g/1-a.svg', 'width="720"') + fig('/img/guide/g/2-b.svg')), 'g', ok).problems.join()).toContain('width/height not positive integers');
    expect(figureProblems(page(fig('/img/guide/g/1-a.svg', 'width="720" height="360"', '<figcaption>설명</figcaption>', '짧음') + fig('/img/guide/g/2-b.svg')), 'g', ok).problems.join()).toContain('alt under 10');
    expect(figureProblems(page(fig('/img/guide/g/1-a.svg', 'width="720" height="360"', '') + fig('/img/guide/g/2-b.svg')), 'g', ok).problems.join()).toContain('no figcaption');
    expect(figureProblems(page(fig('/img/guide/g/1-a.svg', 'width="720" height="500"') + fig('/img/guide/g/2-b.svg')), 'g', ok).problems.join()).toContain('does not match');
    const lazy = page(fig('/img/guide/g/1-a.svg').replace(' loading="lazy"', '') + fig('/img/guide/g/2-b.svg').replace(' decoding="async"', ''));
    expect(figureProblems(lazy, 'g', ok).problems.join()).toMatch(/no loading="lazy"[\s\S]*no decoding="async"/);
  });

  it('size caps: SVG over 30 KB, raster over 80 KB', () => {
    const big = Buffer.from(svg(720, 360, `<desc>${'x'.repeat(SVG_MAX)}</desc>`));
    expect(figureProblems(page(fig('/img/guide/g/1-a.svg') + fig('/img/guide/g/2-b.svg')), 'g', files({ 'img/guide/g/1-a.svg': big, 'img/guide/g/2-b.svg': b })).problems.join()).toContain(`> ${SVG_MAX}`);
    const png = Buffer.alloc(RASTER_MAX + 1);
    png.write('\x89PNG', 0, 'latin1');
    png.writeUInt32BE(720, 16);
    png.writeUInt32BE(360, 20);
    expect(figureProblems(page(fig('/img/guide/g/1-a.png') + fig('/img/guide/g/2-b.svg')), 'g', files({ 'img/guide/g/1-a.png': png, 'img/guide/g/2-b.svg': b })).problems.join()).toContain(`> ${RASTER_MAX}`);
  });

  it('imageSize reads SVG (viewBox, else width/height), PNG and WebP (VP8, VP8L, VP8X)', () => {
    expect(imageSize(Buffer.from(svg(600, 640)), 'svg')).toEqual({ w: 600, h: 640 });
    expect(imageSize(Buffer.from('<svg width="30" height="20"></svg>'), 'svg')).toEqual({ w: 30, h: 20 });
    const vp8x = Buffer.alloc(30);
    vp8x.write('RIFF', 0, 'latin1');
    vp8x.write('WEBP', 8, 'latin1');
    vp8x.write('VP8X', 12, 'latin1');
    vp8x.writeUIntLE(719, 24, 3);
    vp8x.writeUIntLE(559, 27, 3);
    expect(imageSize(vp8x, 'webp')).toEqual({ w: 720, h: 560 });
    for (const f of ['photo-kb/1-compress-screen.webp', 'power-of-attorney/1-form-screen.webp', 'loan-note/1-form-shot.webp']) {
      expect(imageSize(readFileSync(join(IMG, f)), 'webp'), f).toEqual({ w: 720, h: 560 });
    }
    expect(imageSize(Buffer.from('nope'), 'webp')).toBeNull();
  });

  it('the same bytes under two srcs fail site-wide', () => {
    expect(duplicateImages([{ page: 'a', src: '/img/guide/a/1-x.svg', hash: 'h' }, { page: 'b', src: '/img/guide/b/1-y.svg', hash: 'h' }])).toHaveLength(1);
    expect(duplicateImages([{ page: 'a', src: '/img/guide/a/1-x.svg', hash: 'h' }, { page: 'a', src: '/img/guide/a/1-x.svg', hash: 'h' }])).toEqual([]);
  });
});

describe('D5.4 SVG safety', () => {
  it('a plain SVG passes; script, foreignObject, image, on*, external href, @import, @font-face, url() and a missing role/title fail', () => {
    expect(svgProblems(svg(10, 10, '<use href="#a"/><rect fill="url(#g)"/>'))).toEqual([]);
    const bad = svgProblems(
      '<svg><script>x</script><foreignObject/><image href="a.png"/><rect onclick="x"/><a xlink:href="https://x.kr/">a</a><style>@import "a.css"; @font-face{src:url(f.woff2)}</style></svg>',
    ).join('|');
    for (const p of ['<script>', '<foreignObject>', '<image>', 'on* attribute', 'href a.png', 'href https://x.kr/', '@import', '@font-face', 'url(f.woff2)', 'no role="img"', 'no <title>']) expect(bad).toContain(p);
    // Review CONTENT1021-A: an unquoted href and an animation that rewrites href fail too.
    expect(svgProblems(svg(10, 10, '<a href=javascript:alert(1)>x</a>')).join()).toContain('unquoted href');
    expect(svgProblems(svg(10, 10, '<a href="#a"><set attributeName="href" to="https://x.kr/"/></a>')).join()).toContain('<set>/<animate> on href');
    expect(svgProblems(svg(10, 10, '<a href="#a"><animate attributeName="xlink:href" values="x"/></a>')).join()).toContain('<set>/<animate> on href');
  });
});

describe('D5.5 shared blocks', () => {
  const long = '가'.repeat(60);
  it('a ≥ 60-code-point p/li/blockquote/figcaption in two pages fails; shorter, same page or table text does not', () => {
    expect([...longBlocks(`<p>${long}</p><li>짧아요</li><td>${long}</td>`)]).toEqual([long]);
    expect(sharedBlocks([['a', `<p>${long}</p>`], ['b', `<li>${long}</li>`]])).toHaveLength(1);
    expect(sharedBlocks([['a', `<p>${long}</p><p>${long}</p>`]])).toEqual([]);
    expect(sharedBlocks([['a', `<p>${'가'.repeat(59)}</p>`], ['b', `<p>${'가'.repeat(59)}</p>`]])).toEqual([]);
    expect(sharedBlocks([['a', `<p>${long}</p>`], ['b', `<td>${long}</td>`]])).toEqual([]);
  });
  it('elements() pairs nested tags', () => {
    expect(elements('<li>a<ul><li>b</li></ul></li>', 'li').map((e: { inner: string }) => e.inner)).toEqual(['a<ul><li>b</li></ul>', 'b']);
  });
});

describe('D5.6 merged paths and D1 redirects', () => {
  it('oldPathHits finds an old path (its share image too) in any text file but _redirects; a longer slug is not a hit', () => {
    expect(oldPathHits([['a.html', '<a href="/guide/pdf-merge-free/">'], ['_redirects', '/guide/pdf-merge-free/ /guide/pdf-merge/ 301'], ['b.html', '/guide/pdf-merge/']])).toEqual(['a.html names /guide/pdf-merge-free/']);
    expect(oldPathHits([['og.json', '"og/guide/id-photo-kb.png"']])).toEqual(['og.json names /guide/id-photo-kb/']);
    expect(oldPathHits([['a.html', '/guide/id-photo-kbx/']])).toEqual([]);
    expect(oldPathHits([['sitemap.xml', 'https://docttak.com/guide/id-photo-kb/']])).toEqual(['sitemap.xml names /guide/id-photo-kb/']);
  });

  it('public/_redirects: both spellings of every merged path go 301 to the survivor; the old page is deleted, the survivor exists', () => {
    const rules = readFileSync(join(ROOT, 'public', '_redirects'), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
    for (const [old, to] of Object.entries(MERGED_GUIDES)) {
      expect(rules, old).toContainEqual([old, to, '301']);
      expect(rules, old).toContainEqual([old.slice(0, -1), to, '301']);
      const oldSlug = old.split('/')[2]!;
      const newSlug = to.split('/')[2]!;
      expect(existsSync(join(ROOT, 'src', 'content', 'guides', `${oldSlug}.md`)), oldSlug).toBe(false);
      expect(existsSync(join(ROOT, 'src', 'content', 'guides', `${newSlug}.md`)) || existsSync(join(ROOT, 'src', 'content', 'hubs', `${newSlug}.md`)), newSlug).toBe(true);
    }
  });

  it('no content file still names a merged guide', () => {
    for (const dir of ['guides', 'hubs']) {
      for (const f of readdirSync(join(ROOT, 'src', 'content', dir))) {
        const text = readFileSync(join(ROOT, 'src', 'content', dir, f), 'utf8');
        for (const old of Object.keys(MERGED_GUIDES)) {
          const slug = old.split('/')[2]!;
          expect(text, `${dir}/${f}`).not.toMatch(new RegExp(`(?<![\\w-])${slug}(?![\\w-])`));
        }
      }
    }
  });
});

describe('D9 guide images in the repository', () => {
  const read = (dir: string, f: string) => {
    const raw = readFileSync(join(ROOT, 'src', 'content', dir, f), 'utf8').replace(/\r\n/g, '\n');
    const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw)!;
    return { slug: f.replace(/\.md$/, ''), data: parseYaml(m[1]!) as Record<string, unknown>, body: m[2]! };
  };
  const guides = readdirSync(join(ROOT, 'src', 'content', 'guides')).map((f) => read('guides', f)).filter((g) => g.data.draft !== true);
  const parsed = guides.map((g) => ({ ...g, parsed: publishedGuideSchema.parse(g.data) }));
  const hubs = HUB_SLUGS.map((s) => read('hubs', `${s}.md`)).map((h) => ({ ...h, parsed: hubSchema.parse(h.data) }));
  const dirs = [...new Set([...(existsSync(IMG) ? readdirSync(IMG) : []), ...(existsSync(FLAGGED_IMG) ? readdirSync(FLAGGED_IMG) : [])])];

  it('every image folder belongs to a guide or hub; names are <n>-<name>.svg|webp; every SVG is safe and ≤ 30 KB', () => {
    const slugs = new Set([...guides.map((g) => g.slug), ...hubs.map((h) => h.slug)]);
    for (const d of dirs) {
      expect(slugs.has(d), d).toBe(true);
      for (const f of readdirSync(imgDir(d))) {
        expect(f, `${d}/${f}`).toMatch(/^\d+-[a-z0-9-]+\.(svg|webp)$/);
        if (!f.endsWith('.svg')) continue;
        const text = readFileSync(join(imgDir(d), f), 'utf8');
        expect(svgProblems(text), `${d}/${f}`).toEqual([]);
        expect(Buffer.byteLength(text), `${d}/${f}`).toBeLessThanOrEqual(SVG_MAX);
      }
    }
  });

  it('plain language (docs/COPY.md): no jargon word in the text of any guide SVG', () => {
    let n = 0;
    for (const d of dirs) {
      for (const f of readdirSync(imgDir(d)).filter((x) => x.endsWith('.svg'))) {
        const text = svgText(readFileSync(join(imgDir(d), f), 'utf8'));
        expect(text.match(JARGON) ?? [], `${d}/${f}`).toEqual([]);
        n++;
      }
    }
    expect(n).toBeGreaterThanOrEqual(12);
    expect('사진을 업로드해요'.match(JARGON)).not.toBeNull();
  });

  it('every number with a unit drawn in an SVG is backed by that guide (hub: its sources and table rows)', () => {
    const hubGuides = parsed.map((g) => ({ id: g.slug, data: g.parsed }));
    let checked = 0;
    for (const d of dirs) {
      const g = parsed.find((x) => x.slug === d);
      const h = hubs.find((x) => x.slug === d);
      for (const f of readdirSync(imgDir(d)).filter((x) => x.endsWith('.svg'))) {
        const text = svgText(readFileSync(join(imgDir(d), f), 'utf8'));
        if (g) expect(unsourcedFacts(g.parsed, text), `${d}/${f}`).toEqual([]);
        else if (h) {
          const rows = new Set(h.parsed.tables.flatMap((t) => hubRows(hubGuides, t.kind)).flatMap((r) => r.facts));
          const own = allowedFacts({ sources: h.parsed.sources });
          expect(numberUnits(text).filter((x) => !rows.has(x) && !own.has(x)), `${d}/${f}`).toEqual([]);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(12);
    // The check reads text nodes: an unsourced size in an SVG is caught.
    expect(unsourcedFacts(parsed.find((x) => x.slug === 'passport-photo')!.parsed, svgText(svg(10, 10, '<text>3.9 cm</text>')))).toEqual(['3.9 cm']);
  });

  it('every figure in a guide or hub body points at a file in public/img/guide/<own slug>/ and is never before the first H2', () => {
    for (const g of [...guides, ...hubs]) {
      const first = g.body.search(/^## /m);
      for (const m of g.body.matchAll(/<figure class="guide-fig"><img src="([^"]+)"/g)) {
        expect(m[1]!.startsWith(`/img/guide/${g.slug}/`), `${g.slug}: ${m[1]}`).toBe(true);
        expect(existsSync(join(ROOT, 'public', m[1]!)) || existsSync(join(FLAGGED_IMG, m[1]!.replace('/img/guide/', ''))), m[1]).toBe(true);
        expect(m.index!, `${g.slug}: figure before the first H2`).toBeGreaterThan(first);
      }
    }
  });
});

describe('flagged guide figures (CONTENT1021 B2: remove-background ships only with PUBLIC_BG_REMOVE)', () => {
  it('the committed source is the flagged folder, and the public copy is gitignored', () => {
    expect(FLAGGED_GUIDE_IMAGE_DIR).toBe(FLAGGED_IMG);
    for (const slug of Object.keys(FLAGGED_GUIDE_IMAGES)) {
      expect(readdirSync(join(FLAGGED_IMG, slug)).filter((f) => f.endsWith('.svg')).length, slug).toBeGreaterThanOrEqual(2);
      expect(readFileSync(join(ROOT, '.gitignore'), 'utf8')).toContain(`public/img/guide/${slug}/`);
    }
  });

  it('copies the figures with the flag on and removes them with it off', () => {
    const pub = mkdtempSync(join(tmpdir(), 'flagged-'));
    try {
      expect(syncFlaggedGuideImages(pub, { bgRemove: true })).toEqual(['remove-background']);
      expect(readdirSync(join(pub, 'img', 'guide', 'remove-background')).sort()).toEqual(readdirSync(join(FLAGGED_IMG, 'remove-background')).sort());
      expect(syncFlaggedGuideImages(pub, { bgRemove: false })).toEqual([]);
      expect(existsSync(join(pub, 'img', 'guide', 'remove-background'))).toBe(false);
    } finally {
      rmSync(pub, { recursive: true, force: true });
    }
  });
});
