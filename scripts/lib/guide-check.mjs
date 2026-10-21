// The content gates of CONTENT1021 D5 (check-dist wires them; tests/unit/guide-check.test.ts feeds fixtures). Pure
// functions: no file system access except through the `readFile` callback the caller passes.
//   D5.1/D5.2 length (bars and metrics: ./guide-length.mjs) · D5.3 own figures · D5.4 SVG safety
//   D5.5 no shared ≥60-code-point block across pages (guides and hubs; tool notes, D8) · D5.6 merged (301) guide paths gone from dist.
import { createHash } from 'node:crypto';
import { LENGTH_PENDING, countChars, proseText } from './guide-length.mjs';

/** D1: the merged guides, old path → survivor (public/_redirects carries both spellings of each, 301). */
export const MERGED_GUIDES = {
  '/guide/id-photo-size/': '/guide/photo-sizes/',
  '/guide/id-photo-kb/': '/guide/photo-kb/',
  '/guide/passport-photo-error/': '/guide/passport-reissue-photo/',
  '/guide/pdf-merge-free/': '/guide/pdf-merge/',
};

/** Image caps (D5.3), bytes. */
export const SVG_MAX = 30 * 1024;
export const RASTER_MAX = 80 * 1024;
/** Shortest alt text, code points. */
export const ALT_MIN = 10;
/** A shared block this long (code points, no whitespace) or longer fails D5.5. */
export const DUP_BLOCK_MIN = 60;
/** Aspect tolerance of the width/height attributes against the file (D5.3). */
export const ASPECT_TOL = 0.01;

/**
 * D5.1/D5.2: the pages a rule expects, each `{ key, chars }` (`chars` null: no page or no counted body). Under the bar
 * is an error, or a warning for a key in `pending`; a pending key that passes is an error (take it off the list).
 */
export function lengthProblems(pages, min, label, pending = LENGTH_PENDING) {
  const errors = [];
  const warnings = [];
  for (const { key, chars } of pages) {
    if (chars === null) errors.push(`${label} ${key}: not in dist or no counted body`);
    else if (chars < min) (pending.has(key) ? warnings : errors).push(`${label} ${key}: ${chars} characters < ${min}${pending.has(key) ? ' (LENGTH_PENDING)' : ''}`);
    else if (pending.has(key)) errors.push(`${label} ${key}: ${chars} ≥ ${min} but still in LENGTH_PENDING (remove it)`);
  }
  return { errors, warnings };
}

/** Every `<tag …>…</tag>` element (balanced) of `html`: { open, inner, index }. */
export function elements(html, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, 'gi');
  const out = [];
  const stack = [];
  for (const m of html.matchAll(re)) {
    if (m[0][1] !== '/') stack.push(m);
    else {
      const o = stack.pop();
      if (o) out.push({ open: o[0], inner: html.slice(o.index + o[0].length, m.index), index: o.index });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
};

/** The div.guide-body of a built guide or hub, up to its FAQ section ('' when none). */
export function guideBody(html) {
  const i = html.indexOf('<div class="guide-body">');
  if (i < 0) return '';
  const end = html.indexOf('<section class="guide-faq"', i);
  return html.slice(i, end > i ? end : undefined);
}

/** D8: the inner HTML of a built tool page's section.tool-notes ('' when none). */
export function toolNotes(html) {
  return elements(html, 'section').find((e) => /\bclass="tool-notes"/.test(e.open))?.inner ?? '';
}

/** Intrinsic size of an SVG (viewBox, else width/height), PNG or WebP file; null when unreadable. */
export function imageSize(buf, ext) {
  if (ext === 'svg') {
    const root = /<svg\b[^>]*>/.exec(buf.toString('utf8'))?.[0];
    if (!root) return null;
    const vb = attr(root, 'viewBox')?.trim().split(/[\s,]+/).map(Number);
    if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { w: vb[2], h: vb[3] };
    const w = Number.parseFloat(attr(root, 'width') ?? '');
    const h = Number.parseFloat(attr(root, 'height') ?? '');
    return w > 0 && h > 0 ? { w, h } : null;
  }
  if (ext === 'png') {
    if (buf.length < 24 || buf.toString('latin1', 1, 4) !== 'PNG') return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (ext === 'webp') {
    if (buf.length < 30 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
    const kind = buf.toString('latin1', 12, 16);
    if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  }
  return null;
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * D5.3: the figures of one guide/hub page. `readFile(distPath)` returns a Buffer or null. Returns the problems and the
 * images it read ({ src, hash }) for the site-wide hash rule.
 */
export function figureProblems(html, slug, readFile) {
  const problems = [];
  const images = [];
  const body = guideBody(html);
  const firstH2 = body.search(/<h2[\s>]/);
  const own = `/img/guide/${slug}/`;
  let good = 0;
  const figs = elements(body, 'figure').filter((f) => /\bclass="guide-fig"/.test(f.open));
  for (const f of figs) {
    const img = /<img\b[^>]*>/.exec(f.inner)?.[0];
    const src = img ? attr(img, 'src') : null;
    const where = `figure ${src ?? '(no img)'}`;
    const before = problems.length;
    if (firstH2 < 0 || f.index < firstH2) problems.push(`${where}: before the first H2`);
    if (!img || !src) {
      problems.push(`${where}: no <img src>`);
      continue;
    }
    if (!src.startsWith(own) || src.includes('..')) problems.push(`${where}: not under ${own}`);
    const ext = /\.(svg|webp|png)$/.exec(src)?.[1];
    if (!ext) problems.push(`${where}: not .svg, .webp or .png`);
    const alt = attr(img, 'alt');
    if (alt === null || [...alt.trim()].length < ALT_MIN) problems.push(`${where}: alt under ${ALT_MIN} characters`);
    if (attr(img, 'loading') !== 'lazy') problems.push(`${where}: no loading="lazy"`);
    if (attr(img, 'decoding') !== 'async') problems.push(`${where}: no decoding="async"`);
    if (!/<figcaption\b[^>]*>[\s\S]*?\S[\s\S]*?<\/figcaption>/.test(f.inner)) problems.push(`${where}: no figcaption`);
    const W = attr(img, 'width');
    const H = attr(img, 'height');
    const sized = W !== null && H !== null && /^[1-9]\d*$/.test(W) && /^[1-9]\d*$/.test(H);
    if (!sized) problems.push(`${where}: width/height not positive integers`);
    const buf = ext ? readFile(src.slice(1)) : null;
    if (ext && !buf) problems.push(`${where}: file not in dist`);
    if (buf && ext) {
      images.push({ src, hash: sha256(buf) });
      const max = ext === 'svg' ? SVG_MAX : RASTER_MAX;
      if (buf.length > max) problems.push(`${where}: ${buf.length} bytes > ${max}`);
      const size = imageSize(buf, ext);
      if (!size) problems.push(`${where}: size unreadable`);
      else if (sized) {
        const a = Number(W) / Number(H);
        const b = size.w / size.h;
        if (Math.abs(a - b) / b > ASPECT_TOL) problems.push(`${where}: ${W}×${H} does not match the file's ${size.w}×${size.h}`);
      }
    }
    if (problems.length === before) good++;
  }
  if (good < 2) problems.push(`${good} valid own figure(s), needs 2`);
  return { problems, images };
}

/** D5.3: an image hash used by two different srcs. images: { page, src, hash }[]. */
export function duplicateImages(images) {
  const by = new Map();
  const out = [];
  for (const i of images) {
    const prev = by.get(i.hash);
    if (prev && prev.src !== i.src) out.push(`${i.src} (${i.page}) has the same bytes as ${prev.src} (${prev.page})`);
    else if (!prev) by.set(i.hash, i);
  }
  return out;
}

/** D5.4: SVG safety. */
export function svgProblems(svg) {
  const p = [];
  if (/<script\b/i.test(svg)) p.push('<script>');
  if (/<foreignObject\b/i.test(svg)) p.push('<foreignObject>');
  if (/<image\b/i.test(svg)) p.push('<image>');
  if (/<[^>]*\son[a-z]+\s*=/i.test(svg)) p.push('on* attribute');
  for (const m of svg.matchAll(/\s(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)) if (!m[1].startsWith('#')) p.push(`href ${m[1]}`);
  if (/\s(?:xlink:)?href\s*=\s*[^"'#\s]/i.test(svg)) p.push('unquoted href');
  if (/<(?:set|animate)\b[^>]*attributeName\s*=\s*["']?(?:xlink:)?href/i.test(svg)) p.push('<set>/<animate> on href');
  if (/@import\b/i.test(svg)) p.push('@import');
  if (/@font-face\b/i.test(svg)) p.push('@font-face');
  for (const m of svg.matchAll(/url\(\s*['"]?([^)'"]*)/gi)) if (!m[1].startsWith('#')) p.push(`url(${m[1]})`);
  if (!/<svg\b[^>]*\srole="img"/.test(svg)) p.push('no role="img"');
  if (!/<title\b[^>]*>[^<]*\S[^<]*<\/title>/.test(svg)) p.push('no <title>');
  return p;
}

/** The text nodes of an SVG (title, text, tspan…), entities decoded: what the per-guide fact check reads. */
export const svgText = (svg) => proseText(svg.replace(/<[^>]+>/g, '\n'));

/** D5.5: the p, li, blockquote and figcaption blocks of a fragment that are ≥ DUP_BLOCK_MIN code points (no whitespace). */
export function longBlocks(fragment) {
  const out = new Set();
  for (const tag of ['p', 'li', 'blockquote', 'figcaption']) {
    for (const e of elements(fragment, tag)) {
      const t = proseText(e.inner).replace(/\s/g, '');
      if (countChars(t) >= DUP_BLOCK_MIN) out.add(t);
    }
  }
  return out;
}

/** D5.5: blocks shared by two different pages. pages: [name, fragment][] → messages. */
export function sharedBlocks(pages) {
  const seen = new Map();
  const out = [];
  for (const [name, fragment] of pages) {
    for (const b of longBlocks(fragment)) {
      const prev = seen.get(b);
      if (prev === undefined) seen.set(b, name);
      else if (prev !== name) out.push(`${name} repeats a block of ${prev}: 「${[...b].slice(0, 40).join('')}…」`);
    }
  }
  return out;
}

/** D5.6: dist text files that name a merged path (any spelling of the slug after /guide/). files: [path, text][]. */
export function oldPathHits(files, merged = MERGED_GUIDES) {
  const res = Object.keys(merged).map((p) => [p, new RegExp(`${p.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`)]);
  const out = [];
  for (const [path, text] of files) {
    if (path === '_redirects') continue;
    for (const [p, re] of res) if (re.test(text)) out.push(`${path} names ${p}`);
  }
  return out;
}

