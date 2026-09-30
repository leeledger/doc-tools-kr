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

export interface GuideLd {
  slug: string;
  title: string;
  description: string;
  published: string;
  updated: string;
  faq: readonly { q: string; a: string }[];
  /** Source URLs (preset sources resolved). */
  citations: readonly string[];
}

const organization = (site: URL | undefined): Record<string, unknown> => ({
  '@type': 'Organization',
  name: SITE.name,
  url: new URL('/', site).href,
  logo: { '@type': 'ImageObject', url: new URL('/brand/icon-512.png', site).href },
});

/** Absolute URL of a guide's share image (src/pages/og/guide/[slug].png.ts). */
export const guideOgUrl = (slug: string, site: URL | undefined): string => new URL(`/og/guide/${slug}.png`, site).href;

/** JSON-LD for a guide (Growth G.1): Article + FAQPage (the visible FAQ, same text) + BreadcrumbList. No HowTo. */
export function guideJsonLd(g: GuideLd, site: URL | undefined): Record<string, unknown>[] {
  const url = new URL(`/guide/${g.slug}/`, site).href;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: g.title,
      description: g.description,
      datePublished: g.published,
      dateModified: g.updated,
      author: organization(site),
      publisher: organization(site),
      image: guideOgUrl(g.slug, site),
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      inLanguage: 'ko-KR',
      citation: [...g.citations],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: g.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
    breadcrumbs(site, [
      [SITE.name, '/'],
      ['안내', '/guide/'],
      [g.title, `/guide/${g.slug}/`],
    ]),
  ];
}

/** BreadcrumbList with positions 1..n and absolute items. */
export function breadcrumbs(site: URL | undefined, items: readonly [string, string][]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: new URL(path, site).href })),
  };
}
