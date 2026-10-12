// GROWTH3 G4: the 11-10 search indicators of the weekly growth report (scripts/ops/lib/indicators.mjs).
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { run as growth } from '../../scripts/ops/growth.mjs';
import { fetchGrowth } from '../../scripts/ops/lib/gsc.mjs';
import { CLUSTER_FIXED, clusterPaths, computeIndicators, renderIndicators, storedIndicators, sumRows, toolSlugs, toolsOf, withIndicators } from '../../scripts/ops/lib/indicators.mjs';
import { parseReportData, renderReport } from '../../scripts/ops/lib/report.mjs';

const U = 'https://docttak.com';
const page = (path: string, impressions: number, clicks: number, position: number) => ({ key: `${U}${path}`, impressions, clicks, ctr: impressions ? clicks / impressions : 0, position });
const pq = (path: string, query: string, impressions: number, position: number, clicks = 0) => ({ page: `${U}${path}`, query, impressions, clicks, ctr: impressions ? clicks / impressions : 0, position });

const PATHS = ['/id-photo/', '/guide/photo-sizes/', '/guide/id-card-photo/', '/guide/police-exam-photo/'];
const TOOLS = ['id-photo', 'pdf-merge'];

function gscData(over: Record<string, unknown> = {}) {
  return {
    range7: { startDate: '2026-10-03', endDate: '2026-10-09' },
    range28: { startDate: '2026-09-12', endDate: '2026-10-09' },
    last7: { clicks: 3, impressions: 150, ctr: 0.02, position: 11 },
    last28: { clicks: 12, impressions: 539, ctr: 0.022, position: 12.3 },
    queries28: [
      { key: '주민등록증 크기', clicks: 0, impressions: 17, ctr: 0, position: 9.9 },
      { key: '문서딱', clicks: 2, impressions: 4, ctr: 0.5, position: 1 },
      { key: 'docttak pdf', clicks: 0, impressions: 1, ctr: 0, position: 3 },
    ],
    queries7: [],
    pages28: [
      page('/guide/id-card-photo/', 130, 1, 9.3),
      page('/id-photo/', 60, 3, 15),
      page('/guide/police-exam-photo/', 10, 0, 5),
      page('/guide/pdf-merge/', 40, 2, 8),
      page('/pdf-merge/', 20, 1, 20),
      page('/', 5, 1, 4),
    ],
    pageQueries28: [
      pq('/guide/id-card-photo/', '주민등록증 사진 규격', 60, 8),
      pq('/guide/id-card-photo/', '주민등록증 크기', 17, 9.9),
      pq('/guide/id-card-photo/', '주민등록증 사진', 20, 4.5),
      pq('/guide/id-card-photo/', '주민증 사진', 3, 2),
      pq('/guide/police-exam-photo/', '경찰 증명사진', 6, 4.6),
      pq('/guide/police-exam-photo/', '주민등록증 사진', 2, 3),
      pq('/id-photo/', '증명사진 만들기', 40, 16),
      pq('/guide/pdf-merge/', 'pdf 합치기', 30, 4),
    ],
    ...over,
  };
}

describe('indicators: sums', () => {
  it('weights the position by impressions; CTR is clicks over impressions; no impressions gives zeros', () => {
    const s = sumRows([page('/a/', 100, 2, 10), page('/b/', 300, 1, 2)]);
    expect(s.clicks).toBe(3);
    expect(s.impressions).toBe(400);
    expect(s.ctr).toBeCloseTo(3 / 400);
    expect(s.position).toBeCloseTo((100 * 10 + 300 * 2) / 400);
    expect(sumRows([])).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 });
  });

  it('cluster, top-5 query count, guides vs tools, brand and the top pages', () => {
    const ind = computeIndicators(gscData(), { paths: PATHS, tools: TOOLS });
    // Cluster: id-card-photo + id-photo + police-exam-photo (photo-sizes has no row).
    expect(ind.cluster).toMatchObject({ impressions: 200, clicks: 4, pages: 3 });
    expect(ind.cluster.position).toBeCloseTo((130 * 9.3 + 60 * 15 + 10 * 5) / 200);
    // Distinct cluster queries at position ≤ 5: 주민등록증 사진 (twice, counted once), 주민증 사진, 경찰 증명사진. pdf 합치기 is not in the cluster.
    expect(ind.cluster.top5).toBe(3);
    expect(ind.guide).toMatchObject({ impressions: 180, clicks: 3 });
    expect(ind.tool).toMatchObject({ impressions: 80, clicks: 4 });
    expect(ind.tool.ctr).toBeCloseTo(4 / 80);
    expect(ind.brand).toMatchObject({ impressions: 5, clicks: 2, queries: 2 });
    expect(ind.topPages!.map((p) => p.path)).toEqual(['/guide/id-card-photo/', '/id-photo/', '/guide/pdf-merge/', '/pdf-merge/', '/guide/police-exam-photo/', '/']);
    expect(ind.topPages![0]!.queries.map((q: { query: string }) => q.query)).toEqual(['주민등록증 사진 규격', '주민등록증 사진', '주민등록증 크기']);
    expect(ind.error).toBeNull();
  });

  it('no brand query: zeros, and the row still renders', () => {
    const ind = computeIndicators(gscData({ queries28: [{ key: '여권사진', clicks: 0, impressions: 9, ctr: 0, position: 7 }] }), { paths: PATHS, tools: TOOLS });
    expect(ind.brand).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0, queries: 0 });
    expect(renderIndicators(ind, null, undefined)).toContain('| 브랜드 검색 (검색어 0개) | 0 | 0 | 0.0% | - | - |');
  });
});

describe('indicators: the report section', () => {
  it('without a previous report every change is "-"; with one, the changes are signed', () => {
    const ind = computeIndicators(gscData(), { paths: PATHS, tools: TOOLS });
    const first = renderIndicators(ind, null, gscData().range28);
    expect(first).toContain('## 11-10 지표 (검색)');
    expect(first).toContain('서치콘솔 28일 (2026-09-12~2026-10-09)');
    expect(first).toMatch(/\| 증명사진 군집 \(3쪽\) \| 200 \| 4 \| 2\.0% \| 10\.8 \| - \|/);
    expect(first).toContain('평균 5위 안에 든 검색어: 3개');
    expect(first).not.toContain('지난주 3');
    expect(first).toContain('네이버 서치어드바이저: 사람이 확인');
    expect(first).toContain('| /guide/id-card-photo/ | 130 | 0.8% | 9.3 | 주민등록증 사진 규격 (60, 8.0위), 주민등록증 사진 (20, 4.5위), 주민등록증 크기 (17, 9.9위) |');
    const before = { cluster: { impressions: 150, clicks: 4, ctr: 0, position: 11.2, pages: 3, top5: 1 }, guide: { impressions: 180, clicks: 3, ctr: 0, position: 8 }, tool: { impressions: 90, clicks: 2, ctr: 0, position: 18 }, brand: { impressions: 5, clicks: 2, ctr: 0, position: 1, queries: 2 } };
    const second = renderIndicators(ind, before, gscData().range28);
    expect(second).toContain('| 노출 +50, 클릭 0, 순위 -0.4 |');
    expect(second).toContain('| 도구 페이지 | 80 | 4 | 5.0% | 16.3 | 노출 -10, 클릭 +2, 순위 -1.8 |');
    expect(second).toContain('평균 5위 안에 든 검색어: 3개 (지난주 1개)');
  });

  it('a page × query error: the top-5 count and the top pages say 오류 with a note; the other rows stay', async () => {
    const query = async (b: Record<string, unknown>) => {
      const dims = b.dimensions as string[] | undefined;
      if (dims?.length === 2) throw new Error('Search Console: 429 quota');
      if (!dims) return [{ clicks: 5, impressions: 100, ctr: 0.05, position: 7 }];
      if (dims[0] === 'page') return [{ keys: [`${U}/id-photo/`], clicks: 2, impressions: 50, ctr: 0.04, position: 9 }];
      return [];
    };
    const g = await fetchGrowth(query, new Date('2026-10-09T00:00:00Z'));
    expect(g.pageQueries28).toBeNull();
    expect(g.pageQueriesError).toBe('Search Console: 429 quota');
    expect(g.pages28).toHaveLength(1);
    const ind = computeIndicators(g, { paths: PATHS, tools: TOOLS });
    expect(ind.cluster).toMatchObject({ impressions: 50, clicks: 2, top5: null });
    const md = renderIndicators(ind, null, g.range28);
    expect(md).toContain('평균 5위 안에 든 검색어: 오류');
    expect(md).toContain('### 노출 상위 8쪽과 검색어 (28일)\n오류');
    expect(md).toContain('> 페이지별 검색어를 받지 못했어요: Search Console: 429 quota.');
    expect(md).toContain('| 증명사진 군집 (1쪽) | 50 | 2 | 4.0% | 9.0 | - |');
  });

  it('fetchGrowth asks for 250 pages and 1000 page × query rows', async () => {
    const calls: Record<string, unknown>[] = [];
    const query = async (b: Record<string, unknown>) => {
      calls.push(b);
      return b.dimensions ? [] : [{ clicks: 0, impressions: 0, ctr: 0, position: 0 }];
    };
    const g = await fetchGrowth(query, new Date('2026-10-09T00:00:00Z'));
    expect(calls.find((c) => JSON.stringify(c.dimensions) === '["page"]')?.rowLimit).toBe(250);
    expect(calls.find((c) => JSON.stringify(c.dimensions) === '["page","query"]')?.rowLimit).toBe(1000);
    expect(g.pageQueries28).toEqual([]);
    expect(g).not.toHaveProperty('pageQueriesError');
  });

  it('the report still prints 25 pages when 250 come back', () => {
    const pages28 = Array.from({ length: 30 }, (_, i) => page(`/guide/g${i}/`, 100 - i, 0, 10));
    const md = renderReport({ week: '2026-42', generated: '2026-10-12', gsc: { ...gscData(), pages28 }, cf: null, notes: [], r1: { sitemapCount: 50, pagesOk: true, streak: 0, clicksOk: false, met: false, recent: [] } });
    const table = md.split('### 상위 페이지 (28일)')[1]!.split('\n\n')[0]!;
    expect(table.split('\n').filter((l) => l.startsWith('| /guide/g'))).toHaveLength(25);
  });

  it('no Search Console data: the section says so and keeps the Naver line; nothing is stored', () => {
    const md = renderIndicators(null, null, undefined);
    expect(md).toContain('건너뜀');
    expect(md).toContain('네이버 서치어드바이저: 사람이 확인');
    expect(storedIndicators(null)).toBeNull();
  });

  it('withIndicators puts the section before the growth-data line and stores the sums (not the top pages)', () => {
    const md = '# 성장 리포트 2026-42\n\n- x\n\n<!-- growth-data {"week":"2026-42","gsc":null} -->\n';
    const ind = computeIndicators(gscData(), { paths: PATHS, tools: TOOLS });
    const out = withIndicators(md, '## 11-10 지표 (검색)\nbody', storedIndicators(ind));
    expect(out.indexOf('## 11-10 지표')).toBeLessThan(out.indexOf('<!-- growth-data'));
    const data = parseReportData(out);
    expect(data.week).toBe('2026-42');
    expect(data.indicators.cluster).toMatchObject({ impressions: 200, top5: 3 });
    expect(data.indicators).not.toHaveProperty('topPages');
  });
});

describe('indicators: repository data', () => {
  it('the cluster is the tool, the hub and the published guides naming id-photo; drafts are left out', () => {
    const paths = clusterPaths();
    expect(paths.slice(0, 2)).toEqual(CLUSTER_FIXED);
    expect(paths).toContain('/guide/id-card-photo/');
    expect(paths).toContain('/guide/passport-photo/');
    expect(paths).not.toContain('/guide/mma-photo/');
    expect(paths).not.toContain('/guide/pdf-merge/');
    expect(toolsOf("tools: [id-photo, 'photo-compress']\n")).toEqual(['id-photo', 'photo-compress']);
  });

  it('the tool slugs come from src/data/tools.ts', () => {
    const slugs = toolSlugs();
    expect(slugs).toContain('id-photo');
    expect(slugs).toContain('hwpx-to-hwp');
    expect(slugs.every((s) => /^[a-z0-9-]+$/.test(s))).toBe(true);
  });
});

describe('indicators: growth run (dry run, fixture data)', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  it('prints the new section and compares with the previous report', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'growth-ind-'));
    const prev = { cluster: { impressions: 100, clicks: 1, ctr: 0.01, position: 12, pages: 2, top5: 0 }, guide: { impressions: 100, clicks: 1, ctr: 0.01, position: 12 }, tool: { impressions: 10, clicks: 0, ctr: 0, position: 20 }, brand: { impressions: 0, clicks: 0, ctr: 0, position: 0, queries: 0 } };
    writeFileSync(join(dir, '2026-41.md'), `# 성장 리포트 2026-41\n\n<!-- growth-data ${JSON.stringify({ week: '2026-41', gsc: null, indicators: prev })} -->\n`);
    const data = gscData();
    const fetchImpl = vi.fn(async (u: string | URL, init?: RequestInit) => {
      const url = String(u);
      if (url.endsWith('/sitemap.xml')) return new Response('<urlset></urlset>', { headers: { 'content-type': 'application/xml' } });
      if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'g' }));
      if (url.includes('searchAnalytics/query')) {
        const dims = JSON.parse(String(init!.body)).dimensions as string[] | undefined;
        if (!dims) return new Response(JSON.stringify({ rows: [{ clicks: 12, impressions: 539, ctr: 0.022, position: 12.3 }] }));
        if (dims.length === 2) return new Response(JSON.stringify({ rows: data.pageQueries28.map((r) => ({ keys: [r.page, r.query], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })) }));
        const list = dims[0] === 'page' ? data.pages28 : data.queries28;
        return new Response(JSON.stringify({ rows: list.map((r) => ({ keys: [r.key], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })) }));
      }
      throw new Error(`unexpected ${url}`);
    });
    const logs: string[] = [];
    const gh = { closeAll: vi.fn(async () => {}), create: vi.fn(async () => {}) };
    const env = { OPS_TODAY: '2026-10-12', GSC_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'a@b', private_key: privateKey }) };
    expect(await growth(['--reports', dir, '--dry-run'], { log: (s: string) => logs.push(s), env, fetchImpl: fetchImpl as unknown as typeof fetch, wait: async () => {}, github: gh })).toBe(0);
    const md = logs.join('\n');
    expect(md).toContain('## 11-10 지표 (검색)');
    expect(md).toMatch(/\| 안내 글 \(\/guide\/\) \| 180 \| 3 \| 1\.7% \| [\d.]+ \| 노출 \+80, 클릭 \+2, 순위 -[\d.]+ \|/);
    expect(md).toContain('(지난주 0개)');
    expect(md.indexOf('## 11-10 지표')).toBeLessThan(md.indexOf('<!-- growth-data'));
    expect(parseReportData(md).indicators.brand.queries).toBe(2);
  });
});
