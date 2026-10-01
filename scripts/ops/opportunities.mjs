// A-6: new-guide opportunities from Search Console (docs/OPS-RUNBOOK.md).
//   node scripts/ops/opportunities.mjs --data .ops-state/growth.json [--dry-run]
// Reads the 28-day queries A-5 saved and lists (1) queries with many impressions and a low CTR and (2) queries
// that no published guide covers (compared with the guide slugs, titles and target queries), each with the tool
// deep link that fits. The list goes into the ops:opportunity issue (updated weekly). No data (the GSC secret
// is missing) → nothing to do, exit 0.
import { existsSync, readFileSync } from 'node:fs';
import { cell, isMain, parseArgs } from './lib/common.mjs';
import { createGitHub } from './lib/github.mjs';
import { readGuides } from './lib/guides.mjs';

export const LABEL = 'ops:opportunity';
export const LOW_CTR = { minImpressions: 50, maxCtr: 0.02 };
export const UNCOVERED = { minImpressions: 10 };
const MAX_ROWS = 20;
const BRAND = /문서딱|docttak|독딱/i;

const squash = (s) => s.normalize('NFKC').toLowerCase().replace(/[\s\-_·]+/g, '');

/** Words of a query worth matching (2+ characters; particles and filler dropped). */
const STOP = new Set(['방법', '하는법', '하기', '무료', '사이트', '온라인', '어플', '앱', '프로그램', '변환기']);
export const queryWords = (q) =>
  q
    .normalize('NFKC')
    .toLowerCase()
    .split(/[\s,./?!·]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w));

/**
 * The published guide whose slug, title or target query covers every word of the query, or null.
 * @template {{ slug: string, title: string, query: string, draft: boolean }} G
 * @param {string} query
 * @param {G[]} guides
 * @returns {G | null}
 */
export function coveredBy(query, guides) {
  const words = queryWords(query).map(squash);
  if (!words.length) return null;
  for (const g of guides) {
    if (g.draft) continue;
    const hay = squash(`${g.slug} ${g.title} ${g.query}`);
    if (squash(g.query) === squash(query) || words.every((w) => hay.includes(w))) return g;
  }
  return null;
}

const PRESET_WORDS = [
  [/여권/, 'passport_online'],
  [/공무원|공시|인사혁신/, 'gosi'],
  [/큐넷|q-?net|자격증|기능사|기사시험/i, 'qnet'],
  [/사람인/, 'saramin'],
  [/잡코리아/, 'jobkorea'],
];

/** The tool (deep link) that fits a query, or null. */
export function suggestTool(query) {
  const q = query.normalize('NFKC').toLowerCase();
  if (/hwp|hwpx|한글\s*파일|한글\s*문서|아래아/.test(q)) return '/hwp-to-pdf/';
  if (/pdf/.test(q) && /합치|합치기|병합|붙이|하나로/.test(q)) return '/pdf-merge/';
  if (/pdf/.test(q)) {
    const mb = /(\d+(?:\.\d)?)\s*mb/.exec(q)?.[1];
    return mb ? `/pdf-compress/?target=${mb}` : '/pdf-compress/';
  }
  if (/증명|여권|반명함|규격|사이즈|사진\s*크기/.test(q) && /사진/.test(q)) {
    const preset = PRESET_WORDS.find(([re]) => re.test(q))?.[1];
    return preset ? `/id-photo/?preset=${preset}` : '/id-photo/';
  }
  if (/사진|이미지|jpg|jpeg|png|kb/.test(q)) {
    const kb = /(\d{2,5})\s*kb/.exec(q)?.[1];
    return kb ? `/photo-compress/?target=${kb}` : '/photo-compress/';
  }
  return null;
}

/**
 * @typedef {{ key: string, clicks: number, impressions: number, ctr: number, position: number }} QueryRow
 */

/**
 * The two lists from the 28-day query rows.
 * @param {QueryRow[]} rows
 * @param {{ slug: string, path: string, title: string, query: string, draft: boolean }[]} guides
 * @returns {{ lowCtr: (QueryRow & { guide: string | null, tool: string | null })[], uncovered: (QueryRow & { tool: string | null })[] }}
 */
export function findOpportunities(rows, guides) {
  const real = rows.filter((r) => !BRAND.test(r.key));
  const lowCtr = real
    .filter((r) => r.impressions >= LOW_CTR.minImpressions && r.ctr < LOW_CTR.maxCtr)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, MAX_ROWS)
    .map((r) => ({ ...r, guide: coveredBy(r.key, guides)?.path ?? null, tool: suggestTool(r.key) }));
  const uncovered = real
    .filter((r) => r.impressions >= UNCOVERED.minImpressions && !coveredBy(r.key, guides))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, MAX_ROWS)
    .map((r) => ({ ...r, tool: suggestTool(r.key) }));
  return { lowCtr, uncovered };
}

const pct = (v) => `${(v * 100).toFixed(1)}%`;

export function issueBody({ lowCtr, uncovered }, week) {
  const lines = [`${week} 서치콘솔 28일 쿼리에서 고른 새 안내 페이지 후보입니다(A-6). 공식 출처를 직접 가져올 수 있는 것만 만드세요.`, ''];
  lines.push(`## 노출은 많은데 클릭이 적은 쿼리 (노출 ${LOW_CTR.minImpressions}회 이상, CTR ${pct(LOW_CTR.maxCtr)} 미만)`);
  if (lowCtr.length) {
    lines.push('| 쿼리 | 노출 | 클릭 | CTR | 순위 | 지금 받는 안내 | 추천 도구 |', '|---|---:|---:|---:|---:|---|---|');
    for (const r of lowCtr) lines.push(`| ${cell(r.key)} | ${r.impressions} | ${r.clicks} | ${pct(r.ctr)} | ${r.position.toFixed(1)} | ${r.guide ?? '없음'} | ${r.tool ?? '-'} |`);
  } else lines.push('없음.');
  lines.push('', `## 안내 페이지가 없는 쿼리 (노출 ${UNCOVERED.minImpressions}회 이상)`);
  if (uncovered.length) {
    lines.push('| 쿼리 | 노출 | 클릭 | 순위 | 추천 도구 |', '|---|---:|---:|---:|---|');
    for (const r of uncovered) lines.push(`| ${cell(r.key)} | ${r.impressions} | ${r.clicks} | ${r.position.toFixed(1)} | ${r.tool ?? '-'} |`);
  } else lines.push('없음.');
  return lines.join('\n');
}

export async function run(argv, io = {}) {
  const { opts, dryRun } = parseArgs(argv);
  const log = io.log ?? console.log;
  const file = opts.data ?? '.ops-state/growth.json';
  const data = io.data ?? (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
  if (!data?.gsc) {
    log('opportunities: 서치콘솔 데이터가 없어 건너뜁니다 (GSC_SERVICE_ACCOUNT_JSON 확인).');
    return 0;
  }
  const found = findOpportunities(data.gsc.queries28, io.guides ?? readGuides());
  log(`opportunities: 저CTR ${found.lowCtr.length}개, 안내 없음 ${found.uncovered.length}개`);
  if (!found.lowCtr.length && !found.uncovered.length) return 0;
  const gh = io.github ?? createGitHub({ dryRun, log });
  await gh.upsert({ label: LABEL, title: `새 안내 페이지 후보 ${data.week}: ${found.uncovered.length + found.lowCtr.length}개`, body: issueBody(found, data.week), comment: `${data.week} 후보로 갱신했습니다.` });
  return 0;
}

if (isMain(import.meta)) process.exitCode = await run(process.argv.slice(2));
