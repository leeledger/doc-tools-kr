import type { APIRoute } from 'astro';

/**
 * Search and answer engines named explicitly (Growth G.3). Training crawlers are not blocked either: the goal
 * is the widest reach (Arch decision; a policy change is one line here).
 */
const NAMED_BOTS = ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'Claude-SearchBot', 'Google-Extended', 'Bingbot', 'Yeti', 'Daumoa'];

export const GET: APIRoute = ({ site }) => {
  const groups = ['User-agent: *\nAllow: /', ...NAMED_BOTS.map((b) => `User-agent: ${b}\nAllow: /`)].join('\n\n');
  const body = `${groups}\n\nSitemap: ${new URL('/sitemap.xml', site).href}\nSitemap: ${new URL('/guide/rss.xml', site).href}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
