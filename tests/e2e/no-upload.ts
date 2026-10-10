// Shared no-upload assertion (brief §3.3). Every e2e test imports `test` from here: the auto fixture
// records every request of the browser context (including worker requests) and every websocket,
// then fails the test if anything could have carried data off the device.
import { test as base, expect, type BrowserContext, type Page, type Request, type Response } from '@playwright/test';
import { blockAnalytics, isAnalyticsUrl } from '../../scripts/lib/no-analytics.mjs';
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

export function expectNoUpload(log: NetworkLog, baseURL: string, navigated = true, allowUpload: readonly AllowedUpload[] = [], ga = false, designedCsp = false): void {
  expect(uploadProblems(log, baseURL, allowUpload, ga, designedCsp), 'network activity that could carry file data').toEqual([]);
  if (navigated) expect(log.requests.length, 'the recorder saw the page load').toBeGreaterThan(0);
}

/**
 * Google Analytics 4 (owner 2026-10-08), for the GA-on build (the cloud-* projects): gtag.js is answered by this stub,
 * which sends one bodiless GET collect hit carrying the configured page_location (as gtag.js would), and every Google
 * Analytics host answers 204. No test reaches Google.
 */
export const GTAG_STUB =
  "(function(){var nav=performance.getEntriesByType('navigation')[0];window.__gtagStub={afterLoad:!!nav&&nav.loadEventEnd>0};" +
  "var dl=window.dataLayer||[];for(var i=0;i<dl.length;i++){var a=dl[i];if(a&&a[0]==='config'){" +
  "fetch('https://region1.google-analytics.com/g/collect?v=2&en=page_view&tid='+encodeURIComponent(a[1])+'&dl='+encodeURIComponent(a[2].page_location),{mode:'no-cors'}).catch(function(){});}}})();";

/**
 * INTERNAL-TRAFFIC: the requests blockAnalytics aborted never left the browser, so the guard does not count them.
 * Only used with the noAnalytics option, where every such request is routed to abort before the page loads.
 */
export function withoutBlockedAnalytics(log: NetworkLog): NetworkLog {
  return { ...log, requests: log.requests.filter((r) => !isAnalyticsUrl(r.url())) };
}

export const test = base.extend<{ network: NetworkLog; allowUpload: AllowedUpload[]; ga: boolean; noAnalytics: boolean; liveCsp: boolean }>({
  // Empty for every spec: only the 배경 지우기 cloud spec sets it (test.use), for its one endpoint.
  allowUpload: [[], { option: true }],
  // False for every project but cloud-* (their build has PUBLIC_GA_ID): only then Google Analytics may load (stubbed).
  ga: [false, { option: true }],
  // True only in playwright.live.config.ts (INTERNAL-TRAFFIC): our runs on the deployed site send no analytics.
  noAnalytics: [false, { option: true }],
  // True only in playwright.live.config.ts: the deployed site's CSP may name the analytics and GA hosts it is built with.
  liveCsp: [false, { option: true }],
  network: [
    async ({ context, page, baseURL, allowUpload, ga, noAnalytics, liveCsp }, use) => {
      if (noAnalytics) await blockAnalytics(context);
      if (ga) {
        await context.route(/^https:\/\/www\.googletagmanager\.com\/gtag\/js\?/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: GTAG_STUB }));
        await context.route(/^https:\/\/[^/]+\.(google-analytics\.com|analytics\.google\.com)\//, (r) => r.fulfill({ status: 204 }));
      }
      const log = recordNetwork(context, page);
      await use(log);
      expectNoUpload(noAnalytics ? withoutBlockedAnalytics(log) : log, baseURL!, page.url() !== 'about:blank', allowUpload, ga, liveCsp);
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
