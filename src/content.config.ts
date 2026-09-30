// Content collections (Growth G.1): the /guide/ pages, one Markdown file each in src/content/guides/. The zod
// schema (src/data/guide-schema.ts) fails the build on a violation. Drafts are never rendered.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { guideSchema } from './data/guide-schema';

const guides = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/guides' }),
  schema: guideSchema,
});

export const collections = { guides };
