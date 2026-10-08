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
 * Order in which the home description names tools once they no longer all fit (E-T2-a, decided for TOOLS4 T3; the
 * market report's order). Slugs that are not live are skipped; a live tool missing here would go last.
 */
export const HOME_DESC_ORDER: readonly string[] = [
  'id-photo',
  'pdf-merge',
  'photo-compress',
  'pdf-compress',
  'jpg-to-pdf',
  'pdf-to-jpg',
  'image-to-jpg',
  'hwp-to-pdf',
  'hwp-viewer',
  'pdf-password',
  'pdf-split',
  'stamp-signature',
  'remove-background',
];

/** Meta length limits (SEO-LENGTH). Same values as scripts/lib/meta-length.mjs; a unit test keeps them equal. */
export const TITLE_MAX = 40;
export const DESC_MIN = 40;
export const DESC_MAX = 80;
const fits = (s: string): boolean => [...s].length <= DESC_MAX;

/**
 * Meta description of the home page and the default for other pages: derived from the live tools only, so
 * nothing promises a tool that is not live (UX-AUDIT-1 P0-4). No particle follows the variable part.
 */
export function defaultDescription(tools: readonly Tool[] = LIVE_TOOLS): string {
  // Sprint C (C1/C2): the tagline sentence left the template once the names grew; the shorter form names every tool.
  // Owner 2026-10-05: the description says what the site does, not where the file goes (no privacy claim, so
  // the 배경 지우기 cloud path needs no exception here).
  const names = liveNames(tools);
  const long = `${names}. 내야 하는 문서·사진을 규격에 맞춰요. 가입 없이 무료.`;
  if (fits(long)) return long;
  const short = `${names}. 가입 없이 무료.`;
  if (fits(short)) return short;
  // E-T2-a (TOOLS4 T3): too many names for DESC_MAX characters. Name as many as fit in HOME_DESC_ORDER, then the count.
  const rank = (t: Tool): number => {
    const i = HOME_DESC_ORDER.indexOf(t.slug);
    return i < 0 ? HOME_DESC_ORDER.length : i;
  };
  const ordered = tools.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i).map((x) => x.t.name);
  const tail = ` 등 ${tools.length}가지 도구. 가입 없이 무료.`;
  let k = ordered.length - 1;
  while (k > 1 && !fits(`${ordered.slice(0, k).join('·')}${tail}`)) k--;
  return `${ordered.slice(0, k).join('·')}${tail}`;
}

/** Ads stay off in this phase. AdSlot renders nothing while this is false. */
export const ADS_ENABLED = false;

/** Search-console verification tokens. Meta tags render only when set. */
export const VERIFICATION = {
  naver: import.meta.env.PUBLIC_NAVER_SITE_VERIFICATION as string | undefined,
  google: import.meta.env.PUBLIC_GOOGLE_SITE_VERIFICATION as string | undefined,
};

/** Every page title ends with this (tools.ts writes it out; a unit test checks they match). */
export const TITLE_SUFFIX = ` | ${SITE.name}`;

const env = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/**
 * Contact address. Owner decision (Polish Q): no contact, operator or privacy-officer details are published
 * while the site takes no personal data. When set (before ads or usage statistics: check-dist enforces it),
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
