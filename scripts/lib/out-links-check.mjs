// check-dist rules for the link blocks (briefs handoff/ARCHITECT-BRIEF-REV2.md Build Order H and
// handoff/ARCHITECT-BRIEF-REV3.md R3.6). Pure: tests/unit/postbuild.test.ts feeds fixtures.
// (a) a sponsored link (rel contains the word sponsored) only on a screen of the placement map: a tool page whose slug is
//     a key of TOOL_OUT, or a /guide/ page whose first tool (its 바로 쓰는 도구 list) is a key of GUIDE_OUT, and only with
//     a dest of that key. Every page of the No-block list (home, 404, offline, privacy, terms, licenses, the guide index,
//     the hubs, the upload-size tools and their guides) therefore fails with any sponsored link.
// (b) every sponsored link sits inside a .out-links block after the generic disclosure (a Coupang Partners link also
//     after COUPANG_DISCLOSURE) in that block; no info link follows the disclosure.
// (c) every link.coupang.com link is sponsored; a sponsored link opens a new tab and its label says 광고.
// (d) a /guide/ page with a sponsored link shows AFF_COPY.top before its first h2, and never in its <head> (meta
//     description, og, JSON-LD).
// (e) flag off: no link.coupang.com link and no sponsored link anywhere; flag on: /id-photo/ keeps its three Coupang links.
//     Never a Coupang script (src or inline), iframe, image, link, source, object or embed.
// (f) ADS1020 D1: while AFF_ENABLED is false in src/data/affiliate.ts, no dist text file (html, js, json, xml, txt) names
//     link.coupang.com or carries AFF_COPY.top, AFF_COPY.ad, AFF_COPY.heading or COUPANG_DISCLOSURE, whatever
//     PUBLIC_AFF_COUPANG says.

export const ID_PHOTO_PAGE = 'id-photo/index.html';

/** The disclosure strings of src/data/affiliate.ts (one-line literals), or null when one is missing. */
export function disclosureStrings(source) {
  const generic = /^\s*ad:\s*'([^'\n]+)'/m.exec(source)?.[1];
  const top = /^\s*top:\s*'([^'\n]+)'/m.exec(source)?.[1];
  const heading = /^\s*heading:\s*'([^'\n]+)'/m.exec(source)?.[1];
  const coupang = /\bCOUPANG_DISCLOSURE\s*=\s*'([^'\n]+)'/.exec(source)?.[1];
  return generic && top && heading && coupang ? { generic, top, heading, coupang } : null;
}

/** AFF_ENABLED of src/data/affiliate.ts: true or false, or null when the line is missing. */
export function affEnabled(source) {
  const m = /^export const AFF_ENABLED\s*=\s*(true|false);/m.exec(source);
  return m ? m[1] === 'true' : null;
}

/** The dist text files rule (f) scans. */
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

const ENTITIES = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', '#39': "'" };
const text = (html) => html.replace(/<[^>]*>/g, '').replace(/&(lt|gt|quot|apos|amp|#39);/g, (_, e) => ENTITIES[e]);
const attr = (attrs, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1];
/** rel contains the whole word sponsored, anywhere in the value (rel values are case-insensitive). */
const SPONSORED = /(^|\s)sponsored(\s|$)/i;
const COUPANG_HREF = /^https:\/\/link\.coupang\.com\//;
const anchors = (html) => html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g);
const isSponsored = (attrs) => SPONSORED.test(attr(attrs, 'rel') ?? '');

/** [start, end) of every `<div class="out-links" …>` element (nested blocks included). */
function blockSpans(html) {
  const spans = [];
  for (const open of html.matchAll(/<div\b[^>]*\bclass="out-links(?:\s[^"]*)?"[^>]*>/g)) {
    const re = /<(\/?)div\b[^>]*>/gi;
    re.lastIndex = open.index + open[0].length;
    let depth = 1;
    let end = html.length;
    for (let m = re.exec(html); m; m = re.exec(html)) {
      depth += m[1] ? -1 : 1;
      if (depth === 0) {
        end = m.index + m[0].length;
        break;
      }
    }
    spans.push([open.index, end]);
  }
  return spans;
}

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
 * `{ generic, top, coupang }` and the placement maps `{ TOOL_OUT, GUIDE_OUT }` (scripts/lib/usage.mjs). [] passes.
 */
export function sponsoredProblems(pages, { generic, top, coupang }, { TOOL_OUT, GUIDE_OUT }) {
  const problems = [];
  for (const [path, html] of pages) {
    const all = [...anchors(html)];
    const sponsoredLinks = all.filter((m) => isSponsored(m[1]));
    const coupangLinks = all.filter((m) => COUPANG_HREF.test(attr(m[1], 'href') ?? ''));
    if (!sponsoredLinks.length && !coupangLinks.length) continue;
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
    // (b), (c)
    const spans = blockSpans(html);
    for (const m of all) {
      const sponsored = isSponsored(m[1]);
      const dest = attr(m[1], 'data-out') ?? '';
      const coupangHref = COUPANG_HREF.test(attr(m[1], 'href') ?? '');
      const span = innermost(spans, m.index);
      // A Coupang Partners link is always an ad: without rel=sponsored it fails, and it still gets every check below.
      if (coupangHref && !sponsored) problems.push(`${path}: the Coupang link "${dest || 'link'}" is not rel=sponsored`);
      if (!sponsored && !coupangHref) {
        // An info link is never under the disclosure.
        if (span && dest && text(html.slice(span[0], m.index)).includes(generic)) problems.push(`${path}: the link "${dest}" follows the affiliate disclosure`);
        continue;
      }
      const name = dest || 'sponsored';
      if (dests && !dests.includes(dest)) problems.push(`${path}: the sponsored link "${name}" is not a dest of this page's block`);
      if (!span) {
        problems.push(`${path}: the sponsored link "${name}" is outside .out-links`);
        continue;
      }
      const before = text(html.slice(span[0], m.index));
      if (!before.includes(generic)) problems.push(`${path}: the sponsored link "${name}" is not preceded by the disclosure`);
      if (coupangHref && !before.includes(coupang)) problems.push(`${path}: the Coupang link "${name}" is not preceded by COUPANG_DISCLOSURE`);
      if (attr(m[1], 'target') !== '_blank') problems.push(`${path}: the sponsored link "${name}" does not open a new tab`);
      if (!text(m[2]).includes('광고')) problems.push(`${path}: the label of the sponsored link "${name}" does not say 광고`);
    }
  }
  return problems;
}

/**
 * (e) PUBLIC_AFF_COUPANG: off, no Coupang link and no sponsored link on any page; on, /id-photo/ has its three Coupang
 * links. Never a Coupang script (src or inline), iframe, image, link, source, object or embed.
 */
export function coupangProblems(pages, on) {
  const problems = [];
  for (const [path, html] of pages) {
    const coupangLinks = (html.match(/href="https:\/\/link\.coupang\.com\//g) ?? []).length;
    if (!on && coupangLinks) problems.push(`${path}: a Coupang link while PUBLIC_AFF_COUPANG is off`);
    if (!on && [...anchors(html)].some((m) => isSponsored(m[1]))) problems.push(`${path}: a sponsored link while PUBLIC_AFF_COUPANG is off`);
    if (on && path === ID_PHOTO_PAGE && coupangLinks !== 3) problems.push(`${ID_PHOTO_PAGE}: ${coupangLinks} Coupang link(s) although PUBLIC_AFF_COUPANG is on (expected 3)`);
    const embed = /<(?:script|iframe|img|link|source|object|embed)\b[^>]*coupang/i.test(html) || [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].some((s) => /coupang/i.test(s[1]));
    if (embed) problems.push(`${path}: a Coupang script, iframe, image or other embed`);
  }
  if (on && !pages.has(ID_PHOTO_PAGE)) problems.push(`${ID_PHOTO_PAGE}: missing although PUBLIC_AFF_COUPANG is on`);
  return problems;
}
