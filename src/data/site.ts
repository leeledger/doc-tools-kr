import { LIVE_TOOLS, type Tool } from './tools';
import og from './og.json';

export const SITE = {
  name: '문서딱',
  /** Owner tagline (Polish Q): plain words, no jargon. */
  tagline: '내야 하는 문서·사진, 용량과 규격에 딱 맞춰 드려요',
  defaultTitle: '문서딱 — 내야 하는 문서·사진, 용량과 규격에 딱 맞춰 드려요',
  themeColor: '#0f766e',
  locale: 'ko_KR',
} as const;

/** Live tool names joined with "·". Tool names are written only in tools.ts (docs/COPY.md release checklist). */
export const liveNames = (tools: readonly Tool[] = LIVE_TOOLS): string => tools.map((t) => t.name).join('·');

/**
 * Meta description of the home page and the default for other pages: derived from the live tools only, so
 * nothing promises a tool that is not live (UX-AUDIT-1 P0-4). No particle follows the variable part.
 */
export function defaultDescription(tools: readonly Tool[] = LIVE_TOOLS): string {
  // Sprint C (C1): with seven tools the names alone are 85 characters, so the tagline sentence left the template
  // (it is the page title's); the text stays within 80–120.
  // Sprint C (C2): with the eighth tool the names are 100 characters, so the shorter sentence keeps it at 120.
  // Owner 2026-10-05: the description says what the site does, not where the file goes (no privacy claim, so
  // the 배경 지우기 cloud path needs no exception here).
  const names = liveNames(tools);
  const long = `${names}. 내야 하는 문서·사진을 규격에 맞춰요. 가입 없이 무료.`;
  return [...long].length <= 120 ? long : `${names}. 가입 없이 무료.`;
}

/** Ads stay off in this phase. AdSlot renders nothing while this is false. */
export const ADS_ENABLED = false;

/** Search-console verification tokens. Meta tags render only when set. */
export const VERIFICATION = {
  naver: import.meta.env.PUBLIC_NAVER_SITE_VERIFICATION as string | undefined,
  google: import.meta.env.PUBLIC_GOOGLE_SITE_VERIFICATION as string | undefined,
};

/** Every tool title ends with this (tools.ts writes it out; a unit test checks they match). */
export const TITLE_SUFFIX = '가입 없이 무료로 | 문서딱';

const env = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/**
 * Contact address. Owner decision (Polish Q): no contact, operator or privacy-officer details are published
 * while the site takes no personal data. When set (before ads or the error beacon: check-dist enforces it),
 * the footer shows it; an invalid value fails the build (scripts/check-dist.mjs).
 */
export const CONTACT_EMAIL = env(import.meta.env.PUBLIC_CONTACT_EMAIL);
/**
 * 개인정보 보호책임자 (C2-cloud, brief §7.1). Published only on /privacy/ and only with the 배경 지우기 cloud path on;
 * the build fails without it then (scripts/lib/bgcloud.mjs privacyGate).
 */
export const PRIVACY_OFFICER = env(import.meta.env.PUBLIC_PRIVACY_OFFICER);
/** Optional; rendered only when set. */
export const BIZ_REG_NO = env(import.meta.env.PUBLIC_BIZ_REG_NO);

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** "문의: <a href="mailto:…">…</a>" (HTML, escaped), or null when no address is set. */
export function contactLine(email: string | undefined = CONTACT_EMAIL): string | null {
  if (!email) return null;
  const e = escapeHtml(email);
  return `문의: <a href="mailto:${e}">${e}</a>`;
}

/** The footer's contact line (HTML): only what is set; empty while nothing is (owner decision, Polish Q). */
export function footerContact(email: string | undefined = CONTACT_EMAIL, bizRegNo: string | undefined = BIZ_REG_NO): string {
  return [contactLine(email), bizRegNo && `사업자등록번호 ${escapeHtml(bizRegNo)}`].filter(Boolean).join(' · ');
}

export interface SharePreview {
  /** Absolute URL of /brand/og-<image>.png. */
  image: string;
  /** og:description and twitter:description (plain words, at most 80 characters). */
  description: string;
  /** og:image:alt and twitter:image:alt: the words drawn on the image. */
  alt: string;
}

/** The share preview of a page path (src/data/og.json; unlisted paths take "*"). */
export function sharePreview(path: string, site: URL | string): SharePreview {
  const pages = og.pages as Record<string, { image: string; description: string }>;
  const entry = pages[path] ?? pages['*']!;
  const img = (og.images as Record<string, { title: string; line: string }>)[entry.image]!;
  return {
    image: new URL(`/brand/og-${entry.image}.png`, site).href,
    description: entry.description.replace('{tools}', liveNames()),
    alt: `${SITE.name}: ${img.title}. ${img.line}`,
  };
}
