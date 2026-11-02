// SEARCH1031 D5: the site search index, fetched once by src/lib/search/ui.ts on first use. Live tools only (a flag-off
// tool has no entry), published guides and the hubs. The tools' keywords are copywriting reference (tools.ts) and are
// emitted here only as matcher input, never as a meta keywords tag. Budget (check-dist): 60 KB raw, 15 KB gzip.
import type { APIRoute } from 'astro';
import { LIVE_TOOLS } from '../data/tools';
import { hubs, publishedGuides } from '../data/guides';
import { guideEntry, searchIndex, toolEntry } from '../lib/search/build';

export const GET: APIRoute = async () => {
  const guides = (await publishedGuides()).map((g) => guideEntry(g.id, g.data));
  const hubList = (await hubs()).map((h) => guideEntry(h.id, { title: h.data.title }));
  const body = JSON.stringify(searchIndex(LIVE_TOOLS.map(toolEntry), [...hubList, ...guides]));
  return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
