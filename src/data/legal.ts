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
/** 이어서 하기 (CHAIN): a handed-over file waits briefly in this browser. In every build (the feature has no flag). */
export const PRIVACY_CHAIN = '2026년 10월 11일';
/** The newest change in this build: 이어서 하기 is in every build and newer than every flagged section. */
export const PRIVACY_REVISED = PRIVACY_CHAIN;
export const TERMS_EFFECTIVE = __BG_CLOUD__ ? PRIVACY_CLOUD : '2026년 9월 30일';
/** The sitemap lastmod of /privacy/, /terms/ and /licenses/ (YYYY-MM-DD; docs/COPY.md release checklist). */
export const LEGAL_UPDATED = '2026-09-30';
/**
 * The sitemap lastmod of /privacy/ and /terms/: the 배경 지우기 wording (C2-cloud), plainer headings (2026-10-05), then
 * the anonymous usage statistics and visitor-count sections (turned on 2026-10-07), then Google Analytics (with PUBLIC_GA_ID),
 * then 이어서 하기 (CHAIN, every build).
 */
export const PRIVACY_TERMS_UPDATED = '2026-10-11';
