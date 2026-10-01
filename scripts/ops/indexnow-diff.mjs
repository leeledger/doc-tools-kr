// A-2: ping IndexNow with the URLs whose sitemap lastmod changed since the last successful ping.
//   node scripts/ops/indexnow-diff.mjs --state .ops-state/sitemap.xml [--url https://docttak.com] [--dry-run]
// The previous live sitemap is kept in the state file (the workflow restores and saves it with actions/cache).
// No state yet (first run, or the cache expired): every URL is sent once; IndexNow accepts resubmissions. The
// state is written only after the ping succeeds, so a failed ping is retried by the next run. --dry-run sends
// nothing and writes no state.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { run as indexnow } from '../indexnow.mjs';
import { BOT_UA, SITE, fetchText, isMain, parseArgs } from './lib/common.mjs';
import { changedUrls, sitemapEntries } from './lib/html.mjs';

export async function run(argv, io = {}) {
  const { opts, dryRun } = parseArgs(argv);
  const log = io.log ?? console.log;
  const error = io.error ?? console.error;
  const ping = io.indexnow ?? indexnow;
  const state = opts.state ?? '.ops-state/sitemap.xml';
  const base = (opts.url ?? SITE).replace(/\/$/, '');
  const r = await fetchText(`${base}/sitemap.xml?__ops=${Date.now()}`, { headers: { 'User-Agent': BOT_UA, 'Cache-Control': 'no-cache' }, fetchImpl: io.fetchImpl, wait: io.wait });
  if (!r.ok || !sitemapEntries(r.text).length) {
    error(`indexnow-diff: ${base}/sitemap.xml을 읽지 못했습니다 (${r.status || r.error}).`);
    return 1;
  }
  const previous = existsSync(state) ? readFileSync(state, 'utf8') : null;
  const urls = changedUrls(previous, r.text);
  log(`indexnow-diff: ${previous ? '이전 sitemap과 비교' : '이전 기록 없음(전체 제출)'} — 바뀐 URL ${urls.length}개${urls.length ? `\n  ${urls.join('\n  ')}` : ''}`);
  if (urls.length) {
    const code = await ping(dryRun ? [...urls, '--dry-run'] : urls, { log, error });
    if (code !== 0) return code;
  }
  if (!dryRun) {
    mkdirSync(dirname(state), { recursive: true });
    writeFileSync(state, r.text);
  }
  return 0;
}

if (isMain(import.meta)) process.exitCode = await run(process.argv.slice(2));
