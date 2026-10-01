// A-3: weekly source watch (docs/OPS-RUNBOOK.md).
//   node scripts/ops/source-watch.mjs [--dry-run]
//   node scripts/ops/source-watch.mjs --exact   (G2 A1 publish gate: no issue, exit 1 on any non-verbatim quote)
// Every official source a page cites (guide frontmatter `sources`, the official id-photo presets) is fetched
// once, politely (identifying UA, one request at a time with a pause, retries with backoff), and every quoted
// fragment must still be on that page. A missing fragment or an unreachable source is reported in one issue
// labelled ops:source-changed: page, URL, the quote we publish and the page text around the closest match.
// Exit 0 once reported (or all clear); 1 only if the job itself failed.
import { BOT_UA, cell, fetchText, isMain, isoDate, parseArgs, sleep, today } from './lib/common.mjs';
import { createGitHub } from './lib/github.mjs';
import { readGuides, readPresets, watchList } from './lib/guides.mjs';
import { findQuote, hasExactQuote, pageText, pageTextExact, quoteFragments } from './lib/html.mjs';

export const LABEL = 'ops:source-changed';
const PAUSE_MS = 1500;

/**
 * Checks a watch list against fetched pages. `get(url)` returns { ok, status, text, error }. A quote read in a
 * browser (`via: 'browser'`, G2 A1: the HTML is a script shell, so a fetch can never find it) is not fetched; it
 * goes to `manual` and is never counted as changed or unreachable.
 * `exact` (the publish gate, G2 A1): a fragment counts only when it stands in the page character for character,
 * whitespace runs folded to one space (`pageTextExact`); the weekly watch stays lenient to detect changes.
 * @returns {Promise<{ checked: number, changed: object[], unreachable: object[], manual: object[] }>}
 */
export async function checkSources(all, get, { exact = false } = {}) {
  const manual = all.filter((e) => e.via === 'browser').map((e) => ({ pages: e.pages, url: e.urls[0], quote: e.quote }));
  const list = all.filter((e) => e.via !== 'browser');
  const pages = new Map();
  const load = async (url) => {
    if (!pages.has(url)) {
      const r = await get(url);
      pages.set(url, r.ok ? { ok: true, text: pageText(r.text), exact: pageTextExact(r.text) } : { ok: false, why: r.status ? `HTTP ${r.status}` : r.error });
    }
    return pages.get(url);
  };
  const changed = [];
  const unreachable = [];
  let checked = 0;
  for (const e of list) {
    const loaded = [];
    for (const u of e.urls) loaded.push([u, await load(u)]);
    const okPages = loaded.filter(([, p]) => p.ok);
    for (const [u, p] of loaded) if (!p.ok) unreachable.push({ pages: e.pages, url: u, why: p.why, quote: e.quote });
    if (!okPages.length) continue;
    for (const frag of quoteFragments(e.quote)) {
      checked++;
      const results = okPages.map(([u, p]) => {
        const r = findQuote(frag, p.text);
        return { url: u, ...r, found: exact ? hasExactQuote(frag, p.exact) : r.found };
      });
      if (results.some((r) => r.found)) continue;
      const best = results.find((r) => r.context) ?? results[0];
      changed.push({ pages: e.pages, url: best.url, urls: e.urls, quote: frag, context: best.context, origin: e.origin });
    }
  }
  return { checked, changed, unreachable, manual };
}

/** The "수동 확인 (브라우저 출처)" table: URL and quote of every browser-read source. */
export function manualTable(manual) {
  if (!manual?.length) return [];
  const lines = [`## 수동 확인 (브라우저 출처) (${manual.length})`, '스크립트로 읽을 수 없는 페이지예요. 브라우저로 열어 문구가 그대로인지 확인해 주세요.', '', '| 페이지 | 출처 | 인용 문구 |', '|---|---|---|'];
  for (const m of manual) lines.push(`| ${cell(m.pages.join(', '))} | ${cell(m.url)} | ${cell(m.quote)} |`);
  lines.push('');
  return lines;
}

export function issueBody({ changed, unreachable, checked, manual }, date, runUrl) {
  const lines = [`출처 감시(A-3) ${date}: 인용 문구 ${checked}개를 확인했습니다.`, ''];
  if (changed.length) {
    lines.push(`## 문구가 바뀐 것으로 보이는 출처 (${changed.length})`, '공식 페이지에서 인용 문구를 찾지 못했습니다. 규격이 바뀌었는지 확인하고 안내 페이지·프리셋을 고쳐 주세요.', '');
    for (const c of changed) {
      lines.push(`### ${c.pages.join(', ')}`, `- 출처: ${c.url}${c.urls.length > 1 ? ` (프리셋 출처 ${c.urls.length}곳 모두 확인)` : ''}`, `- 근거: ${c.origin}`, `- 우리가 인용한 문구:`, `  > ${c.quote}`);
      lines.push(c.context ? `- 현재 페이지의 가장 가까운 부분:\n  > ${c.context}` : '- 현재 페이지에서 비슷한 부분도 찾지 못했습니다.', '');
    }
  }
  if (unreachable.length) {
    lines.push(`## 가져오지 못한 출처 (${unreachable.length})`, '| 페이지 | 출처 | 결과 |', '|---|---|---|');
    for (const u of unreachable) lines.push(`| ${cell(u.pages.join(', '))} | ${cell(u.url)} | ${cell(u.why)} |`);
    lines.push('');
  }
  lines.push(...manualTable(manual));
  if (runUrl) lines.push(`실행 기록: ${runUrl}`);
  return lines.join('\n');
}

export async function run(argv, io = {}) {
  const { dryRun, flags } = parseArgs(argv);
  const exact = flags.has('exact');
  const log = io.log ?? console.log;
  const env = io.env ?? process.env;
  const list = watchList(io.guides ?? readGuides(), io.presets ?? readPresets());
  const urls = new Set(list.flatMap((e) => e.urls));
  log(`source-watch: 출처 ${urls.size}곳, 인용 ${list.length}개`);
  let first = true;
  const get = async (url) => {
    if (!first) await (io.wait ?? sleep)(PAUSE_MS);
    first = false;
    const r = await fetchText(url, { headers: { 'User-Agent': BOT_UA, Accept: 'text/html,*/*;q=0.8', 'Accept-Language': 'ko-KR,ko;q=0.9' }, fetchImpl: io.fetchImpl, wait: io.wait });
    log(`  ${r.ok ? 'OK ' : 'ERR'} ${r.status || r.error} ${url}`);
    return r;
  };
  const result = await checkSources(list, get, { exact });
  for (const line of manualTable(result.manual)) log(line);
  if (exact) {
    // Publish gate: report on the console only (never an issue); any non-verbatim or unreachable quote fails.
    for (const c of result.changed) log(`NOT VERBATIM ${c.pages.join(', ')} ${c.url}
  quote: ${c.quote}
  page:  ${c.context ?? '(nothing close)'}`);
    for (const u of result.unreachable) log(`UNREACHABLE ${u.pages.join(', ')} ${u.url} ${u.why}`);
    const bad = result.changed.length + result.unreachable.length;
    log(bad ? `source-watch --exact: ${bad} problem(s) in ${result.checked} quotes` : `source-watch --exact: ${result.checked} quotes verbatim`);
    return bad ? 1 : 0;
  }
  const date = isoDate(today(env));
  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : '';
  const gh = io.github ?? createGitHub({ dryRun, log });
  if (result.changed.length || result.unreachable.length) {
    const title = `출처 변경 의심: ${result.changed.length}건 바뀜, ${result.unreachable.length}건 확인 불가 (${date})`;
    const body = issueBody(result, date, runUrl);
    await gh.upsert({ label: LABEL, title, body, comment: `${date} 다시 확인했습니다. 본문을 최신 결과로 바꿨습니다.` });
  } else {
    log(`source-watch: 인용 ${result.checked}개 모두 그대로입니다.`);
    await gh.commentOpen(LABEL, `${date} 확인: 인용 문구 ${result.checked}개가 모두 공식 페이지에 그대로 있습니다. 고친 뒤라면 이 이슈를 닫아 주세요.`);
  }
  return 0;
}

if (isMain(import.meta)) process.exitCode = await run(process.argv.slice(2));
