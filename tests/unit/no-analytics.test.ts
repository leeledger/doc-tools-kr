// INTERNAL-TRAFFIC (docs/OPS-RUNBOOK.md, "자동화 트래픽 제외"): automated browser sessions on the live site send no
// analytics. The helper itself, then a grep-style check that every script able to drive a browser against the
// deployed site uses it, and that the fetch-based live checks cannot execute page scripts at all.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blockAnalytics, isAnalyticsUrl } from '../../scripts/lib/no-analytics.mjs';
import { DESIGNED_CONNECT_SRC, connectSrcOf, isDesignedConnectSrc } from '../../scripts/lib/csp-connect.mjs';
import { BEACON_CONNECT } from '../../scripts/lib/analytics.mjs';
import { GA_CONNECT_SRC } from '../../scripts/lib/ga.mjs';
import { uploadProblems } from '../e2e/upload-guard';

describe('isAnalyticsUrl', () => {
  it.each([
    'https://static.cloudflareinsights.com/beacon.min.js',
    'https://cloudflareinsights.com/cdn-cgi/rum',
    'https://www.googletagmanager.com/gtag/js?id=G-TFP7W8X8BG',
    'https://www.google-analytics.com/g/collect?v=2&tid=G-TFP7W8X8BG&en=page_view',
    'https://region1.google-analytics.com/g/collect?v=2',
    'https://google-analytics.com/collect',
    'https://region1.analytics.google.com/g/collect?v=2',
    'https://docttak.com/cdn-cgi/rum',
    'https://www.google.com/g/collect?v=2&tid=G-TFP7W8X8BG',
    'https://docttak.com/api/usage',
    'http://127.0.0.1:4173/api/usage',
    'https://STATIC.CloudflareInsights.com/beacon.min.js',
  ])('blocks %s', (url) => expect(isAnalyticsUrl(url)).toBe(true));

  it.each([
    'https://docttak.com/',
    'https://docttak.com/ga.js',
    'https://docttak.com/pdf-merge/',
    'https://docttak.com/api/remove-bg',
    'https://docttak.com/api/usage/extra',
    'https://docttak.com/guide/?q=/api/usage',
    'https://docttak.com/_astro/app.js',
    'https://notcloudflareinsights.com/cdn-cgi/rum',
    'https://google-analytics.com.evil.example/collect',
    'https://www.google.com/search?q=x',
    'blob:https://docttak.com/0b5c',
    'data:text/plain,hi',
    'not a url',
  ])('lets %s through', (url) => expect(isAnalyticsUrl(url)).toBe(false));
});

describe('blockAnalytics', () => {
  it('routes exactly the analytics URLs of the context to abort', async () => {
    const routes: { match: (u: URL) => boolean; handler: (r: { abort(code?: string): Promise<void> }) => unknown }[] = [];
    await blockAnalytics({ route: async (match, handler) => void routes.push({ match, handler }) });
    expect(routes).toHaveLength(1);
    const [{ match, handler }] = routes;
    expect(match(new URL('https://cloudflareinsights.com/cdn-cgi/rum'))).toBe(true);
    expect(match(new URL('https://docttak.com/api/usage'))).toBe(true);
    expect(match(new URL('https://docttak.com/pdf-merge/'))).toBe(false);
    const codes: (string | undefined)[] = [];
    await handler({ abort: async (code) => void codes.push(code) });
    expect(codes).toEqual(['blockedbyclient']);
  });
});

// Round 2: the live checks accept exactly the CSP production is designed to send.
describe('designed CSP connect-src (round 2)', () => {
  // Production on 2026-10-10 (curl -sI https://docttak.com/pdf-merge/), both analytics on.
  const LIVE =
    "default-src 'self'; script-src 'self' https://www.googletagmanager.com https://static.cloudflareinsights.com 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://*.google.com https://cloudflareinsights.com; img-src 'self' data: blob:";
  const withConnect = (v: string) => `default-src 'self'; connect-src ${v}; img-src 'self'`;

  it('is derived from the generators: off, analytics, GA, both', () => {
    expect(DESIGNED_CONNECT_SRC).toEqual(["'self'", `'self' ${BEACON_CONNECT}`, `'self' ${GA_CONNECT_SRC}`, `'self' ${GA_CONNECT_SRC} ${BEACON_CONNECT}`]);
  });

  it('accepts the production header and each designed variant', () => {
    expect(isDesignedConnectSrc(LIVE)).toBe(true);
    for (const v of DESIGNED_CONNECT_SRC) expect(isDesignedConnectSrc(withConnect(v)), v).toBe(true);
    expect(isDesignedConnectSrc(withConnect(`'self'   ${BEACON_CONNECT}`))).toBe(true);
  });

  it('rejects any other host, order, wildcard or a missing directive', () => {
    for (const v of [
      `'self' ${BEACON_CONNECT} https://evil.example`,
      `'self' https://evil.example`,
      `${BEACON_CONNECT} 'self'`,
      `'self' ${BEACON_CONNECT} ${GA_CONNECT_SRC}`,
      `'self' https:`,
      '*',
      `'self' https://*.google-analytics.com`,
    ])
      expect(isDesignedConnectSrc(withConnect(v)), v).toBe(false);
    expect(isDesignedConnectSrc("default-src 'self'")).toBe(false);
    expect(isDesignedConnectSrc('')).toBe(false);
    expect(connectSrcOf("connect-src 'self';connect-src *")).toBe("'self'");
  });

  it('the no-upload guard accepts the designed CSP only with designedCsp (the live config)', () => {
    const base = 'https://docttak.com';
    const res = (csp: string) => ({ url: () => `${base}/pdf-merge/`, headers: () => ({ 'content-security-policy': csp }), request: () => ({ method: () => 'GET' }) });
    const log = (csp: string) => ({ requests: [], responses: [res(csp)], websockets: [] });
    expect(uploadProblems(log(LIVE), base)).toEqual([`no CSP connect-src 'self' on ${base}/pdf-merge/`]);
    expect(uploadProblems(log(LIVE), base, [], false, true)).toEqual([]);
    expect(uploadProblems(log(withConnect(`'self' ${BEACON_CONNECT} https://evil.example`)), base, [], false, true)).not.toEqual([]);
  });
});

const ROOT = process.cwd();
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === 'node_modules' || name === 'corpus' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else if (/\.(m?js|ts)$/.test(name)) out.push(relative(ROOT, join(ROOT, p)).split(sep).join('/'));
  }
  return out;
}
const SOURCES = [...walk('scripts'), ...walk('tests')];
const LAUNCHES = /\b(chromium|firefox|webkit|puppeteer)\.(launch|launchServer|launchPersistentContext|connect|connectOverCDP)\(/;

/**
 * Browser scripts that can never reach the deployed site: they load file:// pages, a local Vite server on 127.0.0.1
 * or a routed fake origin. A new script that launches a browser must either call blockAnalytics or be added here.
 */
const LOCAL_ONLY: Record<string, string> = {
  'scripts/qa/admin-preview.mjs': 'renders the /admin/ Function locally and opens file:// pages',
  'scripts/regress/bgremove.mjs': 'Vite server on 127.0.0.1',
  'scripts/regress/hwp.mjs': 'Vite server on 127.0.0.1',
  'scripts/regress/hwp-viewer.mjs': 'local server on 127.0.0.1',
  'scripts/regress/idphoto.mjs': 'Vite server on 127.0.0.1',
  'scripts/regress/photo.mjs': 'Vite server on 127.0.0.1',
  'scripts/spike/hwpx-to-hwp-browser.mjs': 'routed fake origin https://spike.test',
};

describe('every live browser session blocks analytics (grep)', () => {
  const launchers = SOURCES.filter((p) => LAUNCHES.test(read(p)));

  it('finds the browser scripts', () => {
    expect(launchers).toContain('scripts/qa/visual.mjs');
  });

  it.each(launchers)('%s blocks analytics or is local-only', (p) => {
    const src = read(p);
    if (p in LOCAL_ONLY) {
      // Local-only stays local-only: no target URL argument, no navigation to the live host.
      expect(src).not.toMatch(/['"]--url['"]|LIVE_URL/);
      expect(src).not.toMatch(/goto\(\s*[`'"]https:\/\/docttak\.com/);
      return;
    }
    expect(src).toMatch(/import \{[^}]*\bblockAnalytics\b[^}]*\} from '[./]+\/lib\/no-analytics\.mjs'/);
    expect(src).toMatch(/await blockAnalytics\(/);
  });

  it('qa:visual blocks analytics on the one context factory every page uses', () => {
    const src = read('scripts/qa/visual.mjs');
    expect(src.match(/browser\.newContext\(|\.newContext\(\{/g)).toHaveLength(1);
    expect(src).toMatch(/const ctx = await browser\.newContext\([\s\S]*?await blockAnalytics\(ctx\);[\s\S]*?return ctx;/);
  });

  it('the A-1 live smoke: the live config turns noAnalytics on and the fixture aborts before recording', () => {
    expect(read('playwright.live.config.ts')).toMatch(/\bnoAnalytics: true\b/);
    expect(read('playwright.live.config.ts')).toMatch(/\bliveCsp: true\b/);
    expect(read('playwright.config.ts')).not.toMatch(/\b(noAnalytics|liveCsp)\b/);
    const fixture = read('tests/e2e/no-upload.ts');
    expect(fixture).toMatch(/if \(noAnalytics\) await blockAnalytics\(context\);[\s\S]*?const log = recordNetwork\(context, page\);/);
    const specs = SOURCES.filter((p) => p.startsWith('tests/live/'));
    expect(specs.length).toBeGreaterThan(0);
    for (const p of specs) expect(read(p), p).toMatch(/import \{[^}]*\btest as base\b[^}]*\} from '\.\.\/e2e\/no-upload'/);
  });

  it('workflows run Playwright against the live site only through playwright.live.config.ts', () => {
    const dir = '.github/workflows';
    for (const name of readdirSync(join(ROOT, dir))) {
      const yml = read(`${dir}/${name}`);
      if (!/docttak\.com/.test(yml)) continue;
      for (const line of yml.split('\n').filter((l) => /playwright test/.test(l))) expect(line, `${name}: ${line.trim()}`).toMatch(/-c playwright\.live\.config\.ts/);
      // Round 2: a piped log must not hide the check's exit code.
      for (const line of yml.split('\n').filter((l) => /\|\s*tee\b/.test(l))) expect(line, `${name}: ${line.trim()}`).toMatch(/set -o pipefail;/);
      expect(yml, name).not.toMatch(/\blhci\b|lighthouse/i);
    }
  });

  it('the fetch-based live checks cannot run page scripts (no browser, no jsdom)', () => {
    const fetchers = ['scripts/smoke-assets.mjs', 'scripts/indexnow.mjs', ...SOURCES.filter((p) => p.startsWith('scripts/ops/'))];
    for (const p of fetchers) expect(read(p), p).not.toMatch(/from '(@playwright\/test|playwright|playwright-core|puppeteer|jsdom|happy-dom)'/);
  });
});
