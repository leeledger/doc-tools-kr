// The AdSense P1 length metrics (FORM1020 round 2; bars and the tool metric: CONTENT1021 D4).
// Guide (and hub): the rendered body prose of div.guide-body (the markdown body, up to the FAQ section). Front matter
// (title, answer box, sources), FAQ, nav, footer and related lists do not count.
// Tool page (metric T): the text inside <main> minus the widget (section.tool), section.quick, section.related, ad
// slots and script/style/template; the FAQ counts.
// Both: tags removed, entities decoded, URLs dropped, no whitespace; code points.
// CLI: node scripts/guide-length.mjs [slug ...] (guides + hubs) · node scripts/guide-length.mjs --tools (tool pages).

/** The bars (never lowered). */
export const GUIDE_MIN_CHARS = 2500;
export const TOOL_MIN_CHARS = 2000;

/**
 * Scaffolding, Steps A–C of CONTENT1021 only (D5): guide/hub slugs and tool paths not yet expanded. check-dist reports
 * their length and figure rules as WARN instead of FAIL. Each step removes its pages; Step D deletes this constant.
 * A page that passes may never be added (check-dist fails on a pending page that passes).
 */
export const LENGTH_PENDING = new Set([
  // Step B2: PDF / HWP / 서류 / 사진 보내기 / 서명 guides.
  'pdf-compress', 'pdf-password', 'pdf-split', 'pdf-sign', 'pdf-to-jpg', 'jpg-to-pdf', 'email-attachment-limit', 'ecfs-pdf-limit',
  'yearend-tax-pdf', 'gov24-pdf-save', 'kosaf-docs', 'univ-docs-upload', 'hwp-on-phone', 'hwp-to-pdf', 'hwpx-to-hwp',
  'open-hwp-without-hangul', 'what-is-hwpx', 'heic-to-jpg', 'kakao-photo', 'remove-background', 'stamp-image', 'e-signature-law',
  // Step C: every Korean tool page.
  '/pdf-merge/', '/pdf-compress/', '/jpg-to-pdf/', '/pdf-to-jpg/', '/pdf-password/', '/pdf-split/', '/pdf-sign/', '/pdf-edit/',
  '/photo-compress/', '/image-to-jpg/', '/id-photo/', '/id-copy/', '/english-name/', '/stamp-maker/', '/stamp-signature/',
  '/power-of-attorney/', '/hwp-to-pdf/', '/hwp-viewer/', '/hwpx-to-hwp/', '/char-count/', '/remove-background/', '/english-address/',
]);

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decodes the entities Astro writes (named basics and numeric). */
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** The visible prose of an HTML fragment: script/style/template out, tags out, entities decoded, URLs dropped, spaces collapsed. */
export function proseText(fragment) {
  return decodeEntities(fragment.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Code points without whitespace. */
export const countChars = (text) => [...text.replace(/\s/g, '')].length;

/** The body prose of a built guide or hub page, or '' when the page has no div.guide-body. */
export function guideBodyText(html) {
  const i = html.indexOf('<div class="guide-body">');
  if (i < 0) return '';
  const end = html.indexOf('<section class="guide-faq"', i);
  return proseText(html.slice(i, end > i ? end : undefined));
}

/** The guide metric. */
export const guideBodyChars = (html) => countChars(guideBodyText(html));

const hasClass = (openTag, test) => {
  const c = /\bclass="([^"]*)"/.exec(openTag)?.[1];
  return c !== undefined && c.split(/\s+/).some(test);
};

/**
 * Removes every `<tag>` element whose opening tag passes `isCut` (balanced: nested elements of the same tag are
 * counted, so a section inside the widget never ends the cut early).
 */
export function cutElements(html, tag, isCut) {
  const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, 'gi');
  let out = '';
  let pos = 0;
  let depth = 0;
  for (const m of html.matchAll(re)) {
    const open = m[0][1] !== '/';
    if (depth === 0) {
      if (open && isCut(m[0])) {
        out += html.slice(pos, m.index);
        depth = 1;
      }
      continue;
    }
    depth += open ? 1 : -1;
    if (depth === 0) pos = m.index + m[0].length;
  }
  if (depth > 0) return out; // unclosed: everything from the cut on is dropped
  return out + html.slice(pos);
}

const TOOL_CUT = new Set(['tool', 'quick', 'related']);

/** The counted prose of a built tool page (metric T), or '' when it has no <main>. */
export function toolBodyText(html) {
  const m = /<main\b[^>]*>([\s\S]*)<\/main>/.exec(html);
  if (!m) return '';
  let main = m[1].replace(/<(script|style|template)\b[\s\S]*?<\/\1>/g, ' ');
  main = cutElements(main, 'section', (t) => hasClass(t, (c) => TOOL_CUT.has(c)));
  main = cutElements(main, 'div', (t) => hasClass(t, (c) => c === 'ad-slot'));
  return proseText(main);
}

/** The tool metric (T). */
export const toolBodyChars = (html) => countChars(toolBodyText(html));
