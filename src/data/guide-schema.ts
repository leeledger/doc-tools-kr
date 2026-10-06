// The guide frontmatter contract (Growth G.1). src/content.config.ts uses it for the `guides` collection, so a
// violation fails the build; tests/unit/guides-schema.test.ts parses every guide with it too.
import { z } from 'astro/zod';
import { getPreset, isSourced } from './id-photo-presets';
import { TOOL_FACTS, isToolFactRef } from './tool-facts';
import { LIVE_TOOLS } from './tools';
import { parseHref } from '../lib/ui/deeplink';
import { specProblems } from './guide-facts';

export const CATEGORIES = ['사진', 'PDF', '한글파일', '서류'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Reader-facing topics (G2 A1): the /guide/ index groups the guides by these, in this order. */
export const TOPICS = ['여권·신분증', '시험·자격증', '취업·이력서', '입시·장학', '세금·민원', 'PDF·메일', '사진 보내기', '한글파일', '서명·도장'] as const;
export type Topic = (typeof TOPICS)[number];

/** Korea Standard Time, UTC+9 (no daylight saving). */
const KST_OFFSET_MS = 9 * 3_600_000;

/** A source older than this at build time fails the dist test (T9): re-verify it (runbook, every January). */
export const MAX_SOURCE_AGE_DAYS = 400;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** YAML reads an unquoted 2026-09-30 as a Date; both spellings become the same ISO string. */
const isoDate = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string().regex(ISO, 'YYYY-MM-DD').refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'not a date'),
);

const len = (min: number, max: number) =>
  z.string().refine((s) => [...s].length >= min && [...s].length <= max, `${min}–${max} characters`);

const presetSource = z.object({ preset: z.string() }).strict();
const urlSource = z
  .object({
    url: z.string().regex(/^https:\/\/[^\s]+$/, 'https URL'),
    title: len(2, 80),
    quote: len(2, 300),
    retrieved: isoDate,
    /** The quote was read from the rendered page in a browser (the HTML is a script shell): source-watch lists it
     * for a manual check instead of fetching it (G2 A1). */
    via: z.literal('browser').optional(),
  })
  .strict();

const size = z.object({ w: z.number().positive(), h: z.number().positive() }).strict();
/**
 * A spec row (G2 A1): what the hubs (/guide/photo-sizes/, /guide/upload-limits/) build their tables from. Either
 * `preset` (every number comes from src/data/id-photo-presets.ts) or literal values, each of which the guide's own
 * quotes must back (the fact check). A row is data for the hubs; the guide body keeps its own table.
 */
export const specRowSchema = z
  .object({
    label: len(2, 40),
    kind: z.enum(['photo', 'upload']),
    preset: z.string().optional(),
    px: size.optional(),
    kb: z.number().positive().optional(),
    mb: z.number().positive().optional(),
    mm: size.optional(),
    format: len(2, 30).optional(),
    /** false: no tool of ours makes this file (e.g. a TIF scan), so the hub shows no tool link for the row. */
    fit: z.boolean().optional(),
    /** 1-based index of the source whose quote backs this row's numbers (G2 A3); default: the first quote stating them all. */
    source: z.number().int().positive().optional(),
  })
  .strict();

export const publishedGuideSchema = z
  .object({
    title: len(4, 40),
    description: len(50, 110),
    ogDescription: len(10, 80),
    query: z.string().min(2),
    answer: len(10, 120),
    published: isoDate,
    updated: isoDate,
    category: z.enum(CATEGORIES),
    topic: z.enum(TOPICS),
    tools: z.array(z.string()).min(1),
    cta: z.object({ href: z.string(), label: len(2, 30) }).strict(),
    related: z.array(z.string()).min(2).max(4),
    sources: z.array(z.union([presetSource, urlSource])).min(1),
    toolFacts: z.array(z.object({ ref: z.string(), value: z.union([z.number(), z.string()]) }).strict()).default([]),
    spec: z.array(specRowSchema).default([]),
    faq: z.array(z.object({ q: len(4, 80), a: len(10, 400) }).strict()).min(3).max(6),
    og: z.object({ title: len(2, 14), line: len(4, 34) }).strict(),
    season: z.object({ peak: z.string(), refresh: z.array(isoDate) }).strict().optional(),
    draft: z.literal(false).default(false),
  })
  .strict()
  .superRefine((g, ctx) => {
    for (const issue of guideProblems(g)) ctx.addIssue({ code: 'custom', message: issue });
  });

/**
 * A planned page whose facts are not quoted yet (Growth G.1 step 0): never rendered, linked or listed. It
 * records what blocks it and every official page tried, with the verbatim failure.
 */
export const draftGuideSchema = z
  .object({
    draft: z.literal(true),
    title: len(4, 40),
    query: z.string().min(2),
    blockedBy: z.string().min(4),
    publishBy: isoDate.optional(),
    tried: z.array(z.object({ url: z.string().regex(/^https:\/\//, 'https URL'), result: z.string().min(2), date: isoDate }).strict()).default([]),
  })
  .strict();

export const guideSchema = z.union([draftGuideSchema, publishedGuideSchema]);

export type GuideData = z.infer<typeof publishedGuideSchema>;
export type DraftGuideData = z.infer<typeof draftGuideSchema>;

/** Rules across fields (also run by the unit test). Empty when the guide is valid. */
export function guideProblems(
  g: Pick<GuideData, 'title' | 'answer' | 'published' | 'updated' | 'tools' | 'cta' | 'sources' | 'toolFacts'> & Partial<Pick<GuideData, 'spec'>>,
  now: Date = new Date(),
): string[] {
  const e: string[] = [];
  // Dates are Korean calendar days (the sources are read and dated in Korea): "today" is the date in KST (UTC+9).
  const today = new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
  if (g.updated < g.published) e.push(`updated ${g.updated} is before published ${g.published}`);
  for (const [k, v] of [['published', g.published], ['updated', g.updated]] as const) if (v > today) e.push(`${k} ${v} is in the future`);
  const year = g.title.match(/(?<!\d)(20\d\d)(?!\d)/)?.[1];
  if (year && year !== g.updated.slice(0, 4)) e.push(`the title says ${year} but updated is ${g.updated}`);
  // One sentence ending in 다 or 요 (optionally followed by a full stop).
  if (!/[다요]\.?$/.test(g.answer)) e.push('answer must end in 다 or 요');
  if (/[.?!]\s+\S/.test(g.answer)) e.push('answer must be one sentence');
  const live = LIVE_TOOLS.map((t) => t.slug);
  for (const t of g.tools) if (!live.includes(t)) e.push(`tool "${t}" is not a live tool`);
  if (!parseHref(g.cta.href, live)) e.push(`cta href "${g.cta.href}" is not a live tool link with a valid deep link`);
  let linked = 0;
  for (const s of g.sources) {
    if (!('preset' in s)) {
      linked++;
      continue;
    }
    const p = getPreset(s.preset);
    if (!p) e.push(`preset "${s.preset}" does not exist`);
    else if (isSourced(p) && p.sourceUrls.length) linked++;
    // An arithmetic preset (반명함판) backs its own numbers, which the page must call 계산값/일반 크기; it lists no source.
    else if (p.status !== 'arithmetic') e.push(`preset "${s.preset}" has no official source`);
  }
  if (!linked) e.push('at least one source must link to an official page');
  for (const f of g.toolFacts) {
    if (!isToolFactRef(f.ref)) e.push(`toolFact "${f.ref}" is not in src/data/tool-facts.ts`);
    else if (TOOL_FACTS[f.ref].value !== f.value) e.push(`toolFact "${f.ref}" is ${String(TOOL_FACTS[f.ref].value)}, the guide says ${String(f.value)}`);
  }
  e.push(...specProblems(g));
  return e;
}
