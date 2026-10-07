// npm run qa:admin -- [--label before|after] [--out DIR] [--shots]
// Renders /admin/ (functions/admin/[[path]].ts) offline from fixture rows (tests/fixtures/usage-rows.mjs) into
// OUT/LABEL/SCENARIO.html: full-7, full-90, empty, error (SQL API 500), xss. With --shots each page is opened in
// Playwright chromium and saved as PNG at 1280x900 light, 360x780 light and 360x780 dark; the 360 px document
// scrollWidth is printed (it must stay <= 360). Writes to the OS temp folder by default, never the repo.
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { onRequest } from '../../functions/admin/[[path]].ts';
import { EMPTY, FULL, PREV, XSS } from '../../tests/fixtures/usage-rows.mjs';

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

/** Answers each SQL API query by its alias, like tests/unit/usage.test.ts. */
function stubFetch(rows, prev, status = 200) {
  globalThis.fetch = async (_url, init) => {
    if (status !== 200) return new Response('error', { status });
    const sql = String(init?.body ?? '');
    const data = sql.includes('AS kind') ? prev : sql.includes('AS event') ? rows.events : sql.includes('AS code') ? rows.fails : sql.includes('AS setting') ? rows.settings : rows.guides;
    return new Response(JSON.stringify({ data }));
  };
}

const SCENARIOS = [
  ['full-7', 7, FULL, PREV, 200],
  ['full-90', 90, FULL, PREV, 200],
  ['empty', 7, EMPTY, [], 200],
  ['error', 7, FULL, PREV, 500],
  ['xss', 7, XSS, PREV, 200],
];

const files = [];
for (const [name, days, rows, prev, status] of SCENARIOS) {
  stubFetch(rows, prev, status);
  const res = await onRequest({ request: new Request(`https://docttak.com/admin/?days=${days}`, { headers: { authorization: AUTH } }), env: ENV });
  const file = join(DIR, `${name}.html`);
  writeFileSync(file, await res.text());
  files.push([name, file]);
  console.log(`${name}: HTTP ${res.status} -> ${file}`);
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
