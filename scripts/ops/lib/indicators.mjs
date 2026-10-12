// The 11-10 search indicators of the weekly growth report (GROWTH3 G4; docs/REVENUE-MODEL.md §4, 수익화 전략 검증
// L79-90). Search Console only: no site code, no beacon. Pure functions plus the markdown section; growth.mjs
// appends the section after renderReport() and stores `indicators` in the report's growth-data line, so next
// week's report can show the change. Naver has no public API: its line says a person checks it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND } from '../opportunities.mjs';
import { ROOT, cell } from './common.mjs';
import { readGuides } from './guides.mjs';

/** The id-photo cluster: the tool, the photo-size hub and every published guide that names the tool. */
export const CLUSTER_FIXED = ['/id-photo/', '/guide/photo-sizes/'];
/** How many pages the top-pages table lists, and how many queries per page. */
export const TOP_PAGES = 8;
export const TOP_QUERIES = 3;
/** "Top 5" in the indicator: an average position of 5 or better. */
export const TOP_POSITION = 5;

/** A Search Console page URL as a site path ("https://docttak.com/guide/x/" → "/guide/x/"). */
export const pathOf = (url) => String(url).replace(/^https?:\/\/[^/]+/, '') || '/';

/** The `tools: [a, b]` list of a guide's frontmatter (the one-line form every guide uses). */
export function toolsOf(md) {
  const m = /^tools:\s*\[([^\]]*)\]\s*$/m.exec(md);
  return m ? m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : [];
}

/** The cluster's page paths, read from the repository (published guides only; drafts are never pages). */
export function clusterPaths(root = ROOT) {
  const guides = readGuides(root).filter((g) => !g.draft);
  const named = guides.filter((g) => toolsOf(readFileSync(join(root, 'src', 'content', 'guides', `${g.slug}.md`), 'utf8')).includes('id-photo'));
  return [...CLUSTER_FIXED, ...named.map((g) => g.path)];
}

/** The live tool slugs of src/data/tools.ts (each tool entry's `slug: '…',` line). */
export function toolSlugs(root = ROOT) {
  const ts = readFileSync(join(root, 'src', 'data', 'tools.ts'), 'utf8');
  return [...ts.matchAll(/^\s+slug: '([a-z0-9-]+)',$/gm)].map((m) => m[1]);
}

/** Clicks and impressions summed; CTR = clicks / impressions; position weighted by impressions (0 with no impressions). */
export function sumRows(rows) {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  for (const r of rows) {
    clicks += r.clicks;
    impressions += r.impressions;
    weighted += r.position * r.impressions;
  }
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: impressions ? weighted / impressions : 0 };
}

/**
 * The indicators from fetchGrowth() data. `paths`: the cluster's page paths; `tools`: the tool slugs. The top-5
 * count and the top-pages list need the page × query rows: without them (an API error) they are null.
 */
export function computeIndicators(gsc, { paths, tools }) {
  const cluster = new Set(paths);
  const toolPaths = new Set(tools.map((s) => `/${s}/`));
  const pages = gsc.pages28.map((r) => ({ ...r, path: pathOf(r.key) }));
  const pq = gsc.pageQueries28 ? gsc.pageQueries28.map((r) => ({ ...r, path: pathOf(r.page) })) : null;
  const inCluster = pages.filter((r) => cluster.has(r.path));
  const brandRows = gsc.queries28.filter((r) => BRAND.test(r.key));
  const top5 = pq ? new Set(pq.filter((r) => cluster.has(r.path) && r.impressions > 0 && r.position <= TOP_POSITION).map((r) => r.query)).size : null;
  const topPages = pq
    ? [...pages]
        .sort((a, b) => b.impressions - a.impressions || a.path.localeCompare(b.path))
        .slice(0, TOP_PAGES)
        .map((p) => ({
          path: p.path,
          ...sumRows([p]),
          queries: pq
            .filter((r) => r.path === p.path)
            .sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query))
            .slice(0, TOP_QUERIES)
            .map((r) => ({ query: r.query, impressions: r.impressions, position: r.position })),
        }))
    : null;
  return {
    cluster: { ...sumRows(inCluster), pages: inCluster.length, top5 },
    guide: sumRows(pages.filter((r) => r.path.startsWith('/guide/'))),
    tool: sumRows(pages.filter((r) => toolPaths.has(r.path))),
    brand: { ...sumRows(brandRows), queries: brandRows.length },
    topPages,
    error: gsc.pageQueriesError ?? null,
  };
}

/** What growth-data keeps (next week's comparison): the sums, not the top-pages table. */
export function storedIndicators(ind) {
  if (!ind) return null;
  const { topPages: _t, error: _e, ...kept } = ind;
  return kept;
}

const n = (v) => Math.round(v).toLocaleString('en-US');
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const pos = (v) => (v ? v.toFixed(1) : '-');
const signed = (v, digits = 0) => {
  const s = digits ? v.toFixed(digits) : String(Math.round(v));
  return v > 0 ? `+${s}` : s === '-0' || s === '-0.0' ? '0' : s;
};

/** "노출 +12, 클릭 +1, 순위 -0.4" against last week's stored row; "-" with nothing to compare. */
function delta(now, before) {
  if (!before) return '-';
  const parts = [`노출 ${signed(now.impressions - before.impressions)}`, `클릭 ${signed(now.clicks - before.clicks)}`];
  if (now.position && before.position) parts.push(`순위 ${signed(now.position - before.position, 1)}`);
  return parts.join(', ');
}

/**
 * The "## 11-10 지표 (검색)" section. `ind`: computeIndicators() or null (no Search Console data this week);
 * `previous`: last week's stored indicators or null (an older report has none → "-").
 */
export function renderIndicators(ind, previous, range28) {
  const lines = ['## 11-10 지표 (검색)'];
  if (!ind) {
    lines.push('건너뜀 (서치콘솔 데이터 없음, 위 메모 참고).', '', '- 네이버 서치어드바이저: 사람이 확인 (공개 API 없음)');
    return lines.join('\n');
  }
  const prev = previous ?? {};
  lines.push(
    `서치콘솔 28일${range28 ? ` (${range28.startDate}~${range28.endDate})` : ''}. 지난주 대비는 지난 리포트의 같은 값과 비교해요.`,
    '',
    '| 지표 | 노출 | 클릭 | CTR | 평균 순위 | 지난주 대비 |',
    '|---|---:|---:|---:|---:|---|',
  );
  const row = (label, now, before) => `| ${label} | ${n(now.impressions)} | ${n(now.clicks)} | ${pct(now.ctr)} | ${pos(now.position)} | ${delta(now, before)} |`;
  lines.push(
    row(`증명사진 군집 (${ind.cluster.pages}쪽)`, ind.cluster, prev.cluster),
    row('안내 글 (/guide/)', ind.guide, prev.guide),
    row('도구 페이지', ind.tool, prev.tool),
    row(`브랜드 검색 (검색어 ${ind.brand.queries}개)`, ind.brand, prev.brand),
    '',
  );
  const top5Before = typeof prev.cluster?.top5 === 'number' ? ` (지난주 ${prev.cluster.top5}개)` : '';
  lines.push(`- 증명사진 군집에서 평균 ${TOP_POSITION}위 안에 든 검색어: ${ind.cluster.top5 === null ? '오류' : `${ind.cluster.top5}개${top5Before}`}`);
  lines.push('- 네이버 서치어드바이저: 사람이 확인 (공개 API 없음)', '', `### 노출 상위 ${TOP_PAGES}쪽과 검색어 (28일)`);
  if (!ind.topPages) {
    lines.push('오류', '', `> 페이지별 검색어를 받지 못했어요: ${ind.error ?? '알 수 없는 오류'}. 나머지 지표는 그대로예요.`);
  } else {
    lines.push(`| 페이지 | 노출 | CTR | 평균 순위 | 노출 많은 검색어 ${TOP_QUERIES}개 |`, '|---|---:|---:|---:|---|');
    for (const p of ind.topPages) {
      const qs = p.queries.map((q) => `${q.query} (${n(q.impressions)}, ${pos(q.position)}위)`).join(', ') || '-';
      lines.push(`| ${cell(p.path)} | ${n(p.impressions)} | ${pct(p.ctr)} | ${pos(p.position)} | ${cell(qs)} |`);
    }
    if (!ind.topPages.length) lines.push('| (데이터 없음) | | | | |');
  }
  return lines.join('\n');
}

const MARK = /<!-- growth-data (\{.*\}) -->/;

/** The report with the section inserted before its growth-data line, and `indicators` added to that line's JSON. */
export function withIndicators(md, section, stored) {
  const m = MARK.exec(md);
  if (!m) return `${md}\n${section}\n`;
  const data = { ...JSON.parse(m[1]), indicators: stored };
  return `${md.slice(0, m.index)}${section}\n\n<!-- growth-data ${JSON.stringify(data)} -->${md.slice(m.index + m[0].length)}`;
}
