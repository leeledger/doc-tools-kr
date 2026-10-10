// /admin/ page renderer (brief handoff/ARCHITECT-BRIEF-ADMIN-UI.md, "Test map"): the previous-period query, the
// admin fields of shapeUsage, fail-code labels and the HTML of scripts/lib/admin-view.mjs.
import { describe, expect, it, vi } from 'vitest';
import { FAIL_LABELS, UsageApiError, fetchPrevTotals, shapeUsage, usagePrevSql } from '../../scripts/lib/usage.mjs';
import { barPct, delta, formatKst, rateLevel, renderAdminPage, sampleShareOf } from '../../scripts/lib/admin-view.mjs';
import { EMPTY, FULL, PREV, XSS } from '../fixtures/usage-rows.mjs';

const NOW = new Date('2026-10-07T05:03:00Z');
const PREV_TOTALS = { start: 300, success: 250, fail: 25, arrive: 35 };
const page = (days: number, rows = FULL, prev: typeof PREV_TOTALS | null = PREV_TOTALS, extra: Record<string, unknown> = {}) =>
  renderAdminPage({ days, shaped: shapeUsage(rows), prev, now: NOW, ...extra });
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe('previous-period query', () => {
  it('usagePrevSql: exact SQL for 1 / 7 / 30; throws for 90 and a bad dataset', () => {
    expect(usagePrevSql('docttak_usage', 7)).toBe(
      "SELECT blob1 AS kind, SUM(_sample_interval * double1) AS n FROM docttak_usage WHERE timestamp > NOW() - INTERVAL '14' DAY AND timestamp <= NOW() - INTERVAL '7' DAY GROUP BY blob1 FORMAT JSON",
    );
    expect(usagePrevSql('docttak_usage', 1)).toContain("INTERVAL '2' DAY AND timestamp <= NOW() - INTERVAL '1' DAY");
    expect(usagePrevSql('x_y', 30)).toContain("FROM x_y WHERE timestamp > NOW() - INTERVAL '60' DAY AND timestamp <= NOW() - INTERVAL '30' DAY");
    expect(() => usagePrevSql('docttak_usage', 90)).toThrow();
    expect(() => usagePrevSql('docttak_usage', 365)).toThrow();
    expect(() => usagePrevSql('x; DROP TABLE y', 7)).toThrow();
  });

  it('fetchPrevTotals maps kinds to numbers, ignores unknown kinds, errors -> UsageApiError', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ data: [...PREV, { kind: 'start', n: '5' }] })));
    expect(await fetchPrevTotals({ accountId: 'a', token: 't', dataset: 'docttak_usage', days: 7, fetch: f as never })).toEqual({ start: 305, success: 250, fail: 25, arrive: 35 });
    expect(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).toContain('AS kind');
    const err = fetchPrevTotals({ accountId: 'a', token: 't', dataset: 'docttak_usage', days: 7, fetch: (async () => new Response('x', { status: 429 })) as never });
    await expect(err).rejects.toBeInstanceOf(UsageApiError);
    await expect(err).rejects.toMatchObject({ status: 429 });
  });
});

describe('shapeUsage admin fields', () => {
  it('kpi, tools (TOOLS order, raw numbers) and failRows (labels; unknown code -> null label)', () => {
    const s = shapeUsage(FULL);
    expect(s.kpi.start).toBe(320);
    expect(s.kpi.success).toBe(280);
    expect(s.kpi.fail).toBe(33);
    expect(s.kpi.arrive).toBe(35);
    expect(s.kpi.rate).toBeCloseTo((280 / 313) * 100, 6);
    expect(s.tools.map((t) => t.tool)).toEqual(['pdf-merge', 'pdf-compress', 'photo-compress', 'id-photo', 'hwp-to-pdf', 'jpg-to-pdf']);
    expect(s.tools[1]).toEqual({ tool: 'pdf-compress', label: 'PDF 용량 줄이기', pick: 95, start: 80, success: 70, fail: 10, download: 66, guide: { success: 10, fail: 0 }, direct: { success: 60, fail: 10 } });
    expect(s.failRows[0]).toEqual({ tool: 'pdf-merge', toolLabel: 'PDF 합치기', code: 'corrupt', codeLabel: '손상된 파일', phaseLabel: '파일 읽기', n: 9 });
    expect(s.failRows.find((r) => r.code === 'mystery-code')!.codeLabel).toBeNull();
    expect(shapeUsage({}).kpi).toEqual({ start: 0, success: 0, fail: 0, rate: null, arrive: 0 });
  });

  it('every fail code the tools send has a Korean label', () => {
    const SENT = [
      'engine', 'unknown', 'corrupt', 'empty', 'not-image', 'not-pdf', 'not-hwp', 'animated', 'dims', 'oom', 'timeout', 'too-large', 'too-big', 'too-many',
      'truncated', 'unsupported', 'verify', 'zip', 'encode', 'noimage', 'already-encrypted', 'not-encrypted', 'password', 'wrong-password', 'distribution',
      'heic', 'canvas', 'crash', 'mask', 'nosubject', 'unreachable', 'target-unreachable', 'network', 'model-corrupt', 'allpaper', 'noink',
      'cloud-busy', 'cloud-quota', 'cloud-failed', 'encoder', 'no-pages', 'no-image', 'already-hwp', 'unverified', 'export',
    ];
    for (const c of SENT) expect(FAIL_LABELS[c as keyof typeof FAIL_LABELS], c).toMatch(/[가-힣]/);
  });
});

describe('helpers', () => {
  it('formatKst: fixed instant -> Korean time', () => {
    expect(formatKst(NOW)).toBe('2026-10-07 14:03');
    expect(formatKst(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01 00:00');
  });

  it('delta: up, down, zero, prev 0, both 0, rate in %p, no comparison', () => {
    expect(delta(112, 100, 7)).toEqual({ text: '▲ +12%', sr: '직전 7일보다 12% 늘었어요' });
    expect(delta(92, 100, 7)).toEqual({ text: '▼ -8%', sr: '직전 7일보다 8% 줄었어요' });
    expect(delta(100, 100, 7)).toEqual({ text: '0%', sr: '직전 7일보다 같아요' });
    expect(delta(5, 0, 1).text).toBe('새로 생김');
    expect(delta(0, 0, 1).text).toBe('변화 없음');
    expect(delta(93, 90, 30, 'rate')).toEqual({ text: '▲ +3%p', sr: '직전 30일보다 3%p 올랐어요' });
    expect(delta(88, 90, 30, 'rate').text).toBe('▼ -2%p');
    expect(delta(5, null, 7).text).toBe('비교 없음');
    expect(delta(5, undefined, 90, 'rate', '비교 없음 (기록은 3개월만 남아요)').text).toBe('비교 없음 (기록은 3개월만 남아요)');
  });

  it('rateLevel at 95 / 94 / 80 / 79, few under 20 attempts, none without attempts', () => {
    expect(rateLevel(95, 5)).toEqual({ level: 'good', rate: 95 });
    expect(rateLevel(94, 6)).toEqual({ level: 'warn', rate: 94 });
    expect(rateLevel(80, 20)).toEqual({ level: 'warn', rate: 80 });
    expect(rateLevel(79, 21)).toEqual({ level: 'bad', rate: 79 });
    expect(rateLevel(19, 0)).toEqual({ level: 'few', rate: 100 });
    expect(rateLevel(20, 0).level).toBe('good');
    expect(rateLevel(0, 0)).toEqual({ level: 'none', rate: null });
  });

  it('barPct: integer clamp 0-100; max 0 or not numbers -> 0', () => {
    expect(barPct(50, 120)).toBe(42);
    expect(barPct(120, 120)).toBe(100);
    expect(barPct(500, 120)).toBe(100);
    expect(barPct(-5, 120)).toBe(0);
    expect(barPct(5, 0)).toBe(0);
    expect(barPct(Number.NaN, 10)).toBe(0);
    expect(barPct(5, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('sampleShareOf: 0.25 -> 0.25; unset -> 1; bad -> null', () => {
    expect(sampleShareOf('0.25')).toBe(0.25);
    expect(sampleShareOf(undefined)).toBe(1);
    expect(sampleShareOf('lots')).toBeNull();
    expect(sampleShareOf('5')).toBeNull();
  });
});

describe('renderAdminPage', () => {
  it.each([1, 7, 30, 90])('structure for %i days: one h1, 5 KPI cards, 4 period links, one aria-current, accessible tables, no script, no external URL', (days) => {
    const html = page(days);
    expect(html).toContain('<html lang="ko">');
    expect(count(html, /<h1>/g)).toBe(1);
    expect(html).toContain('<section aria-label="요약">');
    expect(count(html, /<dl class="card/g)).toBe(5);
    expect(html).toContain('<nav class="tabs" aria-label="기간">');
    for (const d of [1, 7, 30, 90]) expect(html).toMatch(new RegExp(`<a href="\\?days=${d}"[^>]*>${d}일</a>`));
    expect(count(html, /<a [^>]*aria-current="page"/g)).toBe(1);
    expect(html).toContain(`<a href="?days=${days}" aria-current="page">${days}일</a>`);
    const tables = count(html, /<table/g);
    expect(tables).toBe(5);
    expect(count(html, /<table aria-labelledby="s-[a-z]+">/g)).toBe(tables);
    expect(count(html, /<th(?=[\s>])(?! scope="col")/g)).toBe(0);
    expect(count(html, /role="region" aria-label="[^"]+" tabindex="0"/g)).toBe(tables);
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/(src=|href=|url\()["']?\s*(https?:)?\/\//i);
    expect(html).toContain(`지난 ${days}일 · 2026-10-07 14:03 기준 (한국 시간)`);
  });

  it('KPI deltas: vs the previous period with screen-reader sentences; prev null -> 비교 없음; 90 days -> retention note', () => {
    const html = page(7);
    expect(html).toContain('직전 7일 대비');
    expect(html).toContain('<span aria-hidden="true">▲ +7%</span><span class="sr">직전 7일보다 7% 늘었어요</span>'); // 320 vs 300
    expect(html).toContain('직전 7일보다 12% 늘었어요'); // 280 vs 250
    expect(html).toContain('▲ +32%'); // fail 33 vs 25
    expect(html).toContain('▼ -1%p'); // 89.5% vs 90.9%
    expect(page(7, FULL, null)).toContain('<dd class="delta">비교 없음</dd>');
    expect(page(7, FULL, null)).not.toContain('직전 7일 대비');
    const p90 = page(90);
    expect(count(p90, /비교 없음 \(기록은 3개월만 남아요\)/g)).toBe(5);
  });

  it('per-tool table: sorted by 처리 시작, bars from numbers, every rate pill has a word', () => {
    const html = page(7);
    const order = ['사진 용량 줄이기', 'PDF 용량 줄이기', 'PDF 합치기', 'HWP PDF 변환', '증명사진 규격 맞추기', '사진 PDF 변환'].map((l) => html.indexOf(`<span class="tool">${l}</span>`));
    expect(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1]!))).toBe(true);
    expect(html).toContain('style="width:100%"');
    expect(html).toContain('style="width:67%"'); // 80 / 120
    expect(html).toContain('style="width:0%"'); // jpg-to-pdf
    expect(html).toContain('<span class="pill good"><span aria-hidden="true">●</span> 97% 좋음</span>');
    expect(html).toContain('<span class="pill warn"><span aria-hidden="true">▲</span> 88% 주의</span>');
    expect(html).toContain('<span class="pill bad"><span aria-hidden="true">■</span> 73% 낮음</span>');
    expect(html).toContain('<span class="pill few"><span aria-hidden="true">○</span> 80% 표본 적음</span>');
    for (const m of html.match(/<span class="pill [a-z]+">.*?<\/span> [^<]*<\/span>/g) ?? []) expect(m).toMatch(/(좋음|주의|낮음|표본 적음)<\/span>$/);
  });

  it('fail reasons: Korean label with the raw code underneath; an unknown code shows the raw code only', () => {
    const html = page(7);
    expect(html).toContain('손상된 파일<br><code>corrupt</code>');
    expect(html).toContain('<td><code>mystery-code</code></td>');
  });

  it('escapes every value at the renderer (XSS fixture)', () => {
    const html = page(7, XSS);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
  });

  it('empty: no events at all -> one friendly block with only longer-period links; one empty section -> its message', () => {
    const e7 = page(7, EMPTY);
    expect(e7).toContain('이 기간에는 아직 기록이 없어요');
    expect(e7).toContain('도구를 쓰면 몇 분 뒤에 여기에 나타나요.');
    expect(e7).not.toContain('<section aria-label="요약">');
    expect(e7).toContain('<a href="?days=30">지난 30일 보기</a> <a href="?days=90">지난 90일 보기</a>');
    expect(e7).not.toContain('지난 1일 보기');
    expect(page(90, EMPTY)).not.toContain('보기</a>');
    const noFails = page(7, { ...FULL, fails: [] });
    expect(noFails).toMatch(/<h2 id="s-fails">실패 이유<\/h2>\n<p class="muted">이 기간에는 기록이 없어요.<\/p>/);
    expect(count(noFails, /<table/g)).toBe(4);
  });

  it('error notice: exact text with role="status" inside the shell with the tabs', () => {
    const html = renderAdminPage({ days: 30, notice: 'HTTP 500', now: NOW });
    expect(html).toContain('<p class="notice" role="status">도구 사용 통계를 불러오지 못했어요 (HTTP 500).</p>');
    expect(html).toContain('<a href="?days=30" aria-current="page">30일</a>');
    expect(html).toContain('<h1>문서딱 방문·사용 통계</h1>');
    expect(html).toContain('<title>문서딱 방문·사용 통계</title>');
    expect(renderAdminPage({ days: 7, notice: '<b>' })).toContain('(&lt;b&gt;)');
  });

  it('footer: retention, sampling note; sample sentence only under 1', () => {
    const base = page(7);
    expect(base).toContain('기록은 3개월 동안만 남아요.');
    expect(base).toContain('숫자는 추정치예요. 방문이 많으면 일부만 세고 비율로 보정해요. 기록은 몇 분 늦게 들어올 수 있어요.');
    expect(base).not.toContain('만 기록해요');
    expect(page(7, FULL, PREV_TOTALS, { sampleShare: 0.25 })).toContain('지금은 방문의 25%만 기록해요.');
    expect(page(7, FULL, PREV_TOTALS, { sampleShare: 1 })).not.toContain('만 기록해요');
    expect(page(7, FULL, PREV_TOTALS, { sampleShare: null })).not.toContain('만 기록해요');
  });

  it('full page for FULL at 7 days (file snapshot)', async () => {
    await expect(page(7)).toMatchFileSnapshot('./__snapshots__/admin-full-7.html');
  });
});
