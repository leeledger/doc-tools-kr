// Shared no-upload assertion (brief §3.3). Every e2e test imports `test` from here: the auto fixture
// records every request of the browser context (including worker requests) and every websocket,
// then fails the test if anything could have carried data off the device.
import { test as base, expect, type BrowserContext, type Page, type Request, type Response } from '@playwright/test';

export interface NetworkLog {
  requests: Request[];
  responses: Response[];
  websockets: string[];
}

export function recordNetwork(context: BrowserContext, page: Page): NetworkLog {
  const log: NetworkLog = { requests: [], responses: [], websockets: [] };
  context.on('request', (r) => log.requests.push(r));
  context.on('response', (r) => log.responses.push(r));
  page.on('websocket', (ws) => log.websockets.push(ws.url()));
  return log;
}

export function expectNoUpload(log: NetworkLog, baseURL: string, navigated = true): void {
  const origin = new URL(baseURL).origin;
  const problems: string[] = [];
  for (const r of log.requests) {
    const url = r.url();
    const scheme = url.slice(0, url.indexOf(':') + 1);
    if (!['GET', 'HEAD'].includes(r.method())) problems.push(`${r.method()} ${url}`);
    if (r.postDataBuffer() !== null) problems.push(`request body on ${url}`);
    if (scheme !== 'blob:' && scheme !== 'data:' && new URL(url).origin !== origin) problems.push(`third-party ${url}`);
  }
  for (const ws of log.websockets) problems.push(`websocket ${ws}`);
  for (const r of log.responses) {
    const url = r.url();
    if (!url.startsWith(origin)) continue;
    const csp = r.headers()['content-security-policy'] ?? '';
    if (!/(^|;)\s*connect-src 'self'\s*(;|$)/.test(csp)) problems.push(`no CSP connect-src 'self' on ${url}`);
  }
  expect(problems, 'network activity that could carry file data').toEqual([]);
  if (navigated) expect(log.requests.length, 'the recorder saw the page load').toBeGreaterThan(0);
}

export const test = base.extend<{ network: NetworkLog }>({
  network: [
    async ({ context, page, baseURL }, use) => {
      const log = recordNetwork(context, page);
      await use(log);
      expectNoUpload(log, baseURL!, page.url() !== 'about:blank');
    },
    { auto: true },
  ],
});

/**
 * Navigates and waits for document.readyState === 'complete'. Playwright's Firefox occasionally misses
 * the load event under parallel load (the page reports readyState 'complete' while goto still waits),
 * so the load state is checked in the page instead.
 */
export async function gotoReady(page: Page, path: string): Promise<Response | null> {
  const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.readyState === 'complete');
  return res;
}

export { expect };
