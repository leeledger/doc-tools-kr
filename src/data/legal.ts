import { ANALYTICS_ON } from './analytics';
import { GA_ON } from './ga';

// Dates on the legal pages (Arch, Polish P round 2: 2026-09-30).
/** The second version (Polish Q). */
export const PRIVACY_V1 = '2026년 9월 30일';
/** C2-cloud (brief §7.1): the 배경 지우기 section and the 개인정보 보호책임자. Only in a build with the cloud path on. */
export const PRIVACY_CLOUD = '2026년 10월 2일';
/** Visitor counts (owner 2026-10-05; turned on 2026-10-07): Cloudflare Web Analytics. Only in a build with PUBLIC_CF_ANALYTICS_TOKEN. */
export const PRIVACY_ANALYTICS = '2026년 10월 7일';
/** Anonymous usage statistics (brief USAGE; turned on 2026-10-07, KST). Only in a build with PUBLIC_USAGE_STATS=1. */
export const PRIVACY_USAGE = '2026년 10월 7일';
/** Google Analytics 4 (owner 2026-10-08): the day it goes live (re-confirmed at the deploy gate). Only in a build with PUBLIC_GA_ID. */
export const PRIVACY_GA = '2026년 10월 8일';
export const PRIVACY_REVISED = GA_ON ? PRIVACY_GA : __USAGE_STATS__ ? PRIVACY_USAGE : ANALYTICS_ON ? PRIVACY_ANALYTICS : __BG_CLOUD__ ? PRIVACY_CLOUD : PRIVACY_V1;
export const TERMS_EFFECTIVE = __BG_CLOUD__ ? PRIVACY_CLOUD : '2026년 9월 30일';
/** The sitemap lastmod of /privacy/, /terms/ and /licenses/ (YYYY-MM-DD; docs/COPY.md release checklist). */
export const LEGAL_UPDATED = '2026-09-30';
/**
 * The sitemap lastmod of /privacy/ and /terms/: the 배경 지우기 wording (C2-cloud), plainer headings (2026-10-05), then
 * the anonymous usage statistics and visitor-count sections (turned on 2026-10-07), then Google Analytics (with PUBLIC_GA_ID).
 */
export const PRIVACY_TERMS_UPDATED = GA_ON ? '2026-10-08' : '2026-10-07';
