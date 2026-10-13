// 무료 임베드 위젯 (brief handoff/ARCHITECT-BRIEF-REV5.md, "Test map"): the snippet, the framing headers and the
// GA / Web Analytics CSP extensions around them, the check-dist widget rules, the e2e server's _headers semantics, the
// precache exclusion and via=embed in the usage statistics.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { embedSnippet } from '../../src/data/embed';
import { extendSiteCsp } from '../../scripts/lib/csp.mjs';
import { withAnalyticsCsp } from '../../scripts/lib/analytics.mjs';
import { withGaCsp } from '../../scripts/lib/ga.mjs';
import { EMBED_PAGE_RE, embedHeaderProblems, embedPageProblems } from '../../scripts/lib/embed-check.mjs';
import { NOT_PRECACHED } from '../../scripts/gen-sw.mjs';
import { VIAS, shapeUsage, validate } from '../../scripts/lib/usage.mjs';
import { renderAdminPage } from '../../scripts/lib/admin-view.mjs';
import { arrival, buildPayload } from '../../src/lib/ui/usage';
import { headersFor, parseHeaders } from '../e2e/serve.mjs';

const ROOT = join(__dirname, '..', '..');
const HEADERS = readFileSync(join(ROOT, 'public', '_headers'), 'utf8');
const EMBED_BLOCK = '/embed/id-photo/*';
const cspLines = (text: string): string[] => text.split(/\r?\n/).filter((l) => /^\s+Content-Security-Policy:/.test(l));

describe('snippet (Decision 1)', () => {
  it('is the two plain HTML lines: the frame (no sandbox, fixed height) and the backlink', () => {
    expect(embedSnippet('https://docttak.com')).toBe(
      '<iframe src="https://docttak.com/embed/id-photo/" title="증명사진 규격 맞추기 (문서딱)" width="100%" height="820" style="border:0;max-width:720px" loading="lazy"></iframe>\n' +
        '<p><a href="https://docttak.com/id-photo/">증명사진 규격 맞추기</a> · 문서딱 제공</p>',
    );
    expect(embedSnippet('https://docttak.com')).not.toMatch(/<script|sandbox/);
  });
});

describe('_headers (Decision 4)', () => {
  it('public/_headers: the /* policy keeps frame-ancestors none; only the widget block allows framing, after a detach', () => {
    expect(embedHeaderProblems(HEADERS)).toEqual([]);
    const lines = cspLines(HEADERS);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("frame-ancestors 'none'");
    expect(lines[1]).toContain('frame-ancestors *');
    expect(lines[1]!.replace('frame-ancestors *', "frame-ancestors 'none'")).toBe(lines[0]);
    expect(HEADERS.split(/\r?\n/).filter((l) => l === EMBED_BLOCK)).toHaveLength(1);
  });

  it('embedHeaderProblems: a missing detach, a detach after the policy, a widened /*, another directive, no noindex, a second framing block', () => {
    const site = cspLines(HEADERS)[0]!.trim();
    const embed = site.replace("frame-ancestors 'none'", 'frame-ancestors *');
    const file = (...blocks: string[]): string => ['/*', `  ${site}`, ...blocks].join('\n');
    const good = [EMBED_BLOCK, '  ! Content-Security-Policy', `  ${embed}`, '  X-Robots-Tag: noindex'].join('\n');
    expect(embedHeaderProblems(file(good))).toEqual([]);
    expect(embedHeaderProblems(file([EMBED_BLOCK, `  ${embed}`, '  X-Robots-Tag: noindex'].join('\n'))).join()).toContain('does not detach');
    expect(embedHeaderProblems(file([EMBED_BLOCK, `  ${embed}`, '  ! Content-Security-Policy', '  X-Robots-Tag: noindex'].join('\n'))).join()).toContain('does not detach');
    expect(embedHeaderProblems(file([EMBED_BLOCK, '  ! Content-Security-Policy', `  ${embed.replace("object-src 'none'", "object-src 'self'")}`, '  X-Robots-Tag: noindex'].join('\n'))).join()).toContain('differs');
    expect(embedHeaderProblems(file([EMBED_BLOCK, '  ! Content-Security-Policy', `  ${embed}`].join('\n'))).join()).toContain('X-Robots-Tag');
    expect(embedHeaderProblems(file(good, ['/id-photo/*', '  ! Content-Security-Policy', `  ${embed}`].join('\n'))).join()).toContain('2 blocks allow framing');
    expect(embedHeaderProblems(['/*', `  ${embed}`, good].join('\n')).join()).toContain("lacks frame-ancestors 'none'");
    expect(embedHeaderProblems(file()).join()).toContain('0 blocks allow framing');
  });

  it('round 2: a detach outside a widget block, a detach with no policy of its own, a policy without frame-ancestors', () => {
    const site = cspLines(HEADERS)[0]!.trim();
    const embed = site.replace("frame-ancestors 'none'", 'frame-ancestors *');
    const file = (...blocks: string[]): string => ['/*', `  ${site}`, [EMBED_BLOCK, '  ! Content-Security-Policy', `  ${embed}`, '  X-Robots-Tag: noindex'].join('\n'), ...blocks].join('\n');
    expect(embedHeaderProblems(file())).toEqual([]);
    // Detach alone on another path: those pages would send no policy at all.
    const loose = embedHeaderProblems(file(['/guide/*', '  ! Content-Security-Policy'].join('\n'))).join();
    expect(loose).toContain('/guide/* detaches the site-wide policy (only a widget block');
    expect(loose).toContain('/guide/* detaches the site-wide policy without setting its own');
    // Detach alone even on a widget-shaped path.
    expect(embedHeaderProblems(file(['/embed/other/*', '  ! Content-Security-Policy', '  X-Robots-Tag: noindex'].join('\n'))).join()).toContain('/embed/other/* detaches the site-wide policy without setting its own');
    // A second policy without frame-ancestors (joined with the site one it would still be refused, but after a detach it would not).
    const noFa = site.replace("; frame-ancestors 'none'", '');
    expect(noFa).not.toContain('frame-ancestors');
    expect(embedHeaderProblems(file(['/x/*', `  ${noFa}`].join('\n'))).join()).toContain('the /x/* policy has no frame-ancestors');
  });

  it('GA and Web Analytics extend only the /* policy; the widget line stays byte for byte (either order)', () => {
    const embedLine = cspLines(HEADERS)[1];
    for (const out of [withGaCsp(HEADERS), withAnalyticsCsp(HEADERS), withGaCsp(withAnalyticsCsp(HEADERS)), withAnalyticsCsp(withGaCsp(HEADERS))]) {
      const [site, embed] = cspLines(out);
      expect(site).not.toBe(cspLines(HEADERS)[0]);
      expect(site).toContain("frame-ancestors 'none'");
      expect(embed).toBe(embedLine);
      expect(embed).not.toMatch(/google|cloudflareinsights/);
    }
  });

  it('extendSiteCsp: only the CSP line of the /* block; null without exactly one there', () => {
    const t = (l: string): string => `${l} X`;
    expect(extendSiteCsp("/x/*\n  Content-Security-Policy: a\n/*\n  Content-Security-Policy: b\n", t)).toBe("/x/*\n  Content-Security-Policy: a\n/*\n  Content-Security-Policy: b X\n");
    expect(extendSiteCsp('/*\r\n  X-A: 1\r\n  Content-Security-Policy: b\r\n/y\r\n  Content-Security-Policy: c\r\n', (l) => l.replace('b', 'b X'))).toBe('/*\r\n  X-A: 1\r\n  Content-Security-Policy: b X\r\n/y\r\n  Content-Security-Policy: c\r\n');
    expect(extendSiteCsp('/*\n  Content-Security-Policy: a\n  Content-Security-Policy: b\n', t)).toBeNull();
    expect(extendSiteCsp('/x/*\n  Content-Security-Policy: a\n', t)).toBeNull();
    expect(extendSiteCsp('/*\n  X-A: 1\n', t)).toBeNull();
  });

  it('the e2e server applies the detach like Cloudflare: one policy on the widget, none relaxed elsewhere; without a detach both policies are sent', () => {
    const rules = parseHeaders(HEADERS);
    const csp = (path: string): string => headersFor(rules, path)['Content-Security-Policy'];
    expect(csp('/embed/id-photo/')).toBe(cspLines(HEADERS)[1]!.trim().slice('Content-Security-Policy: '.length));
    expect(headersFor(rules, '/embed/id-photo/')['X-Robots-Tag']).toBe('noindex');
    for (const p of ['/', '/id-photo/', '/embed/', '/embed/x/', '/_astro/a.js']) {
      expect(csp(p), p).toContain("frame-ancestors 'none'");
      expect(csp(p), p).not.toContain('frame-ancestors *');
    }
    expect(headersFor(rules, '/embed/')['X-Robots-Tag']).toBeUndefined();
    const noDetach = parseHeaders(HEADERS.replace(/^[ \t]+! Content-Security-Policy\r?\n/m, ''));
    expect(headersFor(noDetach, '/embed/id-photo/')['Content-Security-Policy']).toMatch(/frame-ancestors 'none', default-src/);
  });
});

describe('check-dist widget rules (R5.7)', () => {
  const page = (body: string, head = '<meta name="robots" content="noindex"><link rel="canonical" href="https://docttak.com/id-photo/">'): string =>
    `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
  const ok = { initialJs: 'import"./ui-shared.js";', sitemap: '<loc>https://docttak.com/embed/</loc>' };
  const P = 'embed/id-photo/index.html';

  it('matches widget pages only, never the info page', () => {
    expect(EMBED_PAGE_RE.test(P)).toBe(true);
    expect(EMBED_PAGE_RE.test('embed/index.html')).toBe(false);
    expect(embedPageProblems('embed/index.html', '<html></html>', ok)).toEqual([]);
  });

  it('passes a clean widget; flags noindex, canonical, links, share, 이어서 하기, ads, GA, the beacon, the service worker and the sitemap', () => {
    expect(embedPageProblems(P, page('<div id="idp-tool"></div>'), ok)).toEqual([]);
    const cases: [string, string, string, typeof ok?][] = [
      ['noindex', page('', '<link rel="canonical" href="https://docttak.com/id-photo/">'), 'noindex'],
      ['canonical', page('', '<meta name="robots" content="noindex"><link rel="canonical" href="https://docttak.com/embed/id-photo/">'), 'canonical'],
      ['no canonical', page('', '<meta name="robots" content="noindex">'), 'canonical'],
      ['sponsored', page('<a href="https://x" rel="noopener sponsored">x</a>'), 'sponsored'],
      ['coupang', page('<a href="https://link.coupang.com/a/x">x</a>'), 'Coupang'],
      ['print link', page('<a href="https://x" data-out="photo-studio">x</a>'), '사진관'],
      ['share', page('<div class="share" data-share></div>'), 'share'],
      ['chain', page('<div id="idp-next" class="next-steps"></div>'), '이어서 하기'],
      ['ad', page('<div class="ad-slot"></div>'), 'ad slot'],
      ['ga', page('', '<meta name="robots" content="noindex"><link rel="canonical" href="https://docttak.com/id-photo/"><script defer src="/ga.js" data-site-ga></script>'), 'Google Analytics'],
      ['beacon', page('<script defer src="https://static.cloudflareinsights.com/beacon.min.js"></script>'), 'beacon'],
      ['sw', page(''), 'service worker', { ...ok, initialJs: 'navigator.serviceWorker.register("/sw.js")' }],
      ['sitemap', page(''), 'sitemap', { ...ok, sitemap: '<loc>https://docttak.com/embed/id-photo/</loc>' }],
    ];
    for (const [name, html, want, ctx] of cases) expect(embedPageProblems(P, html, ctx ?? ok).join(), name).toContain(want);
  });
});

describe('precache and usage', () => {
  it('/embed/ and anything under it is never precached', () => {
    expect(NOT_PRECACHED('/embed/')).toBe(true);
    expect(NOT_PRECACHED('/embed/id-photo/')).toBe(true);
    expect(NOT_PRECACHED('/id-photo/')).toBe(false);
  });

  it('via=embed: read from the widget path only (never the host referrer), no arrive, on every event', () => {
    expect(arrival('', 'https://docttak.com', '/embed/id-photo/', false)).toEqual({ via: 'embed', arrive: null });
    expect(arrival('https://studio.example/', 'https://docttak.com', '/embed/id-photo/', false)).toEqual({ via: 'embed', arrive: null });
    expect(arrival('https://docttak.com/guide/passport-photo/', 'https://docttak.com', '/embed/id-photo/', true)).toEqual({ via: 'embed', arrive: null });
    expect(arrival('https://docttak.com/embed/', 'https://docttak.com', '/id-photo/', false)).toEqual({ via: 'direct', arrive: null });
    const ctx = { via: 'embed' as const, ua: 'x', device: 'desktop' as const, build: 'dev', w: 1 };
    const events = [
      { e: 'pick', t: 'id-photo' },
      { e: 'start', t: 'id-photo', o: 'preset', v: 'passport_online' },
      { e: 'success', t: 'id-photo' },
      { e: 'fail', t: 'id-photo', c: 'decode', p: 'parse' },
      { e: 'download', t: 'id-photo' },
    ] as const;
    for (const ev of events) {
      const p = buildPayload(ev, ctx);
      expect(p.via, ev.e).toBe('embed');
      expect(validate(JSON.stringify(p)), ev.e).not.toBeNull();
      expect(JSON.stringify(p)).not.toMatch(/studio|example|referrer|http/);
    }
  });

  it('validate: embed is a via; any other value is rejected', () => {
    expect(VIAS).toEqual(['guide', 'direct', 'embed']);
    const base = { e: 'pick', t: 'id-photo', d: 'desktop', b: 'dev', w: 1 };
    expect(validate(JSON.stringify({ ...base, via: 'embed' }))).not.toBeNull();
    for (const via of ['host', 'studio.example', '', 'EMBED']) expect(validate(JSON.stringify({ ...base, via })), via).toBeNull();
  });

  it('admin and weekly: the via split gains the 다른 누리집 column', () => {
    const shaped = shapeUsage({
      events: [
        { tool: 'id-photo', event: 'success', via: 'embed', n: 3 },
        { tool: 'id-photo', event: 'fail', via: 'embed', n: 1 },
        { tool: 'id-photo', event: 'success', via: 'direct', n: 5 },
      ],
    });
    expect(shaped.tools[0]).toMatchObject({ tool: 'id-photo', success: 8, fail: 1, embed: { success: 3, fail: 1 }, direct: { success: 5, fail: 0 }, guide: { success: 0, fail: 0 } });
    const table = shaped.tables.find((t) => t.head.includes('다른 누리집'))!;
    expect(table.head).toEqual(['도구', '안내에서 옴', '바로 옴', '다른 누리집']);
    expect(table.rows[0]).toEqual(['증명사진 규격 맞추기', '-', '100%', '75%']);
    const html = renderAdminPage({ days: 7, shaped, now: new Date('2026-10-13T00:00:00Z') });
    const via = html.slice(html.indexOf('<h2 id="s-via">'));
    expect(via).toContain('다른 누리집');
  });
});
