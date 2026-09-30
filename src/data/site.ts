import { LIVE_TOOLS, type Tool } from './tools';

export const SITE = {
  name: '문서딱',
  tagline: '용량·규격에 딱 맞추는 문서 도구',
  defaultTitle: '문서딱 — 용량·규격에 딱 맞추는 문서 도구',
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
  return `${liveNames(tools)}. 파일 업로드 없이 내 브라우저 안에서 바로 처리하고, 파일은 서버로 전송되지 않습니다. 회원가입 없이 무료.`;
}

/** The shorter og:description for the home page (same live-only rule). */
export function ogDescription(tools: readonly Tool[] = LIVE_TOOLS): string {
  return `${liveNames(tools)}. 업로드 없이 내 브라우저 안에서 바로 처리합니다. 회원가입 없이 무료.`;
}

/** Ads stay off in this phase. AdSlot renders nothing while this is false. */
export const ADS_ENABLED = false;

/** Search-console verification tokens. Meta tags render only when set. */
export const VERIFICATION = {
  naver: import.meta.env.PUBLIC_NAVER_SITE_VERIFICATION as string | undefined,
  google: import.meta.env.PUBLIC_GOOGLE_SITE_VERIFICATION as string | undefined,
};

export const TITLE_SUFFIX = '업로드 없이 브라우저에서 무료로 | 문서딱';

/** The operator (UX-AUDIT-1 P0-2). */
export const OPERATOR = { name: '사이티드', nameEn: 'Cited' } as const;
export const OPERATOR_LABEL = `${OPERATOR.name}(${OPERATOR.nameEn})`;

const env = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Contact address. An invalid value fails the build (scripts/check-dist.mjs); unset shows "준비 중". */
export const CONTACT_EMAIL = env(import.meta.env.PUBLIC_CONTACT_EMAIL);
export const PRIVACY_OFFICER = env(import.meta.env.PUBLIC_PRIVACY_OFFICER) ?? `${OPERATOR.name} 대표`;
/** Optional; rendered only when set. */
export const BIZ_REG_NO = env(import.meta.env.PUBLIC_BIZ_REG_NO);

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * "문의: <a href="mailto:…">…</a>" when the address is set, otherwise "문의: {pending}" (HTML, escaped).
 * The footer, the privacy page and the terms page all use this one function.
 */
export function contactLine(pending = '준비 중', email: string | undefined = CONTACT_EMAIL): string {
  if (!email) return `문의: ${escapeHtml(pending)}`;
  const e = escapeHtml(email);
  return `문의: <a href="mailto:${e}">${e}</a>`;
}
