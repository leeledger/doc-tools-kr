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
/** 인화·사진관 링크 (REV2): the usage statistics also count which link of the id-photo result was pressed. Only in a build with PUBLIC_USAGE_STATS=1. */
export const PRIVACY_OUT_ID_PHOTO = '2026년 10월 12일';
/**
 * 상품·사진관 링크 (REV3 Decision 7): the count covers every result screen's and guide's link block. Only in a build with
 * PUBLIC_USAGE_STATS=1. The REV3 deploy date (re-confirmed at the deploy gate).
 */
export const PRIVACY_OUT = '2026년 10월 13일';
/**
 * 무료 임베드 위젯 (REV5 Decision 5): the usage statistics also say whether the tool was used inside another site's frame
 * (via=embed). Only in a build with PUBLIC_USAGE_STATS=1. The REV5 deploy date (re-confirmed at the deploy gate).
 */
export const PRIVACY_EMBED = '2026년 10월 13일';
/**
 * 링크 표시 (REQ1014-A D18): the usage statistics also count which marked link (blog, app) a visit came from, kept in this
 * tab for at most 3 hours. Only in a build with PUBLIC_USAGE_STATS=1. The REQ1014-A deploy date (re-confirmed at the gate).
 */
export const PRIVACY_UTM = '2026년 10월 14일';
/**
 * 영문주소 변환기 (ADDREN1016 decision 14): the address sent to 행정안전부 주소 검색. Only in a build with PUBLIC_ADDR_EN=1.
 * The day the flag goes on in production (re-confirmed at the O4 gate).
 */
export const PRIVACY_ADDR = '2026년 10월 16일';
/** The newest change in this build: 영문주소 변환기 when on, else the link-marker count (REQ1014-A) in a usage-stats build, else 이어서 하기 (every build, newer than every other flagged section). */
export const PRIVACY_REVISED = __ADDR_EN__ ? PRIVACY_ADDR : __USAGE_STATS__ ? PRIVACY_UTM : PRIVACY_CHAIN;
/**
 * 이용약관 11항 「다른 누리집에 넣어 쓰기」 (REV5 Decision 7; wording awaits the owner). Terms 9항: a change is posted 7 days
 * before it takes effect, so this is the REV5 deploy date plus 7 days (re-confirmed at the deploy gate). Every build.
 * 11항 carries this date itself and the terms change history lists it; the page-top 시행일 stays TERMS_EFFECTIVE (Review
 * REV5 round 2: the rest of the terms is already in force).
 */
export const TERMS_EMBED = '2026년 10월 20일';
export const TERMS_EFFECTIVE = __BG_CLOUD__ ? PRIVACY_CLOUD : '2026년 9월 30일';
/** The sitemap lastmod of /privacy/, /terms/ and /licenses/ (YYYY-MM-DD; docs/COPY.md release checklist). */
export const LEGAL_UPDATED = '2026-09-30';
/**
 * The sitemap lastmod of /privacy/ and /terms/: the 배경 지우기 wording (C2-cloud), plainer headings (2026-10-05), then
 * the anonymous usage statistics and visitor-count sections (turned on 2026-10-07), then Google Analytics (with PUBLIC_GA_ID),
 * then 이어서 하기 (CHAIN, every build), then the 인화·사진관 링크 count (REV2, with PUBLIC_USAGE_STATS), then every link
 * block counted (REV3, with PUBLIC_USAGE_STATS; PRIVACY_OUT), then the link-marker count (REQ1014-A, PRIVACY_UTM), then
 * 영문주소 변환기 (ADDREN1016, with PUBLIC_ADDR_EN; PRIVACY_ADDR).
 */
export const PRIVACY_TERMS_UPDATED = __ADDR_EN__ ? '2026-10-16' : '2026-10-14';
