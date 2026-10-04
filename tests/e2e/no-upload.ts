// Shared no-upload assertion (brief §3.3). Every e2e test imports `test` from here: the auto fixture
// records every request of the browser context (including worker requests) and every websocket,
// then fails the test if anything could have carried data off the device.
import { test as base, expect, type BrowserContext, type Page, type Request, type Response } from '@playwright/test';
import { uploadProblems, type AllowedUpload } from './upload-guard';

export type { AllowedUpload };

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

export function expectNoUpload(log: NetworkLog, baseURL: string, navigated = true, allowUpload: readonly AllowedUpload[] = []): void {
  expect(uploadProblems(log, baseURL, allowUpload), 'network activity that could carry file data').toEqual([]);
  if (navigated) expect(log.requests.length, 'the recorder saw the page load').toBeGreaterThan(0);
}

export const test = base.extend<{ network: NetworkLog; allowUpload: AllowedUpload[] }>({
  // Empty for every spec: only the 배경 지우기 cloud spec sets it (test.use), for its one endpoint.
  allowUpload: [[], { option: true }],
  network: [
    async ({ context, page, baseURL, allowUpload }, use) => {
      const log = recordNetwork(context, page);
      await use(log);
      expectNoUpload(log, baseURL!, page.url() !== 'about:blank', allowUpload);
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
