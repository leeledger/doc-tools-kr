// The /admin/ page (briefs handoff/ARCHITECT-BRIEF-ADMIN-UI.md, ARCHITECT-BRIEF-ADMIN-VISITS.md): server HTML with
// one inline <style>, no client script, no external URL. functions/admin/[[path]].ts handles auth, headers, the
// period and the queries and hands the shaped rows here: visits (scripts/lib/visits.mjs shapeVisits) first, then
// usage (scripts/lib/usage.mjs shapeUsage). Each block has its own notice. Every string is escaped at the point of
// output. Plain ESM, no dependencies: the Function, the Node preview (scripts/qa/admin-preview.mjs) and vitest import it.
import { trendSvg } from './admin-chart.mjs';
import { COMPARE_PERIODS, PERIODS, TOOLS, escapeHtml, usageSample } from './usage.mjs';

const esc = escapeHtml;
const count = (n) => Math.round(Number.isFinite(n) ? n : 0).toLocaleString('en-US');
const pct = (x) => `${Math.round(x)}%`;

const KST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** A Date -> "YYYY-MM-DD HH:mm" in Korean time (from formatToParts, so the output does not depend on the locale data). */
export function formatKst(date) {
  const p = Object.fromEntries(KST.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** PUBLIC_USAGE_SAMPLE -> the share in [0.01, 1], or null when the value is invalid (the page must not fail on it). */
export function sampleShareOf(value) {
  try {
    return usageSample(value);
  } catch {
    return null;
  }
}

/**
 * The change of `cur` against `prev` for a KPI card: { text (visible, with ▲/▼), sr (sentence for screen readers) }.
 * `kind` "count": percent change; "rate": percentage points (cur / prev in percent, null without attempts).
 * `prev` undefined/null for counts means no comparison; `none` is the text shown then.
 */
export function delta(cur, prev, days, kind = 'count', none = '비교 없음') {
  const than = `직전 ${days}일보다`;
  if (kind === 'rate') {
    if (prev === undefined) return { text: none, sr: '' };
    if (prev === null && cur === null) return { text: '변화 없음', sr: '' };
    if (prev === null) return { text: '새로 생김', sr: `${than} 새로 생겼어요` };
    if (cur === null) return { text: '변화 없음', sr: '' };
    const d = Math.round(cur - prev);
    if (d > 0) return { text: `▲ +${d}%p`, sr: `${than} ${d}%p 올랐어요` };
    if (d < 0) return { text: `▼ -${-d}%p`, sr: `${than} ${-d}%p 내렸어요` };
    return { text: '0%p', sr: `${than} 같아요` };
  }
  if (prev === undefined || prev === null) return { text: none, sr: '' };
  if (prev === 0 && cur === 0) return { text: '변화 없음', sr: '' };
  if (prev === 0) return { text: '새로 생김', sr: `${than} 새로 생겼어요` };
  const d = Math.round(((cur - prev) / prev) * 100);
  if (d > 0) return { text: `▲ +${d}%`, sr: `${than} ${d}% 늘었어요` };
  if (d < 0) return { text: `▼ -${-d}%`, sr: `${than} ${-d}% 줄었어요` };
  return { text: '0%', sr: `${than} 같아요` };
}

const LEVELS = {
  good: { glyph: '●', word: '좋음' },
  warn: { glyph: '▲', word: '주의' },
  bad: { glyph: '■', word: '낮음' },
  few: { glyph: '○', word: '표본 적음' },
};

/** Success rate level: good ≥95, warn 80-94, bad <80 (on the rounded %), few under 20 attempts, none without any. */
export function rateLevel(success, fail) {
  const attempts = success + fail;
  if (!(attempts > 0)) return { level: 'none', rate: null };
  const rate = Math.round((success / attempts) * 100);
  const level = attempts < 20 ? 'few' : rate >= 95 ? 'good' : rate >= 80 ? 'warn' : 'bad';
  return { level, rate };
}

/** Bar width: integer 0-100 of n against max (max not above 0, or not numbers -> 0). */
export function barPct(n, max) {
  if (!Number.isFinite(n) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((n / max) * 100)));
}

/** The success-rate pill: shape glyph + % + word, never colour alone. */
function pill(success, fail) {
  const { level, rate } = rateLevel(success, fail);
  if (level === 'none') return '<span class="muted">-</span>';
  const l = LEVELS[level];
  return `<span class="pill ${level}"><span aria-hidden="true">${l.glyph}</span> ${rate}% ${l.word}</span>`;
}

const EMPTY_SECTION = '<p class="muted">이 기간에는 기록이 없어요.</p>';

/** A titled section with one table inside a horizontal scroll region (or the empty message). */
function section(id, title, head, rows, numCols) {
  const h = `<h2 id="${id}">${esc(title)}</h2>`;
  if (!rows.length) return `<section aria-labelledby="${id}">\n${h}\n${EMPTY_SECTION}\n</section>`;
  const cls = (i) => (numCols.includes(i) ? ' class="num"' : '');
  const thead = `<tr>${head.map((x, i) => `<th scope="col"${cls(i)}>${esc(x)}</th>`).join('')}</tr>`;
  const tbody = rows.map((r) => `<tr>${r.map((c, i) => `<td${cls(i)}>${c}</td>`).join('')}</tr>`).join('\n');
  return `<section aria-labelledby="${id}">
${h}
<div class="scroll" role="region" aria-label="${esc(title)}" tabindex="0">
<table aria-labelledby="${id}">
<thead>${thead}</thead>
<tbody>
${tbody}
</tbody>
</table>
</div>
</section>`;
}

function kpiCard(label, value, d, cls = '') {
  const sr = d.sr ? `<span class="sr">${esc(d.sr)}</span>` : '';
  const shown = d.sr ? `<span aria-hidden="true">${esc(d.text)}</span>` : esc(d.text);
  return `<dl class="card${cls}"><dt>${esc(label)}</dt><dd class="value">${esc(value)}</dd><dd class="delta">${shown}${sr}</dd></dl>`;
}

function kpis(kpi, prev, days) {
  const compares = COMPARE_PERIODS.includes(days);
  const none = compares ? '비교 없음' : '비교 없음 (기록은 3개월만 남아요)';
  const p = compares && prev ? prev : null;
  const prevRate = p ? (p.success + p.fail > 0 ? (p.success / (p.success + p.fail)) * 100 : null) : undefined;
  const label = compares && p ? `<p class="muted kpi-note">직전 ${days}일 대비</p>` : '';
  return `<section aria-label="요약">
<div class="kpis">
${kpiCard('처리 시작', count(kpi.start), delta(kpi.start, p?.start, days, 'count', none))}
${kpiCard('성공', count(kpi.success), delta(kpi.success, p?.success, days, 'count', none))}
${kpiCard('성공률', kpi.rate === null ? '-' : pct(kpi.rate), delta(kpi.rate, prevRate, days, 'rate', none), ' wide')}
${kpiCard('실패', count(kpi.fail), delta(kpi.fail, p?.fail, days, 'count', none))}
${kpiCard('안내 글에서 넘어옴', count(kpi.arrive), delta(kpi.arrive, p?.arrive, days, 'count', none))}
</div>
${label}
</section>`;
}

function toolsSection(tools) {
  const sorted = [...tools].sort((a, b) => b.start - a.start || TOOLS.indexOf(a.tool) - TOOLS.indexOf(b.tool));
  const max = Math.max(0, ...sorted.map((t) => t.start));
  const rows = sorted.map((t) => [
    `<span class="tool">${esc(t.label)}</span>`,
    `<span class="barcell"><span class="track"><span class="bar" aria-hidden="true" style="width:${barPct(t.start, max)}%"></span></span><span>${count(t.start)}</span></span>`,
    count(t.success),
    count(t.fail),
    pill(t.success, t.fail),
    count(t.pick),
    count(t.download),
  ]);
  return section('s-tools', '도구별', ['도구', '처리 시작', '성공', '실패', '성공률', '파일 고름', '내려받음'], rows, [1, 2, 3, 4, 5, 6]);
}

function failSection(failRows) {
  const rows = failRows.map((r) => [
    esc(r.toolLabel),
    r.codeLabel === null ? `<code>${esc(r.code)}</code>` : `${esc(r.codeLabel)}<br><code>${esc(r.code)}</code>`,
    esc(r.phaseLabel),
    count(r.n),
  ]);
  return section('s-fails', '실패 이유', ['도구', '이유', '단계', '횟수'], rows, [3]);
}

/** A shaped string table (shapeUsage tables) with the given numeric columns. */
const shapedSection = (id, table, numCols) => section(id, table.title, table.head, table.rows.map((r) => r.map(esc)), numCols);

function viaSection(tools) {
  const rows = tools.map((t) => [esc(t.label), pill(t.guide.success, t.guide.fail), pill(t.direct.success, t.direct.fail)]);
  return section('s-via', '안내에서 온 경우와 바로 온 경우 성공률', ['도구', '안내에서 옴', '바로 옴'], rows, [1, 2]);
}

function isEmpty(shaped) {
  return !shaped.tools.length && !shaped.kpi.arrive && !shaped.failRows.length && shaped.tables.every((t) => !t.rows.length);
}

function emptyBlock(days) {
  const longer = PERIODS.filter((d) => d > days);
  const links = longer.length ? `\n<p>${longer.map((d) => `<a href="?days=${d}">지난 ${d}일 보기</a>`).join(' ')}</p>` : '';
  return `<section class="empty" aria-label="기록 없음">
<p class="empty-title">이 기간에는 아직 기록이 없어요</p>
<p class="muted">도구를 쓰면 몇 분 뒤에 여기에 나타나요.</p>${links}
</section>`;
}

/** Visits per 100 starts ratio: usage starts / visits × 100 (one decimal), null when visits are 0 or usage failed. */
export function startsPer100(start, visits) {
  if (!Number.isFinite(start) || !(visits > 0)) return null;
  return Math.round((start / visits) * 1000) / 10;
}

export const VISITS_NOTE = '방문 수는 2026년 10월 7일부터 집계했어요. 봇은 대부분 빠지지만 같은 사람의 재방문도 각각 세므로, 실제 사람 수보다 조금 많을 수 있어요.';
const VISITS_ESTIMATE = '일부 숫자는 Cloudflare가 표본으로 세어 보정한 추정치예요.';
const APPROX_TOPS = '7일씩 나눠 받은 순위를 더한 값이라 순위는 대략적이에요.';

/**
 * The ratio card's change in its own unit (회 per 100 visits, one decimal): { text, sr } like delta().
 * @param {number} cur
 * @param {number} prev
 * @param {number} days
 */
export function ratioDelta(cur, prev, days) {
  const d = Math.round((cur - prev) * 10) / 10;
  const than = `직전 ${days}일보다`;
  if (d > 0) return { text: `▲ +${d.toFixed(1)}회`, sr: `${than} ${d.toFixed(1)}회 늘었어요` };
  if (d < 0) return { text: `▼ -${(-d).toFixed(1)}회`, sr: `${than} ${(-d).toFixed(1)}회 줄었어요` };
  return { text: '0회', sr: `${than} 같아요` };
}
const RATIO_NOTE = '처리 시작은 도구 사용 기록, 방문은 Cloudflare 집계라 서로 다른 방법으로 센 값이에요. 대략적인 비교로만 보세요.';

function visitsKpis(visits, kpi, prevUsage, days) {
  const compares = COMPARE_PERIODS.includes(days);
  const none = visits.prevBeforeStart ? '비교 없음 (집계 시작 전)' : '비교 없음';
  const p = compares ? visits.prevTotals : null;
  const ratio = kpi ? startsPer100(kpi.start, visits.totals.visits) : null;
  const prevRatio = p && prevUsage ? startsPer100(prevUsage.start, p.visits) : null;
  const rDelta = ratio !== null && prevRatio !== null ? ratioDelta(ratio, prevRatio, days) : { text: none, sr: '' };
  const label = p ? `<p class="muted kpi-note">직전 ${days}일 대비</p>` : '';
  const est = visits.estimated ? ' (추정)' : '';
  return `<section aria-label="방문 요약">
<div class="kpis kpis3">
${kpiCard(`방문${est}`, count(visits.totals.visits), delta(visits.totals.visits, p?.visits, days, 'count', none))}
${kpiCard(`페이지뷰${est}`, count(visits.totals.pageViews), delta(visits.totals.pageViews, p?.pageViews, days, 'count', none))}
${kpiCard('방문 100회당 처리 시작 (약)', ratio === null ? '-' : `약 ${ratio.toFixed(1)}회`, rDelta, ' wide')}
</div>
${label}
</section>`;
}

function visitsBlock({ visits, visitsNotice, kpi, prevUsage, days }) {
  const head = `<h2 class="group-title">방문</h2>
<p class="muted group-note">${esc(VISITS_NOTE)}${visits?.estimated ? ` ${esc(VISITS_ESTIMATE)}` : ''}</p>`;
  if (visitsNotice !== undefined || !visits) return `<div class="group" id="visits">
${head}
<p class="notice" role="status">방문 통계를 불러오지 못했어요 (${esc(visitsNotice ?? '')}).</p>
</div>`;
  const n = (x) => count(x);
  const chart = `<section aria-labelledby="s-trend">
<h2 id="s-trend">방문 추이</h2>
${trendSvg(visits.trend, { title: `지난 ${days}일 방문 추이 (${days === 1 ? '시간별' : '날짜별'})` })}
</section>`;
  return `<div class="group" id="visits">
${head}
${visitsKpis(visits, kpi, prevUsage, days)}
<p class="muted ratio-note">${esc(RATIO_NOTE)}</p>
${chart}
${section('s-pages', '많이 본 페이지', ['페이지', '주소', '방문', '페이지뷰'], visits.pages.map((r) => [esc(r.label), `<code>${esc(r.path)}</code>`, n(r.visits), n(r.pageViews)]), [2, 3])}
${section('s-referrers', '들어온 곳', ['들어온 곳', '방문', '페이지뷰'], visits.referrers.map((r) => [esc(r.label), n(r.visits), n(r.pageViews)]), [1, 2])}
${section('s-countries', '나라', ['나라', '방문'], visits.countries.map((r) => [esc(r.label), n(r.visits)]), [1])}
${section('s-devices', '기기', ['기기', '방문'], visits.devices.map((r) => [esc(r.label), n(r.visits)]), [1])}${visits.approxTops ? `\n<p class="muted ratio-note">${esc(APPROX_TOPS)}</p>` : ''}
</div>`;
}

const STYLE = `
:root{color-scheme:light dark;--bg:#f5f7f6;--surface:#fff;--text:#12201d;--muted:#4b5b57;--line:#d5dedb;--brand:#0f766e;--on-brand:#fff;--track:#e3ebe9;--bar:#5aa69c;
--good:#0f766e;--good-bg:#e7f5f2;--warn:#b45309;--warn-bg:#fdf4e4;--bad:#b91c1c;--bad-bg:#fdeded;--few:#4b5563;--few-bg:#eef0f2;--notice-bg:#fff4e5;--notice-line:#f0b46a}
@media (prefers-color-scheme:dark){:root{--bg:#0b1210;--surface:#111c19;--text:#e6f0ed;--muted:#a6b8b3;--line:#26362f;--brand:#5eead4;--on-brand:#0b1210;--track:#1d2b27;--bar:#2f9e8f;
--good:#5eead4;--good-bg:#12302b;--warn:#fbbf24;--warn-bg:#2e2410;--bad:#f87171;--bad-bg:#331717;--few:#b4bcc8;--few-bg:#1f2826;--notice-bg:#2a1f0b;--notice-line:#8a6420}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 system-ui,-apple-system,"Segoe UI","Apple SD Gothic Neo","Malgun Gothic",sans-serif}
.wrap{max-width:1040px;margin:0 auto;padding:20px 16px 40px}
h1{font-size:22px;margin:0 0 2px}
.sub{margin:0 0 14px;color:var(--muted)}
h2{font-size:17px;margin:0 0 10px}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 20px}
.tabs a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:60px;padding:0 16px;border:1.5px solid var(--brand);border-radius:999px;color:var(--brand);text-decoration:none;font-weight:600}
.tabs a[aria-current="page"]{background:var(--brand);color:var(--on-brand)}
.tabs a:focus-visible,.scroll:focus-visible,.empty a:focus-visible{outline:3px solid var(--brand);outline-offset:2px}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.card{margin:0;padding:14px;background:var(--surface);border:1px solid var(--line);border-radius:12px}
.card dt{color:var(--muted);font-size:14px}
.card dd{margin:0}
.card .value{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.3}
.card .delta{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.kpi-note{margin:6px 0 0;font-size:13px}
section{margin:0 0 24px}
section[aria-labelledby]{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px}
.scroll{overflow-x:auto;border-radius:8px}
table{border-collapse:collapse;width:100%}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;white-space:nowrap}
th{font-size:13px;color:var(--muted);font-weight:600}
.num{text-align:right;font-variant-numeric:tabular-nums}
.scroll th:first-child,.scroll td:first-child{position:sticky;left:0;z-index:1;background:var(--surface);white-space:normal;word-break:keep-all;min-width:6.5em;max-width:10em}
tbody tr:last-child td{border-bottom:0}
.barcell{display:inline-flex;align-items:center;gap:8px;justify-content:flex-end}
.track{display:inline-block;width:72px;height:8px;border-radius:4px;background:var(--track);overflow:hidden}
.bar{display:block;height:100%;background:var(--bar)}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:13px;font-weight:600;white-space:nowrap}
.pill.good{color:var(--good);background:var(--good-bg)}.pill.warn{color:var(--warn);background:var(--warn-bg)}
.pill.bad{color:var(--bad);background:var(--bad-bg)}.pill.few{color:var(--few);background:var(--few-bg)}
code{font:12px/1.4 ui-monospace,Consolas,monospace;color:var(--muted);overflow-wrap:anywhere}
.muted{color:var(--muted)}
.notice{background:var(--notice-bg);border:1px solid var(--notice-line);border-radius:10px;padding:10px 14px}
.empty{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:28px 16px;text-align:center}
.empty-title{font-size:18px;font-weight:700;margin:0 0 4px}
.empty a{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;color:var(--brand);font-weight:600}
footer{color:var(--muted);font-size:14px}
footer p{margin:0 0 4px}
.sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.group-title{font-size:20px;margin:0 0 4px}
.group-note{margin:0 0 12px;font-size:14px}
.ratio-note{margin:-12px 0 24px;font-size:13px}
.group{margin:0 0 32px}
.kpis3{grid-template-columns:repeat(3,1fr)}
.chart{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:8px;margin:0 0 8px}
.chart svg{grid-column:2;display:block;width:100%;height:160px;overflow:visible;color:var(--brand)}
.chart-unit{grid-column:1;margin:0 0 12px;font-size:12px;line-height:16px;color:var(--muted);text-align:right}
.chart-y{grid-column:1;display:flex;flex-direction:column;justify-content:space-between;height:176px;margin:-8px 0;font-size:12px;line-height:16px;color:var(--muted);text-align:right;font-variant-numeric:tabular-nums}
.chart .col{fill:currentColor}
.chart .hit{fill:transparent}
.chart .grid{stroke:var(--line);stroke-width:1}
.chart .base{stroke:var(--muted);stroke-width:1}
.chart-x{grid-column:2;display:flex;justify-content:space-between;gap:8px;margin:4px 0 0;font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.chart-table summary{display:inline-flex;align-items:center;min-height:44px;cursor:pointer;color:var(--brand);font-weight:600}
.chart-table summary:focus-visible{outline:3px solid var(--brand);outline-offset:2px}
@media (max-width:600px){.kpis{grid-template-columns:repeat(2,1fr)}.card.wide{grid-column:span 2}.card .value{font-size:22px}section[aria-labelledby]{padding:12px}}
`;

/**
 * The whole /admin/ page. The visits block appears when `visits` (shapeVisits) or `visitsNotice` is given; `notice`
 * replaces only the usage block.
 * @param {{ days: number, shaped?: any, prev?: { start: number, success: number, fail: number, arrive: number } | null,
 *   now?: Date, sampleShare?: number | null, notice?: string, visits?: any, visitsNotice?: string }} opts
 */
export function renderAdminPage({ days, shaped, prev = null, now, sampleShare = null, notice, visits, visitsNotice }) {
  const tabs = PERIODS.map((d) => `<a href="?days=${d}"${d === days ? ' aria-current="page"' : ''}>${d}일</a>`).join('');
  const when = now instanceof Date && !Number.isNaN(now.getTime()) ? ` · ${formatKst(now)} 기준 (한국 시간)` : '';
  let body;
  const usageOk = notice === undefined && Boolean(shaped);
  if (!usageOk) body = `<p class="notice" role="status">도구 사용 통계를 불러오지 못했어요 (${esc(notice ?? '')}).</p>`;
  else if (isEmpty(shaped)) body = emptyBlock(days);
  else {
    const [, , settings, guides] = shaped.tables;
    body = [kpis(shaped.kpi, prev, days), toolsSection(shaped.tools), failSection(shaped.failRows), shapedSection('s-settings', settings, [3]), shapedSection('s-guides', guides, [2, 3]), viaSection(shaped.tools)].join('\n');
  }
  const hasVisits = visits !== undefined || visitsNotice !== undefined;
  const visitsHtml = hasVisits ? `${visitsBlock({ visits, visitsNotice, kpi: usageOk ? shaped.kpi : null, prevUsage: usageOk ? prev : null, days })}\n` : '';
  const usageHead = hasVisits ? '<h2 class="group-title">도구 사용</h2>\n' : '';
  const sample = typeof sampleShare === 'number' && sampleShare < 1 ? `\n<p>지금은 방문의 ${Math.round(sampleShare * 100)}%만 기록해요.</p>` : '';
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="light dark">
<title>문서딱 방문·사용 통계</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header>
<h1>문서딱 방문·사용 통계</h1>
<p class="sub">지난 ${esc(days)}일${when}</p>
<nav class="tabs" aria-label="기간">${tabs}</nav>
</header>
<main>
${visitsHtml}${usageHead}${body}
</main>
<footer>
<p>기록은 3개월 동안만 남아요.</p>
<p>숫자는 추정치예요. 방문이 많으면 일부만 세고 비율로 보정해요. 기록은 몇 분 늦게 들어올 수 있어요.</p>${sample}
</footer>
</div>
</body>
</html>`;
}
