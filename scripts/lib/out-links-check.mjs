// check-dist rules for the link blocks (briefs handoff/ARCHITECT-BRIEF-REV2.md Build Order H,
// handoff/ARCHITECT-BRIEF-REV3.md R3.6 and handoff/ARCHITECT-BRIEF-LP1028.md Build Order 7). Pure: tests/unit/postbuild.test.ts
// feeds fixtures.
// (a) a sponsored link (rel contains the word sponsored) only on a screen of the placement map: a tool page whose slug is
//     a key of TOOL_OUT, or a /guide/ page whose first tool (its 바로 쓰는 도구 list) is a key of GUIDE_OUT, and only with
//     a dest of that key. Every page of the No-block list (home, 404, offline, privacy, terms, licenses, the guide index,
//     the hubs, the upload-size tools and their guides) therefore fails with any sponsored link.
// (b) every sponsored link sits inside a .out-links block; no info link follows a disclosure.
// (b2) LP1028: a sponsored link is preceded inside its .out-links by the disclosure of its network: click.linkprice.com
//     after LP_COPY.ad; link.coupang.com after AFF_COPY.ad and COUPANG_DISCLOSURE; any other sponsored host fails.
// (c) every link.coupang.com or click.linkprice.com link is sponsored; a sponsored link opens a new tab and its label says 광고.
// (d) a /guide/ page with a sponsored link shows AFF_COPY.top before its first h2, and never in its <head> (meta
//     description, og, JSON-LD).
// (e) LP1028 (owner 2026-10-28, Coupang on result screens only): PUBLIC_AFF_COUPANG on, each page of COUPANG_PAGES has
//     exactly its Coupang links and every other page (guides, home, content, /en/, /embed/) none and no Coupang
//     disclosure line (COUPANG_DISCLOSURE, AFF_COPY.top, AFF_COPY.heading); off, none anywhere.
// (e2) PUBLIC_AFF_COUPANG off: no sponsored link anywhere except a LinkPrice one.
//     Never a Coupang script (src or inline), iframe, image, link, source, object or embed.
// (f) ADS1020 D1: while AFF_ENABLED is false in src/data/affiliate.ts, no dist text file (html, js, json, xml, txt) names
//     link.coupang.com or carries AFF_COPY.top, AFF_COPY.ad, AFF_COPY.heading or COUPANG_DISCLOSURE, whatever
//     PUBLIC_AFF_COUPANG says.
// (g) every click.linkprice.com href (entity-decoded) is exactly one LP_LINKS href: rel sponsored, label with 광고,
//     target _blank, data-out = the dest of that href.
// (h) LinkPrice on: each page of LP_PAGES has exactly its LinkPrice links, no other page any; every one sits inside a div
//     carrying the hidden attribute in the HTML (shown only once there is a result).
// (i) LinkPrice off: no dist text file names click.linkprice.com or carries LP_COPY.ad. On: only HTML files name
//     click.linkprice.com. Coupang on: only HTML files name link.coupang.com.
// (j) never a LinkPrice script (src or inline), iframe, image, link, source, object or embed.

export const ID_PHOTO_PAGE = 'id-photo/index.html';

/** (e) LP1028 L10: the Coupang links of each result screen while PUBLIC_AFF_COUPANG is on (src/data/affiliate.ts TOOL_AFF
 * without the screens LinkPrice takes; remove-background only where it is built). */
export const COUPANG_PAGES = {
  'id-photo/index.html': 3,
  'remove-background/index.html': 1,
  'hwp-viewer/index.html': 1,
  'hwp-to-pdf/index.html': 1,
  'hwpx-to-hwp/index.html': 1,
  'pdf-merge/index.html': 1,
  'pdf-split/index.html': 1,
  'jpg-to-pdf/index.html': 2,
};

/** (e) LP1028 L10: with LinkPrice off these screens fall back to their Coupang block (resultBlock). */
export const COUPANG_LP_OFF_PAGES = {
  'pdf-sign/index.html': 1,
  'stamp-signature/index.html': 1,
  'stamp-maker/index.html': 1,
};

/** (h) LP1028 L1: the LinkPrice links of each result screen while PUBLIC_AFF_LINKPRICE is on. */
export const LP_PAGES = {
  'pdf-sign/index.html': 1,
  'stamp-signature/index.html': 1,
  'stamp-maker/index.html': 1,
  'id-photo/index.html': 2,
  'char-count/index.html': 1,
  'resignation-letter/index.html': 1,
};

/** The disclosure strings of src/data/affiliate.ts (one-line literals), or null when one is missing. */
export function disclosureStrings(source) {
  const one = (block, key) => new RegExp(`\\b${block}\\s*=\\s*\\{[^}]*?^\\s*${key}:\\s*'([^'\\n]+)'`, 'm').exec(source)?.[1];
  const generic = one('AFF_COPY', 'ad');
  const top = one('AFF_COPY', 'top');
  const heading = one('AFF_COPY', 'heading');
  const lp = one('LP_COPY', 'ad');
  const coupang = /\bCOUPANG_DISCLOSURE\s*=\s*'([^'\n]+)'/.exec(source)?.[1];
  return generic && top && heading && coupang && lp ? { generic, top, heading, coupang, lp } : null;
}

/** AFF_ENABLED of src/data/affiliate.ts: true or false, or null when the line is missing. */
export function affEnabled(source) {
  const m = /^export const AFF_ENABLED\s*=\s*(true|false);/m.exec(source);
  return m ? m[1] === 'true' : null;
}

/** LP_ENABLED of src/data/affiliate.ts: true or false, or null when the line is missing. */
export function lpEnabled(source) {
  const m = /^export const LP_ENABLED\s*=\s*(true|false);/m.exec(source);
  return m ? m[1] === 'true' : null;
}

/** The LP_LINKS entries of src/data/affiliate.ts ({ dest, href }, the href as written), or null when there are none. */
export function lpLinks(source) {
  const list = /\bLP_LINKS\b[^=\n]*=\s*\[([^\]]*)\]/.exec(source)?.[1];
  const links = list ? [...list.matchAll(/\{\s*dest:\s*'(lp-[a-z0-9-]+)',\s*label:\s*'[^'\n]*',\s*href:\s*'([^'\n]+)'\s*\}/g)].map((m) => ({ dest: m[1], href: m[2] })) : [];
  return links.length ? links : null;
}

/** The dist text files rules (f) and (i) scan. */
export const AFF_TEXT_RE = /\.(html|m?js|json|xml|txt)$/;

/**
 * (f) Problems of `texts` (iterable of [dist path, text]) while AFF_ENABLED is false: a Coupang link or one of the
 * disclosure strings `{ generic, top, heading, coupang }` anywhere. [] passes.
 */
export function coupangOffProblems(texts, { generic, top, heading, coupang }) {
  const problems = [];
  const needles = [
    ['link.coupang.com', 'a Coupang link'],
    [top, 'AFF_COPY.top'],
    [generic, 'AFF_COPY.ad'],
    [heading, 'AFF_COPY.heading'],
    [coupang, 'COUPANG_DISCLOSURE'],
  ];
  for (const [path, text] of texts) for (const [needle, name] of needles) if (text.includes(needle)) problems.push(`${path}: ${name} while AFF_ENABLED is false (src/data/affiliate.ts)`);
  return problems;
}

const ENTITIES = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', '#39': "'", '#38': '&', '#x26': '&' };
const decode = (s) => s.replace(/&(lt|gt|quot|apos|amp|#39|#38|#x26);/g, (_, e) => ENTITIES[e]);
const text = (html) => decode(html.replace(/<[^>]*>/g, ''));
const attr = (attrs, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1];
/** rel contains the whole word sponsored, anywhere in the value (rel values are case-insensitive). */
const SPONSORED = /(^|\s)sponsored(\s|$)/i;
const COUPANG_HREF = /^https:\/\/link\.coupang\.com\//;
const LP_HREF = /^https:\/\/click\.linkprice\.com\//;
const anchors = (html) => html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g);
const isSponsored = (attrs) => SPONSORED.test(attr(attrs, 'rel') ?? '');
const hrefOf = (attrs) => decode(attr(attrs, 'href') ?? '');

/** [start, end) of every `<div …>` element whose opening tag matches `open` (nested ones included). */
function divSpans(html, open) {
  const spans = [];
  for (const o of html.matchAll(open)) {
    const re = /<(\/?)div\b[^>]*>/gi;
    re.lastIndex = o.index + o[0].length;
    let depth = 1;
    let end = html.length;
    for (let m = re.exec(html); m; m = re.exec(html)) {
      depth += m[1] ? -1 : 1;
      if (depth === 0) {
        end = m.index + m[0].length;
        break;
      }
    }
    spans.push([o.index, end]);
  }
  return spans;
}
/** Every `<div class="out-links" …>` element. */
const blockSpans = (html) => divSpans(html, /<div\b[^>]*\bclass="out-links(?:\s[^"]*)?"[^>]*>/g);
/** Every div carrying the hidden attribute. */
const hiddenSpans = (html) => divSpans(html, /<div\b(?=[^>]*\shidden(?=[\s>=/]))[^>]*>/g);

/** The innermost block span containing `at`, or null. */
const innermost = (spans, at) => spans.filter(([s, e]) => at >= s && at < e).sort((a, b) => a[1] - a[0] - (b[1] - b[0]))[0] ?? null;

/**
 * The placement key of a page: { kind: 'tool', key: slug } for `<slug>/index.html`, { kind: 'guide', key: tools[0] } for
 * `guide/<slug>/index.html` (the first link of its 바로 쓰는 도구 list), else null.
 */
export function placement(path, html) {
  const guide = /^guide\/[a-z0-9-]+\/index\.html$/.test(path);
  if (guide) {
    const list = /aria-labelledby="guide-tools-title"[\s\S]*?<a\b[^>]*\shref="\/([a-z0-9-]+)\/"/.exec(html);
    return list ? { kind: 'guide', key: list[1] } : null;
  }
  const tool = /^([a-z0-9-]+)\/index\.html$/.exec(path);
  return tool ? { kind: 'tool', key: tool[1] } : null;
}

/**
 * Problems (strings) of the sponsored links in `pages` (Map of dist path -> HTML) against the disclosure strings
 * `{ generic, top, coupang, lp }` and the placement maps `{ TOOL_OUT, GUIDE_OUT }` (scripts/lib/usage.mjs). [] passes.
 */
export function sponsoredProblems(pages, { generic, top, coupang, lp }, { TOOL_OUT, GUIDE_OUT }) {
  const problems = [];
  for (const [path, html] of pages) {
    const all = [...anchors(html)];
    const sponsoredLinks = all.filter((m) => isSponsored(m[1]));
    const networkLinks = all.filter((m) => COUPANG_HREF.test(hrefOf(m[1])) || LP_HREF.test(hrefOf(m[1])));
    if (!sponsoredLinks.length && !networkLinks.length) continue;
    // (a)
    const place = placement(path, html);
    const map = place?.kind === 'guide' ? GUIDE_OUT : TOOL_OUT;
    const dests = place && Object.hasOwn(map, place.key) ? map[place.key] : null;
    if (sponsoredLinks.length && !dests) {
      problems.push(`${path}: a sponsored link on a page without a link block`);
      continue;
    }
    // (d)
    if (place?.kind === 'guide' && sponsoredLinks.length) {
      const h2 = html.search(/<h2[\s>]/);
      const body = html.indexOf('<body');
      if (!text(html.slice(body < 0 ? 0 : body, h2 < 0 ? html.length : h2)).includes(top)) problems.push(`${path}: a sponsored link without the first-part line (AFF_COPY.top) before the first h2`);
      const head = html.slice(0, body < 0 ? 0 : body);
      if (head.includes(top)) problems.push(`${path}: the first-part line (AFF_COPY.top) in <head>`);
    }
    // (b), (b2), (c)
    const spans = blockSpans(html);
    for (const m of all) {
      const sponsored = isSponsored(m[1]);
      const dest = attr(m[1], 'data-out') ?? '';
      const href = hrefOf(m[1]);
      const coupangHref = COUPANG_HREF.test(href);
      const lpHref = LP_HREF.test(href);
      const span = innermost(spans, m.index);
      // A Coupang Partners or LinkPrice link is always an ad: without rel=sponsored it fails, and it still gets every check below.
      if (coupangHref && !sponsored) problems.push(`${path}: the Coupang link "${dest || 'link'}" is not rel=sponsored`);
      if (lpHref && !sponsored) problems.push(`${path}: the LinkPrice link "${dest || 'link'}" is not rel=sponsored`);
      if (!sponsored && !coupangHref && !lpHref) {
        // An info link is never under a disclosure.
        if (span && dest) {
          const before = text(html.slice(span[0], m.index));
          if (before.includes(generic) || before.includes(lp)) problems.push(`${path}: the link "${dest}" follows the affiliate disclosure`);
        }
        continue;
      }
      const name = dest || 'sponsored';
      if (!coupangHref && !lpHref) {
        problems.push(`${path}: the sponsored link "${name}" is neither a Coupang nor a LinkPrice link`);
        continue;
      }
      if (dests && !dests.includes(dest)) problems.push(`${path}: the sponsored link "${name}" is not a dest of this page's block`);
      if (!span) {
        problems.push(`${path}: the sponsored link "${name}" is outside .out-links`);
        continue;
      }
      const before = text(html.slice(span[0], m.index));
      if (coupangHref) {
        if (!before.includes(generic)) problems.push(`${path}: the sponsored link "${name}" is not preceded by the disclosure`);
        if (!before.includes(coupang)) problems.push(`${path}: the Coupang link "${name}" is not preceded by COUPANG_DISCLOSURE`);
      } else if (!before.includes(lp)) problems.push(`${path}: the LinkPrice link "${name}" is not preceded by LP_COPY.ad`);
      if (attr(m[1], 'target') !== '_blank') problems.push(`${path}: the sponsored link "${name}" does not open a new tab`);
      if (!text(m[2]).includes('광고')) problems.push(`${path}: the label of the sponsored link "${name}" does not say 광고`);
    }
  }
  return problems;
}

/**
 * (e), (e2) PUBLIC_AFF_COUPANG `on`: each page of COUPANG_PAGES has exactly its Coupang links (/id-photo/ must exist),
 * every other page none and no Coupang disclosure line (`strings`: { top, heading, coupang }); with LinkPrice off
 * (`lpOn` false) the screens of COUPANG_LP_OFF_PAGES have their Coupang links too; off: no Coupang link and no sponsored
 * link but a LinkPrice one. Never a Coupang script (src or inline), iframe, image, link, source, object or embed.
 */
export function coupangProblems(pages, on, { top, heading, coupang }, lpOn = true) {
  const problems = [];
  const state = on ? 'on' : 'off';
  for (const [path, html] of pages) {
    const coupangLinks = (html.match(/href="https:\/\/link\.coupang\.com\//g) ?? []).length;
    const expected = on ? (COUPANG_PAGES[path] ?? (lpOn ? 0 : COUPANG_LP_OFF_PAGES[path] ?? 0)) : 0;
    if (coupangLinks !== expected) problems.push(`${path}: ${coupangLinks} Coupang link(s) while PUBLIC_AFF_COUPANG is ${state} (expected ${expected})`);
    if (!expected) {
      const body = text(html);
      for (const [needle, name] of [
        [coupang, 'COUPANG_DISCLOSURE'],
        [top, 'AFF_COPY.top'],
        [heading, 'AFF_COPY.heading'],
      ]) if (html.includes(needle) || body.includes(needle)) problems.push(`${path}: ${name} on a page without Coupang links`);
    }
    if (!on && [...anchors(html)].some((m) => isSponsored(m[1]) && !LP_HREF.test(hrefOf(m[1])))) problems.push(`${path}: a sponsored link other than LinkPrice while PUBLIC_AFF_COUPANG is off`);
    const embed = /<(?:script|iframe|img|link|source|object|embed)\b[^>]*coupang/i.test(html) || [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].some((s) => /coupang/i.test(s[1]));
    if (embed) problems.push(`${path}: a Coupang script, iframe, image or other embed`);
  }
  if (on && !pages.has(ID_PHOTO_PAGE)) problems.push(`${ID_PHOTO_PAGE}: missing although PUBLIC_AFF_COUPANG is on`);
  return problems;
}

/**
 * (g), (h), (j) The LinkPrice links of `pages` while PUBLIC_AFF_LINKPRICE is `on`, against `links` (lpLinks of
 * src/data/affiliate.ts). [] passes.
 */
export function linkpriceProblems(pages, on, links) {
  const problems = [];
  const state = on ? 'on' : 'off';
  for (const [path, html] of pages) {
    const hidden = hiddenSpans(html);
    let count = 0;
    for (const m of anchors(html)) {
      const href = hrefOf(m[1]);
      if (!LP_HREF.test(href)) continue;
      count += 1;
      const dest = attr(m[1], 'data-out') ?? '';
      const name = dest || 'link';
      // (g)
      const known = links.find((l) => l.href === href);
      if (!known) problems.push(`${path}: the LinkPrice link "${name}" is not exactly an LP_LINKS href`);
      else if (dest !== known.dest) problems.push(`${path}: the LinkPrice link "${name}" has data-out "${dest}", expected "${known.dest}"`);
      if (!isSponsored(m[1])) problems.push(`${path}: the LinkPrice link "${name}" is not rel=sponsored`);
      if (attr(m[1], 'target') !== '_blank') problems.push(`${path}: the LinkPrice link "${name}" does not open a new tab`);
      if (!text(m[2]).includes('광고')) problems.push(`${path}: the label of the LinkPrice link "${name}" does not say 광고`);
      // (h)
      if (!hidden.some(([s, e]) => m.index >= s && m.index < e)) problems.push(`${path}: the LinkPrice link "${name}" is not inside a hidden div`);
    }
    const expected = on ? (LP_PAGES[path] ?? 0) : 0;
    if (count !== expected) problems.push(`${path}: ${count} LinkPrice link(s) while PUBLIC_AFF_LINKPRICE is ${state} (expected ${expected})`);
    // (j)
    const embed = /<(?:script|iframe|img|link|source|object|embed)\b[^>]*linkprice/i.test(html) || [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].some((s) => /linkprice/i.test(s[1]));
    if (embed) problems.push(`${path}: a LinkPrice script, iframe, image or other embed`);
  }
  if (on) for (const p of Object.keys(LP_PAGES)) if (!pages.has(p)) problems.push(`${p}: missing although PUBLIC_AFF_LINKPRICE is on`);
  return problems;
}

/**
 * (i) Problems of `texts` (iterable of [dist path, text]): LinkPrice off, any file naming click.linkprice.com or carrying
 * `lpAd` (LP_COPY.ad); on, a non-HTML file naming click.linkprice.com. Coupang on, a non-HTML file naming link.coupang.com.
 */
export function affTextProblems(texts, { lpOn, coupangOn, lpAd }) {
  const problems = [];
  for (const [path, body] of texts) {
    const html = path.endsWith('.html');
    if (!lpOn && body.includes('click.linkprice.com')) problems.push(`${path}: a LinkPrice link while PUBLIC_AFF_LINKPRICE is off`);
    if (!lpOn && body.includes(lpAd)) problems.push(`${path}: LP_COPY.ad while PUBLIC_AFF_LINKPRICE is off`);
    if (lpOn && !html && body.includes('click.linkprice.com')) problems.push(`${path}: a LinkPrice link outside HTML`);
    if (coupangOn && !html && body.includes('link.coupang.com')) problems.push(`${path}: a Coupang link outside HTML`);
  }
  return problems;
}
