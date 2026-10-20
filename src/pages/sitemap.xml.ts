import type { APIRoute } from 'astro';
import { LIVE_TOOLS } from '../data/tools';
import { PRIVACY_TERMS_UPDATED } from '../data/legal';
import { OPERATOR_ON } from '../data/site';
import { ABOUT_UPDATED } from '../data/about';
import { guidePath, hubs, publishedGuides } from '../data/guides';
import { TOOLS_EN, enTwin } from '../i18n/en/tools';
import { EN_LEGAL_UPDATED } from '../i18n/en/legal';

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
    // ADS1020 D12: /embed/ and /licenses/ are noindex and left out; /about/ and /contact/ only when they are built.
    ...(OPERATOR_ON ? ([['/about/', ABOUT_UPDATED], ['/contact/', ABOUT_UPDATED]] as const) : []),
    ['/privacy/', PRIVACY_TERMS_UPDATED],
    ['/terms/', PRIVACY_TERMS_UPDATED],
  ];
  // EN1 (brief EN decision 7): the English pages, and on both twins of a pair the same three alternates (ko, en, and
  // x-default). ADS1020 D13: x-default = the Korean URL (Korean is the primary audience). The sitemap is the only hreflang
  // method: no link tags, no HTTP headers.
  const enTools = TOOLS_EN.map((t) => [`/en/${t.slug}/`, t.updated] as const);
  const enRows: (readonly [string, string])[] = [
    ['/en/', max(enTools.map((r) => r[1]))],
    ...enTools,
    ['/en/privacy/', EN_LEGAL_UPDATED],
    ['/en/terms/', EN_LEGAL_UPDATED],
  ];
  const abs = (p: string): string => new URL(p, site).href;
  const alternates = (p: string): string => {
    const ko = p.startsWith('/en/') ? p.slice(3) : p;
    const en = enTwin(ko);
    if (!en) return '';
    const link = (lang: string, href: string): string => `<xhtml:link rel="alternate" hreflang="${lang}" href="${abs(href)}"/>`;
    return link('ko', ko) + link('en', en) + link('x-default', ko);
  };
  const urls = [...rows, ...enRows].map(([p, d]) => `  <url><loc>${abs(p)}</loc><lastmod>${d}</lastmod>${alternates(p)}</url>`).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
