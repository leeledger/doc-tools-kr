// 캠페인별 유입 (REQ1014-A D14/D15): the query, its shaping, the admin section and the weekly report table.
import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_NOTE, CAMPAIGN_TOP, campaignMarkdown, campaignSql, fetchCampaigns, shapeCampaigns } from '../../scripts/lib/campaign.mjs';
import { UsageApiError, shapeUsage } from '../../scripts/lib/usage.mjs';
import { renderAdminPage } from '../../scripts/lib/admin-view.mjs';
import { FULL, EMPTY } from '../fixtures/usage-rows.mjs';

const ROWS = [
  { src: 'naver_blog', camp: 'history-exam-photo', event: 'land', n: '12' },
  { src: 'naver_blog', camp: 'history-exam-photo', event: 'start', n: '5' },
  { src: 'naver_blog', camp: 'history-exam-photo', event: 'success', n: '4' },
  { src: 'tistory', camp: 'other', event: 'land', n: 3 },
  { src: 'play', camp: 'none', event: 'land', n: 12 },
  { src: 'play', camp: 'none', event: 'start', n: 9 },
  { src: 'other', camp: 'spring', event: 'start', n: 1 },
  // dropped: a source outside the list, a campaign failing the rule, an event that is not land/start/success
  { src: 'facebook', camp: 'x', event: 'land', n: 99 },
  { src: 'tistory', camp: 'Bad Name', event: 'land', n: 99 },
  { src: 'tistory', camp: 'x', event: 'pick', n: 99 },
  { src: '', camp: '', event: 'land', n: 99 },
];

describe('campaignSql / fetchCampaigns', () => {
  it('the exact query; a bad dataset or period throws', () => {
    expect(campaignSql('docttak_usage', 7)).toBe(
      "SELECT blob13 AS src, blob14 AS camp, blob1 AS event, SUM(_sample_interval * double1) AS n FROM docttak_usage WHERE timestamp > NOW() - INTERVAL '7' DAY AND blob13 != '' AND (blob1 = 'land' OR blob1 = 'start' OR blob1 = 'success') GROUP BY blob13, blob14, blob1 ORDER BY n DESC LIMIT 500 FORMAT JSON",
    );
    for (const d of [1, 30, 90]) expect(campaignSql('docttak_usage', d)).toContain(`INTERVAL '${d}' DAY`);
    expect(() => campaignSql('x; DROP TABLE y', 7)).toThrow();
    expect(() => campaignSql('docttak_usage', 2)).toThrow();
    expect(() => campaignSql(undefined as never, 7)).toThrow();
  });

  it('posts the query with the token; an error is UsageApiError with the status only', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ data: ROWS })));
    expect(await fetchCampaigns({ accountId: 'acc', token: 'tok', dataset: 'docttak_usage', days: 1, fetch: f as never })).toEqual(ROWS);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc/analytics_engine/sql');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(init.body).toBe(campaignSql('docttak_usage', 1));
    await expect(fetchCampaigns({ accountId: 'a', token: 't', dataset: 'docttak_usage', days: 7, fetch: (async () => new Response('x', { status: 400 })) as never })).rejects.toBeInstanceOf(UsageApiError);
  });
});

describe('shapeCampaigns', () => {
  it('one row per source and campaign, labels, sorted by 방문 then 처리 시작, drops what is outside the rules', () => {
    expect(shapeCampaigns(ROWS)).toEqual([
      { src: 'play', srcLabel: '문서딱 앱(안드로이드)', camp: 'none', campLabel: '(캠페인 없음)', land: 12, start: 9, success: 0 },
      { src: 'naver_blog', srcLabel: '네이버 블로그', camp: 'history-exam-photo', campLabel: 'history-exam-photo', land: 12, start: 5, success: 4 },
      { src: 'tistory', srcLabel: '티스토리', camp: 'other', campLabel: '(목록 밖 이름)', land: 3, start: 0, success: 0 },
      { src: 'other', srcLabel: '기타', camp: 'spring', campLabel: 'spring', land: 0, start: 1, success: 0 },
    ]);
    expect(shapeCampaigns(undefined as never)).toEqual([]);
    expect(shapeCampaigns(null as never)).toEqual([]);
  });

  it('top 30 (admin) or the given number (weekly report: 10)', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ src: 'tistory', camp: `c-${i}`, event: 'land', n: 100 - i }));
    expect(shapeCampaigns(many)).toHaveLength(CAMPAIGN_TOP);
    expect(CAMPAIGN_TOP).toBe(30);
    expect(shapeCampaigns(many, 10).map((r) => r.camp)).toEqual(Array.from({ length: 10 }, (_, i) => `c-${i}`));
  });

  it('markdown: the table or the empty sentence; pipes escaped', () => {
    expect(campaignMarkdown(shapeCampaigns(ROWS).slice(0, 2), '없음')).toBe(
      ['| 들어온 곳 | 캠페인 | 방문 | 처리 시작 | 성공 |', '|---|---|---:|---:|---:|', '| 문서딱 앱(안드로이드) | (캠페인 없음) | 12 | 9 | 0 |', '| 네이버 블로그 | history-exam-photo | 12 | 5 | 4 |'].join('\n'),
    );
    expect(campaignMarkdown([], '없음')).toBe('없음');
  });
});

describe('admin page: 캠페인별 유입', () => {
  const NOW = new Date('2026-10-14T03:00:00Z');
  const render = (campaigns: unknown, rows = FULL) => renderAdminPage({ days: 1, shaped: shapeUsage(rows), prev: null, now: NOW, campaigns: campaigns as never });

  it('rows after the guide-arrival table, the note, numbers right-aligned; raw campaign names in <code>', () => {
    const html = render(shapeCampaigns(ROWS));
    expect(html.indexOf('id="s-campaigns"')).toBeGreaterThan(html.indexOf('id="s-guides"'));
    expect(html.indexOf('id="s-campaigns"')).toBeLessThan(html.indexOf('id="s-via"'));
    expect(html).toContain('<h2 id="s-campaigns">캠페인별 유입</h2>');
    expect(html).toContain(CAMPAIGN_NOTE);
    expect(html).toContain('<tr><td>네이버 블로그</td><td><code>history-exam-photo</code></td><td class="num">12</td><td class="num">5</td><td class="num">4</td></tr>');
    expect(html).toContain('<td>(캠페인 없음)</td>');
    expect(html).toContain('<th scope="col">들어온 곳</th><th scope="col">캠페인</th><th scope="col" class="num">방문</th>');
  });

  it('empty -> the empty message; null (query failed) -> its own notice, the usage tables intact; undefined -> no section', () => {
    expect(render([])).toMatch(/<h2 id="s-campaigns">캠페인별 유입<\/h2>\n<p class="muted kpi-note">[^<]+<\/p>\n<p class="muted">이 기간에는 기록이 없어요.<\/p>/);
    const failed = render(null);
    expect(failed).toContain('<p class="notice" role="status">캠페인 표를 불러오지 못했어요.</p>');
    expect(failed).toContain('id="s-tools"');
    expect(failed).not.toContain('도구 사용 통계를 불러오지 못했어요');
    expect(render(undefined)).not.toContain('s-campaigns');
  });

  it('escapes source and campaign labels (XSS)', () => {
    const html = render([{ src: 'other', srcLabel: '<img src=x>', camp: '"><script>', campLabel: '"><script>', land: 1, start: 0, success: 0 }]);
    expect(html).not.toContain('<img src=x>');
    expect(html).not.toContain('"><script>');
    expect(html).toContain('&lt;img src=x&gt;');
  });

  it('usage otherwise empty: the friendly block, then the campaign rows when there are any', () => {
    const html = render(shapeCampaigns(ROWS), EMPTY);
    expect(html).toContain('이 기간에는 아직 기록이 없어요');
    expect(html.indexOf('id="s-campaigns"')).toBeGreaterThan(html.indexOf('이 기간에는 아직 기록이 없어요'));
    expect(render([], EMPTY)).not.toContain('s-campaigns');
  });
});
