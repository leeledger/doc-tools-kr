// CONTENT1021 D8: the tool-note front matter (src/content/tool-notes/<tool-slug>.md; src/content.config.ts). `sources` has
// the same shapes as a guide's; `toolFacts` are refs into src/data/tool-facts.ts. Both default to []. The checks that need
// the tool list (src/data/tool-notes.ts) run in src/components/ToolNotes.astro and the unit tests.
import { z } from 'astro/zod';
import { presetSource, urlSource } from './guide-schema';

export const toolNoteSchema = z
  .object({
    sources: z.array(z.union([presetSource, urlSource])).default([]),
    toolFacts: z.array(z.object({ ref: z.string(), value: z.union([z.number(), z.string()]) }).strict()).default([]),
  })
  .strict();

export type ToolNoteData = z.infer<typeof toolNoteSchema>;
