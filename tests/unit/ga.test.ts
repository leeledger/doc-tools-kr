// Google Analytics 4 (owner 2026-10-08; brief GA4 "Test map"): the ID gate, the CSP, the /ga.js loader (text and
// behaviour), the service worker, the no-upload guard's GA allowance, check-dist on and off, and the privacy policy
// of a GA-on build.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { afterAll, describe, expect, it } from 'vitest';
import { withAnalyticsCsp } from '../../scripts/lib/analytics.mjs';
import { GA_CONNECT_SRC, GA_COOKIE_EXPIRES, GA_ID_RE, GA_IMG_SRC, GA_SCRIPT_SRC, gaId, loaderSource, withGaCsp } from '../../scripts/lib/ga.mjs';
import { precacheList } from '../../scripts/gen-sw.mjs';
import { route } from '../../src/sw/sw';
import { PRIVACY_GA, PRIVACY_REVISED } from '../../src/data/legal';
import { isGaRequest, uploadProblems, type RequestLike, type ResponseLike } from '../e2e/upload-guard';

const ROOT = join(import.meta.dirname, '..', '..');
const DIST = join(ROOT, 'dist');
const HEADERS = readFileSync(join(ROOT, 'public', '_headers'), 'utf8');
const ID = 'G-TEST000000';
const tmp = mkdtempSync(join(tmpdir(), 'docttak-ga-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const cspOf = (headers: string) => headers.match(/Content-Security-Policy: ([^\r\n]*)/)![1]!;
const directive = (csp: string, name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `))!;

describe('gaId: PUBLIC_GA_ID', () => {
  it('unset or blank is off, a G- measurement ID passes trimmed, anything else throws', () => {
    expect(gaId(undefined)).toBe('');
    expect(gaId('   ')).toBe('');
    expect(gaId(' G-TFP7W8X8BG ')).toBe('G-TFP7W8X8BG');
    expect(gaId(ID)).toBe(ID);
    for (const bad of ['g-TFP7W8X8BG', 'UA-12345-1', 'G-12345', 'G-1234567890123', 'G-TFP7W8X8B!', 'GTM-ABC1234', 'AW-123456789']) {
      expect(() => gaId(bad), bad).toThrow(`PUBLIC_GA_ID "${bad}" is not a Google Analytics 4 measurement ID`);
    }
    expect(GA_ID_RE.test('G-TFP7W8X8BG')).toBe(true);
  });
});

describe('withGaCsp', () => {
  it('extends exactly script-src, connect-src and img-src of the single site-wide CSP with the GA hosts (no Ads hosts)', () => {
    const out = withGaCsp(HEADERS);
    const csp = cspOf(out);
    expect(directive(csp, 'script-src')).toBe("script-src 'self' https://www.googletagmanager.com 'wasm-unsafe-eval'");
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://*.google.com");
    expect(directive(csp, 'img-src')).toBe("img-src 'self' https://www.googletagmanager.com https://*.google-analytics.com data: blob:");
    expect(GA_SCRIPT_SRC).toBe('https://www.googletagmanager.com');
    for (const d of ['default-src', 'worker-src', 'font-src', 'style-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors']) expect(directive(csp, d), d).toBe(directive(cspOf(HEADERS), d));
    expect(csp).not.toMatch(/doubleclick|googlesyndication|googleadservices|frame-src/);
    // Nothing but the CSP line changes.
    expect(out.replace(/^.*Content-Security-Policy.*$/m, '')).toBe(HEADERS.replace(/^.*Content-Security-Policy.*$/m, ''));
  });
  it('throws without exactly one CSP line or without the three directives', () => {
    expect(() => withGaCsp('/*\n  X-Content-Type-Options: nosniff\n')).toThrow('no site-wide Content-Security-Policy');
    expect(() => withGaCsp("/*\n  Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src 'self'\n")).toThrow('no site-wide Content-Security-Policy');
  });
  it('composes with the Cloudflare Web Analytics CSP in either order', () => {
    for (const out of [withGaCsp(withAnalyticsCsp(HEADERS)), withAnalyticsCsp(withGaCsp(HEADERS))]) {
      const csp = cspOf(out);
      const tokens = (d: string) => directive(csp, d).split(' ');
      expect(tokens('script-src')).toEqual(expect.arrayContaining(["'self'", 'https://www.googletagmanager.com', 'https://static.cloudflareinsights.com', "'wasm-unsafe-eval'"]));
      expect(tokens('connect-src')).toEqual(expect.arrayContaining(["'self'", 'https://cloudflareinsights.com', ...GA_CONNECT_SRC.split(' ')]));
      expect(tokens('img-src')).toEqual(expect.arrayContaining(["'self'", ...GA_IMG_SRC.split(' '), 'data:', 'blob:']));
      expect(out.match(/Content-Security-Policy/g)).toHaveLength(1);
    }
  });
});

/** Runs a loader text in a fake browser: what it queued, what it appended, when. */
function runLoader(src: string, { readyState = 'interactive', idle = true } = {}) {
  const listeners: Record<string, () => void> = {};
  const appended: { tag: string; async?: boolean; src?: string }[] = [];
  const idleCalls: { fn: () => void; opts: unknown }[] = [];
  const timeouts: (() => void)[] = [];
  const window: Record<string, unknown> = {
    addEventListener: (ev: string, fn: () => void) => (listeners[ev] = fn),
    ...(idle ? { requestIdleCallback: (fn: () => void, opts: unknown) => idleCalls.push({ fn, opts }) } : {}),
  };
  const document = { readyState, head: { appendChild: (el: { tag: string }) => appended.push(el) }, createElement: (tag: string) => ({ tag }) };
  const location = { href: 'https://docttak.com/pdf-compress/?utm_source=blog&utm_medium=post#top' };
  vm.runInNewContext(src, { window, document, location, setTimeout: (fn: () => void) => timeouts.push(fn), Date });
  return { window, listeners, appended, idleCalls, timeouts };
}

describe('loaderSource: /ga.js', () => {
  const src = loaderSource(ID);
  it('the text: ID baked in, arguments pushed, both signal flags off, 13-month cookie, the URL read first; small and plain', () => {
    expect(src).toContain(`gtag('config','${ID}',{page_location:loc,allow_google_signals:false,allow_ad_personalization_signals:false,cookie_expires:${GA_COOKIE_EXPIRES},cookie_flags:'SameSite=Lax;Secure'})`);
    expect(GA_COOKIE_EXPIRES).toBe(395 * 24 * 3600);
    expect(src).toContain('function gtag(){w.dataLayer.push(arguments);}');
    expect(src).toContain(`https://www.googletagmanager.com/gtag/js?id=${ID}`);
    expect(src.indexOf('location.href')).toBeLessThan(src.indexOf('dataLayer'));
    expect(src.indexOf("var loc=location.href.split('#')[0];")).toBe('(function(){'.length);
    expect(src).not.toMatch(/eval|innerHTML|document\.write|new Function|outerHTML|insertAdjacentHTML/);
    expect(src).not.toMatch(/\b(let|const)\b|=>|`/); // ES5
    expect(src.match(/gtag\('/g)).toHaveLength(2); // js and config, no other calls
    expect(Buffer.byteLength(src)).toBeLessThan(1024);
    expect(() => loaderSource('UA-1-1')).toThrow();
  });
  it('behaviour: queues js + config (as Arguments) at once, loads gtag.js only after load and idle (max 2 s), gtag stays private', () => {
    const r = runLoader(src);
    const dl = r.window.dataLayer as ArrayLike<unknown>[];
    expect(dl).toHaveLength(2);
    for (const e of dl) expect(Object.prototype.toString.call(e)).toBe('[object Arguments]');
    expect(dl[0]![0]).toBe('js');
    expect(dl[1]![0]).toBe('config');
    expect(dl[1]![1]).toBe(ID);
    expect(dl[1]![2]).toEqual({ page_location: 'https://docttak.com/pdf-compress/?utm_source=blog&utm_medium=post', allow_google_signals: false, allow_ad_personalization_signals: false, cookie_expires: 34128000, cookie_flags: 'SameSite=Lax;Secure' });
    expect(r.window.gtag).toBeUndefined();
    expect(r.appended).toEqual([]);
    expect(r.idleCalls).toEqual([]);
    r.listeners.load!();
    expect(r.appended).toEqual([]);
    expect(r.idleCalls).toHaveLength(1);
    expect(r.idleCalls[0]!.opts).toEqual({ timeout: 2000 });
    r.idleCalls[0]!.fn();
    expect(r.appended).toEqual([{ tag: 'script', async: true, src: `https://www.googletagmanager.com/gtag/js?id=${ID}` }]);
  });
  it('behaviour: an already loaded page goes straight to idle; without requestIdleCallback a timeout loads it', () => {
    const done = runLoader(src, { readyState: 'complete' });
    expect(done.listeners.load).toBeUndefined();
    expect(done.idleCalls).toHaveLength(1);
    const noIdle = runLoader(src, { idle: false });
    noIdle.listeners.load!();
    expect(noIdle.timeouts).toHaveLength(1);
    noIdle.timeouts[0]!();
    expect(noIdle.appended).toHaveLength(1);
  });
  it('a second run keeps an existing dataLayer', () => {
    const r = runLoader(src);
    vm.runInNewContext(src, { window: r.window, document: { readyState: 'interactive', head: {}, createElement: () => ({}) }, location: { href: 'https://docttak.com/' }, setTimeout, Date });
    expect((r.window.dataLayer as unknown[]).length).toBe(4);
  });
});

describe('page_title stays the static <title>', () => {
  it('src/ never assigns document.title (GA4 reads page_title from it)', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.(ts|astro|mjs|js)$/.test(e.name) ? [join(d, e.name)] : []));
    const hits = walk(join(ROOT, 'src')).filter((f) => /document\.title\s*=(?!=)/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});

describe('service worker and Google Analytics', () => {
  const origin = 'https://docttak.com';
  it('route(): same-origin /ga.js goes to the network (never cache-first); Google URLs are another origin', () => {
    for (const mode of ['no-cors', 'cors', 'same-origin']) expect(route({ method: 'GET', url: `${origin}/ga.js`, mode }, origin)).toBe('default');
    for (const url of [`https://www.googletagmanager.com/gtag/js?id=${ID}`, 'https://region1.google-analytics.com/g/collect?v=2', 'https://region1.analytics.google.com/g/collect']) {
      expect(route({ method: 'GET', url, mode: 'no-cors' }, origin)).toBe('default');
      expect(route({ method: 'POST', url, mode: 'no-cors' }, origin)).toBe('default');
    }
  });
  it('no Google host anywhere in the service worker source', () => {
    expect(readFileSync(join(ROOT, 'src', 'sw', 'sw.ts'), 'utf8')).not.toMatch(/google|gtag|\/ga\.js/i);
  });
  it('gen-sw: the classic /ga.js is never precached', () => {
    const dir = join(tmp, 'sw-dist');
    const page = `<!doctype html><head><script defer src="/ga.js" data-site-ga></script></head><body><script type="module" src="/_astro/site.js"></script></body>`;
    const files: Record<string, string> = {
      'index.html': page,
      'offline/index.html': page,
      'sitemap.xml': '<urlset><url><loc>https://docttak.com/</loc></url></urlset>',
      '_astro/site.js': 'export const x = 1;',
      'ga.js': loaderSource(ID),
    };
    for (const [p, body] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), body);
    }
    const { urls } = precacheList(dir);
    expect(urls).toEqual(expect.arrayContaining(['/', '/offline/', '/_astro/site.js']));
    expect(urls).not.toContain('/ga.js');
  });
});

describe('no-upload guard: the GA allowance (tests/e2e/upload-guard.ts)', () => {
  const base = 'http://127.0.0.1:4183';
  const rq = (method: string, url: string, body: Buffer | null = null): RequestLike => ({ url: () => url, method: () => method, postDataBuffer: () => body });
  const rs = (url: string, csp: string): ResponseLike => ({ url: () => url, headers: () => ({ 'content-security-policy': csp }), request: () => ({ method: () => 'GET' }) });
  const gaCsp = cspOf(withGaCsp(HEADERS));
  const gtag = rq('GET', `https://www.googletagmanager.com/gtag/js?id=${ID}`);
  const hit = rq('GET', 'https://region1.google-analytics.com/g/collect?v=2&tid=G-TEST000000');
  const page = rq('GET', `${base}/pdf-compress/`);

  it('off (every project but cloud-*): Google requests and the GA CSP fail', () => {
    expect(uploadProblems({ requests: [page, gtag], responses: [rs(`${base}/pdf-compress/`, gaCsp)], websockets: [] }, base)).toEqual([`third-party ${gtag.url()}`, `no CSP connect-src 'self' on ${base}/pdf-compress/`]);
  });
  it('on: bodiless GETs to gtag.js and the collect hosts pass under exactly the GA CSP', () => {
    expect(uploadProblems({ requests: [page, gtag, hit], responses: [rs(`${base}/pdf-compress/`, gaCsp)], websockets: [] }, base, [], true)).toEqual([]);
  });
  it('on: a POST or a body to Google, another Google path or host, http, or a wider CSP still fail', () => {
    const post = rq('POST', 'https://region1.google-analytics.com/g/collect?v=2', Buffer.from('x'));
    expect(uploadProblems({ requests: [post], responses: [], websockets: [] }, base, [], true)).toEqual([`POST ${post.url()}`, `request body on ${post.url()}`, `third-party ${post.url()}`]);
    for (const url of ['https://www.googletagmanager.com/gtm.js?id=GTM-X', 'https://www.google.com/x', 'https://evil.example/g/collect', 'http://region1.google-analytics.com/g/collect', 'https://google-analytics.com.evil.example/g/collect']) {
      expect(isGaRequest('GET', url), url).toBe(false);
    }
    expect(isGaRequest('GET', 'https://region1.analytics.google.com/g/collect?v=2')).toBe(true);
    const wider = gaCsp.replace("connect-src 'self'", "connect-src 'self' https://evil.example");
    expect(uploadProblems({ requests: [page], responses: [rs(`${base}/`, wider)], websockets: [] }, base, [], true)).toEqual([`no CSP connect-src 'self' on ${base}/`]);
  });
});

describe('PRIVACY_REVISED in a GA-off build', () => {
  it('unit tests run GA-off: the date chain is unchanged', () => {
    expect(PRIVACY_REVISED).not.toBe(PRIVACY_GA);
  });
});

describe('GA-off dist (the build under test)', () => {
  it('no tag, no /ga.js, no Google host, no GA section or wording in the policy; check-dist refuses PUBLIC_GA_ID on it', () => {
    if (!existsSync(join(DIST, 'index.html'))) throw new Error('Run `npm run build` first: these checks read dist/.');
    if (existsSync(join(DIST, 'ga.js'))) return; // a GA-on dist (local runs only): the GA-on build below covers it
    expect(readFileSync(join(DIST, 'index.html'), 'utf8')).not.toContain('/ga.js');
    const privacy = readFileSync(join(DIST, 'privacy', 'index.html'), 'utf8');
    expect(privacy).not.toContain('id="ga"');
    expect(privacy).not.toMatch(/Google 애널리틱스|_ga|국외 이전[^<]*Google/);
    expect(readFileSync(join(DIST, '_headers'), 'utf8')).not.toMatch(/google/i);
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-dist.mjs')], { env: { ...process.env, PUBLIC_GA_ID: ID }, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('index.html: 0 Google Analytics tags (expected exactly one /ga.js tag with data-site-ga)');
    expect(r.stderr).toContain('PUBLIC_GA_ID is set but dist/ga.js is missing (postbuild gen-ga)');
  }, 60_000);
});

describe('GA-on build (PUBLIC_GA_ID=G-TEST000000)', { timeout: 300_000 }, () => {
  const out = join(tmp, 'ga-build');
  // astro build copies public/ as is, and public/vendor/ holds the 배경 지우기 engine only after a PUBLIC_BG_REMOVE=1
  // copy-vendor (the CI checks job). Build with the flag that matches it, or check-dist fails the flag-off build for
  // carrying those files.
  const bgVendored = existsSync(join(ROOT, 'public', 'vendor', 'birefnet-lite-512'));
  const env = { ...process.env, PUBLIC_GA_ID: ID, PUBLIC_BG_REMOVE: bgVendored ? '1' : '0' };
  const node = (script: string, extra: NodeJS.ProcessEnv = env) => spawnSync(process.execPath, [join(ROOT, 'scripts', script), '--dist', out], { cwd: ROOT, env: extra, encoding: 'utf8' });
  let built = false;
  const build = () => {
    if (built) return;
    execFileSync(process.execPath, [join(ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'build', '--outDir', out], { cwd: ROOT, env, stdio: 'pipe' });
    built = true;
  };
  const page = (p: string) => readFileSync(join(out, p), 'utf8');

  it('gen-ga writes the loader; check-dist passes; gen-headers widens the CSP and makes /ga.js no-cache', () => {
    build();
    const ga = node('gen-ga.mjs');
    expect(ga.status, ga.stderr).toBe(0);
    expect(page('ga.js')).toBe(loaderSource(ID));
    const check = node('check-dist.mjs');
    expect(check.status, check.stderr).toBe(0);
    const headers = node('gen-headers.mjs');
    expect(headers.status, headers.stderr).toBe(0);
    const h = page('_headers');
    expect(cspOf(h)).toBe(cspOf(withGaCsp(HEADERS)));
    expect(h).toContain('/ga.js\n  Cache-Control: no-cache\n');
  });

  it('every page: one /ga.js tag before the module scripts; no gtag.js tag, no inline gtag', () => {
    build();
    for (const p of ['index.html', 'pdf-compress/index.html', 'id-photo/index.html', '404.html', 'offline/index.html', 'privacy/index.html']) {
      const html = page(p);
      expect(html.match(/<script defer src="\/ga\.js" data-site-ga><\/script>/g), p).toHaveLength(1);
      const mod = html.indexOf('type="module"');
      if (mod >= 0) expect(html.indexOf('src="/ga.js"'), p).toBeLessThan(mod);
      expect(html, p).not.toMatch(/googletagmanager|gtag\(/);
    }
  });

  it('the privacy policy: section 1 sentence, the GA section as 4 with its items, renumbered sections, change log, date; sitemap lastmod', () => {
    build();
    const html = page('privacy/index.html');
    const text = html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
    expect(text).toContain('이름·연락처 같은 개인정보를 받지 않아요. 방문 분석을 위해 Google 애널리틱스 쿠키를 써요(4항).');
    expect(text).not.toContain('쿠키와 방문 분석 도구도 쓰지 않아요');
    const h2 = [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
    expect(h2).toEqual(['1. 이름·연락처는 받지 않아요', '2. 고른 파일은 내 폰·컴퓨터 안에서 처리해요', '3. 사이트를 여는 기록', '4. Google 애널리틱스(방문 분석)', '5. 광고', '6. 변경 이력']);
    expect(html).toMatch(/<h2 id="ga"[^>]*>4\. Google 애널리틱스\(방문 분석\)<\/h2>/);
    for (const s of [
      '_ga, _ga_<번호>',
      '최대 13개월',
      '대략적인 지역(IP로 추정하며 IP 주소 자체는 Google 애널리틱스에 저장되지 않아요)',
      '고른 파일의 이름과 내용은 담기지 않아요',
      '받는 자: Google LLC',
      '이전 국가: 미국',
      '이전 일시·방법: 페이지를 열 때마다 인터넷으로 전송',
      '이용 목적: 방문 통계',
      '보유·이용 기간: Google 애널리틱스에 2개월 보관 후 삭제 (쿠키는 최대 13개월)',
      'Google 신호와 광고 개인화는 꺼 두었고, 광고에 쓰지 않아요.',
      '막아도 모든 도구를 그대로 쓸 수 있어요.',
      `시행일: ${PRIVACY_GA}`,
      `${PRIVACY_GA}: Google 애널리틱스(방문 분석, 쿠키)와 국외 이전 내용을 더함`,
    ]) expect(text, s).toContain(s);
    expect(html).toContain('href="https://support.google.com/policies/contact/general_privacy_form?hl=ko"');
    expect(html).toContain('href="https://tools.google.com/dlpage/gaoptout?hl=ko"');
    expect(page('sitemap.xml')).toMatch(/<loc>[^<]*\/privacy\/<\/loc><lastmod>2026-10-08<\/lastmod>/);
  });

  it('check-dist: an invalid ID, a missing or altered ga.js, or the ID unset on this build fail', () => {
    build();
    const bad = node('check-dist.mjs', { ...env, PUBLIC_GA_ID: 'UA-1234-1' });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('PUBLIC_GA_ID "UA-1234-1" is not a Google Analytics 4 measurement ID');
    const other = node('check-dist.mjs', { ...env, PUBLIC_GA_ID: 'G-OTHER12345' });
    expect(other.status).toBe(1);
    expect(other.stderr).toContain('dist/ga.js is not the loader for G-OTHER12345');
    const off = node('check-dist.mjs', { ...env, PUBLIC_GA_ID: '' });
    expect(off.status).toBe(1);
    expect(off.stderr).toContain('index.html: Google Analytics tag although PUBLIC_GA_ID is not set');
    expect(off.stderr).toContain('dist/ga.js ships although PUBLIC_GA_ID is not set');
    expect(off.stderr).toContain('ga.js: names googletagmanager although PUBLIC_GA_ID is not set');
    // gen-ga with the ID unset removes the loader.
    expect(node('gen-ga.mjs', { ...env, PUBLIC_GA_ID: '' }).status).toBe(0);
    expect(existsSync(join(out, 'ga.js'))).toBe(false);
  });
});
