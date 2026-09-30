// Published guides (Growth G.1): drafts are never rendered, linked, listed or submitted.
import { getCollection, type CollectionEntry } from 'astro:content';
import type { Category, GuideData } from './guide-schema';

/** A published guide (drafts carry a different, smaller frontmatter and are never rendered). */
export type Guide = Omit<CollectionEntry<'guides'>, 'data'> & { data: GuideData };

const isPublished = (e: CollectionEntry<'guides'>): e is Guide => e.data.draft === false;

export const guidePath = (slug: string): string => `/guide/${slug}/`;

/** Every published guide, in a stable order (category, then title). */
export async function publishedGuides(): Promise<Guide[]> {
  const all = (await getCollection('guides')).filter(isPublished);
  return all.sort((a, b) => a.data.category.localeCompare(b.data.category, 'ko') || a.data.title.localeCompare(b.data.title, 'ko'));
}

/** Published guides by slug, in the given order; a missing or draft slug is dropped (with a build warning). */
export async function guidesBySlug(slugs: readonly string[], from: string): Promise<Guide[]> {
  const all = await publishedGuides();
  const out: Guide[] = [];
  for (const s of slugs) {
    const g = all.find((x) => x.id === s);
    if (g) out.push(g);
    else console.warn(`[guides] ${from}: "${s}" is not a published guide; link dropped`);
  }
  return out;
}

/** Published guides that point at a tool (the tool pages' "관련 안내"), at most `max`. */
export async function guidesForTool(slug: string, max = 4): Promise<Guide[]> {
  return (await publishedGuides()).filter((g) => g.data.tools.includes(slug)).slice(0, max);
}

export const CATEGORY_ORDER: readonly Category[] = ['사진', 'PDF', '한글파일'];
