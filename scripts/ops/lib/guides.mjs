// Guide and preset data for the ops jobs, read from the repository without a build: the guide frontmatter
// (src/content/guides/*.md, the shape of src/data/guide-schema.ts) and the official id-photo presets
// (src/data/id-photo-presets.ts). Only the fields the jobs need are parsed: title, query, draft, sources.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './common.mjs';

/** A YAML scalar as the guides write it: plain, 'single' ('' escapes ') or "double" quoted. */
export function unquote(v) {
  const s = v.trim();
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'");
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try {
      return JSON.parse(s);
    } catch {
      return s.slice(1, -1);
    }
  }
  return s;
}

/**
 * @typedef {{ url?: string, title?: string, quote?: string, retrieved?: string, preset?: string }} Source
 * @typedef {{ title: string, query: string, draft: boolean, sources: Source[] }} Frontmatter
 */

/**
 * The frontmatter fields the ops jobs use. sources: [{ url, title, quote } | { preset }].
 * @param {string} md
 * @returns {Frontmatter | null}
 */
export function parseFrontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  if (!m) return null;
  const lines = m[1].split(/\r?\n/);
  /** @type {Frontmatter} */
  const out = { title: '', query: '', draft: false, sources: [] };
  let inSources = false;
  /** @type {Source | null} */
  let item = null;
  for (const line of lines) {
    const top = /^([A-Za-z]\w*):\s*(.*)$/.exec(line);
    if (top) {
      inSources = top[1] === 'sources';
      item = null;
      if (top[1] === 'title') out.title = unquote(top[2]);
      else if (top[1] === 'query') out.query = unquote(top[2]);
      else if (top[1] === 'draft') out.draft = unquote(top[2]) === 'true';
      continue;
    }
    if (!inSources) continue;
    const start = /^\s*-\s+(\w+):\s*(.*)$/.exec(line);
    if (start) {
      item = { [start[1]]: unquote(start[2]) };
      out.sources.push(item);
      continue;
    }
    const field = /^\s+(\w+):\s*(.*)$/.exec(line);
    if (field && item) item[field[1]] = unquote(field[2]);
  }
  return out;
}

/**
 * Every guide: { slug, path, title, query, draft, sources }.
 * @returns {({ slug: string, path: string } & Frontmatter)[]}
 */
export function readGuides(root = ROOT) {
  const dir = join(root, 'src', 'content', 'guides');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const fm = parseFrontmatter(readFileSync(join(dir, f), 'utf8'));
      const slug = f.replace(/\.md$/, '');
      return { slug, path: `/guide/${slug}/`, title: '', query: '', draft: false, sources: [], ...fm };
    });
}

const tsString = (s) => {
  const q = s[0];
  return s.slice(1, -1).replace(new RegExp(`\\\\${q}`, 'g'), q).replace(/\\\\/g, '\\');
};
const STRING = String.raw`'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"`;

/**
 * The official presets of src/data/id-photo-presets.ts: { id, label, urls, quote }. URLs written as a
 * constant (PASSPORT_RULE_URL) are resolved from the file's `const NAME = '…'` declarations.
 */
export function parsePresets(ts) {
  const consts = Object.fromEntries([...ts.matchAll(new RegExp(String.raw`const\s+([A-Z_][A-Z0-9_]*)\s*=\s*(${STRING})`, 'g'))].map((m) => [m[1], tsString(m[2])]));
  const blocks = ts.split(/\n\s*\{\s*\n(?=\s*id:\s*')/).slice(1);
  const out = [];
  for (const b of blocks) {
    const id = /id:\s*'([^']+)'/.exec(b)?.[1];
    const status = /status:\s*'([^']+)'/.exec(b)?.[1];
    if (!id || status !== 'official') continue;
    const label = /label:\s*'([^']+)'/.exec(b)?.[1] ?? id;
    const urlsSrc = /sourceUrls:\s*\[([\s\S]*?)\]/.exec(b)?.[1] ?? '';
    const urls = [...urlsSrc.matchAll(new RegExp(String.raw`(${STRING})|([A-Z_][A-Z0-9_]*)`, 'g'))]
      .map((m) => (m[1] ? tsString(m[1]) : consts[m[2]]))
      .filter(Boolean);
    const q = new RegExp(String.raw`quote:\s*(${STRING})`).exec(b)?.[1];
    out.push({ id, label, urls, quote: q ? tsString(q) : '' });
  }
  return out;
}

export const readPresets = (root = ROOT) => parsePresets(readFileSync(join(root, 'src', 'data', 'id-photo-presets.ts'), 'utf8'));

/**
 * What the source watch checks: one entry per (quote, url set), with the pages that cite it. A guide's URL
 * source must hold its quote at that URL; a preset quote must be found across the preset's URLs (it joins
 * sentences from more than one official page). Presets are also cited by the /id-photo/ tool itself.
 */
export function watchList(guides, presets) {
  const byKey = new Map();
  const add = (pagePath, urls, quote, origin) => {
    const key = `${urls.join(' ')}\n${quote}`;
    const e = byKey.get(key) ?? { urls, quote, origin, pages: [] };
    if (!e.pages.includes(pagePath)) e.pages.push(pagePath);
    byKey.set(key, e);
  };
  const presetById = new Map(presets.map((p) => [p.id, p]));
  for (const p of presets) add('/id-photo/', p.urls, p.quote, `preset ${p.id}`);
  for (const g of guides) {
    if (g.draft) continue;
    for (const s of g.sources) {
      if (s.url && s.quote) add(g.path, [s.url], s.quote, `guide ${g.slug}`);
      else if (s.preset && presetById.has(s.preset)) {
        const p = presetById.get(s.preset);
        add(g.path, p.urls, p.quote, `preset ${p.id}`);
      }
    }
  }
  return [...byKey.values()];
}
