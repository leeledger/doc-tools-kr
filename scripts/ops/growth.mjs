// A-5: weekly growth report (docs/OPS-RUNBOOK.md).
//   node scripts/ops/growth.mjs [--reports reports/growth] [--out-json .ops-state/growth.json] [--dry-run]
// Env: GSC_SERVICE_ACCOUNT_JSON (Search Console, property sc-domain:docttak.com), CF_API_TOKEN (+ optional
// CF_ZONE_ID), AE_API_TOKEN + CF_ACCOUNT_ID (anonymous usage statistics, Analytics Engine SQL API; optional
// USAGE_DATASET). A missing secret skips that part with a note in the report; an API error is noted too and puts
// "(오류 있음)" in the summary issue title. Writes reports/growth/YYYY-WW.md (ISO week of the run; the workflow
// commits it), the full data for A-6 to --out-json, and a summary issue labelled ops:growth (last week's is
// closed). --dry-run prints the report and the issue, commits no report and sends nothing (--out-json is still
// written: it is scratch data for A-6).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BOT_UA, ROOT, SITE, addDays, fetchText, isMain, isoDate, parseArgs, today } from './lib/common.mjs';
import { fetchTraffic, zoneId } from './lib/cloudflare.mjs';
import { createGitHub } from './lib/github.mjs';
import { PROPERTY, accessToken, fetchGrowth, gscClient, parseServiceAccount } from './lib/gsc.mjs';
import { sitemapEntries } from './lib/html.mjs';
import { isoWeek, parseReportData, r1Status, renderReport } from './lib/report.mjs';
import { datasetName, fetchUsage, shapeUsage } from '../lib/usage.mjs';

export const LABEL = 'ops:growth';
/** Search Console data is final about three days later. */
const GSC_LAG_DAYS = 3;

/** Every committed report's data, oldest first. */
export function readReports(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}\.md$/.test(f))
    .sort()
    .map((f) => parseReportData(readFileSync(join(dir, f), 'utf8')))
    .filter(Boolean);
}

export async function liveSitemapCount(fetchImpl, wait) {
  const r = await fetchText(`${SITE}/sitemap.xml`, { headers: { 'User-Agent': BOT_UA }, fetchImpl, wait });
  if (!r.ok) throw new Error(`${SITE}/sitemap.xml: HTTP ${r.status || r.error}`);
  return sitemapEntries(r.text).length;
}

/** Collects the numbers. Missing secrets and API errors become notes; errors also set `failed`. */
export async function collect({ env, now, fetchImpl = fetch, wait }) {
  const notes = [];
  let failed = false;
  let gsc = null;
  let cf = null;
  if (!env.GSC_SERVICE_ACCOUNT_JSON) notes.push('GSC_SERVICE_ACCOUNT_JSON 비밀값이 없어 서치콘솔 부분을 건너뛰었습니다 (docs/OPS-RUNBOOK.md §비밀값).');
  else {
    try {
      const sa = parseServiceAccount(env.GSC_SERVICE_ACCOUNT_JSON);
      const query = gscClient(await accessToken(sa, { fetchImpl }), { property: env.GSC_PROPERTY || PROPERTY, fetchImpl });
      gsc = await fetchGrowth(query, addDays(now, -GSC_LAG_DAYS));
    } catch (err) {
      failed = true;
      notes.push(`서치콘솔 오류: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!env.CF_API_TOKEN) notes.push('CF_API_TOKEN 비밀값이 없어 Cloudflare 부분을 건너뛰었습니다 (docs/OPS-RUNBOOK.md §비밀값).');
  else {
    try {
      const zone = env.CF_ZONE_ID || (await zoneId(env.CF_API_TOKEN, 'docttak.com', { fetchImpl }));
      cf = await fetchTraffic(env.CF_API_TOKEN, zone, isoDate(addDays(now, -1)), { fetchImpl });
    } catch (err) {
      failed = true;
      notes.push(`Cloudflare 오류: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  let usage = null;
  if (!env.AE_API_TOKEN || !env.CF_ACCOUNT_ID) notes.push('AE_API_TOKEN 또는 CF_ACCOUNT_ID 비밀값이 없어 도구 사용 부분을 건너뛰었습니다 (docs/OPS-RUNBOOK.md §비밀값).');
  else {
    try {
      const dataset = datasetName(env.USAGE_DATASET);
      if (!dataset) throw new Error('USAGE_DATASET 이름이 올바르지 않습니다');
      usage = shapeUsage(await fetchUsage({ accountId: env.CF_ACCOUNT_ID, token: env.AE_API_TOKEN, dataset, days: 7, fetch: fetchImpl }));
    } catch (err) {
      failed = true;
      notes.push(`도구 사용 통계 오류: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  let sitemapCount = 0;
  try {
    sitemapCount = await liveSitemapCount(fetchImpl, wait);
  } catch (err) {
    failed = true;
    notes.push(`sitemap 오류: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { gsc, cf, usage, notes, failed, sitemapCount };
}

export function summaryBody(data, file, failed) {
  const { gsc, cf, usage, r1, notes } = data;
  const lines = [`${data.week} 성장 리포트: \`${file}\``, ''];
  if (gsc) lines.push(`- 서치콘솔 7일: 클릭 ${gsc.last7.clicks}, 노출 ${gsc.last7.impressions}, CTR ${(gsc.last7.ctr * 100).toFixed(1)}%, 평균 순위 ${gsc.last7.position.toFixed(1)}`, `- 서치콘솔 28일: 클릭 ${gsc.last28.clicks}, 노출 ${gsc.last28.impressions}`);
  if (cf) lines.push(`- Cloudflare 7일: 요청 ${cf.last7.requests.toLocaleString('en-US')}, 페이지뷰 ${cf.last7.pageViews.toLocaleString('en-US')}, 대역폭 ${(cf.last7.bytes / 1e6).toFixed(1)} MB`);
  if (usage) lines.push(`- 도구 사용 7일: 성공 ${Math.round(usage.totals.success).toLocaleString('en-US')}회, 성공률 ${usage.totals.rate}`);
  lines.push(`- R1: 페이지 ${r1.sitemapCount}개(${r1.pagesOk ? '충족' : '미충족'}), 주 100클릭 연속 ${r1.streak}주(${r1.clicksOk ? '충족' : '미충족'})`);
  if (notes.length) lines.push('', ...notes.map((x) => `> ${x}`));
  if (failed) lines.push('', '오류가 있었습니다. 비밀값과 권한을 docs/OPS-RUNBOOK.md대로 확인해 주세요.');
  return lines.join('\n');
}

export async function run(argv, io = {}) {
  const { opts, dryRun } = parseArgs(argv);
  const log = io.log ?? console.log;
  const env = io.env ?? process.env;
  const now = today(env);
  const dir = opts.reports ?? join(ROOT, 'reports', 'growth');
  const week = isoWeek(now).label;
  const c = await collect({ env, now, fetchImpl: io.fetchImpl, wait: io.wait });
  const previous = readReports(dir).filter((d) => d.week !== week);
  const current = { week, generated: isoDate(now), sitemapCount: c.sitemapCount, gsc: c.gsc, cf: c.cf, usage: c.usage };
  const r1 = r1Status(c.sitemapCount, [...previous, current]);
  const data = { ...current, notes: c.notes, r1 };
  const md = renderReport(data);
  const file = `reports/growth/${week}.md`;
  const title = `성장 리포트 ${week}${c.failed ? ' (오류 있음)' : ''}`;
  const body = summaryBody(data, file, c.failed);
  if (dryRun) log(`[dry-run] ${file}\n${md}`);
  else {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${week}.md`), md);
    log(`growth: wrote ${file}`);
  }
  if (opts['out-json']) {
    mkdirSync(dirname(opts['out-json']), { recursive: true });
    writeFileSync(opts['out-json'], JSON.stringify({ week, gsc: c.gsc, r1 }, null, 2));
  }
  const gh = io.github ?? createGitHub({ dryRun, log });
  await gh.closeAll(LABEL, `${week} 리포트가 새로 올라와 닫습니다.`);
  await gh.create({ label: LABEL, title, body });
  return 0;
}

if (isMain(import.meta)) process.exitCode = await run(process.argv.slice(2));
