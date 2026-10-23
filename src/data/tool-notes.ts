// CONTENT1021 D8: the tool notes (src/content/tool-notes/<tool-slug>.md), one per Korean tool page, rendered by
// src/components/ToolNotes.astro between the page's 알아 두면 좋아요 and FAQ blocks. The prose lives in Markdown (the
// system font, like the guides: gen-ui-font does not scan .md), so it never grows the preloaded UI font. Front matter:
// `sources` (same shapes as a guide's) and `toolFacts` (refs into src/data/tool-facts.ts); a number with a unit in the
// body that neither backs fails the build, like a guide. Schema: src/data/tool-note-schema.ts.
import { unsourcedFacts } from './guide-facts';
import { TOOL_FACTS, isToolFactRef } from './tool-facts';
import type { ToolNoteData } from './tool-note-schema';
import { ADDR_EN_TOOL, BG_REMOVE_TOOL, ID_CAMERA_TOOL, TOOLS } from './tools';

/** Every Korean tool page that may be built: the live tools plus the flag-gated pages, whatever this build's flags. */
export const NOTE_SLUGS: readonly string[] = [...new Set([...TOOLS.map((t) => t.slug), BG_REMOVE_TOOL.slug, ADDR_EN_TOOL.slug, ID_CAMERA_TOOL.slug])];

/** Problems of one note (empty = ok): an unknown tool slug, a wrong tool fact, a number with a unit nothing backs. */
export function toolNoteProblems(slug: string, data: ToolNoteData, body: string): string[] {
  const out: string[] = [];
  if (!NOTE_SLUGS.includes(slug)) out.push(`"${slug}" is not a Korean tool page`);
  for (const f of data.toolFacts) {
    if (!isToolFactRef(f.ref)) out.push(`toolFact "${f.ref}" is not in src/data/tool-facts.ts`);
    else if (TOOL_FACTS[f.ref].value !== f.value) out.push(`toolFact "${f.ref}" is ${String(TOOL_FACTS[f.ref].value)}, the note says ${String(f.value)}`);
  }
  const unsourced = unsourcedFacts(data, body);
  if (unsourced.length) out.push(`numbers without a source: ${unsourced.join(', ')}`);
  return out;
}

/** The only flag a tool note may gate a passage on (PRINT1023 A): `<span data-requires="id-camera">…</span>` in the Markdown. */
const CAMERA_SPAN = /<span data-requires="id-camera">([\s\S]*?)<\/span>(\s*)/g;

/**
 * The rendered note HTML for this build: with 증명사진 촬영 on (PUBLIC_ID_CAMERA) a marked passage loses only its wrapper,
 * so the page reads as before; off, the passage and the space after it go. Any other or leftover marker fails the build.
 */
export function gateNoteHtml(html: string, idCamera: boolean): string {
  const out = html.replace(CAMERA_SPAN, (_, inner: string, space: string) => {
    // The pattern stops at the first </span>, so an inner span would cut the passage short (review A, Should Fix 1).
    if (inner.includes('<span')) throw new Error('tool note: an id-camera passage may not contain its own <span>');
    return idCamera ? inner + space : '';
  });
  if (out.includes('data-requires=')) throw new Error('tool note: a data-requires marker gateNoteHtml does not handle (only id-camera, not nested)');
  return out;
}
