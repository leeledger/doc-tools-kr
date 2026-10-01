import type { APIRoute } from 'astro';
import { LIVE_TOOLS } from '../data/tools';
import { LEGAL_UPDATED } from '../data/legal';
import { guidePath, hubs, publishedGuides } from '../data/guides';

// Every indexable page with its lastmod (Growth G.3). Never a query URL: deep links canonicalize to the tool page.
export const GET: APIRoute = async ({ site }) => {
  const guides = await publishedGuides();
  const max = (dates: string[]): string => dates.reduce((a, b) => (b > a ? b : a));
  const tools = LIVE_TOOLS.map((t) => [`/${t.slug}/`, t.updated] as const);
  const guideRows = [...(await hubs()), ...guides].map((g) => [guidePath(g.id), g.data.updated] as const);
  const guideIndex = guideRows.length ? [['/guide/', max(guideRows.map((r) => r[1]))] as const] : [];
  const rows: (readonly [string, string])[] = [
    ['/', max([...tools, ...guideIndex].map((r) => r[1]))],
    ...tools,
    ...guideIndex,
    ...guideRows,
    ['/privacy/', LEGAL_UPDATED],
    ['/terms/', LEGAL_UPDATED],
    ['/licenses/', LEGAL_UPDATED],
  ];
  const urls = rows.map(([p, d]) => `  <url><loc>${new URL(p, site).href}</loc><lastmod>${d}</lastmod></url>`).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
