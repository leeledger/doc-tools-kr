// Google AdSense, review stage (ADS1020, brief handoff/ARCHITECT-BRIEF-ADS1020.md D2-D5): PUBLIC_ADSENSE_ON=1 puts Google's
// async adsbygoogle.js tag, after the same-origin /ads-cfg.js (ad requests paused, non-personalized only), in the <head>
// of the content pages only, each served with its own scheme-source CSP. No ad unit exists yet (serve stage = a later
// sprint). The client ID is public (public/ads.txt); PUBLIC_ADSENSE_CLIENT may override it. With it on, the build fails
// without PUBLIC_CONTACT_EMAIL and PUBLIC_PRIVACY_OFFICER (astro.config.mjs and check-dist).
// src/data/adsense.ts mirrors CONTENT_ROUTES and isContentPath; tests/unit/adsense.test.ts keeps them equal.

/** The docttak AdSense publisher (the pub of public/ads.txt). */
export const ADSENSE_CLIENT_DEFAULT = 'ca-pub-6478963235198426';
export const CLIENT_RE = /^ca-pub-\d{16}$/;
export const ADS_CFG_PATH = '/ads-cfg.js';
export const ADSBYGOOGLE_URL = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

/**
 * The text of /ads-cfg.js (postbuild gen-ads-cfg). Google AdSense Help, "Ad code examples for ads personalization
 * settings" (https://support.google.com/adsense/answer/9042142, fetched 2026-10-20): pauseAdRequests=1 "will pause ad
 * requests" ("Without making this call [pauseAdRequests=0], no ads will be shown"); requestNonPersonalizedAds=1 "makes
 * sure you are requesting non-personalized ads" (owner 2026-10-12: non-personalized only).
 */
export const ADS_CFG_SOURCE = '(window.adsbygoogle=window.adsbygoogle||[]).pauseAdRequests=1;window.adsbygoogle.requestNonPersonalizedAds=1;';

/**
 * The pages that may carry the tag, as _headers patterns (a trailing * matches the rest of the path, the prefix itself
 * included). Never: tool and result pages, 404s, /offline/, /privacy/, /terms/, /licenses/, /en/*, /embed/*.
 */
export const CONTENT_ROUTES = ['/', '/guide/*', '/about/', '/contact/'];

/** Whether the page at `path` (a URL pathname) is a content page. */
export function isContentPath(path) {
  return CONTENT_ROUTES.some((r) => (r.endsWith('*') ? path.startsWith(r.slice(0, -1)) : path === r));
}

/** The URL pathname of a dist HTML file (`guide/x/index.html` -> `/guide/x/`, `404.html` -> `/404.html`). */
export const distPathname = (file) => `/${file.replace(/(^|\/)index\.html$/, '$1')}`;

/**
 * The CSP of the content pages (D5): scheme sources, so Google's ad hosts (pagead2/tpc.googlesyndication.com,
 * googleads.g.doubleclick.net and the others), GA and the Web Analytics beacon are covered without a host list.
 */
export const CONTENT_CSP =
  "default-src 'self'; script-src 'self' https: 'unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https:; img-src 'self' data: blob: https:; frame-src https:; fenced-frame-src https:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * `{ on, client }` for the PUBLIC_* values `env`. Throws on a PUBLIC_ADSENSE_CLIENT that is not `ca-pub-` and 16 digits
 * (the value is not echoed).
 */
export function adsenseConfig(env) {
  const on = typeof env.PUBLIC_ADSENSE_ON === 'string' && env.PUBLIC_ADSENSE_ON.trim() === '1';
  const override = typeof env.PUBLIC_ADSENSE_CLIENT === 'string' ? env.PUBLIC_ADSENSE_CLIENT.trim() : '';
  if (override && !CLIENT_RE.test(override)) throw new Error('PUBLIC_ADSENSE_CLIENT is not an AdSense client ID (ca-pub- and 16 digits)');
  return { on, client: override || ADSENSE_CLIENT_DEFAULT };
}

/** Problems of the operator gate (empty = fine, or AdSense is off; an invalid client is one too). */
export function adsenseGate(env) {
  let on;
  try {
    on = adsenseConfig(env).on;
  } catch (e) {
    return [e.message];
  }
  if (!on) return [];
  const errors = [];
  const email = env.PUBLIC_CONTACT_EMAIL?.trim();
  if (!email || !EMAIL_RE.test(email)) errors.push('PUBLIC_ADSENSE_ON is on but PUBLIC_CONTACT_EMAIL is not a valid address (the privacy policy must name a contact)');
  if (!env.PUBLIC_PRIVACY_OFFICER?.trim()) errors.push('PUBLIC_ADSENSE_ON is on but PUBLIC_PRIVACY_OFFICER is not set (the privacy policy must name the 개인정보 보호책임자)');
  return errors;
}

/** The two head tags of a content page, in order (Base.astro renders the same markup). */
export const cfgTag = () => `<script src="${ADS_CFG_PATH}" data-site-ads-cfg></script>`;
export const adsTag = (client) => `<script async src="${ADSBYGOOGLE_URL}?client=${client}" crossorigin="anonymous"></script>`;

/**
 * `headers` (dist/_headers after the GA and Web Analytics extensions) with one block per content route that detaches
 * the site-wide policy and sets CONTENT_CSP, plus the /ads-cfg.js cache rule. The `/*` block stays byte for byte.
 * Throws when there is no site-wide policy (the content blocks would detach nothing and the rest would be unguarded).
 */
export function withContentCsp(headers) {
  const lines = headers.split('\n');
  const start = lines.findIndex((l) => l.trimEnd() === '/*');
  let end = start + 1;
  while (start >= 0 && end < lines.length && (lines[end].trim() === '' || /^\s/.test(lines[end]))) end++;
  const csp = start < 0 ? [] : lines.slice(start + 1, end).filter((l) => /^\s+Content-Security-Policy:/.test(l));
  if (csp.length !== 1) throw new Error('gen-headers: no site-wide Content-Security-Policy in the /* block to detach on the content pages');
  const blocks = CONTENT_ROUTES.map((r) => `${r}\n  ! Content-Security-Policy\n  Content-Security-Policy: ${CONTENT_CSP}\n`).join('');
  return `${headers}${headers.endsWith('\n') ? '' : '\n'}${blocks}${ADS_CFG_PATH}\n  Cache-Control: public, max-age=3600\n`;
}

// check-dist rules (brief Build Order G). Pure: tests/unit/adsense.test.ts feeds fixtures.
const AD_STRINGS = ['adsbygoogle', 'googlesyndication', ADS_CFG_PATH];
const count = (s, needle) => s.split(needle).length - 1;

/**
 * The HTML pages `pages` (Map of dist path -> HTML). On: every content page has exactly one adsbygoogle tag with
 * `client` and crossorigin="anonymous", after exactly one /ads-cfg.js tag, both in <head>; every other page names none of
 * adsbygoogle, googlesyndication or /ads-cfg.js. Off: no page names them. The home page and /guide/ must exist when on.
 */
export function adsPageProblems(pages, { on, client }) {
  const problems = [];
  for (const [p, html] of pages) {
    const content = on && isContentPath(distPathname(p));
    if (!content) {
      for (const s of AD_STRINGS) if (html.includes(s)) problems.push(`${p}: names ${s} ${on ? 'but is not a content page' : 'although PUBLIC_ADSENSE_ON is off'}`);
      continue;
    }
    const head = html.slice(0, Math.max(0, html.indexOf('</head>')));
    const tag = adsTag(client);
    const cfg = cfgTag();
    if (count(html, 'adsbygoogle.js') !== 1 || count(head, tag) !== 1) problems.push(`${p}: expected exactly one ${tag} in <head>`);
    if (count(html, ADS_CFG_PATH) !== 1 || count(head, cfg) !== 1) problems.push(`${p}: expected exactly one ${cfg} in <head>`);
    else if (head.indexOf(cfg) > head.indexOf(tag)) problems.push(`${p}: ${ADS_CFG_PATH} comes after the adsbygoogle tag`);
  }
  if (on) for (const p of ['index.html', 'guide/index.html']) if (!pages.has(p)) problems.push(`${p}: missing (a content page)`);
  return problems;
}

/** Off: no dist text file (`texts`: [path, text]) names adsbygoogle, googlesyndication or /ads-cfg.js. */
export function adsOffTextProblems(texts) {
  const problems = [];
  for (const [p, text] of texts) for (const s of AD_STRINGS) if (text.includes(s)) problems.push(`${p}: names ${s} although PUBLIC_ADSENSE_ON is off`);
  return problems;
}

/**
 * The final _headers text (gen-headers siteHeaders). On: each content route is one block that detaches the site-wide
 * policy and then sets CONTENT_CSP, exactly once; the `/*` policy still has no https: scheme source; /ads-cfg.js has its
 * cache rule. Off: no fenced-frame-src anywhere (the content policy is not there).
 */
export function adsHeaderProblems(headers, on) {
  const problems = [];
  const lines = headers.split('\n');
  const blockOf = (pattern) => {
    const out = [];
    lines.forEach((l, i) => {
      if (l.trimEnd() !== pattern) return;
      const body = [];
      for (let j = i + 1; j < lines.length && /^\s/.test(lines[j]); j++) body.push(lines[j].trim());
      out.push(body);
    });
    return out;
  };
  const site = blockOf('/*')[0]?.find((l) => l.startsWith('Content-Security-Policy:')) ?? '';
  if (!site) problems.push('_headers: no site-wide Content-Security-Policy in the /* block');
  if (/\shttps:(\s|;|$)/.test(site)) problems.push('_headers: the site-wide policy has an https: scheme source');
  if (!on) {
    if (headers.includes('fenced-frame-src')) problems.push('_headers: fenced-frame-src (the content policy) although PUBLIC_ADSENSE_ON is off');
    return problems;
  }
  for (const r of CONTENT_ROUTES) {
    const blocks = blockOf(r);
    const want = ['! Content-Security-Policy', `Content-Security-Policy: ${CONTENT_CSP}`];
    if (blocks.length !== 1 || JSON.stringify(blocks[0]) !== JSON.stringify(want)) problems.push(`_headers: ${r} is not exactly one block that detaches the site-wide policy and sets the content policy`);
  }
  if (count(headers, CONTENT_CSP) !== CONTENT_ROUTES.length) problems.push(`_headers: the content policy appears ${count(headers, CONTENT_CSP)} times (expected ${CONTENT_ROUTES.length})`);
  const cfg = blockOf(ADS_CFG_PATH);
  if (cfg.length !== 1 || !cfg[0].includes('Cache-Control: public, max-age=3600')) problems.push(`_headers: no ${ADS_CFG_PATH} block with Cache-Control: public, max-age=3600`);
  return problems;
}
