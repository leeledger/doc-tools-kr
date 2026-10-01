// Shared helpers for the ops scripts (docs/OPS-RUNBOOK.md): argument parsing, a polite fetch with retries, and
// the "run as CLI" check. Node 22 only, no dependencies. None of this ships to the site.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ROOT = join(import.meta.dirname, '..', '..', '..');
export const SITE = 'https://docttak.com';

/** Identifies the bot to official sites (source watch) and to our own site. */
export const BOT_UA = 'Mozilla/5.0 (compatible; docttak-ops/1.0; +https://docttak.com/)';
/** What a real visitor's browser sends; Cloudflare injects scripts only for responses it thinks are browsers. */
export const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
};

export const isMain = (meta) => Boolean(process.argv[1]) && meta.url === pathToFileURL(process.argv[1]).href;

const VALUE_OPTS = new Set(['sha', 'url', 'state', 'out', 'out-json', 'data', 'reports', 'timeout', 'interval', 'label', 'title', 'body-file', 'site', 'run-url']);

/** `--flag`, `--key value` (for the options above), `--key=value` and positionals. */
export function parseArgs(argv) {
  const flags = new Set();
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) positional.push(a);
    else if (a.includes('=')) opts[a.slice(2, a.indexOf('='))] = a.slice(a.indexOf('=') + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--') && VALUE_OPTS.has(a.slice(2))) opts[a.slice(2)] = argv[++i];
    else flags.add(a.slice(2));
  }
  return { flags, opts, positional, dryRun: flags.has('dry-run') };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const charsetOf = (contentType, head) => {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  return (fromMeta ?? 'utf-8').toLowerCase();
};

/** Decodes an HTML body by its declared charset (several Korean government sites still serve EUC-KR). */
export function decodeBody(bytes, contentType) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
  const cs = charsetOf(contentType, head);
  try {
    return new TextDecoder(cs === 'ks_c_5601-1987' ? 'euc-kr' : cs).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/**
 * GET with retries on network errors, 429 and 5xx (backoff `delays`). Returns
 * { ok, status, url, text, headers, ttfbMs } or { ok: false, status: 0, error }.
 */
export async function fetchText(url, { headers = { 'User-Agent': BOT_UA }, retries = 3, delays = [2000, 5000, 10000], timeoutMs = 20_000, fetchImpl = fetch, wait = sleep, method = 'GET' } = {}) {
  let last = { ok: false, status: 0, error: 'not tried', url };
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await wait(delays[Math.min(attempt - 1, delays.length - 1)]);
    const t0 = performance.now();
    try {
      const res = await fetchImpl(url, { method, headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
      const ttfbMs = Math.round(performance.now() - t0);
      const bytes = new Uint8Array(await res.arrayBuffer());
      last = { ok: res.ok, status: res.status, url: res.url || url, text: decodeBody(bytes, res.headers.get('content-type')), headers: res.headers, ttfbMs };
      if (res.status !== 429 && res.status < 500) return last;
    } catch (err) {
      last = { ok: false, status: 0, url, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return last;
}

/** Markdown table cell: no pipes or newlines. */
export const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

export const today = (env = process.env) => (env.OPS_TODAY ? new Date(`${env.OPS_TODAY}T00:00:00Z`) : new Date());
export const isoDate = (d) => d.toISOString().slice(0, 10);
export const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
