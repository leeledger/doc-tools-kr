// A-1, step 1: wait until the live site serves the build of this commit (docs/OPS-RUNBOOK.md).
//   node scripts/ops/wait-deploy.mjs --sha <commit> [--url https://docttak.com] [--timeout 1200] [--interval 20] [--dry-run]
// Polls the home page (cache-busting query, no-cache) until <meta name="build-id"> equals the first 12
// characters of the SHA (src/data/build.ts). Exit 0 when it does, 1 on timeout. --dry-run checks once and
// reports, always exit 0.
import { BOT_UA, SITE, fetchText, isMain, parseArgs, sleep } from './lib/common.mjs';
import { buildIdOf, buildMatches } from './lib/html.mjs';

/**
 * @param {string[]} argv
 * @param {{ fetchImpl?: typeof fetch, log?: (s: string) => void, error?: (s: string) => void, wait?: (ms: number) => Promise<void>, now?: () => number, env?: Record<string, string | undefined> }} [io]
 */
export async function run(argv, io = {}) {
  const { opts, dryRun } = parseArgs(argv);
  const log = io.log ?? console.log;
  const error = io.error ?? console.error;
  const wait = io.wait ?? sleep;
  const now = io.now ?? Date.now;
  const env = io.env ?? process.env;
  const sha = (opts.sha ?? env.GITHUB_SHA ?? '').trim();
  const base = opts.url ?? SITE;
  const timeoutMs = Number(opts.timeout ?? 1200) * 1000;
  const intervalMs = Number(opts.interval ?? 20) * 1000;
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
    error('wait-deploy: --sha <commit> (or GITHUB_SHA) is required.');
    return 2;
  }
  const want = sha.slice(0, 12);
  const deadline = now() + timeoutMs;
  let last = null;
  for (let attempt = 1; ; attempt++) {
    const url = `${base.replace(/\/$/, '')}/?__deploy=${now()}`;
    const r = await fetchText(url, { headers: { 'User-Agent': BOT_UA, 'Cache-Control': 'no-cache' }, retries: 0, fetchImpl: io.fetchImpl });
    last = r.ok ? buildIdOf(r.text) : null;
    const seen = r.ok ? (last ?? 'build-id 없음') : `HTTP ${r.status || r.error}`;
    if (buildMatches(last, want)) {
      log(`wait-deploy: live build ${last} = ${want} (attempt ${attempt})`);
      return 0;
    }
    if (dryRun) {
      log(`wait-deploy (dry run): live build ${seen}, this commit ${want} — not live yet (a real run keeps polling)`);
      return 0;
    }
    if (now() + intervalMs > deadline) {
      error(`wait-deploy: ${timeoutMs >= 60000 ? `${Math.round(timeoutMs / 60000)}분` : `${Math.round(timeoutMs / 1000)}초`} 동안 라이브 빌드가 ${want}로 바뀌지 않았습니다 (마지막: ${seen}). Cloudflare Pages 배포 로그를 확인하세요.`);
      return 1;
    }
    log(`wait-deploy: live ${seen}, waiting for ${want}…`);
    await wait(intervalMs);
  }
}

if (isMain(import.meta)) process.exitCode = await run(process.argv.slice(2));
