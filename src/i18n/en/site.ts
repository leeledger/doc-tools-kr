// English site constants (EN1; brief EN decisions 7, 13; owner D1: the English name is Docttak, on /en/ pages only).
import og from './og.json';

export const SITE_EN = {
  name: 'Docttak',
  tagline: 'Free PDF and photo tools. No sign-up.',
  locale: 'en_US',
  altLocale: 'ko_KR',
} as const;

/** Every English page title ends with this. */
export const TITLE_SUFFIX_EN = ` | ${SITE_EN.name}`;

/**
 * English meta limits (code points; SERP truncates by pixels, about 600 px): title incl. the suffix, meta description,
 * og/twitter description. Same values as scripts/lib/meta-length.mjs EN_LIMITS; a unit test keeps them equal.
 */
export const TITLE_MAX_EN = 60;
export const DESC_MIN_EN = 70;
export const DESC_MAX_EN = 155;
export const OG_DESC_MAX_EN = 155;

export interface SharePreviewEn {
  image: string;
  description: string;
  alt: string;
}

/** The share preview of an English page path (src/i18n/en/og.json; unlisted paths take "*"). */
export function sharePreviewEn(path: string, site: URL | string): SharePreviewEn {
  const pages = og.pages as Record<string, { image: string; description: string }>;
  const entry = pages[path] ?? pages['*']!;
  const img = (og.images as Record<string, { title: string; line: string }>)[entry.image]!;
  return {
    image: new URL(`/brand/og-en-${entry.image}.png`, site).href,
    description: entry.description,
    alt: `${SITE_EN.name}: ${img.title}. ${img.line}`,
  };
}
