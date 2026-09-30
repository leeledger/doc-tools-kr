// RSS 2.0 of the published guides (Growth G.3), hand-written: no dependency. 네이버 서치어드바이저 takes it.
import type { APIRoute } from 'astro';
import { SITE } from '../../data/site';
import { guidePath, publishedGuides } from '../../data/guides';

const xml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** RFC 822 date at 09:00 KST: "Wed, 30 Sep 2026 09:00:00 +0900". */
function rfc822(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} 09:00:00 +0900`;
}

export const GET: APIRoute = async ({ site }) => {
  const guides = (await publishedGuides()).sort((a, b) => b.data.published.localeCompare(a.data.published) || a.id.localeCompare(b.id));
  const items = guides
    .map((g) => {
      const url = new URL(guidePath(g.id), site).href;
      return `    <item>
      <title>${xml(g.data.title)}</title>
      <link>${xml(url)}</link>
      <guid isPermaLink="true">${xml(url)}</guid>
      <pubDate>${rfc822(g.data.published)}</pubDate>
      <description>${xml(g.data.answer)}</description>
    </item>`;
    })
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xml(`${SITE.name} 안내`)}</title>
    <link>${xml(new URL('/guide/', site).href)}</link>
    <description>${xml('문서·사진 규격과 용량 안내. 기관 안내를 확인해 정리했어요.')}</description>
    <language>ko</language>
${items}
  </channel>
</rss>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
