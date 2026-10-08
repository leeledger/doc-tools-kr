/**
 * Meta length rule (SEO-LENGTH): title at most 40 code points including " | 문서딱", meta description 40–80,
 * og:title = twitter:title = title, og:description = twitter:description and at most 80. Every code point counts
 * once (spaces, "·", "—", "×", digits). src/data/site.ts holds the same numbers; a unit test keeps them equal.
 */
export const TITLE_MAX = 40;
export const DESC_MIN = 40;
export const DESC_MAX = 80;
export const OG_DESC_MAX = 80;

export const metaLen = (s) => [...s].length;

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decodes the entities Astro emits in attributes and text (named, decimal and hex numeric). */
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? decodeEntities(m[1] ?? m[2]) : undefined;
};

/** Title, description, og:* and twitter:* read from the <head> element only (a body SVG <title> is ignored). */
export function headMeta(html) {
  const head = /<head[\s>][\s\S]*?<\/head>/i.exec(html)?.[0] ?? '';
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  const metas = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = attr(tag, 'name') ?? attr(tag, 'property');
    const content = attr(tag, 'content');
    if (key && content !== undefined && !(key in metas)) metas[key] = content;
  }
  return {
    title: t ? decodeEntities(t[1].trim()) : undefined,
    description: metas.description,
    ogTitle: metas['og:title'],
    ogDescription: metas['og:description'],
    twTitle: metas['twitter:title'],
    twDescription: metas['twitter:description'],
  };
}

/** Problems with one page's meta lengths; each message names the page, the count and the text. */
export function metaProblems(path, html) {
  const m = headMeta(html);
  const out = [];
  const q = (s) => JSON.stringify(s);
  if (m.title === undefined) out.push(`${path}: title missing`);
  else if (metaLen(m.title) > TITLE_MAX) out.push(`${path}: title ${metaLen(m.title)} > ${TITLE_MAX}: ${q(m.title)}`);
  if (m.description === undefined) out.push(`${path}: meta description missing`);
  else {
    const n = metaLen(m.description);
    if (n < DESC_MIN) out.push(`${path}: description ${n} < ${DESC_MIN}: ${q(m.description)}`);
    if (n > DESC_MAX) out.push(`${path}: description ${n} > ${DESC_MAX}: ${q(m.description)}`);
  }
  if (m.ogTitle !== m.title) out.push(`${path}: og:title ${q(m.ogTitle)} differs from title ${q(m.title)}`);
  if (m.twTitle !== m.title) out.push(`${path}: twitter:title ${q(m.twTitle)} differs from title ${q(m.title)}`);
  if (m.ogDescription !== m.twDescription)
    out.push(`${path}: og:description ${q(m.ogDescription)} differs from twitter:description ${q(m.twDescription)}`);
  if (m.ogDescription !== undefined && metaLen(m.ogDescription) > OG_DESC_MAX)
    out.push(`${path}: og:description ${metaLen(m.ogDescription)} > ${OG_DESC_MAX}: ${q(m.ogDescription)}`);
  return out;
}
