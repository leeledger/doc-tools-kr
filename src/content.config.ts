// Content collections (Growth G.1): the /guide/ pages, one Markdown file each in src/content/guides/, and the two
// hub pages (G2 A1) in src/content/hubs/, and the tool notes (CONTENT1021 D8) in src/content/tool-notes/ (one per Korean
// tool page; src/data/tool-note-schema.ts). The zod schemas (src/data/guide-schema.ts, src/data/hub-schema.ts) fail
// the build on a violation. Drafts are never rendered.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { guideSchema } from './data/guide-schema';
import { hubSchema } from './data/hub-schema';
import { toolNoteSchema } from './data/tool-note-schema';

const guides = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/guides' }),
  schema: guideSchema,
});

const hubs = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/hubs' }),
  schema: hubSchema,
});

const toolNotes = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/tool-notes' }),
  schema: toolNoteSchema,
});

export const collections = { guides, hubs, toolNotes };
