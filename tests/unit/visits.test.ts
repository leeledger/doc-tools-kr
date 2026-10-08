// /admin/ visits (brief handoff/ARCHITECT-BRIEF-ADMIN-VISITS.md, "Test map"; round 2: windows of at most 7 days,
// numbers as returned): the Web Analytics query module, the trend chart, the visits block of the page, the
// Function's side-by-side fetch, guide titles and preset labels.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHUNK_TOP,
  GRAPHQL_URL,
  MAX_IN_FLIGHT,
  RUM_START,
  SITE_TAG,
  TREND_LIMIT,
  VisitsApiError,
  chunks,
  countryLabel,
  deviceLabel,
  fetchVisits,
  mergeRows,
  pageLabel,
  readGroups,
  shapeVisits,
  siteTagOf,
  trendBuckets,
  visitsQuery,
  windows,
} from '../../scripts/lib/visits.mjs';
import { niceTicks, trendSvg } from '../../scripts/lib/admin-chart.mjs';
import { VISITS_NOTE, ratioDelta, renderAdminPage, startsPer100 } from '../../scripts/lib/admin-view.mjs';
import { GUIDE_TITLES, PRESETS, VALUE_LABELS, shapeUsage } from '../../scripts/lib/usage.mjs';
import { guideTitles } from '../../scripts/ops/lib/guides.mjs';
import { serialize } from '../../scripts/gen-guide-titles.mjs';
import { onRequest as adminFn } from '../../functions/admin/[[path]]';
import { FULL, PREV } from '../fixtures/usage-rows.mjs';
import { RUM_EMPTY, RUM_ERRORS, TOPS, XSS_TOPS, g, rumAnswer, rumBody, trendRows, windowOf } from '../fixtures/rum-rows.mjs';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const NOW = new Date('2026-10-25T05:03:20.456Z'); // 14:03 KST; 7-day prev starts 10-11 (after RUM_START)
type Init = { method: string; headers: Record<string, string>; body: string; signal: AbortSignal };
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const api = (answer: (init: Init) => Response | Promise<Response>) => {
  const calls: { url: string; init: Init }[] = [];
  const f = vi.fn(async (url: string, init: Init) => {
    calls.push({ url, init });
    return answer(init);
  });
  return { f, calls };
};
const fixture = (opts: Parameters<typeof rumAnswer>[1] = {}) => api((init) => ok(rumAnswer(init.body, opts)));
const args = (f: unknown, days = 7, extra: Record<string, unknown> = {}) => ({ accountId: 'acc-tag', token: 'secret-token-xyz', siteTag: SITE_TAG, days, now: NOW, fetch: f as typeof fetch, ...extra });
const DAY = 86_400_000;
const sumRows = (rows: ReturnType<typeof trendRows>) => rows.reduce((t, r) => ({ visits: t.visits + r.sum.visits, pageViews: t.pageViews + r.count }), { visits: 0, pageViews: 0 });

describe('query, windows and chunks', () => {
  it('two constant query strings; values only as variables; verified names only', () => {
    const full = visitsQuery('full');
    const trend = visitsQuery('trend');
    expect(visitsQuery()).toBe(full);
    for (const s of [full, trend]) {
      expect(s).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(s).not.toContain(SITE_TAG);
      expect(s).toContain('$accountTag: string');
      expect(s).toContain('$filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject');
      expect(s).toContain(`trend: rumPageloadEventsAdaptiveGroups(limit: ${TREND_LIMIT}, filter: $filter)`);
      for (const o of s.match(/orderBy: \[(\w+)\]/g) ?? []) expect(['orderBy: [count_DESC]', 'orderBy: [sum_visits_DESC]']).toContain(o);
      for (const d of s.match(/dimensions \{ (\w+) \}/g) ?? []) expect(['datetimeHour', 'requestPath', 'refererHost', 'countryName', 'deviceType'].map((x) => `dimensions { ${x} }`)).toContain(d);
    }
    for (const alias of ['pages', 'referrers', 'countries', 'devices']) {
      expect(full).toContain(`${alias}: rumPageloadEventsAdaptiveGroups(`);
      expect(trend).not.toContain(`${alias}:`);
    }
    expect(full.match(/avg \{ sampleInterval \}/g)).toHaveLength(5);
  });

  it('rolling windows; prev ends 1 s before cur starts; prev only for 1/7/30 from RUM_START on; bad period throws', () => {
    expect(windows(7, NOW)).toEqual({ cur: { start: '2026-10-18T05:03:20Z', end: '2026-10-25T05:03:20Z' }, prev: { start: '2026-10-11T05:03:20Z', end: '2026-10-18T05:03:19Z' }, prevBeforeStart: false });
    expect(windows(1, NOW).prev).toEqual({ start: '2026-10-23T05:03:20Z', end: '2026-10-24T05:03:19Z' });
    expect(windows(30, NOW)).toMatchObject({ prev: null, prevBeforeStart: true });
    expect(windows(90, NOW)).toMatchObject({ prev: null, prevBeforeStart: false });
    expect(windows(7, new Date(`${RUM_START}T00:00:00Z`)).prevBeforeStart).toBe(true);
    expect(() => windows(14, NOW)).toThrow();
  });

  it('chunks: at most 7 days each, oldest first, end to end with a 1 s step, covering the window exactly', () => {
    const w7 = windows(7, NOW).cur;
    expect(chunks(w7)).toEqual([w7]);
    expect(chunks(windows(1, NOW).cur)).toHaveLength(1);
    for (const [days, n] of [[30, 5], [90, 13]] as const) {
      const w = windows(days, NOW).cur;
      const c = chunks(w);
      expect(c, String(days)).toHaveLength(n);
      expect(c[0]!.start).toBe(w.start);
      expect(c[c.length - 1]!.end).toBe(w.end);
      for (let i = 0; i < c.length; i++) {
        const len = Date.parse(c[i]!.end) - Date.parse(c[i]!.start);
        expect(len).toBeLessThanOrEqual(7 * DAY);
        if (i > 0) expect(Date.parse(c[i]!.start) - Date.parse(c[i - 1]!.end)).toBe(1000);
      }
      expect(Date.parse(c[c.length - 1]!.end) - Date.parse(c[c.length - 1]!.start)).toBe(7 * DAY); // the newest pieces are full
    }
    expect(chunks(windows(30, NOW).cur).map((c) => Math.round((Date.parse(c.end) - Date.parse(c.start)) / DAY))).toEqual([2, 7, 7, 7, 7]);
  });

  it('siteTagOf: unset -> SITE_TAG, valid hex -> it, else null', () => {
    expect(siteTagOf(undefined)).toBe(SITE_TAG);
    expect(siteTagOf('  ')).toBe(SITE_TAG);
    expect(siteTagOf('0123456789abcdef0123456789abcdef')).toBe('0123456789abcdef0123456789abcdef');
    expect(siteTagOf('34842a72')).toBeNull();
    expect(siteTagOf('0123456789ABCDEF0123456789ABCDEF')).toBeNull();
    expect(siteTagOf('x"}){viewer')).toBeNull();
  });
});

describe('fetchVisits', () => {
  it('7 days: one full POST for the period and one trend POST for the period before, verified filter shape', async () => {
    const { f, calls } = fixture();
    const raw = await fetchVisits(args(f));
    expect(calls).toHaveLength(2);
    expect(raw.requests).toBe(2);
    for (const { url, init } of calls) {
      expect(url).toBe(GRAPHQL_URL);
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer secret-token-xyz');
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
    const bodies = calls.map((c) => JSON.parse(c.init.body));
    expect(bodies[0].query).toBe(visitsQuery('full'));
    expect(bodies[0].variables).toEqual({ accountTag: 'acc-tag', filter: { AND: [{ datetime_geq: '2026-10-18T05:03:20Z', datetime_leq: '2026-10-25T05:03:20Z' }, { bot: 0 }, { siteTag_in: [SITE_TAG] }] } });
    expect(bodies[1].query).toBe(visitsQuery('trend'));
    expect(bodies[1].variables.filter.AND[0]).toEqual({ datetime_geq: '2026-10-11T05:03:20Z', datetime_leq: '2026-10-18T05:03:19Z' });
    expect(raw.prev).not.toBeNull();
  });

  it('request counts: 1 day 2, 7 days 2 (1 without compare), 30 days 5 (prev before RUM_START), 90 days 13', async () => {
    for (const [days, n, extra] of [[1, 2, {}], [7, 2, {}], [7, 1, { compare: false }], [30, 5, {}], [90, 13, {}]] as const) {
      const { f, calls } = fixture();
      const raw = await fetchVisits(args(f, days, extra));
      expect(calls.length, `${days} ${JSON.stringify(extra)}`).toBe(n);
      expect(raw.requests).toBe(n);
    }
  });

  it(`never more than ${MAX_IN_FLIGHT} requests in flight`, async () => {
    let inFlight = 0;
    let peak = 0;
    const { f } = api(async (init) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return ok(rumAnswer(init.body));
    });
    await fetchVisits(args(f, 90));
    expect(peak).toBe(MAX_IN_FLIGHT);
  });

  it('numbers are used as returned: no multiplication by sampleInterval; sampleInterval > 1 only flags estimated', async () => {
    expect(readGroups([g('datetimeHour', 'h', 70, 40, 10), { count: 4, sum: { visits: 2 }, dimensions: { datetimeHour: 'k' } }], 'datetimeHour')).toEqual({
      rows: [{ key: 'h', pageViews: 70, visits: 40 }, { key: 'k', pageViews: 4, visits: 2 }],
      sampled: true,
    });
    expect(readGroups([g('deviceType', 'mobile', 3, 2, 1)], 'deviceType').sampled).toBe(false);
    const w = windows(7, NOW).cur;
    const sampled = await fetchVisits(args(fixture({ si: 10 }).f, 7, { compare: false }));
    expect(sampled.estimated).toBe(true);
    expect(shapeVisits(sampled, 7, NOW).totals).toEqual(sumRows(trendRows(w.start, w.end)));
    const fine = await fetchVisits(args(fixture().f, 7, { compare: false }));
    expect(fine.estimated).toBe(false);
    expect(shapeVisits(fine, 7, NOW).totals).toEqual(sumRows(trendRows(w.start, w.end)));
  });

  it('chunk merging: per-hour rows summed (the boundary hour from both pieces), top tables summed by key', async () => {
    expect(mergeRows([[{ key: 'a', pageViews: 1, visits: 1 }, { key: 'b', pageViews: 2, visits: 1 }], [{ key: 'a', pageViews: 3, visits: 2 }]])).toEqual([
      { key: 'a', pageViews: 4, visits: 3 },
      { key: 'b', pageViews: 2, visits: 1 },
    ]);
    const raw = await fetchVisits(args(fixture().f, 30));
    const pieces = chunks(windows(30, NOW).cur);
    const expected = pieces.map((c) => sumRows(trendRows(c.start, c.end))).reduce((t, x) => ({ visits: t.visits + x.visits, pageViews: t.pageViews + x.pageViews }));
    expect(shapeVisits(raw, 30, NOW).totals).toEqual(expected);
    const boundary = pieces[1]!.start.slice(0, 13) + ':00:00Z'; // the hour two pieces share
    const v = trendRows(pieces[0]!.start, pieces[0]!.end).find((r) => r.dimensions.datetimeHour === boundary)!.sum.visits;
    expect(raw.cur.trend.find((r) => r.key === boundary)!.visits).toBe(2 * v);
    expect(raw.cur.pages.find((p) => p.key === '/')).toEqual({ key: '/', pageViews: 5 * 40, visits: 5 * 25 });
    expect(raw.cur.devices.find((d) => d.key === 'mobile')!.visits).toBe(5 * 30);
    expect(raw.approxTops).toBe(false);
  });

  it('approxTops: a full top table in a multi-window period marks the ranking approximate; one window never does', async () => {
    const many = { ...TOPS, pages: Array.from({ length: CHUNK_TOP }, (_, i) => g('requestPath', `/p${i}/`, 100 - i, 50)) };
    expect((await fetchVisits(args(fixture({ tops: many }).f, 30))).approxTops).toBe(true);
    expect((await fetchVisits(args(fixture({ tops: many }).f, 7))).approxTops).toBe(false);
  });

  it('empty groups -> zero totals, every bucket 0', async () => {
    const { f } = api(() => ok(RUM_EMPTY));
    const s = shapeVisits(await fetchVisits(args(f)), 7, NOW);
    expect(s.totals).toEqual({ visits: 0, pageViews: 0 });
    expect(s.prevTotals).toEqual({ visits: 0, pageViews: 0 });
    expect(s.trend.every((b) => b.visits === 0 && b.pageViews === 0)).toBe(true);
    expect(s.pages).toEqual([]);
    expect(s.estimated).toBe(false);
  });

  it('HTTP error -> status (+ CF message), errors[] -> message cut to 160, never the token; one failing piece fails all', async () => {
    await expect(fetchVisits(args(api(() => new Response('denied', { status: 403 })).f))).rejects.toMatchObject({ status: 403, message: 'HTTP 403' });
    await expect(fetchVisits(args(api(() => ok({ errors: [{ message: 'not authorized for secret-token-xyz' }] }, 401)).f))).rejects.toMatchObject({ status: 401, message: 'HTTP 401: not authorized for ***' });
    const err = await fetchVisits(args(api(() => ok(RUM_ERRORS)).f)).catch((e) => e);
    expect(err).toBeInstanceOf(VisitsApiError);
    expect(err).toMatchObject({ status: 200, message: 'cannot request data older than 31d <b>"x"</b>' });
    const long = await fetchVisits(args(api(() => ok({ data: null, errors: [{ message: 'x'.repeat(500) }] })).f)).catch((e) => e);
    expect(long.message.length).toBe(160);
    let n = 0;
    const third = api((init) => (++n === 3 ? new Response('busy', { status: 429 }) : ok(rumAnswer(init.body))));
    await expect(fetchVisits(args(third.f, 90))).rejects.toMatchObject({ status: 429 });
  });

  it('bad JSON, missing nodes or fields -> error, never zeros; a full trend answer (cut rows) -> error', async () => {
    const bad = [
      () => new Response('<html>', { status: 200 }),
      () => ok({ data: { viewer: { accounts: [] } } }),
      () => ok({ data: { viewer: { accounts: [{ trend: [], pages: [], referrers: [], countries: [] }] } } }),
      () => ok(rumBody({ trend: [{ count: 1, dimensions: { datetimeHour: 'x' } }], pages: [], referrers: [], countries: [], devices: [] })),
    ];
    for (const b of bad) await expect(fetchVisits(args(api(b).f, 7))).rejects.toMatchObject({ message: '응답 형식이 올바르지 않음' });
    const many = Array.from({ length: TREND_LIMIT }, (_, i) => g('datetimeHour', new Date(Date.UTC(2026, 9, 1) + i * 3_600_000).toISOString(), 1, 1));
    await expect(fetchVisits(args(api(() => ok(rumBody({ trend: many, pages: [], referrers: [], countries: [], devices: [] }))).f, 7))).rejects.toMatchObject({ message: '시간대 행이 너무 많음' });
  });

  it('network error -> 네트워크 오류; the deadline while sending or while reading the body -> 시간 초과', async () => {
    await expect(fetchVisits(args(api(() => Promise.reject(new TypeError('fetch failed'))).f))).rejects.toMatchObject({ status: 0, message: '네트워크 오류' });
    const hang = (init: Init) => new Promise<Response>((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
    await expect(fetchVisits(args(api(hang).f, 7, { timeoutMs: 20 }))).rejects.toMatchObject({ status: 0, message: '시간 초과 (0초)' });
    const slowBody = (init: Init) =>
      ({ status: 200, ok: true, json: () => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))) }) as unknown as Response;
    await expect(fetchVisits(args(api(slowBody).f, 7, { timeoutMs: 20 }))).rejects.toMatchObject({ status: 0, message: '시간 초과 (0초)' });
  });
});

describe('shapeVisits', () => {
  it('KST bucketing: 15:00Z belongs to the next KST day; 1 day = every KST hour touched', () => {
    const trend = [
      { key: '2026-10-23T14:00:00Z', visits: 1, pageViews: 1 }, // 10-23 23시 KST
      { key: '2026-10-23T15:00:00Z', visits: 2, pageViews: 3 }, // 10-24 00시 KST
      { key: '2026-10-24T14:59:00Z', visits: 4, pageViews: 4 }, // 10-24 23시 KST
    ];
    const days = trendBuckets(trend, 7, NOW);
    expect(days.map((b) => b.label)).toEqual(['10/18', '10/19', '10/20', '10/21', '10/22', '10/23', '10/24', '10/25']);
    expect(days.find((b) => b.label === '10/23')).toEqual({ label: '10/23', visits: 1, pageViews: 1 });
    expect(days.find((b) => b.label === '10/24')).toEqual({ label: '10/24', visits: 6, pageViews: 7 });
    const hours = trendBuckets([{ key: '2026-10-24T15:00:00Z', visits: 5, pageViews: 5 }], 1, NOW);
    expect(hours).toHaveLength(25);
    expect(hours[0]!.label).toBe('10/24 14시');
    expect(hours[24]!.label).toBe('10/25 14시');
    expect(hours.find((b) => b.label === '10/25 00시')!.visits).toBe(5);
    expect(trendBuckets([], 90, NOW)).toHaveLength(91);
  });

  it('totals equal the trend sum; 90 days across 13 pieces too', async () => {
    const s = shapeVisits(await fetchVisits(args(fixture().f, 90)), 90, NOW);
    expect(s.trend.reduce((t, b) => t + b.visits, 0)).toBe(s.totals.visits);
    expect(s.trend.reduce((t, b) => t + b.pageViews, 0)).toBe(s.totals.pageViews);
  });

  it('pages: home, tool, guide and hub titles, else the path cut to 80; referrers drop docttak.com; countries and devices in Korean', async () => {
    const s = shapeVisits(await fetchVisits(args(fixture().f)), 7, NOW);
    expect(s.pages.map((p) => p.label)).toEqual(['홈', '사진 용량 줄이기', GUIDE_TITLES['pdf-merge'], GUIDE_TITLES['photo-sizes'], '/guide/', '/guide/no-such-guide/', `/very/long/${'x'.repeat(69)}`]);
    expect(s.pages[1]).toEqual({ label: '사진 용량 줄이기', path: '/photo-compress/', visits: 14, pageViews: 22 });
    expect(s.pages[6]!.path).toHaveLength(80);
    expect(s.referrers.map((r) => r.label)).toEqual(['직접 방문·알 수 없음', 'search.example.kr', 'blog.example.com']);
    expect(s.countries.map((c) => c.label)).toEqual(['대한민국', '일본', countryLabel('ZZ'), '알 수 없음']);
    expect(s.devices.map((d) => d.label)).toEqual(['휴대폰', '컴퓨터', '태블릿', 'smarttv']);
    expect(s.prevTotals).not.toBeNull();
    expect(pageLabel('/pdf-merge/')).toBe('PDF 합치기');
    expect(countryLabel('<b>')).toBe('<b>');
    expect(deviceLabel('')).toBe('알 수 없음');
  });

  it('prev window before RUM_START -> prevTotals null, prevBeforeStart', () => {
    const s = shapeVisits({ cur: { trend: [], pages: [], referrers: [], countries: [], devices: [] }, prev: null, estimated: false, approxTops: false, requests: 1 }, 7, new Date('2026-10-08T05:00:00Z'));
    expect(s.prevTotals).toBeNull();
    expect(s.prevBeforeStart).toBe(true);
  });
});

describe('trend chart', () => {
  const trend = [
    { label: '10/1', visits: 3, pageViews: 5 },
    { label: '10/2', visits: 0, pageViews: 0 },
    { label: '<b>"10/3"</b>', visits: 12.4, pageViews: 20 },
  ];

  it('svg role="img" labelled by title and desc (total, busiest bucket); table fallback; no style or script', () => {
    const html = trendSvg(trend, { title: '지난 7일 방문 추이' });
    expect(html).toContain('<svg role="img" aria-labelledby="visits-trend-t visits-trend-d" viewBox="0 0 30 100" preserveAspectRatio="none"');
    expect(html).toContain('<title id="visits-trend-t">지난 7일 방문 추이</title>');
    expect(html).toContain('<desc id="visits-trend-d">모두 약 15회. 가장 많은 때는 &lt;b&gt;&quot;10/3&quot;&lt;/b&gt;, 약 12회. 세로 눈금은 0회부터 15회까지.</desc>');
    expect(html).toContain('<summary>표로 보기</summary>');
    expect(html).toContain('<th scope="col">기간</th><th scope="col" class="num">방문</th><th scope="col" class="num">페이지뷰</th>');
    expect(html.match(/<rect class="col"/g)).toHaveLength(2);
    expect(html).not.toMatch(/style=|<script|href=|<img|width="\d+px"/);
    expect(html).not.toContain('<b>');
  });

  it('niceTicks: 1/2/5 x 10^n integer steps, 3-5 ticks, top tick >= max, 0 -> a 0-2 scale', () => {
    expect(niceTicks(0)).toEqual([0, 1, 2]);
    expect(niceTicks(1)).toEqual([0, 1, 2]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(16)).toEqual([0, 5, 10, 15, 20]);
    expect(niceTicks(46)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(99)).toEqual([0, 50, 100]);
    expect(niceTicks(100)).toEqual([0, 50, 100]);
    expect(niceTicks(1234)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(Number.NaN)).toEqual([0, 1, 2]);
    for (const m of [1, 3, 9, 12, 37, 250, 999, 4321, 87654]) {
      const t = niceTicks(m);
      expect(t.length).toBeGreaterThanOrEqual(3);
      expect(t.length).toBeLessThanOrEqual(5);
      expect(t[t.length - 1]).toBeGreaterThanOrEqual(m);
      expect(t.every(Number.isInteger)).toBe(true);
      expect([1, 2, 5]).toContain(t[1] / 10 ** Math.floor(Math.log10(t[1])));
    }
  });

  it('y-axis: columns scaled to the top tick, gridlines before columns, labels top-down with the unit', () => {
    const html = trendSvg(trend, { title: 't' }); // max 12 -> ticks 0, 5, 10, 15
    expect(html).toContain('<p class="chart-y" aria-hidden="true"><span>15</span><span>10</span><span>5</span><span>0</span></p>');
    expect(html).toContain('<p class="chart-unit" aria-hidden="true">(회)</p>');
    expect(html).not.toContain('chart-max');
    // 12 / 15 of 100 = 80 high (scaled to the max it would be the full height); 3 / 15 = 20
    expect(html).toContain('<rect class="col" x="21" y="20.00" width="8" height="80.00"/>');
    expect(html).toContain('<rect class="col" x="1" y="80.00" width="8" height="20.00"/>');
    const grids = [...html.matchAll(/<line class="grid" x1="0" y1="([\d.]+)"/g)].map((m) => m[1]);
    expect(grids).toEqual(['66.67', '33.33', '0.00']);
    expect(html.lastIndexOf('class="grid"')).toBeLessThan(html.indexOf('class="col"'));
  });

  it('all zero (or no buckets) -> no SVG, the empty sentence, table still there', () => {
    const html = trendSvg([{ label: '10/1', visits: 0, pageViews: 0 }], { title: 't' });
    expect(html).not.toContain('<svg');
    expect(html).toContain('이 기간에는 방문 기록이 없어요.');
    expect(html).toContain('표로 보기');
    expect(trendSvg([], { title: 't' })).not.toContain('<svg');
  });
});

describe('admin page visits block', () => {
  const shaped = async (opts: Parameters<typeof rumAnswer>[1] = {}, days = 7) => shapeVisits(await fetchVisits(args(fixture(opts).f, days)), days, NOW);
  const empty = async () => shapeVisits(await fetchVisits(args(api(() => ok(RUM_EMPTY)).f)), 7, NOW);
  const PREV_TOTALS = { start: 300, success: 250, fail: 25, arrive: 35 };
  const page = (extra: Record<string, unknown>) => renderAdminPage({ days: 7, now: NOW, ...extra });

  it('visits × usage present/absent: each failure is its own notice, the other block renders', async () => {
    const v = await shaped();
    const both = page({ shaped: shapeUsage(FULL), prev: PREV_TOTALS, visits: v });
    expect(both).toContain('<h2 class="group-title">방문</h2>');
    expect(both).toContain('<h2 class="group-title">도구 사용</h2>');
    expect(both.indexOf('방문</h2>')).toBeLessThan(both.indexOf('도구 사용</h2>'));
    expect(both).not.toContain('불러오지 못했어요');
    for (const t of ['많이 본 페이지', '들어온 곳', '나라', '기기', '방문 추이']) expect(both).toContain(`>${t}</h2>`);

    const visitsOnly = page({ notice: 'HTTP 500', visits: v });
    expect(visitsOnly).toContain('도구 사용 통계를 불러오지 못했어요 (HTTP 500).');
    expect(visitsOnly).toContain('<svg role="img"');
    expect(visitsOnly).not.toContain('방문 통계를 불러오지 못했어요');

    const usageOnly = page({ shaped: shapeUsage(FULL), prev: PREV_TOTALS, visitsNotice: 'HTTP 403' });
    expect(usageOnly).toContain('<p class="notice" role="status">방문 통계를 불러오지 못했어요 (HTTP 403).</p>');
    expect(usageOnly).toContain('<section aria-label="요약">');

    const neither = page({ notice: 'x', visitsNotice: '<b>' });
    expect(neither).toContain('방문 통계를 불러오지 못했어요 (&lt;b&gt;).');
    expect(neither).toContain('도구 사용 통계를 불러오지 못했어요 (x).');
  });

  it('ratio: starts / visits × 100, one decimal, "약 N회"; "-" when visits 0 or usage failed; its change in 회', async () => {
    expect(startsPer100(320, 1000)).toBe(32);
    expect(startsPer100(1, 3)).toBe(33.3);
    expect(startsPer100(5, 0)).toBeNull();
    expect(ratioDelta(31.4, 30.2, 7)).toEqual({ text: '▲ +1.2회', sr: '직전 7일보다 1.2회 늘었어요' });
    expect(ratioDelta(29.7, 30.2, 30)).toEqual({ text: '▼ -0.5회', sr: '직전 30일보다 0.5회 줄었어요' });
    expect(ratioDelta(30.2, 30.24, 1)).toEqual({ text: '0회', sr: '직전 1일보다 같아요' });
    const v = await shaped();
    const html = page({ shaped: shapeUsage(FULL), prev: PREV_TOTALS, visits: v });
    const cur = startsPer100(320, v.totals.visits)!;
    const prev = startsPer100(300, v.prevTotals!.visits)!;
    expect(html).toContain(`방문 100회당 처리 시작 (약)</dt><dd class="value">약 ${cur.toFixed(1)}회</dd><dd class="delta"><span aria-hidden="true">${ratioDelta(cur, prev, 7).text}</span>`);
    expect(html).not.toMatch(/방문 100회당 처리 시작 \(약\)<\/dt><dd class="value">[^<]*<\/dd><dd class="delta"><span aria-hidden="true">[▲▼] [+-]\d+%/);
    expect(page({ notice: 'x', visits: v })).toMatch(/방문 100회당 처리 시작 \(약\)<\/dt><dd class="value">-<\/dd>/);
    expect(page({ shaped: shapeUsage(FULL), visits: await empty() })).toMatch(/방문 100회당 처리 시작 \(약\)<\/dt><dd class="value">-<\/dd>/);
    expect(html).toContain('처리 시작은 도구 사용 기록, 방문은 Cloudflare 집계라 서로 다른 방법으로 센 값이에요. 대략적인 비교로만 보세요.');
  });

  it('"(추정)" only when Cloudflare sampled; approximate-ranking note only with approxTops; no 방문자 / 사람 수', async () => {
    const fine = page({ shaped: shapeUsage(FULL), prev: PREV_TOTALS, visits: await shaped() });
    expect(fine).toContain('<dt>방문</dt>');
    expect(fine).toContain('<dt>페이지뷰</dt>');
    expect(fine).not.toContain('(추정)');
    expect(fine).not.toContain('표본으로 세어');
    expect(fine).toContain(VISITS_NOTE);
    expect(fine).toMatch(/<dt>방문<\/dt><dd class="value">[\d,]+<\/dd><dd class="delta"><span aria-hidden="true">(▲ \+|▼ -)?\d+%<\/span><span class="sr">직전 7일보다/);
    const sampled = page({ notice: 'x', visits: await shaped({ si: 10 }) });
    expect(sampled).toContain('<dt>방문 (추정)</dt>');
    expect(sampled).toContain('<dt>페이지뷰 (추정)</dt>');
    expect(sampled).toContain('일부 숫자는 Cloudflare가 표본으로 세어 보정한 추정치예요.');
    expect(fine).not.toContain('순위는 대략적이에요');
    const many = { ...TOPS, pages: Array.from({ length: CHUNK_TOP }, (_, i) => g('requestPath', `/p${i}/`, 100 - i, 50)) };
    expect(page({ notice: 'x', days: 30, visits: await shaped({ tops: many }, 30) })).toContain('7일씩 나눠 받은 순위를 더한 값이라 순위는 대략적이에요.');
    const early = shapeVisits({ cur: { trend: [], pages: [], referrers: [], countries: [], devices: [] }, prev: null, estimated: false, approxTops: false, requests: 1 }, 7, new Date('2026-10-08T05:00:00Z'));
    expect(page({ visits: early, notice: 'x' })).toContain('<dd class="delta">비교 없음 (집계 시작 전)</dd>');
    for (const h of [fine, sampled, page({ visitsNotice: 'x', notice: 'y' }), page({ visits: await empty(), notice: 'y' })]) {
      expect(h).not.toContain('방문자');
      // The owner's note (SEO-LENGTH step 9) is the one allowed use of "사람 수".
      expect(h.replace(VISITS_NOTE, '')).not.toContain('사람 수');
    }
  });

  it('escapes hostile dimension values (path, host, device) everywhere', async () => {
    const html = page({ notice: 'x', visits: await shaped({ tops: XSS_TOPS }) });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&#39;&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('Function /admin/: usage and visits side by side', () => {
  const PW = 'correct-horse-battery';
  const ENV = { ADMIN_PASSWORD: PW, CF_ACCOUNT_ID: 'acc', AE_API_TOKEN: 'super-secret-token' };
  const AUTH = `Basic ${Buffer.from(`admin:${PW}`).toString('base64')}`;
  const stub = (rum: (body: string) => Response, sqlStatus = 200) => {
    const graphql: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (String(url).endsWith('/graphql')) {
          graphql.push(String(init.body));
          return rum(String(init.body));
        }
        if (sqlStatus !== 200) return new Response('error', { status: sqlStatus });
        const sql = String(init.body);
        return ok({ data: sql.includes('AS kind') ? PREV : sql.includes('AS event') ? FULL.events : [] });
      }),
    );
    return graphql;
  };
  const get = async (env: Record<string, string | undefined> = ENV, q = '?days=7') => (await adminFn({ request: new Request(`https://docttak.com/admin/${q}`, { headers: { authorization: AUTH } }), env })).text();
  const answer = (body: string) => ok(rumAnswer(body));

  it('both ok; GraphQL with the default site tag and never the beacon token', async () => {
    const graphql = stub(answer);
    const html = await get();
    expect(graphql.length).toBeGreaterThanOrEqual(1);
    for (const b of graphql) expect(JSON.parse(b).variables.filter.AND[2]).toEqual({ siteTag_in: [SITE_TAG] });
    expect(graphql.join('')).not.toContain('34842a72');
    expect(html).toContain('<svg role="img"');
    expect(html).toContain('<section aria-label="요약">');
    expect(html).not.toContain('불러오지 못했어요');
  });

  it('visits fail (403 / errors[]) -> visits notice, usage normal; usage fails -> usage notice, visits normal', async () => {
    stub(() => new Response('{}', { status: 403 }));
    let html = await get();
    expect(html).toContain('방문 통계를 불러오지 못했어요 (HTTP 403).');
    expect(html).toContain('<section aria-label="요약">');
    stub(() => ok(RUM_ERRORS));
    html = await get();
    expect(html).toContain('방문 통계를 불러오지 못했어요 (cannot request data older than 31d &lt;b&gt;&quot;x&quot;&lt;/b&gt;).');
    expect(html).not.toContain('super-secret-token');
    stub(answer, 500);
    html = await get();
    expect(html).toContain('도구 사용 통계를 불러오지 못했어요 (HTTP 500).');
    expect(html).toContain('<svg role="img"');
  });

  it('bad RUM_SITE_TAG -> visits notice and no GraphQL request; a valid one is used', async () => {
    let graphql = stub(() => ok(RUM_EMPTY));
    const html = await get({ ...ENV, RUM_SITE_TAG: '34842a72-not-hex' });
    expect(html).toContain('방문 통계를 불러오지 못했어요 (RUM_SITE_TAG 형식이 올바르지 않음).');
    expect(graphql).toHaveLength(0);
    graphql = stub(() => ok(RUM_EMPTY));
    await get({ ...ENV, RUM_SITE_TAG: 'ab'.repeat(16) });
    expect(graphql[0]).toContain('ab'.repeat(16));
  });

  it('90 days: 13 windows of at most 7 days, all full queries (no comparison)', async () => {
    const graphql = stub(answer);
    const html = await get(ENV, '?days=90');
    expect(graphql).toHaveLength(13);
    for (const b of graphql) {
      const w = windowOf(b);
      expect(w.full).toBe(true);
      expect(Date.parse(w.end) - Date.parse(w.start)).toBeLessThanOrEqual(7 * DAY);
    }
    expect(html).toContain('<svg role="img"');
  });
});

describe('guide titles and preset labels', () => {
  it('scripts/lib/guide-titles.mjs equals the guides and hubs (run node scripts/gen-guide-titles.mjs when stale)', () => {
    const committed = readFileSync(join(process.cwd(), 'scripts', 'lib', 'guide-titles.mjs'), 'utf8').replace(/\r\n/g, '\n');
    expect(committed, 'stale: run node scripts/gen-guide-titles.mjs').toBe(serialize(guideTitles()));
    expect(GUIDE_TITLES['photo-sizes']).toBeTruthy();
  });

  it('shapeUsage guides table shows the title; an unknown slug stays as is', () => {
    const t = shapeUsage({ guides: [{ guide: 'pdf-merge', tool: 'pdf-merge', dl: '1', n: 2 }, { guide: 'gone-guide', tool: 'pdf-merge', dl: '0', n: 1 }] }).tables[3]!;
    expect(t.rows.map((r) => r[0])).toEqual([GUIDE_TITLES['pdf-merge'], 'gone-guide']);
  });

  it('every PRESETS id has the label of src/data/id-photo-presets.ts; custom = 직접 입력', () => {
    const ts = readFileSync(join(process.cwd(), 'src', 'data', 'id-photo-presets.ts'), 'utf8');
    const labels = Object.fromEntries([...ts.matchAll(/id:\s*'([^']+)',\s*\n\s*label:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
    for (const id of PRESETS) {
      expect(labels[id], id).toBeTruthy();
      expect(VALUE_LABELS[id as keyof typeof VALUE_LABELS], id).toBe(labels[id]);
    }
    expect(VALUE_LABELS.custom).toBe('직접 입력');
  });
});
