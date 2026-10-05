// Dates on the legal pages (Arch, Polish P round 2: 2026-09-30).
/** The second version (Polish Q). */
export const PRIVACY_V1 = '2026년 9월 30일';
/** C2-cloud (brief §7.1): the 배경 지우기 section and the 개인정보 보호책임자. Only in a build with the cloud path on. */
export const PRIVACY_CLOUD = '2026년 10월 2일';
export const PRIVACY_REVISED = __BG_CLOUD__ ? PRIVACY_CLOUD : PRIVACY_V1;
export const TERMS_EFFECTIVE = __BG_CLOUD__ ? PRIVACY_CLOUD : '2026년 9월 30일';
/** The sitemap lastmod of /privacy/, /terms/ and /licenses/ (YYYY-MM-DD; docs/COPY.md release checklist). */
export const LEGAL_UPDATED = '2026-09-30';
/** The sitemap lastmod of /privacy/ and /terms/: the 배경 지우기 wording (C2-cloud), then plainer headings (2026-10-05). */
export const PRIVACY_TERMS_UPDATED = '2026-10-05';
