// Parsers for the ops jobs: sitemap entries, the build id, page head checks and links (A-4), and the text
// normalization that the source watch (A-3) uses to find a quote in an official page.

/** Every <url> of a sitemap as { loc, lastmod } (lastmod '' when absent). */
export function sitemapEntries(xml) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
    loc: (/<loc>([^<]+)<\/loc>/.exec(m[1])?.[1] ?? '').trim(),
    lastmod: (/<lastmod>([^<]+)<\/lastmod>/.exec(m[1])?.[1] ?? '').trim(),
  })).filter((e) => e.loc);
}

/** URLs that are new or whose lastmod changed since `previous` (both sitemap XML strings; previous may be null). */
export function changedUrls(previousXml, currentXml) {
  const cur = sitemapEntries(currentXml);
  if (!previousXml) return cur.map((e) => e.loc);
  const before = new Map(sitemapEntries(previousXml).map((e) => [e.loc, e.lastmod]));
  return cur.filter((e) => before.get(e.loc) !== e.lastmod).map((e) => e.loc);
}

export const buildIdOf = (html) => /<meta\s+name="build-id"\s+content="([^"]*)"/.exec(html)?.[1] ?? null;

/** The live build id matches the commit: the page carries the first 12 characters of the SHA (src/data/build.ts). */
export const buildMatches = (liveId, sha) => Boolean(liveId && sha && liveId.length >= 7 && sha.toLowerCase().startsWith(liveId.toLowerCase()));

const attr = (tag, name) => new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(1).find((v) => v !== undefined) ?? null;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', times: '×', bull: '•', sim: '∼', tilde: '˜' };
export const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });

/**
 * Head checks of one page (A-4): canonical (absolute, equal to the page URL), og:title/og:description/og:image/
 * og:url, at least one JSON-LD block that parses, no off-site <script src> and no Cloudflare-injected script
 * (/cdn-cgi/, cloudflareinsights, rocket-loader). The legal pages carry no JSON-LD by design. Returns a list of
 * problems (empty when healthy).
 */
export const NO_JSONLD_PATHS = ['/privacy/', '/terms/', '/licenses/'];
export function pageProblems(html, pageUrl) {
  const problems = [];
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const canonical = links.find((t) => /\brel\s*=\s*["']?canonical/i.test(t));
  const canonHref = canonical ? attr(canonical, 'href') : null;
  if (!canonHref) problems.push('canonical 없음');
  else if (canonHref !== pageUrl) problems.push(`canonical이 다른 주소: ${canonHref}`);
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  for (const p of ['og:title', 'og:description', 'og:image', 'og:url']) {
    const tag = metas.find((t) => attr(t, 'property') === p);
    if (!tag || !attr(tag, 'content')) problems.push(`${p} 없음`);
  }
  const ld = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if (!ld.length && !NO_JSONLD_PATHS.includes(new URL(pageUrl).pathname)) problems.push('JSON-LD 없음');
  for (const m of ld) {
    try {
      JSON.parse(m[1]);
    } catch {
      problems.push('JSON-LD가 JSON이 아님');
    }
  }
  for (const s of offSiteScripts(html, pageUrl)) problems.push(`외부·삽입 스크립트: ${s}`);
  return problems;
}

const INJECTED = /\/cdn-cgi\/|cloudflareinsights|rocket-loader|email-decode/i;

/** <script src> that is off-site or injected by Cloudflare (absolute URLs). */
export function offSiteScripts(html, pageUrl) {
  const origin = new URL(pageUrl).origin;
  const out = [];
  for (const m of html.matchAll(/<script\b[^>]*>/gi)) {
    const src = attr(m[0], 'src');
    if (!src) continue;
    let u;
    try {
      u = new URL(decodeEntities(src), pageUrl);
    } catch {
      out.push(src);
      continue;
    }
    if (u.origin !== origin || INJECTED.test(u.pathname)) out.push(u.href);
  }
  if (/cloudflareinsights|__cfBeacon|data-cf-beacon/i.test(html) && !out.some((s) => /cloudflareinsights/.test(s))) out.push('Cloudflare Web Analytics 비컨 (인라인)');
  return out;
}

/** Same-origin <a href> targets of a page, absolute, without the fragment, deduplicated. */
export function internalLinks(html, pageUrl) {
  const origin = new URL(pageUrl).origin;
  const out = new Set();
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], 'href');
    if (!href || /^(mailto|tel|javascript|data|blob):/i.test(href) || href.startsWith('#')) continue;
    let u;
    try {
      u = new URL(decodeEntities(href), pageUrl);
    } catch {
      continue;
    }
    if (u.origin !== origin) continue;
    u.hash = '';
    out.add(u.href);
  }
  return [...out];
}

/** Visible text of a page: scripts, styles and tags removed, entities decoded, whitespace collapsed. */
export function pageText(html) {
  const noCode = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(noCode).replace(/\s+/g, ' ').trim();
}

const FOLD = [
  [/[·ㆍ・‧•∙]/g, '·'],
  [/[∼〜～]/g, '~'],
  [/[‐‑‒–—―]/g, '-'],
  [/[‘’′]/g, "'"],
  [/[“”″]/g, '"'],
  [/[×✕]/g, 'x'],
];

const fold = (s) => FOLD.reduce((t, [re, to]) => t.replace(re, to), s);

/**
 * The comparison form of a character run: folded punctuation, NFKC, lower case, no whitespace. Folding comes
 * first because NFKC turns the compatibility jamo ㆍ (a common middle dot on Korean sites) into a conjoining one.
 */
export function normChars(s) {
  return fold(fold(s).normalize('NFKC')).toLowerCase().replace(/\s+/g, '');
}

/** Normalized text plus, for each normalized character, its index in the source text (for context). */
export function normalizeWithMap(text) {
  let out = '';
  const map = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    const n = normChars(ch);
    for (let k = 0; k < n.length; k++) map.push(i);
    out += n;
    i += ch.length;
  }
  return { norm: out, map };
}

/**
 * The parts of a quote that must appear verbatim: a quote may elide with "…" (or "...") and a preset quote
 * joins sentences from two official pages with " / ". Fragments shorter than 4 characters are ignored.
 */
export const quoteFragments = (quote) =>
  quote
    .split(/\s*(?:…|\.\.\.|\s\/\s)\s*/)
    .map((s) => s.trim())
    .filter((s) => normChars(s).length >= 4);

/**
 * Where the quote fragment stands in the page. found: the whole fragment is there. Otherwise `context` is the
 * page text around the longest leading or trailing part of the fragment that is still there (≥ 6 characters),
 * or null.
 */
export function findQuote(fragment, text) {
  const f = normChars(fragment);
  const { norm, map } = normalizeWithMap(text);
  if (norm.includes(f)) return { found: true, context: null };
  const around = (normIndex) => {
    const at = map[normIndex] ?? 0;
    return text.slice(Math.max(0, at - 80), at + Math.max(fragment.length, 60) + 80).trim();
  };
  let best = null;
  for (const side of ['head', 'tail']) {
    let lo = 6;
    let hi = f.length - 1;
    let hit = -1;
    let len = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const part = side === 'head' ? f.slice(0, mid) : f.slice(f.length - mid);
      const idx = norm.indexOf(part);
      if (idx >= 0) {
        hit = idx;
        len = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (hit >= 0 && (!best || len > best.len)) best = { len, idx: side === 'head' ? hit : Math.max(0, hit - (f.length - len)) };
  }
  return { found: false, context: best ? around(best.idx) : null };
}
