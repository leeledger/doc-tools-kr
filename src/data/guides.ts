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

/**
 * The next step after a tool no published guide points at yet: HWP PDF 변환 → the PDF guides (its own guides
 * stay drafts until an official Hancom source is fetched).
 */
const NEXT_GUIDES: Readonly<Record<string, readonly string[]>> = {
  'hwp-to-pdf': ['pdf-compress', 'pdf-merge', 'email-attachment-limit'],
};

/** Published guides that point at a tool (the tool pages' "관련 안내"), then its next-step guides, at most `max`. */
export async function guidesForTool(slug: string, max = 4): Promise<Guide[]> {
  const all = await publishedGuides();
  const own = all.filter((g) => g.data.tools.includes(slug));
  const next = (NEXT_GUIDES[slug] ?? []).map((s) => all.find((g) => g.id === s)).filter((g): g is Guide => !!g && !own.includes(g));
  return [...own, ...next].slice(0, max);
}

export const CATEGORY_ORDER: readonly Category[] = ['사진', 'PDF', '한글파일'];
