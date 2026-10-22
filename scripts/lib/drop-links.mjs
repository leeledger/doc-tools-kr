// Markdown hast plugin for Astro's Sätteri processor (IDCAM1022 E): drops every paragraph or list item of a Markdown
// page (guides, hubs, tool notes) that links a page this build does not have, so a guide shown in every build can
// point at a flag-gated page (PUBLIC_ID_CAMERA off: /id-photo-camera/ and its guide) without a dead link. Such a
// link must stand in its own paragraph or list item; the whole block goes. astro.config.mjs adds it only when there
// is a hidden path, so a build with every flag on keeps Astro's default processor untouched.

const BLOCKS = new Set(['p', 'li']);

/**
 * Visits one <a>: when its href starts with a hidden path, removes the nearest p/li around it (once per block).
 * `ctx` is the Sätteri hast visitor context (parent, removeNode); `removed` remembers the blocks already dropped.
 */
export function dropLinkBlock(node, ctx, paths, removed) {
  const href = String(node.properties?.href ?? '');
  if (!paths.some((p) => href.startsWith(p))) return;
  let block = ctx.parent(node);
  while (block && !(block.type === 'element' && BLOCKS.has(block.tagName))) block = ctx.parent(block);
  if (!block || removed.has(block)) return;
  removed.add(block);
  ctx.removeNode(block);
}

/** The plugin entry for satteri({ hastPlugins }): a fresh definition per compile. */
export function dropLinksPlugin(paths) {
  return () => {
    const removed = new Set();
    return {
      name: 'drop-hidden-links',
      element: {
        filter: ['a'],
        visit(node, ctx) {
          dropLinkBlock(node, ctx, paths, removed);
        },
      },
    };
  };
}
