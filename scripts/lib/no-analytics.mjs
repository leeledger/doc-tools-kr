// INTERNAL-TRAFFIC (owner 2026-10-10): our own browsers on the live site must not count as visitors. Every automated
// browser session that can reach the deployed site (the A-1 live smoke, qa:visual --url https://docttak.com) calls
// blockAnalytics(context) before its first page: Cloudflare Web Analytics (beacon script and /cdn-cgi/rum), Google
// Analytics (gtag.js and the collect hosts) and our own /api/usage are aborted in the browser, so nothing reaches
// Cloudflare, Google or the usage dataset. The site is unchanged. docs/OPS-RUNBOOK.md, "자동화 트래픽 제외".
import { USAGE_PATH } from './usage.mjs';

/** Hosts whose every request is analytics (exact host match). */
export const ANALYTICS_HOSTS = ['static.cloudflareinsights.com', 'cloudflareinsights.com', 'www.googletagmanager.com', 'google-analytics.com'];
/** Host suffixes whose every request is analytics (region1.google-analytics.com, *.analytics.google.com). */
export const ANALYTICS_HOST_SUFFIXES = ['.google-analytics.com', '.analytics.google.com'];

/** Whether a browser request to `url` would feed visitor or usage statistics (any origin for /api/usage). */
export function isAnalyticsUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  if (ANALYTICS_HOSTS.includes(host) || ANALYTICS_HOST_SUFFIXES.some((s) => host.endsWith(s))) return true;
  // Belt and braces (Review INTERNAL-TRAFFIC): Cloudflare RUM on our own origin and GA collect on www.google.com.
  if (u.pathname === '/cdn-cgi/rum' && (host === 'docttak.com' || host.endsWith('.docttak.com'))) return true;
  if (host === 'www.google.com' && u.pathname.startsWith('/g/collect')) return true;
  return u.pathname === USAGE_PATH;
}

/**
 * Aborts every analytics request of a Playwright BrowserContext (page and worker requests, sendBeacon included).
 * Call it before the first navigation. Service workers must stay blocked (serviceWorkers: 'block'), or a worker's
 * own fetches would bypass context routes.
 * @param {{ route(url: (u: URL) => boolean, handler: (r: { abort(code?: string): Promise<void> }) => unknown): Promise<unknown> }} context
 */
export async function blockAnalytics(context) {
  await context.route((u) => isAnalyticsUrl(u.href), (r) => r.abort('blockedbyclient'));
}
