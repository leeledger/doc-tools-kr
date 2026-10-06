// Published guides (Growth G.1): drafts are never rendered, linked, listed or submitted. Hubs (G2 A1) live in
// their own collection and are listed with the guides wherever all /guide/ pages are (sitemap, RSS, llms.txt).
import { getCollection, type CollectionEntry } from 'astro:content';
import { TOPICS, type GuideData, type Topic } from './guide-schema';
import type { HubData } from './hub-schema';
import { orderToolGuides } from './tool-guide-order';

/** A published guide (drafts carry a different, smaller frontmatter and are never rendered). */
export type Guide = Omit<CollectionEntry<'guides'>, 'data'> & { data: GuideData };
export type Hub = Omit<CollectionEntry<'hubs'>, 'data'> & { data: HubData };

const isPublished = (e: CollectionEntry<'guides'>): e is Guide => e.data.draft === false;

export const guidePath = (slug: string): string => `/guide/${slug}/`;

/** Every published guide, in a stable order (category, then title). */
export async function publishedGuides(): Promise<Guide[]> {
  const all = (await getCollection('guides')).filter(isPublished);
  return all.sort((a, b) => a.data.category.localeCompare(b.data.category, 'ko') || a.data.title.localeCompare(b.data.title, 'ko'));
}

/** The hub pages, by slug. */
export async function hubs(): Promise<Hub[]> {
  return (await getCollection('hubs')).sort((a, b) => a.id.localeCompare(b.id)) as Hub[];
}

/** One hub; a missing file fails the build. */
export async function hubBySlug(slug: string): Promise<Hub> {
  const h = (await hubs()).find((x) => x.id === slug);
  if (!h) throw new Error(`hub "${slug}" has no src/content/hubs/${slug}.md`);
  return h;
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
 * Next-step guides of a tool, after the guides that name it (at most 3 per tool): HWP PDF 변환 → the PDF guides;
 * HWP·HWPX 파일 보기 → the three HWP guides (G2 A0); PDF 합치기 → 대학 원서 서류 (G2 A1); 전자서명·도장 이미지 만들기 → its two guides (Sprint C, C1);
 * 사진 PDF 변환 → 대학 원서 서류 (A4 PDF로 내는 서류), PDF 합치기, PDF 용량 줄이기 (TOOLS4 T2).
 */
const NEXT_GUIDES: Readonly<Record<string, readonly string[]>> = {
  'hwp-to-pdf': ['pdf-compress', 'pdf-merge', 'email-attachment-limit'],
  'hwp-viewer': ['open-hwp-without-hangul', 'hwp-on-phone', 'what-is-hwpx'],
  'pdf-merge': ['univ-docs-upload'],
  'stamp-signature': ['stamp-image', 'e-signature-law'],
  'jpg-to-pdf': ['univ-docs-upload', 'pdf-merge', 'pdf-compress'],
};

/** Published guides that point at a tool (the tool pages' "관련 안내"; pinned ones first, ./tool-guide-order), then its next-step guides, at most `max`. */
export async function guidesForTool(slug: string, max = 4): Promise<Guide[]> {
  const all = await publishedGuides();
  const own = orderToolGuides(slug, all.filter((g) => g.data.tools.includes(slug)));
  const next = (NEXT_GUIDES[slug] ?? []).map((s) => all.find((g) => g.id === s)).filter((g): g is Guide => !!g && !own.includes(g));
  return [...own, ...next].slice(0, max);
}


/** The /guide/ index groups (G2 A1): TOPICS order, empty topics left out, each guide exactly once. */
export function topicGroups(guides: readonly Guide[]): { topic: Topic; items: Guide[] }[] {
  return TOPICS.map((topic) => ({ topic, items: guides.filter((g) => g.data.topic === topic) })).filter((g) => g.items.length > 0);
}
