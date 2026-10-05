// Visitor counts (owner 2026-10-05): Cloudflare Web Analytics behind PUBLIC_CF_ANALYTICS_TOKEN (scripts/lib/analytics.mjs).
// An invalid value renders nothing here and fails the build in check-dist.

const raw = import.meta.env.PUBLIC_CF_ANALYTICS_TOKEN as string | undefined;
const token = typeof raw === 'string' ? raw.trim() : '';

/** The site token, '' while visitor counts are off. */
export const CF_ANALYTICS_TOKEN = /^[0-9a-f]{32}$/.test(token) ? token : '';
export const ANALYTICS_ON = CF_ANALYTICS_TOKEN !== '';
export const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';
