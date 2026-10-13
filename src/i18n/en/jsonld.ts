// JSON-LD for the English pages (EN1): WebApplication + BreadcrumbList + FAQPage per tool, WebSite + ItemList on /en/.
import { SITE_EN } from './site';
import type { ToolEn } from './tools';

export function toolJsonLdEn(tool: ToolEn, site: URL | undefined): Record<string, unknown>[] {
  const url = new URL(`/en/${tool.slug}/`, site).href;
  const home = new URL('/en/', site).href;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: `${tool.name} — ${SITE_EN.name}`,
      url,
      description: tool.description,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any (web browser)',
      inLanguage: 'en',
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_EN.name, item: home },
        { '@type': 'ListItem', position: 2, name: tool.name, item: url },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: 'en',
      mainEntity: tool.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ];
}

export function homeJsonLdEn(tools: readonly ToolEn[], description: string, site: URL | undefined): Record<string, unknown>[] {
  const home = new URL('/en/', site).href;
  return [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_EN.name, url: home, inLanguage: 'en', description },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: tools.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, url: new URL(`/en/${t.slug}/`, site).href })),
    },
  ];
}
