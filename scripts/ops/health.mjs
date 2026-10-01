// A-4: daily site health (docs/OPS-RUNBOOK.md).
//   node scripts/ops/health.mjs [--url https://docttak.com] [--dry-run]
// Requests every sitemap URL with browser-like headers (Cloudflare injects scripts such as the Web Analytics
// beacon only into what it takes for a browser) and checks: HTTP 200; canonical, OG and JSON-LD present; no
// off-site or Cloudflare-injected <script src>; every internal link resolves to 200; time to first byte under
// TTFB_LIMIT_MS (the better of two tries). Problems open or update the ops:health issue; a clean run closes it.
// Exit 0 once reported; 1 only if the job itself failed (the sitemap could not be read is a reported problem).
import { BROWSER_HEADERS, SITE, cell, fetchText, isMain, isoDate, parseArgs, today } from './lib/common.mjs';
import { createGitHub } from './lib/github.mjs';
import { internalLinks, pageProblems, sitemapEntries } from './lib/html.mjs';

export const LABEL = 'ops:health';
export const TTFB_LIMIT_MS = 2000;
const PARALLEL = 4;

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

/**
 * @param {string} base
 * @param {{ fetchImpl?: typeof fetch, wait?: (ms: number) => Promise<void> }} [io]
 * @returns {Promise<{ pages: { url: string, status: number, ttfbMs: number | null }[], problems: { url: string, problem: string }[], links: number }>}
 */
export async function checkHealth(base, { fetchImpl = fetch, wait = undefined } = {}) {
  const get = (url) => fetchText(url, { headers: BROWSER_HEADERS, retries: 2, delays: [3000, 8000], fetchImpl, wait });
  const problems = [];
  const sm = await get(`${base}/sitemap.xml`);
  const entries = sm.ok ? sitemapEntries(sm.text) : [];
  if (!entries.length) {
    problems.push({ url: `${base}/sitemap.xml`, problem: sm.ok ? 'URL이 없음' : `HTTP ${sm.status || sm.error}` });
    return { pages: [], problems, links: 0 };
  }
  const pages = await pool(entries.map((e) => e.loc), PARALLEL, async (url) => {
    let r = await get(url);
    if (r.ok && r.ttfbMs > TTFB_LIMIT_MS) {
      const again = await get(url);
      if (again.ok && again.ttfbMs < r.ttfbMs) r = again;
    }
    return { url, r };
  });
  const linkTargets = new Set();
  for (const { url, r } of pages) {
    if (r.status !== 200) {
      problems.push({ url, problem: r.status ? `HTTP ${r.status}` : `요청 실패: ${r.error}` });
      continue;
    }
    for (const p of pageProblems(r.text, url)) problems.push({ url, problem: p });
    if (r.ttfbMs > TTFB_LIMIT_MS) problems.push({ url, problem: `응답 시작 ${r.ttfbMs} ms (기준 ${TTFB_LIMIT_MS} ms)` });
    for (const l of internalLinks(r.text, url)) linkTargets.add(l);
  }
  const known = new Set(entries.map((e) => e.loc));
  const toCheck = [...linkTargets].filter((l) => !known.has(l));
  const linkResults = await pool(toCheck, PARALLEL, async (l) => ({ l, r: await get(l) }));
  for (const { l, r } of linkResults) {
    if (r.status !== 200) {
      const from = pages.filter((p) => p.r.ok && internalLinks(p.r.text, p.url).includes(l)).map((p) => new URL(p.url).pathname);
      problems.push({ url: l, problem: `내부 링크 깨짐: ${r.status ? `HTTP ${r.status}` : r.error} (링크한 페이지: ${from.join(', ')})` });
    }
  }
  return { pages: pages.map(({ url, r }) => ({ url, status: r.status, ttfbMs: r.ttfbMs ?? null })), problems, links: linkTargets.size };
}

export function issueBody({ pages, problems, links }, date, runUrl) {
  const lines = [`사이트 건강 점검(A-4) ${date}: 페이지 ${pages.length}개, 내부 링크 ${links}개 중 문제 ${problems.length}건.`, '', '| URL | 문제 |', '|---|---|'];
  for (const p of problems) lines.push(`| ${cell(p.url)} | ${cell(p.problem)} |`);
  lines.push('', '외부·삽입 스크립트가 보이면 Cloudflare 대시보드에서 Web Analytics(RUM)·Rocket Loader·Email Obfuscation이 꺼져 있는지 확인하세요. 다음 점검이 깨끗하면 이 이슈는 자동으로 닫힙니다.');
  if (runUrl) lines.push('', `실행 기록: ${runUrl}`);
  return lines.join('\n');
}

export async function run(argv, io = {}) {
  const { opts, dryRun } = parseArgs(argv);
  const log = io.log ?? console.log;
  const env = io.env ?? process.env;
  const base = (opts.url ?? SITE).replace(/\/$/, '');
  const result = await checkHealth(base, { fetchImpl: io.fetchImpl, wait: io.wait });
  const ttfbs = result.pages.map((p) => p.ttfbMs).filter((t) => t !== null).sort((a, b) => a - b);
  log(`health: 페이지 ${result.pages.length}개, 내부 링크 ${result.links}개, 문제 ${result.problems.length}건; TTFB 중앙값 ${ttfbs[ttfbs.length >> 1] ?? '-'} ms, 최대 ${ttfbs.at(-1) ?? '-'} ms`);
  for (const p of result.problems) log(`  ${p.url} — ${p.problem}`);
  const date = isoDate(today(env));
  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : '';
  const gh = io.github ?? createGitHub({ dryRun, log });
  if (result.problems.length) await gh.upsert({ label: LABEL, title: `사이트 건강 점검 실패: ${result.problems.length}건 (${date})`, body: issueBody(result, date, runUrl), comment: `${date} 점검에서도 문제가 있습니다(${result.problems.length}건). 본문을 갱신했습니다.` });
  else await gh.closeAll(LABEL, `${date} 점검에서 페이지 ${result.pages.length}개, 내부 링크 ${result.links}개 모두 정상입니다. 자동으로 닫습니다.`);
  return 0;
}

if (isMain(import.meta)) process.exitCode = await run(process.argv.slice(2));
