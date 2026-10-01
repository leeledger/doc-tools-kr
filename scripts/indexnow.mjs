// IndexNow ping (Growth G.4), run by hand after a deploy: `npm run ping:indexnow -- <url...>`.
//   --sitemap   submit every URL of dist/sitemap.xml (the first submission)
//   --dry-run   print what would be sent, send nothing
// It never runs in the build or on the site. Before any POST it checks that the live site serves the key file
// (https://<host>/<key>.txt with the key as its body); if not, it stops with exit 1 and sends nothing. No
// retries: the orchestrator reruns it. The key is public by protocol (it must be served at the site root) and
// proves host ownership only, so it is committed (src/data/indexnow.json, public/<key>.txt).
// Protocol (indexnow.org/documentation, read 2026-09-30): up to 10,000 URLs per POST; 200 OK, 202 Accepted
// (key validation pending), 400 bad request, 403 key not valid, 422 URLs not on the host, 429 too many requests.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(import.meta.dirname, '..');
export const ENDPOINT = 'https://api.indexnow.org/indexnow';
export const MAX_URLS = 10_000;
const TIMEOUT_MS = 10_000;

export const readKey = (root = ROOT) => JSON.parse(readFileSync(join(root, 'src', 'data', 'indexnow.json'), 'utf8')).key;

/** Every <loc> of a sitemap. */
export const sitemapUrls = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

/**
 * @param {string[]} argv
 * @param {{ fetch?: typeof fetch, log?: (s: string) => void, error?: (s: string) => void, env?: Record<string, string | undefined>, root?: string }} [io]
 * @returns {Promise<number>} the exit code
 */
export async function run(argv, io = {}) {
  const f = io.fetch ?? fetch;
  const log = io.log ?? console.log;
  const error = io.error ?? console.error;
  const env = io.env ?? process.env;
  const root = io.root ?? ROOT;
  const dryRun = argv.includes('--dry-run');
  let host;
  try {
    host = new URL(env.PUBLIC_SITE_URL || 'https://docttak.com').host;
  } catch {
    error(`IndexNow: PUBLIC_SITE_URL가 올바른 주소가 아닙니다: ${env.PUBLIC_SITE_URL}`);
    return 1;
  }
  const key = readKey(root);
  if (!/^[0-9a-f]{32}$/.test(key)) {
    error('IndexNow: src/data/indexnow.json의 키가 32자리 16진수가 아닙니다.');
    return 1;
  }

  let urls = argv.filter((a) => !a.startsWith('--'));
  if (argv.includes('--sitemap')) {
    try {
      urls.push(...sitemapUrls(readFileSync(join(root, 'dist', 'sitemap.xml'), 'utf8')));
    } catch {
      error('IndexNow: dist/sitemap.xml을 읽지 못했습니다. 먼저 npm run build를 실행해 주세요.');
      return 1;
    }
  }
  urls = [...new Set(urls)];
  if (!urls.length) {
    error('IndexNow: 보낼 URL이 없습니다. URL을 주거나 --sitemap을 쓰세요.');
    return 1;
  }
  const bad = urls.filter((u) => {
    try {
      const p = new URL(u);
      return p.protocol !== 'https:' || p.host !== host;
    } catch {
      return true;
    }
  });
  if (bad.length) {
    error(`IndexNow: https://${host}/ 의 주소가 아닌 URL이 있어 보내지 않았습니다:\n  ${bad.join('\n  ')}`);
    return 1;
  }
  if (urls.length > MAX_URLS) {
    error(`IndexNow: 한 번에 ${MAX_URLS.toLocaleString('en-US')}개까지 보낼 수 있습니다 (${urls.length}개).`);
    return 1;
  }

  const keyLocation = `https://${host}/${key}.txt`;
  const body = { host, key, keyLocation, urlList: urls };
  if (dryRun) {
    log(`IndexNow (dry run): ${urls.length}개 URL\n${JSON.stringify(body, null, 2)}`);
    return 0;
  }

  // Preflight: the live key file must hold the key, or the search engines would reject the submission.
  let pre;
  try {
    pre = await f(keyLocation, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
  } catch (err) {
    error(`IndexNow 키 파일이 사이트에 없습니다: ${keyLocation} (${err instanceof Error ? err.message : String(err)})`);
    return 1;
  }
  const served = pre.ok ? (await pre.text()).trim() : '';
  if (served !== key) {
    error(`IndexNow 키 파일이 사이트에 없습니다: ${keyLocation} (${pre.status})`);
    return 1;
  }

  let res;
  try {
    res = await f(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    error(`IndexNow: 보내지 못했습니다 (${err instanceof Error ? err.message : String(err)})`);
    return 1;
  }
  if (res.status === 200 || res.status === 202) {
    log(`IndexNow: ${urls.length}개 URL 제출 (${res.status})`);
    return 0;
  }
  const text = (await res.text().catch(() => '')).slice(0, 200);
  error(`IndexNow: ${res.status} ${text}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run(process.argv.slice(2));
}
