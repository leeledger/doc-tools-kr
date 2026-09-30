import { SITE } from './site';
import type { Tool } from './tools';

/** JSON-LD for a tool page: WebApplication + BreadcrumbList (brief §5). */
export function toolJsonLd(tool: Tool, site: URL | undefined): Record<string, unknown>[] {
  const url = new URL(`/${tool.slug}/`, site).href;
  const home = new URL('/', site).href;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: `${tool.name} — ${SITE.name}`,
      url,
      description: tool.description,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: '웹 브라우저',
      inLanguage: 'ko',
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'KRW' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE.name, item: home },
        { '@type': 'ListItem', position: 2, name: tool.name, item: url },
      ],
    },
  ];
}

/** FAQPage JSON-LD from tools.ts faq[] (brief Step 5 §3.1; used by /hwp-to-pdf/ only). */
export function faqJsonLd(tool: Tool): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: tool.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}
