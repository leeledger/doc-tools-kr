// 캠페인별 유입 (REQ1014-A D14/D15): marked-link landings (land) and the starts/successes the same tab made within
// 3 hours, by utm source and campaign (blob13 / blob14 of the usage rows, scripts/lib/usage.mjs). Read by the admin
// page (functions/admin/[[path]].ts) and the weekly report (scripts/ops/growth.mjs). Plain ESM, no dependencies.
import { CAMPAIGN_LABELS, CAMPAIGN_RE, DATASET_RE, PERIODS, UTM_SOURCES, UTM_SOURCE_LABELS, runSql } from './usage.mjs';

/** Rows the admin table shows; the weekly report shows fewer. */
export const CAMPAIGN_TOP = 30;
export const CAMPAIGN_HEAD = ['들어온 곳', '캠페인', '방문', '처리 시작', '성공'];
export const CAMPAIGN_NOTE = '블로그 링크 주소에 붙은 표시(utm)로 센 값이에요. 같은 탭에서 3시간 안에 이어진 처리 시작·성공도 그 링크 몫으로 셉니다. 위 방문(Cloudflare)과는 세는 방법이 달라요.';

/** The one query (constants, a whitelisted period and a validated dataset name only). Throws like usageSql. */
export function campaignSql(dataset, days) {
  if (!DATASET_RE.test(dataset ?? '')) throw new Error('usage: invalid dataset name');
  if (!PERIODS.includes(days)) throw new Error('usage: invalid period');
  return `SELECT blob13 AS src, blob14 AS camp, blob1 AS event, SUM(_sample_interval * double1) AS n FROM ${dataset} WHERE timestamp > NOW() - INTERVAL '${days}' DAY AND blob13 != '' AND (blob1 = 'land' OR blob1 = 'start' OR blob1 = 'success') GROUP BY blob13, blob14, blob1 ORDER BY n DESC LIMIT 500 FORMAT JSON`;
}

/** The rows of campaignSql; rejects with UsageApiError like fetchUsage. */
export function fetchCampaigns({ accountId, token, dataset, days, fetch: f = fetch }) {
  return runSql({ accountId, token, fetch: f }, campaignSql(dataset, days));
}

const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};
const SOURCES = [...UTM_SOURCES, 'other'];
const validCamp = (c) => typeof c === 'string' && CAMPAIGN_RE.test(c);

/**
 * Query rows -> one row per (source, campaign): { src, srcLabel, camp, campLabel, land, start, success }, sorted by
 * land then start (descending), at most `top`. A source outside the list or a campaign failing the rule is dropped.
 */
export function shapeCampaigns(rows = [], top = CAMPAIGN_TOP) {
  const map = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!SOURCES.includes(r?.src) || !validCamp(r.camp) || !['land', 'start', 'success'].includes(r.event)) continue;
    const key = `${r.src}\u0000${r.camp}`;
    const row = map.get(key) ?? { src: r.src, srcLabel: UTM_SOURCE_LABELS[r.src], camp: r.camp, campLabel: Object.hasOwn(CAMPAIGN_LABELS, r.camp) ? CAMPAIGN_LABELS[r.camp] : r.camp, land: 0, start: 0, success: 0 };
    row[r.event] += num(r.n);
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.land - a.land || b.start - a.start).slice(0, top);
}

const count = (n) => Math.round(n).toLocaleString('en-US');
const mdCell = (s) => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');

/** The weekly report's table (markdown), or the empty sentence. */
export function campaignMarkdown(shaped, empty) {
  if (!shaped.length) return empty;
  return [
    `| ${CAMPAIGN_HEAD.join(' | ')} |`,
    '|---|---|---:|---:|---:|',
    ...shaped.map((r) => `| ${[r.srcLabel, r.campLabel, count(r.land), count(r.start), count(r.success)].map(mdCell).join(' | ')} |`),
  ].join('\n');
}
