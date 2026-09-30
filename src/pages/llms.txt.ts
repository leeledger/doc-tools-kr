// llms.txt (Growth G.3): the site in plain Markdown for answer engines. Cheap; its effect is unverified.
import type { APIRoute } from 'astro';
import { SITE } from '../data/site';
import { josa } from '../lib/ui/josa';
import { LIVE_TOOLS } from '../data/tools';
import { guidePath, publishedGuides } from '../data/guides';

export const GET: APIRoute = async ({ site }) => {
  const guides = await publishedGuides();
  const abs = (p: string): string => new URL(p, site).href;
  const body = [
    `# ${SITE.name}`,
    '',
    `> ${josa(SITE.name, '은/는')} PDF와 사진을 제출처의 용량과 규격에 맞추는 무료 웹 도구예요. 파일은 내 폰·컴퓨터 안에서만 처리되고 밖으로 보내지 않아요.`,
    '',
    '## 도구',
    '',
    ...LIVE_TOOLS.map((t) => `- [${t.name}](${abs(`/${t.slug}/`)}): ${t.summary}`),
    '',
    '## 안내',
    '',
    ...guides.map((g) => `- [${g.data.title}](${abs(guidePath(g.id))}): ${g.data.answer}`),
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
