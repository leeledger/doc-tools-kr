// check-dist rules for the id-photo 인화·사진관 links (brief handoff/ARCHITECT-BRIEF-REV2.md, Build Order H):
// (a) a sponsored link (rel contains the word sponsored) exists only on /id-photo/; (b) there every sponsored link sits
// inside .print-links after the generic disclosure, a Coupang Partners link (link.coupang.com) also after
// COUPANG_DISCLOSURE, and no info link follows the disclosure; (c) every link.coupang.com link is sponsored, and a
// sponsored link opens a new tab and its label says 광고. Pure: tests/unit/postbuild.test.ts feeds fixtures.

export const PRINT_PAGE = 'id-photo/index.html';

/** The disclosure strings of src/data/affiliate.ts (one-line literals), or null when either is missing. */
export function disclosureStrings(source) {
  const generic = /^\s*ad:\s*'([^'\n]+)'/m.exec(source)?.[1];
  const coupang = /\bCOUPANG_DISCLOSURE\s*=\s*'([^'\n]+)'/.exec(source)?.[1];
  return generic && coupang ? { generic, coupang } : null;
}

const ENTITIES = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', '#39': "'" };
const text = (html) => html.replace(/<[^>]*>/g, '').replace(/&(lt|gt|quot|apos|amp|#39);/g, (_, e) => ENTITIES[e]);
const attr = (attrs, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1];
/** rel contains the whole word sponsored, anywhere in the value. */
const SPONSORED = /(^|\s)sponsored(\s|$)/;
const COUPANG_HREF = /^https:\/\/link\.coupang\.com\//;
const anchors = (html) => html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g);

/** [start, end) of the first `<div class="print-links" …>` element, or null. */
function blockSpan(html) {
  const open = /<div\b[^>]*\bclass="print-links(?:\s[^"]*)?"[^>]*>/.exec(html);
  if (!open) return null;
  const re = /<(\/?)div\b[^>]*>/gi;
  re.lastIndex = open.index + open[0].length;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return [open.index, m.index + m[0].length];
  }
  return [open.index, html.length];
}

/**
 * Problems (strings) of the sponsored links in `pages` (Map of dist path -> HTML) against the disclosure strings
 * `{ generic, coupang }`. An empty list passes.
 */
export function sponsoredProblems(pages, { generic, coupang }) {
  const problems = [];
  for (const [path, html] of pages) {
    if (path !== PRINT_PAGE && [...anchors(html)].some((m) => SPONSORED.test(attr(m[1], 'rel') ?? ''))) problems.push(`${path}: a sponsored link outside /id-photo/`);
  }
  const html = pages.get(PRINT_PAGE);
  if (!html) return problems;
  const span = blockSpan(html);
  for (const m of anchors(html)) {
    const sponsored = SPONSORED.test(attr(m[1], 'rel') ?? '');
    const dest = attr(m[1], 'data-out') ?? '';
    const coupangHref = COUPANG_HREF.test(attr(m[1], 'href') ?? '');
    const inside = span && m.index >= span[0] && m.index < span[1];
    // A Coupang Partners link is always an ad: without rel=sponsored it fails, and it still gets every check below.
    if (coupangHref && !sponsored) problems.push(`${PRINT_PAGE}: the Coupang link "${dest || 'link'}" is not rel=sponsored`);
    if (!sponsored && !coupangHref) {
      // The info link is never under the disclosure.
      if (inside && dest && text(html.slice(span[0], m.index)).includes(generic)) problems.push(`${PRINT_PAGE}: the link "${dest}" follows the affiliate disclosure`);
      continue;
    }
    const name = dest || 'sponsored';
    if (!inside) {
      problems.push(`${PRINT_PAGE}: the sponsored link "${name}" is outside .print-links`);
      continue;
    }
    const before = text(html.slice(span[0], m.index));
    if (!before.includes(generic)) problems.push(`${PRINT_PAGE}: the sponsored link "${name}" is not preceded by the disclosure`);
    if (coupangHref && !before.includes(coupang)) problems.push(`${PRINT_PAGE}: the Coupang link "${name}" is not preceded by COUPANG_DISCLOSURE`);
    if (attr(m[1], 'target') !== '_blank') problems.push(`${PRINT_PAGE}: the sponsored link "${name}" does not open a new tab`);
    if (!text(m[2]).includes('광고')) problems.push(`${PRINT_PAGE}: the label of the sponsored link "${name}" does not say 광고`);
  }
  return problems;
}

/**
 * PUBLIC_AFF_COUPANG (orchestrator update 2026-10-12): Coupang links are on /id-photo/ exactly when the flag is on, on no
 * other page, and never as a script (src or inline), iframe, image, link, source, object or embed.
 */
export function coupangProblems(pages, on) {
  const problems = [];
  for (const [path, html] of pages) {
    const has = /href="https:\/\/link\.coupang\.com\//.test(html);
    if (path !== PRINT_PAGE && has) problems.push(`${path}: a Coupang link outside /id-photo/`);
    if (path === PRINT_PAGE && has !== on) problems.push(`${PRINT_PAGE}: ${on ? 'no Coupang link although PUBLIC_AFF_COUPANG is on' : 'a Coupang link while PUBLIC_AFF_COUPANG is off'}`);
    const embed = /<(?:script|iframe|img|link|source|object|embed)\b[^>]*coupang/i.test(html) || [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].some((s) => /coupang/i.test(s[1]));
    if (embed) problems.push(`${path}: a Coupang script, iframe, image or other embed`);
  }
  return problems;
}
