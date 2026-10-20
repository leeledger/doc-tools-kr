// The AdSense P1 length metric of a guide (orchestrator decision, FORM1020 round 2): the rendered body prose of
// div.guide-body (the markdown body, up to the FAQ section), tags removed, entities decoded, URLs dropped, no
// whitespace. Front matter (title, answer box, sources), FAQ, nav, footer and related lists do not count.
// Bar: 2,500 for a new guide. CLI: node scripts/guide-length.mjs [slug ...] (reads dist/guide/<slug>/index.html).

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

/** The body prose of a built guide page, or '' when the page has no div.guide-body. */
export function guideBodyText(html) {
  const i = html.indexOf('<div class="guide-body">');
  if (i < 0) return '';
  const end = html.indexOf('<section class="guide-faq"', i);
  const seg = html.slice(i, end > i ? end : undefined);
  return decodeEntities(seg.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The metric: code points of the body prose without whitespace. */
export const guideBodyChars = (html) => [...guideBodyText(html).replace(/\s/g, '')].length;
