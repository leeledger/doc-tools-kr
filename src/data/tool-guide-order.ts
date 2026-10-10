// The order of a tool page's "관련 안내" (G2 A2, Arch ruling 1): guides pinned here come first, in search-demand
// order; every other guide that names the tool follows in the stable category-then-title order. G2 A3: the PDF
// tools pin their own how-to guide, which the Hangul-titled A3 guides would otherwise push off the list (Korean
// collation puts "PDF …" after them). Pure, so the unit tests check it without the content collection.

/** Per tool: guide slugs shown first, most searched first. */
export const TOOL_GUIDE_PINS: Readonly<Record<string, readonly string[]>> = {
  'id-photo': ['passport-photo', 'photo-kb'],
  'pdf-merge': ['pdf-merge'],
  'pdf-compress': ['pdf-compress'],
  // TOOL-GUIDES: each of these tools pins its own how-to guide (slug = tool slug).
  'jpg-to-pdf': ['jpg-to-pdf'],
  'pdf-to-jpg': ['pdf-to-jpg'],
  'pdf-split': ['pdf-split'],
  'pdf-sign': ['pdf-sign'],
  'hwpx-to-hwp': ['hwpx-to-hwp'],
  // Part B: shown only in builds with PUBLIC_BG_REMOVE on (the guide requires bg-remove; the tool page exists only then).
  'remove-background': ['remove-background'],
};

/** `guides` (already in the stable order) with the tool's pinned slugs moved to the front, in pin order. */
export function orderToolGuides<T extends { id: string }>(slug: string, guides: readonly T[]): T[] {
  const pins = TOOL_GUIDE_PINS[slug] ?? [];
  const pinned = pins.map((id) => guides.find((g) => g.id === id)).filter((g): g is T => !!g);
  return [...pinned, ...guides.filter((g) => !pinned.includes(g))];
}
