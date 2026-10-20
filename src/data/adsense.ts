// Google AdSense, review stage (ADS1020 D2-D4), behind PUBLIC_ADSENSE_ON=1 (scripts/lib/adsense.mjs). Base.astro renders the
// two head tags on the content pages only (isContentPath). An invalid PUBLIC_ADSENSE_CLIENT, or the flag on without the
// contact and privacy officer, fails the build in astro.config.mjs; here it renders nothing. CONTENT_ROUTES and
// isContentPath mirror scripts/lib/adsense.mjs (tests/unit/adsense.test.ts keeps them equal).

export const ADSENSE_CLIENT_DEFAULT = 'ca-pub-6478963235198426';
const CLIENT_RE = /^ca-pub-\d{16}$/;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const override = str(import.meta.env.PUBLIC_ADSENSE_CLIENT);

/** The AdSense client of this build. */
export const ADS_CLIENT = override && CLIENT_RE.test(override) ? override : ADSENSE_CLIENT_DEFAULT;
/** The tag ships on the content pages. */
export const ADS_ON = str(import.meta.env.PUBLIC_ADSENSE_ON) === '1' && (!override || CLIENT_RE.test(override));
export const ADS_CFG_PATH = '/ads-cfg.js';
export const ADSBYGOOGLE_URL = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

/** The pages that may carry the tag, as _headers patterns (a trailing * matches the rest of the path, the prefix included). */
export const CONTENT_ROUTES: readonly string[] = ['/', '/guide/*', '/about/', '/contact/'];

/** Whether the page at `path` (a URL pathname) is a content page. */
export function isContentPath(path: string): boolean {
  return CONTENT_ROUTES.some((r) => (r.endsWith('*') ? path.startsWith(r.slice(0, -1)) : path === r));
}
