// EN1 (brief EN decision 12, build order 5): the check-dist rules for the English pages (dist/en/...). Pure functions;
// tests/unit/en-check.test.ts feeds them fixtures, scripts/check-dist.mjs feeds them the build.
import { GA_LOADER } from './ga.mjs';
import { cutElements } from './guide-length.mjs';
import { headMeta } from './meta-length.mjs';

/** An English page (dist-relative path). */
export const EN_PAGE_RE = /^en\//;
/** The marks every tool catalog carries (src/tools/<tool>/messages.ko.ts, src/i18n/en/tools/<tool>.ts). */
export const CATALOG_MARK = { ko: 'catalog-mark:ko', en: 'catalog-mark:en' };
/** The English tool pages, each the twin of the Korean page at the same path without en/. */
export const EN_TOOL_PAGES = ['en/pdf-merge/index.html', 'en/pdf-compress/index.html', 'en/image-to-jpg/index.html'];
/**
 * id parity (rule d): the ids only the Korean twin has. The next-step group (EN2), the quick links ("자주 쓰는 규격",
 * Korean submission targets) and the result's photo-compress line are Korean only.
 */
export const KO_ONLY_IDS = {
  'en/pdf-merge/index.html': ['merge-next', 'quick-title'],
  'en/pdf-compress/index.html': ['cmp-next', 'quick-title'],
  'en/image-to-jpg/index.html': ['ij-next', 'quick-title'],
};

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const twinOf = (enPath) => enPath.replace(EN_PAGE_RE, '');
const head = (html) => /<head[\s>][\s\S]*?<\/head>/i.exec(html)?.[0] ?? '';

/**
 * Rule (a): `lang="en"`, no font preload, no Google Analytics tag, no Coupang link, no sponsored link, no link block, no
 * ad slot; og:locale en_US.
 */
export function enHeadProblems(path, html) {
  const out = [];
  if (!/<html\b[^>]*\blang="en"/.test(html)) out.push(`${path}: <html> is not lang="en"`);
  const preloads = html.match(/<link rel="preload"[^>]*as="font"[^>]*>/g) ?? [];
  if (preloads.length) out.push(`${path}: ${preloads.length} font preload(s), expected 0 (English pages use the system font)`);
  if (html.includes(`src="${GA_LOADER}"`) || html.includes('googletagmanager') || html.includes('gtag(')) out.push(`${path}: a Google Analytics tag or gtag( call (English pages have none)`);
  for (const [re, what] of [
    [/link\.coupang\.com/, 'a Coupang link'],
    [/\brel="[^"]*\bsponsored\b/i, 'a sponsored link'],
    [/\bclass="[^"]*\bout-links\b/, 'a link block (.out-links)'],
    [/\bad-slot\b/, 'an ad slot'],
  ])
    if (re.test(html)) out.push(`${path}: ${what}`);
  if (!head(html).includes('<meta property="og:locale" content="en_US">')) out.push(`${path}: og:locale is not en_US`);
  return out;
}

/** The page's text a reader meets: head title, descriptions and share-image alt texts, JSON-LD, body text and the alt/aria-label/title/placeholder values. */
export function readableText(html) {
  const m = headMeta(html);
  const metaContent = (key) => new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(head(html))?.[1];
  // JSON-LD is shown by search engines (FAQ, names); the share image alt texts by social previews.
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((x) => x[1]);
  let body = /<body\b[\s\S]*<\/body>/i.exec(html)?.[0] ?? '';
  body = body.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ');
  // An element marked lang="ko" (the 한국어 switch, a Korean name) may hold Korean; its content is left out.
  body = body.replace(/<([a-z][a-z0-9]*)\b[^>]*\blang="ko"[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const attrs = [...body.matchAll(/\s(?:alt|aria-label|title|placeholder)="([^"]*)"/gi)].map((x) => x[1]);
  return [m.title, m.description, m.ogDescription, m.twDescription, metaContent('og:image:alt'), metaContent('twitter:image:alt'), ...ld, body.replace(/<[^>]+>/g, ' '), ...attrs].filter(Boolean).join(' ');
}

/** Rule (b): no Hangul a reader meets on an English page, except inside an element with lang="ko". */
export function hangulProblems(path, html) {
  const text = readableText(html);
  const hit = HANGUL.exec(text);
  if (!hit) return [];
  return [`${path}: Hangul outside a lang="ko" element: …${text.slice(Math.max(0, hit.index - 30), hit.index + 30).replace(/\s+/g, ' ')}…`];
}

/**
 * Rule (c): no Korean page's JS (its module scripts, their static imports and every chunk they import dynamically)
 * contains the English catalog mark, no English page's JS the Korean one; each tool twin carries its own mark.
 * `graphText(html)` returns the concatenated text of that graph.
 */
export function catalogProblems(pages, graphText) {
  const out = [];
  for (const [path, html] of pages) {
    const en = EN_PAGE_RE.test(path);
    const text = graphText(html);
    const foreign = en ? CATALOG_MARK.ko : CATALOG_MARK.en;
    if (text.includes(foreign)) out.push(`${path}: its JS contains the ${en ? 'Korean' : 'English'} catalog (${foreign})`);
  }
  for (const enPath of EN_TOOL_PAGES) {
    const en = pages.get(enPath);
    const ko = pages.get(twinOf(enPath));
    if (!en || !ko) continue;
    if (!graphText(en).includes(CATALOG_MARK.en)) out.push(`${enPath}: its JS has no English catalog (${CATALOG_MARK.en})`);
    if (!graphText(ko).includes(CATALOG_MARK.ko)) out.push(`${twinOf(enPath)}: its JS has no Korean catalog (${CATALOG_MARK.ko})`);
  }
  return out;
}

const ids = (html) => new Set([...(/<body\b[\s\S]*<\/body>/i.exec(html)?.[0] ?? '').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

/** Rule (d): each English tool page has exactly the element ids of its Korean twin, minus KO_ONLY_IDS. */
export function idParityProblems(pages, koOnly = KO_ONLY_IDS) {
  const out = [];
  for (const enPath of EN_TOOL_PAGES) {
    const en = pages.get(enPath);
    const ko = pages.get(twinOf(enPath));
    if (!en) {
      out.push(`${enPath}: missing`);
      continue;
    }
    if (!ko) {
      out.push(`${twinOf(enPath)}: missing (the Korean twin of ${enPath})`);
      continue;
    }
    const allowed = new Set(koOnly[enPath] ?? []);
    const enIds = ids(en);
    // CONTENT1021 D8: the Korean tool notes (Markdown headings with their own ids) have no English counterpart.
    const koIds = ids(cutElements(ko, 'section', (t) => /\bclass="tool-notes"/.test(t)));
    const missing = [...koIds].filter((i) => !enIds.has(i) && !allowed.has(i));
    const extra = [...enIds].filter((i) => !koIds.has(i));
    const stale = [...allowed].filter((i) => !koIds.has(i) || enIds.has(i));
    if (missing.length) out.push(`${enPath}: ids of the Korean twin missing: ${missing.join(', ')}`);
    if (extra.length) out.push(`${enPath}: ids the Korean twin does not have: ${extra.join(', ')}`);
    if (stale.length) out.push(`${enPath}: KO_ONLY_IDS entries that no longer apply: ${stale.join(', ')}`);
  }
  return out;
}

/** <url> entries of a sitemap: loc and its xhtml:link alternates ({ hreflang: href }). */
export function sitemapEntries(xml) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => {
    const loc = /<loc>([^<]+)<\/loc>/.exec(m[1])?.[1]?.trim() ?? '';
    const alt = {};
    for (const l of m[1].matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)) alt[l[1]] = l[2];
    return { loc, alt };
  });
}

/**
 * Rule (e): every English page (but its 404) is in the sitemap with a Korean twin there; both twins carry exactly the
 * alternates ko, en and x-default (= the Korean URL, ADS1020 D13), pointing at each other; no Korean page without a twin carries
 * any; every English page's canonical is itself.
 */
export function sitemapProblems(pages, xml) {
  const out = [];
  if (!xml.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"')) out.push('sitemap.xml: no xmlns:xhtml namespace');
  const entries = sitemapEntries(xml);
  const byPath = new Map(entries.map((e) => [e.loc ? new URL(e.loc).pathname : '', e]));
  const pathOf = (file) => `/${file.replace(/index\.html$/, '')}`;
  for (const [file, html] of pages) {
    if (!EN_PAGE_RE.test(file)) continue;
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(head(html))?.[1];
    if (/^en\/404(\/index)?\.html$/.test(file)) {
      if (canonical) out.push(`${file}: the not-found page has a canonical`);
      continue;
    }
    const path = pathOf(file);
    if (!canonical || new URL(canonical).pathname !== path) out.push(`${file}: canonical ${canonical ?? '(none)'} is not ${path}`);
    if (!byPath.has(path)) out.push(`${file}: not in the sitemap`);
  }
  for (const [path, e] of byPath) {
    const en = path.startsWith('/en/');
    const koPath = en ? path.slice(3) : path;
    const enPath = en ? path : `/en${path}`;
    const paired = byPath.has(koPath) && byPath.has(enPath);
    if (en && !byPath.has(koPath)) out.push(`sitemap.xml: ${path} has no Korean twin ${koPath}`);
    if (!paired) {
      if (Object.keys(e.alt).length) out.push(`sitemap.xml: ${path} has alternates but no twin`);
      continue;
    }
    const origin = new URL(e.loc).origin;
    const want = { ko: `${origin}${koPath}`, en: `${origin}${enPath}`, 'x-default': `${origin}${koPath}` };
    const got = JSON.stringify(Object.fromEntries(Object.entries(e.alt).sort()));
    if (got !== JSON.stringify(Object.fromEntries(Object.entries(want).sort()))) out.push(`sitemap.xml: ${path} alternates ${got}, expected ko, en and x-default (= ko) of the pair`);
  }
  return out;
}

/** Rule (g): no English page in the precache list. */
export function precacheProblems(urls) {
  return urls.filter((u) => u.startsWith('/en/')).map((u) => `precache: ${u} (English pages are network-only)`);
}

const sheets = (html) => [...head(html).matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);

/**
 * Rule (h), the CSS split guard: the Korean home, every Korean twin and every English page link exactly the one
 * stylesheet the Korean home links (BaseEn imports the same three CSS files as Base, in the same order).
 */
export function cssProblems(pages) {
  const home = pages.get('index.html');
  if (!home) return ['index.html: missing'];
  const want = sheets(home);
  if (want.length !== 1) return [`index.html: ${want.length} stylesheets, expected 1`];
  const out = [];
  for (const [path, html] of pages) {
    const en = EN_PAGE_RE.test(path);
    const twin = !en && pages.has(`en/${path}`);
    if (!en && !twin) continue;
    const got = sheets(html);
    if (got.length !== 1 || got[0] !== want[0]) out.push(`${path}: stylesheets ${got.join(', ') || '(none)'}, expected only ${want[0]} (the Korean home's)`);
  }
  return out;
}

/** Every rule. `ctx.graphText(html)`: the page's JS graph text; `ctx.sitemap`: dist/sitemap.xml; `ctx.precache`: URL list. */
export function enProblems(pages, ctx) {
  const out = [];
  const enPages = [...pages].filter(([p]) => EN_PAGE_RE.test(p));
  if (!enPages.length) out.push('no English page in dist/en/');
  for (const [p, html] of enPages) out.push(...enHeadProblems(p, html), ...hangulProblems(p, html));
  out.push(...catalogProblems(pages, ctx.graphText), ...idParityProblems(pages), ...sitemapProblems(pages, ctx.sitemap), ...precacheProblems(ctx.precache), ...cssProblems(pages));
  return out;
}
