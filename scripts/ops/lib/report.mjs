// The weekly growth report (A-5) and the R1 trigger logic (M-3, docs/REVENUE-MODEL.md §1). A report is
// reports/growth/YYYY-WW.md (ISO week of the run) and carries its numbers as one machine-readable line,
// `<!-- growth-data {json} -->`, which M-3 reads back from the committed reports.
import { cell } from './common.mjs';
import { renderTables } from '../../lib/usage.mjs';

/** R1 (AdSense) conditions: indexable pages and Search Console clicks per week, for consecutive weeks. */
export const R1 = { minPages: 15, minWeeklyClicks: 100, weeks: 4 };

/** ISO 8601 week of a UTC date: { year, week, label: 'YYYY-WW' }. */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return { year, week, label: `${year}-${String(week).padStart(2, '0')}` };
}

/** Monday (UTC ms) of an ISO week label 'YYYY-WW'. */
export function weekMonday(label) {
  const [y, w] = label.split('-').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const dayNum = jan4.getUTCDay() || 7;
  return Date.UTC(y, 0, 4) - (dayNum - 1) * 86_400_000 + (w - 1) * 7 * 86_400_000;
}

const MARK = /<!-- growth-data (\{.*\}) -->/;
export const parseReportData = (md) => {
  const m = MARK.exec(md);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
};

/**
 * R1 status from the live sitemap count and the committed reports' data (any order). The click condition holds
 * when the latest `R1.weeks` reports are consecutive ISO weeks, each with last-7-day clicks ≥ the minimum.
 * @param {number} sitemapCount
 * @param {({ week: string, gsc: { last7: { clicks: number } } | null } | null)[]} reportData
 * @returns {{ sitemapCount: number, pagesOk: boolean, streak: number, clicksOk: boolean, met: boolean, recent: { week: string, clicks: number }[] }}
 */
export function r1Status(sitemapCount, reportData) {
  const withClicks = reportData.filter((d) => d && /^\d{4}-\d{2}$/.test(d.week) && d.gsc).sort((a, b) => weekMonday(a.week) - weekMonday(b.week));
  let streak = 0;
  for (let i = withClicks.length - 1; i >= 0; i--) {
    const d = withClicks[i];
    const next = withClicks[i + 1];
    if (next && weekMonday(next.week) - weekMonday(d.week) !== 7 * 86_400_000) break;
    if (d.gsc.last7.clicks < R1.minWeeklyClicks) break;
    streak++;
  }
  const pagesOk = sitemapCount >= R1.minPages;
  const clicksOk = streak >= R1.weeks;
  return { sitemapCount, pagesOk, streak, clicksOk, met: pagesOk && clicksOk, recent: withClicks.slice(-R1.weeks).map((d) => ({ week: d.week, clicks: d.gsc.last7.clicks })) };
}

const n = (v) => Math.round(v).toLocaleString('en-US');
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const pos = (v) => (v ? v.toFixed(1) : '-');
const mb = (b) => `${(b / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })} MB`;

function rowsTable(title, rows, keyName, limit) {
  const out = [`### ${title}`, `| ${keyName} | 클릭 | 노출 | CTR | 평균 순위 |`, '|---|---:|---:|---:|---:|'];
  for (const r of rows.slice(0, limit)) out.push(`| ${cell(r.key)} | ${n(r.clicks)} | ${n(r.impressions)} | ${pct(r.ctr)} | ${pos(r.position)} |`);
  if (!rows.length) out.push('| (데이터 없음) | | | | |');
  return out.join('\n');
}

/**
 * The report markdown. data: { week, generated, sitemapCount, gsc: fetchGrowth() | null, cf: fetchTraffic() | null,
 * notes: string[], r1: r1Status() }.
 */
export function renderReport(data) {
  const { week, generated, gsc, cf, usage = null, notes, r1 } = data;
  const lines = [`# 성장 리포트 ${week}`, '', `생성: ${generated} (A-5 자동 작성, docs/OPS-RUNBOOK.md)`, ''];
  if (notes.length) lines.push(...notes.map((x) => `> ${x}`), '');
  lines.push('## 서치콘솔 (구글)');
  if (gsc) {
    lines.push(
      `| 기간 | 클릭 | 노출 | CTR | 평균 순위 |`,
      '|---|---:|---:|---:|---:|',
      `| 최근 7일 (${gsc.range7.startDate}~${gsc.range7.endDate}) | ${n(gsc.last7.clicks)} | ${n(gsc.last7.impressions)} | ${pct(gsc.last7.ctr)} | ${pos(gsc.last7.position)} |`,
      `| 최근 28일 (${gsc.range28.startDate}~${gsc.range28.endDate}) | ${n(gsc.last28.clicks)} | ${n(gsc.last28.impressions)} | ${pct(gsc.last28.ctr)} | ${pos(gsc.last28.position)} |`,
      '',
      rowsTable('상위 쿼리 (7일)', gsc.queries7, '쿼리', 15),
      '',
      rowsTable('상위 쿼리 (28일)', gsc.queries28, '쿼리', 25),
      '',
      rowsTable('상위 페이지 (28일)', gsc.pages28.map((r) => ({ ...r, key: r.key.replace(/^https:\/\/docttak\.com/, '') || '/' })), '페이지', 25),
    );
  } else lines.push('건너뜀 (위 메모 참고).');
  lines.push('', '## Cloudflare (서버 통계)');
  if (cf) {
    lines.push('| 기간 | 요청 | 캐시 요청 | 대역폭 | 페이지뷰 | 일별 순방문자 합 |', '|---|---:|---:|---:|---:|---:|');
    for (const [label, s] of [['최근 7일', cf.last7], ['최근 28일', cf.last28]]) lines.push(`| ${label} (~${cf.until}, ${s.days}일) | ${n(s.requests)} | ${n(s.cachedRequests)} | ${mb(s.bytes)} | ${n(s.pageViews)} | ${n(s.uniques)} |`);
  } else lines.push('건너뜀 (위 메모 참고).');
  lines.push('', '## 도구 사용 (지난 7일)');
  if (usage) lines.push(`성공 ${n(usage.totals.success)}회, 실패 ${n(usage.totals.fail)}회, 성공률 ${usage.totals.rate}. 기록은 3개월 동안만 남아요.`, '', renderTables(usage, 'md', 3));
  else lines.push('건너뜀 (위 메모 참고).');
  lines.push(
    '',
    '## 수익화 R1 조건 (docs/REVENUE-MODEL.md §1)',
    `- 색인 대상 페이지(sitemap): ${r1.sitemapCount}개 / 기준 ${R1.minPages}개 — ${r1.pagesOk ? '충족' : '미충족'}`,
    `- 주간 클릭 ${R1.minWeeklyClicks}회 이상 연속: ${r1.streak}주 / 기준 ${R1.weeks}주 — ${r1.clicksOk ? '충족' : '미충족'}${r1.recent.length ? ` (최근: ${r1.recent.map((x) => `${x.week} ${n(x.clicks)}`).join(', ')})` : ''}`,
    '- 개인정보처리방침 v2 공개: 사람이 확인 (M-3 이슈 체크리스트)',
    '',
    `<!-- growth-data ${JSON.stringify({ week, generated, sitemapCount: r1.sitemapCount, gsc: gsc ? { range7: gsc.range7, range28: gsc.range28, last7: gsc.last7, last28: gsc.last28 } : null, cf, usage: usage ? usage.totals : null })} -->`,
    '',
  );
  return lines.join('\n');
}
