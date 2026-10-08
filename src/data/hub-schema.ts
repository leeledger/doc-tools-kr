// The hub page contract (G2 A1): src/content/hubs/<slug>.md holds the intro (body), the FAQ and every table word,
// so the copy stays in Markdown (system font; gen-ui-font does not scan .md). The table rows come from
// src/data/hubs.ts. src/content.config.ts uses this for the `hubs` collection.
import { z } from 'astro/zod';

const len = (min: number, max: number) =>
  z.string().refine((s) => [...s].length >= min && [...s].length <= max, `${min}–${max} characters`);
const isoDate = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
);

/** Page title without " | 문서딱": the rendered title (with the suffix) is at most 40 code points (SEO-LENGTH). */
const SUFFIX_LEN = [...' | 문서딱'].length;
const pageTitle = z
  .string()
  .refine((s) => [...s].length >= 4, 'at least 4 characters')
  .refine((s) => [...s].length + SUFFIX_LEN <= 40, 'title with suffix over 40');

export const hubSchema = z
  .object({
    title: pageTitle,
    description: len(40, 80),
    ogDescription: len(10, 80),
    answer: len(10, 120),
    published: isoDate,
    updated: isoDate,
    /** Column headers: what the row is, size, file limit, file format, the guide, the tool link. */
    columns: z.object({ label: len(2, 12), size: len(2, 12), limit: len(2, 12), format: len(2, 12), guide: len(2, 12), fit: len(2, 12) }).strict(),
    /** Shown in an empty cell: the source does not state it. */
    none: len(2, 20),
    tables: z
      .array(z.object({ kind: z.enum(['photo', 'upload']), caption: len(4, 60), limitOnly: z.boolean().default(false) }).strict())
      .min(1)
      .max(2),
    related: z.array(z.string()).min(2).max(4),
    faq: z.array(z.object({ q: len(4, 80), a: len(10, 400) }).strict()).min(3).max(6),
    og: z.object({ title: len(2, 14), line: len(4, 34) }).strict(),
  })
  .strict();

export type HubData = z.infer<typeof hubSchema>;
