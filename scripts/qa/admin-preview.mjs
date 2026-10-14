// npm run qa:admin -- [--label before|after] [--out DIR] [--shots]
// Renders /admin/ (functions/admin/[[path]].ts) offline from fixture rows (tests/fixtures/usage-rows.mjs, and
// tests/fixtures/rum-rows.mjs for the Web Analytics GraphQL API) into OUT/LABEL/SCENARIO.html: full-7, full-90,
// empty, error (SQL API 500), xss, visits-7, visits-1 (hourly), visits-90, visits-error (HTTP 200 + errors[]),
// visits-empty, visits-sampled (sampleInterval 10 -> 추정), usage-error-visits-ok, campaigns (캠페인별 유입, 1 and 7
// days), campaigns-error (its SQL 400 only), pages-empty (Cloudflare sends no page list but counted page views),
// mismatch (total far from the device sum), countries-fallback (like / notlike refused -> countryPaths); every visits
// page has the two country tables and the 집계 정보 details (REQ1014-A). With --shots each page is opened in
// Playwright chromium and saved as PNG at 1280x900 light, 360x780 light and 360x780 dark; the 360 px document
// scrollWidth is printed (it must stay <= 360). Writes to the OS temp folder by default, never the repo.
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { onRequest } from '../../functions/admin/[[path]].ts';
import { EMPTY, FULL, PREV, XSS } from '../../tests/fixtures/usage-rows.mjs';
import { RUM_EMPTY, RUM_ERRORS, TOPS, XSS_TOPS, rumAnswer } from '../../tests/fixtures/rum-rows.mjs';

const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const LABEL = arg('--label') ?? 'after';
const OUT = arg('--out') ?? join(tmpdir(), 'docttak-admin-preview');
const SHOTS = args.includes('--shots');
const DIR = join(OUT, LABEL);
mkdirSync(DIR, { recursive: true });

const PW = 'preview-password-0123';
const ENV = { ADMIN_PASSWORD: PW, CF_ACCOUNT_ID: 'acc', AE_API_TOKEN: 'preview-token', PUBLIC_USAGE_SAMPLE: '0.25' };
const AUTH = `Basic ${Buffer.from(`admin:${PW}`).toString('base64')}`;

/**
 * Answers each GraphQL request (by URL) with `rum(requestBody)` and each SQL API query by its alias, like
 * tests/unit/usage.test.ts.
 */
function stubFetch(rows, prev, status, rum, counter, { camp = [], campStatus = 200 } = {}) {
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/graphql')) {
      counter.graphql++;
      return new Response(JSON.stringify(rum(init?.body ?? '')), { status: 200 });
    }
    if (status !== 200) return new Response('error', { status });
    const sql = String(init?.body ?? '');
    if (sql.includes('AS camp')) return campStatus === 200 ? new Response(JSON.stringify({ data: camp })) : new Response('error', { status: campStatus });
    const data = sql.includes('AS kind') ? prev : sql.includes('AS event') ? rows.events : sql.includes('AS code') ? rows.fails : sql.includes('AS setting') ? rows.settings : rows.guides;
    return new Response(JSON.stringify({ data }));
  };
}

const full = (body) => rumAnswer(body);
/** 캠페인별 유입 rows as the SQL API returns them (REQ1014-A). */
const CAMP = [
  { src: 'naver_blog', camp: 'history-exam-photo', event: 'land', n: 42 },
  { src: 'naver_blog', camp: 'history-exam-photo', event: 'start', n: 18 },
  { src: 'naver_blog', camp: 'history-exam-photo', event: 'success', n: 15 },
  { src: 'play', camp: 'none', event: 'land', n: 77 },
  { src: 'play', camp: 'none', event: 'start', n: 20 },
  { src: 'play', camp: 'none', event: 'success', n: 19 },
  { src: 'tistory', camp: 'passport-photo-size-guide-for-online-application-2026', event: 'land', n: 9 },
  { src: 'tistory', camp: 'other', event: 'land', n: 3 },
  { src: 'other', camp: 'none', event: 'land', n: 1 },
];
const SCENARIOS = [
  ['full-7', 7, FULL, PREV, 200, full],
  ['full-90', 90, FULL, PREV, 200, full],
  ['empty', 7, EMPTY, [], 200, () => RUM_EMPTY],
  ['error', 7, FULL, PREV, 500, full],
  ['xss', 7, XSS, PREV, 200, (body) => rumAnswer(body, { tops: XSS_TOPS })],
  ['visits-7', 7, FULL, PREV, 200, full],
  ['visits-1', 1, FULL, PREV, 200, full],
  ['visits-90', 90, FULL, PREV, 200, full],
  ['visits-error', 7, FULL, PREV, 200, () => RUM_ERRORS],
  ['visits-empty', 7, FULL, PREV, 200, () => RUM_EMPTY],
  ['visits-sampled', 30, FULL, PREV, 200, (body) => rumAnswer(body, { si: 10 })],
  ['usage-error-visits-ok', 7, FULL, PREV, 500, full],
  ['campaigns', 7, FULL, PREV, 200, full, { camp: CAMP }],
  ['campaigns-1', 1, FULL, PREV, 200, full, { camp: CAMP }],
  ['campaigns-error', 7, FULL, PREV, 200, full, { campStatus: 400 }],
  ['pages-empty', 1, FULL, PREV, 200, (body) => rumAnswer(body, { tops: { ...TOPS, pages: [], pagesByVisits: [] } })],
  ['mismatch', 1, FULL, PREV, 200, (body) => rumAnswer(body, { total: { count: 420, visits: 210 } })],
  ['countries-fallback', 7, FULL, PREV, 200, (body) => rumAnswer(body, { likeRefused: true })],
];

const files = [];
for (const [name, days, rows, prev, status, rum, opts] of SCENARIOS) {
  const counter = { graphql: 0 };
  stubFetch(rows, prev, status, rum, counter, opts);
  const res = await onRequest({ request: new Request(`https://docttak.com/admin/?days=${days}`, { headers: { authorization: AUTH } }), env: ENV });
  const file = join(DIR, `${name}.html`);
  writeFileSync(file, await res.text());
  files.push([name, file]);
  console.log(`${name}: HTTP ${res.status}, ${counter.graphql} GraphQL request(s) -> ${file}`);
}

if (SHOTS) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const VIEWS = [
    ['desktop-light', { width: 1280, height: 900 }, 'light'],
    ['phone-light', { width: 360, height: 780 }, 'light'],
    ['phone-dark', { width: 360, height: 780 }, 'dark'],
  ];
  try {
    for (const [view, viewport, colorScheme] of VIEWS) {
      const ctx = await browser.newContext({ viewport, colorScheme });
      const page = await ctx.newPage();
      for (const [name, file] of files) {
        await page.goto(pathToFileURL(file).href);
        const png = join(DIR, `${name}-${view}.png`);
        await page.screenshot({ path: png, fullPage: true });
        const extra = viewport.width === 360 ? ` scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)}` : '';
        console.log(`${png}${extra}`);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}
