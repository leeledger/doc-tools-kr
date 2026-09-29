import type { APIRoute } from 'astro';
import { LIVE_TOOLS } from '../data/tools';

export const GET: APIRoute = ({ site }) => {
  const paths = ['/', ...LIVE_TOOLS.map((t) => `/${t.slug}/`), '/privacy/', '/licenses/'];
  const urls = paths.map((p) => `  <url><loc>${new URL(p, site).href}</loc></url>`).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
