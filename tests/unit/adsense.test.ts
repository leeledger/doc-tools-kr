// Google AdSense review stage and Coupang off (brief handoff/ARCHITECT-BRIEF-ADS1020.md, "Test map"): the config and
// operator gate, the content routes (TS == MJS), the client == public/ads.txt, the content CSP and its _headers blocks
// under the e2e server's Cloudflare model, gen-headers off == before, the check-dist rules, the guide author and the
// Coupang-off rules.
import { readFileSync } from 'node:fs';
import { cameraHeaders } from '../../scripts/lib/idcamera.mjs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADSBYGOOGLE_URL,
  ADSENSE_CLIENT_DEFAULT,
  ADS_CFG_PATH,
  ADS_CFG_SOURCE,
  CONTENT_CSP,
  CONTENT_ROUTES,
  adsHeaderProblems,
  adsOffTextProblems,
  adsPageProblems,
  adsTag,
  adsenseConfig,
  adsenseGate,
  cfgTag,
  distPathname,
  isContentPath,
  withContentCsp,
} from '../../scripts/lib/adsense.mjs';
import * as ts from '../../src/data/adsense';
import { domainHeaders, siteHeaders } from '../../scripts/gen-headers.mjs';
import { withGaCsp } from '../../scripts/lib/ga.mjs';
import { withAnalyticsCsp } from '../../scripts/lib/analytics.mjs';
import { headersFor, parseHeaders } from '../e2e/serve.mjs';
import { uploadProblems } from '../e2e/upload-guard';
import { AFF_ENABLED, GUIDE_AFF, TOOL_AFF, affBlock, affOn } from '../../src/data/affiliate';
import { AFF_TEXT_RE, affEnabled, coupangOffProblems, coupangProblems, disclosureStrings } from '../../scripts/lib/out-links-check.mjs';
import { guideJsonLd } from '../../src/data/jsonld';

const ROOT = join(__dirname, '..', '..');
const HEADERS = readFileSync(join(ROOT, 'public', '_headers'), 'utf8');
const SITE = 'https://docttak.com';
const TEST_CLIENT = 'ca-pub-0000000000000000';
const OP = { PUBLIC_CONTACT_EMAIL: 'help@example.kr', PUBLIC_PRIVACY_OFFICER: '홍길동' };
const CSP_OF = (headers: string, path: string): string[] => {
  const h = headersFor(parseHeaders(headers), path);
  return h['Content-Security-Policy'] === undefined ? [] : h['Content-Security-Policy'].split(/, (?=default-src)/);
};

describe('adsenseConfig and the operator gate (D2)', () => {
  it('on only for "1"; the committed client unless PUBLIC_ADSENSE_CLIENT overrides it', () => {
    for (const v of [undefined, '', '0', 'true', 'on', '11']) expect(adsenseConfig({ PUBLIC_ADSENSE_ON: v }).on, String(v)).toBe(false);
    expect(adsenseConfig({ PUBLIC_ADSENSE_ON: ' 1\n' })).toEqual({ on: true, client: ADSENSE_CLIENT_DEFAULT });
    expect(adsenseConfig({ PUBLIC_ADSENSE_ON: '1', PUBLIC_ADSENSE_CLIENT: ` ${TEST_CLIENT} ` })).toEqual({ on: true, client: TEST_CLIENT });
  });

  it('an invalid client fails naming the variable, never echoing the value', () => {
    for (const bad of ['pub-6478963235198426', 'ca-pub-123', 'ca-pub-64789632351984260', 'ca-pub-647896323519842x', 'ca-pub-0000000000000000; x']) {
      expect(() => adsenseConfig({ PUBLIC_ADSENSE_CLIENT: bad }), bad).toThrow('PUBLIC_ADSENSE_CLIENT is not an AdSense client ID');
      try {
        adsenseConfig({ PUBLIC_ADSENSE_CLIENT: bad });
      } catch (e) {
        expect((e as Error).message).not.toContain(bad);
      }
    }
    expect(adsenseGate({ PUBLIC_ADSENSE_CLIENT: 'ca-pub-1' })).toEqual(['PUBLIC_ADSENSE_CLIENT is not an AdSense client ID (ca-pub- and 16 digits)']);
  });

  it('on needs PUBLIC_CONTACT_EMAIL (valid) and PUBLIC_PRIVACY_OFFICER; off needs nothing', () => {
    expect(adsenseGate({})).toEqual([]);
    expect(adsenseGate({ PUBLIC_ADSENSE_ON: '1', ...OP })).toEqual([]);
    const none = adsenseGate({ PUBLIC_ADSENSE_ON: '1' }).join();
    expect(none).toContain('PUBLIC_CONTACT_EMAIL');
    expect(none).toContain('PUBLIC_PRIVACY_OFFICER');
    expect(adsenseGate({ PUBLIC_ADSENSE_ON: '1', ...OP, PUBLIC_CONTACT_EMAIL: 'nope' }).join()).toContain('PUBLIC_CONTACT_EMAIL is not a valid address');
    expect(adsenseGate({ PUBLIC_ADSENSE_ON: '1', ...OP, PUBLIC_PRIVACY_OFFICER: ' ' }).join()).toContain('PUBLIC_PRIVACY_OFFICER is not set');
  });

  it('the committed client is the publisher of public/ads.txt; ads.txt is one valid DIRECT record', () => {
    const ads = readFileSync(join(ROOT, 'public', 'ads.txt'), 'utf8').trim();
    expect(ads).toBe('google.com, pub-6478963235198426, DIRECT, f08c47fec0942fa0');
    expect(ADSENSE_CLIENT_DEFAULT).toBe(`ca-${ads.split(', ')[1]}`);
  });

  it('src/data/adsense.ts mirrors the script (client, routes, paths, isContentPath); unit tests build it off', () => {
    expect(ts.ADSENSE_CLIENT_DEFAULT).toBe(ADSENSE_CLIENT_DEFAULT);
    expect(ts.CONTENT_ROUTES).toEqual(CONTENT_ROUTES);
    expect(ts.ADS_CFG_PATH).toBe(ADS_CFG_PATH);
    expect(ts.ADSBYGOOGLE_URL).toBe(ADSBYGOOGLE_URL);
    expect(ts.ADS_ON).toBe(false);
    expect(ts.ADS_CLIENT).toBe(ADSENSE_CLIENT_DEFAULT);
  });
});

describe('content routes (D4)', () => {
  const yes = ['/', '/guide/', '/guide/x/', '/guide/photo-sizes/', '/about/', '/contact/'];
  const no = ['/pdf-merge/', '/privacy/', '/terms/', '/licenses/', '/embed/', '/embed/id-photo/', '/en/', '/en/pdf-merge/', '/404.html', '/en/404.html', '/offline/', '/id-photo/', '/about', '/guide', '/aboutx/'];
  it('the table, in both copies', () => {
    expect(CONTENT_ROUTES).toEqual(['/', '/guide/*', '/about/', '/contact/']);
    for (const p of yes) {
      expect(isContentPath(p), p).toBe(true);
      expect(ts.isContentPath(p), p).toBe(true);
    }
    for (const p of no) {
      expect(isContentPath(p), p).toBe(false);
      expect(ts.isContentPath(p), p).toBe(false);
    }
  });
  it('dist file -> URL path', () => {
    expect(distPathname('index.html')).toBe('/');
    expect(distPathname('guide/index.html')).toBe('/guide/');
    expect(distPathname('guide/x/index.html')).toBe('/guide/x/');
    expect(distPathname('404.html')).toBe('/404.html');
    expect(distPathname('en/404.html')).toBe('/en/404.html');
  });
});

describe('/ads-cfg.js and the tags (D3)', () => {
  it('the config body is exactly the brief line; the tags are Google\'s snippet', () => {
    expect(ADS_CFG_SOURCE).toBe('(window.adsbygoogle=window.adsbygoogle||[]).pauseAdRequests=1;window.adsbygoogle.requestNonPersonalizedAds=1;');
    const w: { adsbygoogle?: unknown[] & { pauseAdRequests?: number; requestNonPersonalizedAds?: number } } = {};
    new Function('window', ADS_CFG_SOURCE)(w);
    expect(Array.isArray(w.adsbygoogle)).toBe(true);
    expect(w.adsbygoogle).toMatchObject({ pauseAdRequests: 1, requestNonPersonalizedAds: 1 });
    expect(cfgTag()).toBe('<script src="/ads-cfg.js" data-site-ads-cfg></script>');
    expect(adsTag(TEST_CLIENT)).toBe(`<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${TEST_CLIENT}" crossorigin="anonymous"></script>`);
  });
});

describe('content CSP and _headers (D5)', () => {
  const site = HEADERS.split('\n').find((l) => /^\s+Content-Security-Policy:/.test(l))!.trim().slice('Content-Security-Policy: '.length);

  it('CONTENT_CSP: the brief policy (scheme sources, no host list)', () => {
    expect(CONTENT_CSP).toBe(
      "default-src 'self'; script-src 'self' https: 'unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https:; img-src 'self' data: blob: https:; frame-src https:; fenced-frame-src https:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
    );
  });

  it('withContentCsp: the /* block byte for byte, one detach + policy block per route, the cache rule; throws without /*', () => {
    const out = withContentCsp(HEADERS);
    expect(out.startsWith(HEADERS)).toBe(true);
    expect(adsHeaderProblems(out, true)).toEqual([]);
    expect(() => withContentCsp('/x\n  A: b\n')).toThrow('no site-wide Content-Security-Policy');
    expect(() => withContentCsp(HEADERS.replace(/^\s+Content-Security-Policy:.*$/m, ''))).toThrow('no site-wide Content-Security-Policy');
  });

  it('under the Cloudflare model (serve.mjs): content pages get exactly the content CSP, every other page exactly its old one', () => {
    for (const env of [{}, { PUBLIC_GA_ID: 'G-TEST000000' }, { PUBLIC_GA_ID: 'G-TEST000000', PUBLIC_CF_ANALYTICS_TOKEN: '0123456789abcdef0123456789abcdef' }]) {
      const off = siteHeaders(HEADERS, { PUBLIC_SITE_URL: SITE, ...env }).headers;
      const on = siteHeaders(HEADERS, { PUBLIC_SITE_URL: SITE, ...env, PUBLIC_ADSENSE_ON: '1', ...OP }).headers;
      for (const p of ['/', '/guide/', '/guide/passport-photo/', '/about/', '/contact/']) {
        expect(CSP_OF(on, p), `${p} ${JSON.stringify(env)}`).toEqual([CONTENT_CSP]);
        expect(CSP_OF(off, p), p).toEqual(CSP_OF(off, '/pdf-merge/'));
      }
      for (const p of ['/pdf-merge/', '/privacy/', '/licenses/', '/embed/', '/embed/id-photo/', '/en/', '/offline/', '/404.html', '/ads-cfg.js']) {
        expect(CSP_OF(on, p), p).toEqual(CSP_OF(off, p));
        expect(CSP_OF(on, p), p).toHaveLength(1);
      }
      // GA and Web Analytics extensions still land on the `/*` line only.
      expect(on.split('\n').filter((l: string) => /^\s+Content-Security-Policy:/.test(l))[0]).toBe(off.split('\n').filter((l: string) => /^\s+Content-Security-Policy:/.test(l))[0]);
      expect(headersFor(parseHeaders(on), '/ads-cfg.js')['Cache-Control']).toBe('public, max-age=3600');
    }
  });

  it('gen-headers off: exactly what it wrote before ADS1020 (public/_headers + the domain block; GA and analytics as before)', () => {
    // IDCAM1022 D9: the default build adds the camera page's Permissions-Policy block (PUBLIC_ID_CAMERA, default on).
    expect(siteHeaders(HEADERS, { PUBLIC_SITE_URL: SITE }).headers).toBe(HEADERS + cameraHeaders(true) + domainHeaders(SITE));
    expect(siteHeaders(HEADERS, { PUBLIC_SITE_URL: SITE, PUBLIC_ID_CAMERA: '0' }).headers).toBe(HEADERS + domainHeaders(SITE));
    const ga = siteHeaders(HEADERS, { PUBLIC_SITE_URL: SITE, PUBLIC_GA_ID: 'G-TEST000000', PUBLIC_CF_ANALYTICS_TOKEN: '0123456789abcdef0123456789abcdef' }).headers;
    expect(ga).toBe(`${withGaCsp(withAnalyticsCsp(HEADERS))}/ga.js\n  Cache-Control: no-cache\n${cameraHeaders(true)}${domainHeaders(SITE)}`);
    expect(ga).not.toContain('fenced-frame-src');
    expect(adsHeaderProblems(ga, false)).toEqual([]);
  });

  it('serve.mjs models an exact rule: "/" matches only the home page', () => {
    const rules = parseHeaders(['/*', `  Content-Security-Policy: ${site}`, '/', '  ! Content-Security-Policy', '  Content-Security-Policy: X'].join('\n'));
    expect(headersFor(rules, '/')['Content-Security-Policy']).toBe('X');
    for (const p of ['/pdf-merge/', '/guide/', '/x']) expect(headersFor(rules, p)['Content-Security-Policy'], p).toBe(site);
  });

  it('adsHeaderProblems: a missing detach, a route twice, a widened /*, no cache rule, the policy in an off build', () => {
    const on = withContentCsp(HEADERS);
    expect(adsHeaderProblems(on.replace('/about/\n  ! Content-Security-Policy\n', '/about/\n'), true).join()).toContain('/about/ is not exactly one block');
    expect(adsHeaderProblems(`${on}/guide/*\n  ! Content-Security-Policy\n  Content-Security-Policy: ${CONTENT_CSP}\n`, true).join()).toContain('/guide/* is not exactly one block');
    expect(adsHeaderProblems(on.replace("connect-src 'self';", "connect-src 'self' https:;"), true).join()).toContain('the site-wide policy has an https: scheme source');
    expect(adsHeaderProblems(on.replace('/ads-cfg.js\n  Cache-Control: public, max-age=3600\n', ''), true).join()).toContain('no /ads-cfg.js block');
    expect(adsHeaderProblems(on, false).join()).toContain('fenced-frame-src');
    expect(adsHeaderProblems(HEADERS, true).join()).toContain('/ is not exactly one block');
  });
});

describe('check-dist page and text rules (Build Order G)', () => {
  const head = (tags: string) => `<!doctype html><html><head><title>t</title>${tags}</head><body><main>x</main></body></html>`;
  const both = cfgTag() + adsTag(TEST_CLIENT);
  const on = { on: true, client: TEST_CLIENT };
  const good = new Map([
    ['index.html', head(both)],
    ['guide/index.html', head(both)],
    ['guide/x/index.html', head(both)],
    ['about/index.html', head(both)],
    ['pdf-merge/index.html', head('')],
    ['404.html', head('')],
  ]);

  it('on: the pair on every content page, nothing elsewhere', () => {
    expect(adsPageProblems(good, on)).toEqual([]);
  });
  it('on: a missing, doubled, reordered or foreign-client tag, a tag on a tool page, 404, embed or English page, a missing home page', () => {
    const with_ = (p: string, html: string) => new Map([...good, [p, html]]);
    expect(adsPageProblems(with_('guide/x/index.html', head(cfgTag())), on).join()).toContain('guide/x/index.html: expected exactly one <script async');
    expect(adsPageProblems(with_('guide/x/index.html', head(both + adsTag(TEST_CLIENT))), on).join()).toContain('expected exactly one <script async');
    expect(adsPageProblems(with_('guide/x/index.html', head(adsTag(TEST_CLIENT) + cfgTag())), on).join()).toContain('/ads-cfg.js comes after');
    expect(adsPageProblems(with_('guide/x/index.html', head(cfgTag() + adsTag(ADSENSE_CLIENT_DEFAULT))), on).join()).toContain('expected exactly one');
    expect(adsPageProblems(with_('guide/x/index.html', head(adsTag(TEST_CLIENT))), on).join()).toContain('expected exactly one <script src="/ads-cfg.js"');
    expect(adsPageProblems(with_('guide/x/index.html', head(cfgTag() + adsTag(TEST_CLIENT).replace(' crossorigin="anonymous"', ''))), on).join()).toContain('expected exactly one');
    for (const p of ['pdf-merge/index.html', '404.html', 'en/404.html', 'embed/id-photo/index.html', 'embed/index.html', 'en/index.html', 'privacy/index.html', 'offline/index.html', 'licenses/index.html']) {
      expect(adsPageProblems(with_(p, head(both)), on).join(), p).toContain(`${p}: names adsbygoogle but is not a content page`);
    }
    const noHome = new Map(good);
    noHome.delete('index.html');
    expect(adsPageProblems(noHome, on)).toEqual(['index.html: missing (a content page)']);
  });
  it('off: no page, and no text file, names the tag, its host or /ads-cfg.js', () => {
    expect(adsPageProblems(new Map([['index.html', head('')]]), { on: false, client: '' })).toEqual([]);
    expect(adsPageProblems(new Map([['index.html', head(both)]]), { on: false, client: '' }).join()).toContain('although PUBLIC_ADSENSE_ON is off');
    expect(adsOffTextProblems([['_astro/a.js', 'x'], ['llms.txt', 'y']])).toEqual([]);
    expect(adsOffTextProblems([['_astro/a.js', 'window.adsbygoogle'], ['sitemap.xml', 'pagead2.googlesyndication.com'], ['x.json', '"/ads-cfg.js"']])).toHaveLength(3);
  });
});

describe('Coupang off in code (D1; on again for result screens since LP1028, owner 2026-10-28)', () => {
  const source = readFileSync(join(ROOT, 'src', 'data', 'affiliate.ts'), 'utf8');
  const strings = disclosureStrings(source)!;

  it('LP1028: AFF_ENABLED is true (check-dist reads it); result screens have their block unless "0"; guides never', () => {
    expect(AFF_ENABLED).toBe(true);
    expect(affEnabled(source)).toBe(true);
    for (const t of Object.keys(TOOL_AFF)) expect(affBlock('tool', t, affOn(undefined)), t).not.toBeNull();
    for (const t of Object.keys(TOOL_AFF)) expect(affBlock('tool', t, affOn('0')), t).toBeNull();
    for (const t of Object.keys(GUIDE_AFF)) expect(affBlock('guide', t, affOn('1')), t).toBeNull();
  });

  it('affEnabled reads the line; a missing line is null', () => {
    expect(affEnabled('export const AFF_ENABLED = true;')).toBe(true);
    expect(affEnabled('const AFF_ENABLED = false;')).toBeNull();
    expect(strings.heading).toBe('도움이 되는 물건 (광고)');
  });

  it('coupangOffProblems: any Coupang link or disclosure string in any text file fails, whatever the env flag', () => {
    expect(AFF_TEXT_RE.test('a.html') && AFF_TEXT_RE.test('_astro/x.js') && AFF_TEXT_RE.test('sitemap.xml') && AFF_TEXT_RE.test('llms.txt') && AFF_TEXT_RE.test('a.json')).toBe(true);
    expect(coupangOffProblems([['index.html', '<p>hi</p>'], ['_astro/a.js', 'x']], strings)).toEqual([]);
    const bad = coupangOffProblems(
      [
        ['id-photo/index.html', '<a href="https://link.coupang.com/a/x">x</a>'],
        ['guide/x/index.html', strings.top],
        ['_astro/a.js', `"${strings.generic}"`],
        ['b.json', strings.heading],
        ['llms.txt', strings.coupang],
      ],
      strings,
    );
    expect(bad).toEqual([
      'id-photo/index.html: a Coupang link while AFF_ENABLED is false (src/data/affiliate.ts)',
      'guide/x/index.html: AFF_COPY.top while AFF_ENABLED is false (src/data/affiliate.ts)',
      '_astro/a.js: AFF_COPY.ad while AFF_ENABLED is false (src/data/affiliate.ts)',
      'b.json: AFF_COPY.heading while AFF_ENABLED is false (src/data/affiliate.ts)',
      'llms.txt: COUPANG_DISCLOSURE while AFF_ENABLED is false (src/data/affiliate.ts)',
    ]);
    // The env-flag rule, off (as check-dist calls it while AFF_ENABLED is false): no Coupang link, no sponsored link.
    expect(coupangProblems(new Map([['id-photo/index.html', '<p>x</p>']]), false, strings)).toEqual([]);
  });
});

describe('guide author (D11)', () => {
  const g = { slug: 'x', title: 't', description: 'd', published: '2026-10-01', updated: '2026-10-02', faq: [], citations: [] };
  it('Person with the /about/ URL when the operator is named; else the Organization; the publisher stays the Organization', () => {
    const person = guideJsonLd({ ...g, author: '홍길동' }, new URL(SITE))[0]!;
    expect(person.author).toEqual({ '@type': 'Person', name: '홍길동', url: `${SITE}/about/` });
    expect((person.publisher as { '@type': string })['@type']).toBe('Organization');
    const org = guideJsonLd(g, new URL(SITE))[0]!;
    expect((org.author as { '@type': string; name: string })).toMatchObject({ '@type': 'Organization', name: '문서딱' });
  });
});

describe('no-upload guard with ads (Build Order H)', () => {
  const base = 'http://127.0.0.1:4183';
  const rq = (method: string, url: string, frame = `${base}/`, body: Buffer | null = null) => ({ url: () => url, method: () => method, postDataBuffer: () => body, frameUrl: () => frame });
  const rs = (url: string, csp: string) => ({ url: () => url, headers: () => ({ 'content-security-policy': csp }), request: () => ({ method: () => 'GET' }) });
  const tag = `${ADSBYGOOGLE_URL}?client=${TEST_CLIENT}`;
  const site = HEADERS.split('\n').find((l) => /^\s+Content-Security-Policy:/.test(l))!.trim().slice('Content-Security-Policy: '.length);

  it('ads on: the bodiless GET of adsbygoogle.js from a content page and the content CSP on content URLs pass', () => {
    expect(uploadProblems({ requests: [rq('GET', tag), rq('GET', tag, `${base}/guide/x/`)], responses: [rs(`${base}/`, CONTENT_CSP), rs(`${base}/guide/x/`, CONTENT_CSP), rs(`${base}/pdf-merge/`, site)], websockets: [] }, base, [], false, false, true)).toEqual([]);
  });
  it('the same GET from a tool page, a POST or body, another Google host, or the content CSP on a tool page fail; ads off fails all', () => {
    expect(uploadProblems({ requests: [rq('GET', tag, `${base}/pdf-merge/`)], responses: [], websockets: [] }, base, [], false, false, true)).toEqual([`third-party ${tag}`]);
    // Round 2: a content path on another origin (a host page that frames or copies us) does not count.
    expect(uploadProblems({ requests: [rq('GET', tag, 'http://localhost:4183/')], responses: [], websockets: [] }, base, [], false, false, true)).toEqual([`third-party ${tag}`]);
    expect(uploadProblems({ requests: [rq('POST', tag, `${base}/`, Buffer.from('x'))], responses: [], websockets: [] }, base, [], false, false, true)).toHaveLength(3);
    expect(uploadProblems({ requests: [rq('GET', 'https://googleads.g.doubleclick.net/pagead/ads?x=1')], responses: [], websockets: [] }, base, [], false, false, true)).toHaveLength(1);
    expect(uploadProblems({ requests: [], responses: [rs(`${base}/pdf-merge/`, CONTENT_CSP)], websockets: [] }, base, [], false, false, true)).toEqual([`no CSP connect-src 'self' on ${base}/pdf-merge/`]);
    expect(uploadProblems({ requests: [rq('GET', tag)], responses: [rs(`${base}/`, CONTENT_CSP)], websockets: [] }, base)).toEqual([`third-party ${tag}`, `no CSP connect-src 'self' on ${base}/`]);
  });
});

describe('owner checklist (Build Order I)', () => {
  it('the ops:monetize ticks are OPS-RUNBOOK §11 items 1-5, word for word', async () => {
    const { checklist } = await import('../../scripts/ops/monetize.mjs');
    const ticks = (checklist({ sitemapCount: 1, streak: 0, recent: [] }) as string).split('\n').filter((l) => l.startsWith('- [ ] ')).map((l) => l.slice(6));
    const runbook = readFileSync(join(ROOT, 'docs', 'OPS-RUNBOOK.md'), 'utf8').replace(/\r\n/g, '\n');
    const section = runbook.slice(runbook.indexOf('## 11. 애드센스 재신청 (대표만)'), runbook.indexOf('## 12. '));
    const items = [...section.matchAll(/^(\d)\. (.+)$/gm)].map((m) => m[2]!.replace(/\.$/, ''));
    expect(items).toHaveLength(5);
    expect(ticks).toEqual(items);
  });
});

describe('plain language on every build (ADS1020 round 2, scripts/lib/plain-words.mjs)', () => {
  it('flags the old GA/AdSense privacy wording; passes the new; /licenses/ exempt; 픽셀(px) once', async () => {
    const { plainWordProblems } = await import('../../scripts/lib/plain-words.mjs');
    const page = (body: string) => `<html><head><title>t</title></head><body>${body}</body></html>`;
    expect(plainWordProblems('privacy/index.html', page('<p>브라우저 설정에서 쿠키를 막거나 광고 차단 기능을 쓰면 돼요.</p>')).join()).toContain('plain language');
    expect(plainWordProblems('privacy/index.html', page('<li>기기·브라우저 종류</li>'))).toHaveLength(1);
    expect(plainWordProblems('privacy/index.html', page('<p>쓰는 앱 설정에서 쿠키를 막거나 광고 차단 기능을 쓰면 돼요.</p><li>기기와 앱의 종류</li>'))).toEqual([]);
    expect(plainWordProblems('licenses/index.html', page('<p>서버</p>'))).toEqual([]);
    expect(plainWordProblems('x/index.html', page('<p>픽셀(px)</p><p>픽셀(px)</p>'))).toEqual(['x/index.html: "픽셀(px)" more than once']);
    expect(plainWordProblems('embed/index.html', page('<pre>max-width:720px</pre>'))).toEqual([]);
  });
});
