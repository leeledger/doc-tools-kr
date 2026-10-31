// SEARCH1031 D5: the entries of /search-index.json, built at build time (src/pages/search-index.json.ts) and by the
// golden-query unit test from the same functions. Never imported by page code (tools.ts imports the tool limits).
import type { Tool } from '../../data/tools';
import type { GuideDoc, SearchIndex, ToolDoc } from './match';

/**
 * A tool: url, name, summary, copywriting keywords (tools.ts: never a meta keywords tag; here they only feed the
 * matcher) and FAQ questions without their answers.
 */
export function toolEntry(t: Pick<Tool, 'slug' | 'name' | 'summary' | 'keywords' | 'faq'>): ToolDoc {
  return { u: `/${t.slug}/`, n: t.name, s: t.summary, k: [...t.keywords], f: t.faq.map((x) => x.q) };
}

/** A guide (title, search query, category) or a hub (no query; category 규격 모음). */
export function guideEntry(slug: string, d: { title: string; query?: string; category?: string }): GuideDoc {
  return { u: `/guide/${slug}/`, n: d.title, q: d.query ?? '', c: d.category ?? '규격 모음' };
}

export function searchIndex(tools: ToolDoc[], guides: GuideDoc[]): SearchIndex {
  return { v: 1, t: tools, g: guides };
}
