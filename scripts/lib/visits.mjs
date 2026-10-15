// Site visits from Cloudflare Web Analytics (RUM, cookieless) for /admin/ and the weekly report (brief
// handoff/ARCHITECT-BRIEF-ADMIN-VISITS.md). Server-side only: the Pages Function and the ops script POST GraphQL
// queries; nothing runs on the site. Plain ESM, no fs: the Function, the Node scripts and vitest import it.
//
// Query shape verified 2026-10-08 (handoff/rum-probe-*.json): rumPageloadEventsAdaptiveGroups under
// viewer.accounts, filter {AND:[{datetime_geq,datetime_leq},{bot:0},{siteTag_in:[siteTag]}]}; count = page views,
// sum.visits = visits. Live probes (2026-10-08, same data): windows up to 7 days answer from the fine tier
// (sampleInterval ~1); 14 days and wider switch to a coarse tier (sampleInterval 10) whose count and sum.visits are
// already extrapolated, and hour groups there even return visits 0. So every period is split into windows of at most
// RUM_MAX_WINDOW_DAYS, one POST per window, and the rows are summed by key. Numbers are used as returned (never
// multiplied); a sampleInterval above 1 only marks them as estimates.
//
// REQ1014-A (2026-10-14): the 방문/페이지뷰 totals come from a dimensionless `total` node (the hour groups lose
// visits under sampling while the dimension nodes extrapolate, so their sum disagreed with the tables); the previous
// period asks for `total` only. `pagesByVisits` backs up an empty `pages` answer. Countries are split into Korean pages
// and /en/ by two filters (`requestPath_notlike` / `requestPath_like "/en/%"`); if the API refuses those filter
// fields, every window is asked again with one `countryPaths` node (country × path) split here. Each node's row count
// and largest sampleInterval are kept for the 집계 정보 table.
import { COMPARE_PERIODS, GUIDE_TITLES, PERIODS, TOOLS, TOOL_LABELS } from './usage.mjs';

export const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
/** The Web Analytics site tag of docttak.com (not the beacon token). */
export const SITE_TAG = 'c188626389c143ae9567e09d59f3bfb2';
/** First day of RUM data (UTC). A comparison window starting earlier is meaningless. */
export const RUM_START = '2026-10-07';
/** Widest window one query may cover and still get the fine (unsampled) tier. */
export const RUM_MAX_WINDOW_DAYS = 7;
export const TOP_N = 10;
/** Deadline for all requests of one fetchVisits call together. */
export const TIMEOUT_MS = 8000;
/** Requests in flight at once (Cloudflare: 300 GraphQL queries per 5 minutes per user; 90 days = 13). */
export const MAX_IN_FLIGHT = 4;
/** Hourly trend rows of one window: 7 × 24 + the partial first hour fits; a full answer means rows were cut (error). */
export const TREND_LIMIT = 200;
/** Rows per window for the top tables, so the sum over windows ranks well beyond TOP_N. */
export const CHUNK_TOP = 50;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const KST_OFFSET = 9 * HOUR;

/** Rows of the countryPaths fallback node per window (country × path). */
export const COUNTRY_PATHS_LIMIT = 1000;
/** Paths of the English pages (REQ1014-A D11). */
export const EN_PATH_LIKE = '/en/%';
/** The device sum may differ from the total by this share before the page says why (REQ1014-A D9). */
export const MISMATCH_SHARE = 0.1;
/** Our own Android app (TWA) as a referrer -> its name (REQ1014-A D13). Other package names stay as they are. */
export const REFERRER_LABELS = { 'com.docttak.app': '문서딱 앱(안드로이드)' };
/**
 * AI answer services as referrers (REQ1015 D-A1): label -> web hosts (exact or any subdomain) and Android app package
 * names (exact). Search engines and company sites (google.com, bing.com, naver.com, openai.com) are not AI answers.
 */
export const AI_SERVICES = {
  ChatGPT: { hosts: ['chatgpt.com', 'chat.openai.com'], apps: ['com.openai.chatgpt'] },
  Perplexity: { hosts: ['perplexity.ai'], apps: ['ai.perplexity.app.android'] },
  Gemini: { hosts: ['gemini.google.com', 'bard.google.com'], apps: ['com.google.android.apps.bard'] },
  Copilot: { hosts: ['copilot.microsoft.com', 'copilot.cloud.microsoft'], apps: ['com.microsoft.copilot'] },
  Claude: { hosts: ['claude.ai'], apps: ['com.anthropic.claude'] },
  '기타 AI': { hosts: ['chat.deepseek.com', 'grok.com', 'wrtn.ai', 'clova-x.naver.com', 'poe.com', 'you.com', 'chat.mistral.ai', 'meta.ai'], apps: [] },
};

const FIELDS = 'count sum { visits } avg { sampleInterval }';
const group = (alias, limit, dim, order, filter = '$filter') => `${alias}: rumPageloadEventsAdaptiveGroups(limit: ${limit}, filter: ${filter}${order ? `, orderBy: [${order}]` : ''}) { ${FIELDS} dimensions { ${dim} } }`;
const ALIASES = { trend: 'datetimeHour', pages: 'requestPath', pagesByVisits: 'requestPath', referrers: 'refererHost', countriesKo: 'countryName', countriesEn: 'countryName', countryPaths: 'countryName', devices: 'deviceType' };
const LIMITS = { trend: TREND_LIMIT, pages: CHUNK_TOP, pagesByVisits: CHUNK_TOP, referrers: CHUNK_TOP, countriesKo: CHUNK_TOP, countriesEn: CHUNK_TOP, countryPaths: COUNTRY_PATHS_LIMIT, devices: TOP_N };
const TOTAL = `total: rumPageloadEventsAdaptiveGroups(limit: 1, filter: $filter) { ${FIELDS} }`;
const TREND = group('trend', TREND_LIMIT, 'datetimeHour');
const PAGES = [group('pages', CHUNK_TOP, 'requestPath', 'count_DESC'), group('pagesByVisits', CHUNK_TOP, 'requestPath', 'sum_visits_DESC'), group('referrers', CHUNK_TOP, 'refererHost', 'sum_visits_DESC')];
const COUNTRIES_SPLIT = [group('countriesKo', CHUNK_TOP, 'countryName', 'sum_visits_DESC', '$filterKo'), group('countriesEn', CHUNK_TOP, 'countryName', 'sum_visits_DESC', '$filterEn')];
const COUNTRIES_PATHS = [group('countryPaths', COUNTRY_PATHS_LIMIT, 'countryName requestPath', 'sum_visits_DESC')];
const DEVICES = group('devices', TOP_N, 'deviceType', 'sum_visits_DESC');
const FILTER_TYPE = 'AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject';
const HEAD = `query Visits($accountTag: string, $filter: ${FILTER_TYPE}) { viewer { accounts(filter: {accountTag: $accountTag}) {`;
const HEAD_SPLIT = `query Visits($accountTag: string, $filter: ${FILTER_TYPE}, $filterKo: ${FILTER_TYPE}, $filterEn: ${FILTER_TYPE}) { viewer { accounts(filter: {accountTag: $accountTag}) {`;
const queryOf = (head, nodes) => `${head}\n  ${nodes.join('\n  ')}\n} } }`;
const QUERIES = {
  full: queryOf(HEAD_SPLIT, [TOTAL, TREND, ...PAGES, ...COUNTRIES_SPLIT, DEVICES]),
  'full-paths': queryOf(HEAD, [TOTAL, TREND, ...PAGES, ...COUNTRIES_PATHS, DEVICES]),
  prev: queryOf(HEAD, [TOTAL]),
};

/**
 * One of three constant query strings: "full" (current period: total, trend, top tables, countries split by filter),
 * "full-paths" (the same with the countryPaths fallback) or "prev" (previous period: total only).
 */
export function visitsQuery(kind = 'full') {
  return Object.hasOwn(QUERIES, kind) ? QUERIES[kind] : QUERIES.full;
}

/** RUM_SITE_TAG: 32 lowercase hex -> it; unset/empty -> SITE_TAG; anything else -> null (the page shows a notice). */
export function siteTagOf(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (v === '') return SITE_TAG;
  return /^[0-9a-f]{32}$/.test(v) ? v : null;
}

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * The rolling windows of a period ending `now` (like usage.mjs NOW() - INTERVAL): cur [now - days, now]; prev
 * [now - 2·days, now - days - 1 s] (datetime_leq is inclusive) for COMPARE_PERIODS only, and only when it starts on
 * or after RUM_START (else prevBeforeStart). Throws for a period outside PERIODS.
 */
export function windows(days, now) {
  if (!PERIODS.includes(days)) throw new Error('visits: invalid period');
  const end = Math.floor(now.getTime() / 1000) * 1000;
  const start = end - days * DAY;
  const prevStart = start - days * DAY;
  const compares = COMPARE_PERIODS.includes(days);
  const prevBeforeStart = compares && prevStart < Date.parse(`${RUM_START}T00:00:00Z`);
  return {
    cur: { start: iso(start), end: iso(end) },
    prev: compares && !prevBeforeStart ? { start: iso(prevStart), end: iso(start - 1000) } : null,
    prevBeforeStart,
  };
}

/**
 * A window split into pieces of at most RUM_MAX_WINDOW_DAYS, oldest first, laid end to end without overlap: each
 * piece ends 1 s before the next one starts (datetime_leq is inclusive). 30 days -> 7+7+7+7+2, 90 days -> 13 pieces.
 */
export function chunks(w) {
  const start = Date.parse(w.start);
  const out = [];
  let end = Date.parse(w.end);
  for (;;) {
    const s = Math.max(start, end - RUM_MAX_WINDOW_DAYS * DAY);
    out.unshift({ start: iso(s), end: iso(end) });
    if (s <= start) return out;
    end = s - 1000;
  }
}

/** The variables' filters of a window: the base, and for the split query the Korean-page and /en/ ones (constants only). */
export function filterOf(w, siteTag, kind = 'full') {
  const filter = { AND: [{ datetime_geq: w.start, datetime_leq: w.end }, { bot: 0 }, { siteTag_in: [siteTag] }] };
  if (kind !== 'full') return { filter };
  return { filter, filterKo: { AND: [...filter.AND, { requestPath_notlike: EN_PATH_LIKE }] }, filterEn: { AND: [...filter.AND, { requestPath_like: EN_PATH_LIKE }] } };
}

/** Thrown by fetchVisits: status 0 = network / timeout. The message never holds the token. */
export class VisitsApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * @typedef {{ key: string, pageViews: number, visits: number }} Group
 * @typedef {{ visits: number, pageViews: number }} Totals
 * @typedef {{ node: string, rows: number, maxSi: number | null }} Diag
 * @typedef {{ total: Totals, trend: Group[], pages: Group[], pagesByVisits: Group[], referrers: Group[], countriesKo: Group[], countriesEn: Group[], devices: Group[] }} CurGroups
 * @typedef {{ cur: CurGroups, prev: Totals | null, estimated: boolean, approxTops: boolean, requests: number, diag?: Diag[] }} RawVisits
 */

const BAD_SHAPE = '응답 형식이 올바르지 않음';
const cut = (s, token) => {
  let m = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (token) m = m.split(token).join('***');
  return m.length > 160 ? `${m.slice(0, 159)}…` : m;
};
const finite = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;

/**
 * One alias's groups -> { rows: [{ key, pageViews: count, visits: sum.visits }] as returned (never multiplied),
 * sampled: some group's avg.sampleInterval is above 1, maxSi: the largest sampleInterval (null without one) }.
 * Missing count or visits is a schema change: throws.
 * @returns {{ rows: Group[], sampled: boolean, maxSi: number | null }}
 */
export function readGroups(groups, dim) {
  if (!Array.isArray(groups)) throw new VisitsApiError(200, BAD_SHAPE);
  /** @type {number | null} */
  let maxSi = null;
  const rows = groups.map((g) => {
    if (!finite(g?.count) || !finite(g?.sum?.visits) || !g.dimensions || typeof g.dimensions !== 'object') throw new VisitsApiError(200, BAD_SHAPE);
    const si = g.avg?.sampleInterval;
    if (finite(si)) maxSi = Math.max(maxSi ?? 0, si);
    const raw = g.dimensions[dim];
    return { key: typeof raw === 'string' ? raw : '', pageViews: g.count, visits: g.sum.visits };
  });
  return { rows, sampled: maxSi !== null && maxSi > 1, maxSi };
}

/**
 * The dimensionless `total` node -> { visits, pageViews, rows, sampled, maxSi } (no group = zeros; readGroups needs
 * dimensions). More than one group or a missing count / visits is a schema change: throws.
 */
export function readTotal(groups) {
  if (!Array.isArray(groups) || groups.length > 1) throw new VisitsApiError(200, BAD_SHAPE);
  const g = groups[0];
  if (!g) return { visits: 0, pageViews: 0, rows: 0, sampled: false, maxSi: null };
  if (!finite(g?.count) || !finite(g?.sum?.visits)) throw new VisitsApiError(200, BAD_SHAPE);
  const si = finite(g.avg?.sampleInterval) ? g.avg.sampleInterval : null;
  return { visits: g.sum.visits, pageViews: g.count, rows: 1, sampled: si !== null && si > 1, maxSi: si };
}

/** errors[] text saying the API refused the requestPath like / notlike filter fields (REQ1014-A D11 fallback). */
export const isLikeRefused = (err) => err instanceof VisitsApiError && err.status === 200 && /requestPath_(not)?like|filterKo|filterEn/i.test(err.message);

/**
 * Rows of several windows summed by key (first-seen order).
 * @param {Group[][]} lists
 * @returns {Group[]}
 */
export function mergeRows(lists) {
  const byKey = new Map();
  for (const list of lists)
    for (const r of list) {
      const m = byKey.get(r.key) ?? { key: r.key, pageViews: 0, visits: 0 };
      m.pageViews += r.pageViews;
      m.visits += r.visits;
      byKey.set(r.key, m);
    }
  return [...byKey.values()];
}

const isTimeout = (err, signal) => Boolean(signal?.aborted) || (err && typeof err === 'object' && (err.name === 'TimeoutError' || err.name === 'AbortError'));

/** One POST for one window; resolves to the account node. A deadline hit while sending or reading is a timeout. */
async function post({ accountId, token, siteTag, f, signal, timeoutMs }, w, kind) {
  const timeout = () => new VisitsApiError(0, `시간 초과 (${Math.round(timeoutMs / 1000)}초)`);
  let res;
  try {
    res = await f(GRAPHQL_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: visitsQuery(kind), variables: { accountTag: accountId, ...filterOf(w, siteTag, kind) } }),
      signal,
    });
  } catch (err) {
    throw isTimeout(err, signal) ? timeout() : new VisitsApiError(0, '네트워크 오류');
  }
  let body = null;
  try {
    body = await res.json();
  } catch (err) {
    if (isTimeout(err, signal)) throw timeout();
    body = null;
  }
  const firstError = Array.isArray(body?.errors) && body.errors.length ? cut(body.errors[0]?.message, token) : '';
  if (res.status !== 200) throw new VisitsApiError(res.status, firstError ? `HTTP ${res.status}: ${firstError}` : `HTTP ${res.status}`);
  if (firstError) throw new VisitsApiError(200, firstError);
  const acc = body?.data?.viewer?.accounts?.[0];
  if (!acc || typeof acc !== 'object') throw new VisitsApiError(200, BAD_SHAPE);
  return acc;
}

/** Runs the tasks with at most `limit` in flight; the first failure rejects and stops new starts. */
async function pool(tasks, limit) {
  const out = new Array(tasks.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < tasks.length) {
      const k = next++;
      try {
        out[k] = await tasks[k]();
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}

/**
 * The visits of the period ending `now`: one POST per window of at most RUM_MAX_WINDOW_DAYS (current period: total,
 * trend and top tables; previous period, when `compare` and windows() allow it: total only), at most MAX_IN_FLIGHT at
 * once, all under one TIMEOUT_MS deadline. Rows are summed by key across windows. If the API refuses the country split
 * filters (errors[] naming them), every window is asked again with the countryPaths fallback. Resolves to { cur, prev,
 * estimated (some group had sampleInterval > 1), approxTops (a top table came back full, so the ranking may miss
 * rows), requests, diag (per node: rows over all windows and the largest sampleInterval) }; rejects with
 * VisitsApiError on HTTP != 200, other errors[], bad JSON or missing nodes, a full trend answer, a network error or
 * the deadline. `fetch` is injectable.
 * @returns {Promise<RawVisits>}
 */
export async function fetchVisits({ accountId, token, siteTag, days, now, compare = true, fetch: f = fetch, timeoutMs = TIMEOUT_MS }) {
  const w = windows(days, now);
  const curChunks = chunks(w.cur);
  const prevChunks = compare && w.prev ? chunks(w.prev) : [];
  const ctx = { accountId, token, siteTag, f, signal: AbortSignal.timeout(timeoutMs), timeoutMs };
  const tasksOf = (kind) => [...curChunks.map((c) => () => post(ctx, c, kind)), ...prevChunks.map((c) => () => post(ctx, c, 'prev'))];
  let kind = 'full';
  let requests = curChunks.length + prevChunks.length;
  let accs;
  try {
    accs = await pool(tasksOf(kind), MAX_IN_FLIGHT);
  } catch (err) {
    if (!isLikeRefused(err)) throw err;
    kind = 'full-paths';
    requests *= 2;
    accs = await pool(tasksOf(kind), MAX_IN_FLIGHT);
  }
  let estimated = false;
  let approxTops = false;
  /** @type {Map<string, Diag>} */
  const diag = new Map();
  const note = (node, rows, maxSi) => {
    const d = diag.get(node) ?? { node, rows: 0, maxSi: null };
    d.rows += rows;
    if (maxSi !== null) d.maxSi = Math.max(d.maxSi ?? 0, maxSi);
    diag.set(node, d);
  };
  /** @param {any} acc @param {keyof typeof ALIASES} alias */
  const read = (acc, alias) => {
    const raw = acc[alias];
    const { rows, sampled, maxSi } = readGroups(raw, ALIASES[alias]);
    if (alias === 'trend' && raw.length >= TREND_LIMIT) throw new VisitsApiError(200, '시간대 행이 너무 많음');
    // countryPaths is one window's whole country × path list: a full answer means rows were cut even for one window.
    if (alias !== 'trend' && (curChunks.length > 1 || alias === 'countryPaths') && raw.length >= LIMITS[alias]) approxTops = true;
    if (sampled) estimated = true;
    note(alias, rows.length, maxSi);
    return rows;
  };
  const totalOf = (list, node) => {
    const t = { visits: 0, pageViews: 0 };
    for (const acc of list) {
      const x = readTotal(acc.total);
      if (x.sampled) estimated = true;
      note(node, x.rows, x.maxSi);
      t.visits += x.visits;
      t.pageViews += x.pageViews;
    }
    return t;
  };
  const curAccs = accs.slice(0, curChunks.length);
  const merged = (alias) => mergeRows(curAccs.map((a) => read(a, alias)));
  const total = totalOf(curAccs, 'total');
  const trend = merged('trend');
  const pages = merged('pages');
  const pagesByVisits = merged('pagesByVisits');
  const referrers = merged('referrers');
  let countriesKo;
  let countriesEn;
  if (kind === 'full') {
    countriesKo = merged('countriesKo');
    countriesEn = merged('countriesEn');
  } else {
    const ko = [];
    const en = [];
    for (const acc of curAccs) {
      const rows = read(acc, 'countryPaths');
      rows.forEach((r, i) => (String(acc.countryPaths[i].dimensions.requestPath ?? '').startsWith('/en/') ? en : ko).push(r));
    }
    countriesKo = mergeRows([ko]);
    countriesEn = mergeRows([en]);
  }
  /** @type {CurGroups} */
  const cur = { total, trend, pages, pagesByVisits, referrers, countriesKo, countriesEn, devices: merged('devices') };
  const prev = prevChunks.length ? totalOf(accs.slice(curChunks.length), 'total (직전 기간)') : null;
  return { cur, prev, estimated, approxTops, requests, diag: [...diag.values()] };
}

// ---------- shaping ----------

const sum = (groups) => groups.reduce((t, g) => ({ visits: t.visits + g.visits, pageViews: t.pageViews + g.pageViews }), { visits: 0, pageViews: 0 });

const kstKey = (ms, unit) => new Date(ms + KST_OFFSET).toISOString().slice(0, unit === 'hour' ? 13 : 10);
const bucketLabel = (key, unit) => {
  const [, m, d] = key.slice(0, 10).split('-').map(Number);
  return unit === 'hour' ? `${m}/${d} ${key.slice(11, 13)}시` : `${m}/${d}`;
};

/**
 * The trend buckets of the window: 1 day -> one per KST hour, else one per KST calendar day, covering every
 * hour/day the window touches (a rolling 1-day window touches 25 KST hours: the partial first one is its own bucket).
 * Missing buckets are 0.
 */
export function trendBuckets(trend, days, now) {
  const unit = days === 1 ? 'hour' : 'day';
  const w = windows(days, now);
  const step = unit === 'hour' ? HOUR : DAY;
  const keys = [];
  const last = kstKey(Date.parse(w.cur.end), unit);
  for (let ms = Date.parse(w.cur.start); ; ms += step) {
    const k = kstKey(ms, unit);
    if (keys[keys.length - 1] !== k) keys.push(k);
    if (k >= last) break;
  }
  const byKey = new Map(keys.map((k) => [k, { visits: 0, pageViews: 0 }]));
  for (const g of trend) {
    const t = Date.parse(g.key);
    if (!Number.isFinite(t)) continue;
    const b = byKey.get(kstKey(t, unit));
    if (!b) continue;
    b.visits += g.visits;
    b.pageViews += g.pageViews;
  }
  return keys.map((k) => {
    const b = byKey.get(k) ?? { visits: 0, pageViews: 0 };
    return { label: bucketLabel(k, unit), visits: b.visits, pageViews: b.pageViews };
  });
}

const PATH_MAX = 80;
/** A page path -> its Korean name: 홈, a tool name, a guide or hub title; else the path itself. */
export function pageLabel(path) {
  if (path === '/') return '홈';
  const tool = /^\/([a-z0-9-]+)\/$/.exec(path)?.[1];
  if (tool && TOOLS.includes(tool)) return TOOL_LABELS[tool];
  const guide = /^\/guide\/([a-z0-9-]+)\/$/.exec(path)?.[1];
  if (guide && Object.hasOwn(GUIDE_TITLES, guide)) return GUIDE_TITLES[guide];
  return path.slice(0, PATH_MAX);
}

const SELF = /(^|\.)docttak\.com$/;
let regionNames = null;
try {
  regionNames = new Intl.DisplayNames(['ko'], { type: 'region' });
} catch {
  regionNames = null;
}
/** ISO 3166 alpha-2 -> Korean country name; unknown or unsupported -> the code; empty -> 알 수 없음. */
export function countryLabel(code) {
  if (!code) return '알 수 없음';
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}
const DEVICE_LABELS = { desktop: '컴퓨터', mobile: '휴대폰', tablet: '태블릿' };
export const deviceLabel = (d) => (Object.hasOwn(DEVICE_LABELS, d) ? DEVICE_LABELS[d] : d || '알 수 없음');

const byVisits = (a, b) => b.visits - a.visits || b.pageViews - a.pageViews;

/** A referrer host or Android package name -> its AI_SERVICES label (any case), or null when it is not an AI service. */
export function aiServiceOf(host) {
  const k = String(host ?? '').toLowerCase();
  if (k === '') return null;
  for (const [label, { hosts, apps }] of Object.entries(AI_SERVICES)) {
    if (apps.includes(k) || hosts.some((h) => k === h || k.endsWith(`.${h}`))) return label;
  }
  return null;
}

/**
 * A referrer host -> its label: our app's name (REFERRER_LABELS, any case), an AI service as 「LABEL (host)」,
 * 직접 방문·알 수 없음 for none, else the host.
 */
export function referrerLabel(host) {
  if (host === '') return '직접 방문·알 수 없음';
  const k = host.toLowerCase();
  if (Object.hasOwn(REFERRER_LABELS, k)) return REFERRER_LABELS[k];
  const ai = aiServiceOf(k);
  return ai ? `${ai} (${host})` : host;
}

/**
 * The AI-service visits among all referrer rows (REQ1015 D-A2), before the top-10 cut: per service (visits desc, zero
 * rows left out) and the total. partial: the referrer list reached CHUNK_TOP rows, so AI hosts ranked lower are missed.
 * @param {Group[]} referrers
 */
export function aiReferrers(referrers) {
  const by = new Map();
  for (const g of referrers) {
    const label = aiServiceOf(g.key);
    if (!label) continue;
    const row = by.get(label) ?? { label, visits: 0, pageViews: 0 };
    row.visits += g.visits;
    row.pageViews += g.pageViews;
    by.set(label, row);
  }
  const rows = [...by.values()].filter((r) => r.visits > 0 || r.pageViews > 0).sort(byVisits);
  return { total: sum(rows), rows, partial: referrers.length >= CHUNK_TOP };
}

/** True when the device rows' visits differ from the total by more than MISMATCH_SHARE of it (REQ1014-A D9). */
export function mismatchOf(totalVisits, deviceVisits) {
  return Math.abs(deviceVisits - totalVisits) > MISMATCH_SHARE * totalVisits;
}

/**
 * fetchVisits output -> the admin page's numbers (not yet escaped): totals (the dimensionless total node, never the
 * trend sum) and prevTotals, the trend buckets (chart only), the top tables with Korean labels, and the flags
 * estimated (Cloudflare sampled some rows), approxTops (summed ranking may miss rows), prevBeforeStart (the comparison
 * window starts before RUM_START), mismatch (the device sum is off the total by more than 10 %) and diag (per node
 * rows and largest sample interval). Pages come from `pages`, or from `pagesByVisits` when Cloudflare sent no `pages`
 * rows (pagesSource count | visits | none); pagesMissing: both empty while there were page views.
 * @param {RawVisits} raw
 * @param {number} days
 * @param {Date} now
 */
export function shapeVisits(raw, days, now) {
  const { cur, prev } = raw;
  const w = windows(days, now);
  const totals = { visits: cur.total.visits, pageViews: cur.total.pageViews };
  const pagesSource = cur.pages.length ? 'count' : cur.pagesByVisits.length ? 'visits' : 'none';
  const pageRows = pagesSource === 'count' ? [...cur.pages].sort((a, b) => b.pageViews - a.pageViews || b.visits - a.visits) : [...cur.pagesByVisits].sort(byVisits);
  const devices = [...cur.devices].sort(byVisits);
  const countries = (list) => [...list].sort(byVisits).slice(0, TOP_N).map((g) => ({ label: countryLabel(g.key), visits: g.visits }));
  return {
    estimated: Boolean(raw.estimated),
    approxTops: Boolean(raw.approxTops),
    totals,
    prevTotals: prev ? { visits: prev.visits, pageViews: prev.pageViews } : null,
    prevBeforeStart: w.prevBeforeStart,
    trend: trendBuckets(cur.trend, days, now),
    pagesSource,
    pagesMissing: pagesSource === 'none' && totals.pageViews > 0,
    pages: pageRows.slice(0, TOP_N).map((g) => ({ label: pageLabel(g.key), path: g.key.slice(0, PATH_MAX), visits: g.visits, pageViews: g.pageViews })),
    referrers: cur.referrers
      .filter((g) => !SELF.test(g.key.toLowerCase()))
      .sort(byVisits)
      .slice(0, TOP_N)
      .map((g) => ({ label: referrerLabel(g.key), visits: g.visits, pageViews: g.pageViews })),
    ai: aiReferrers(cur.referrers),
    countriesKo: countries(cur.countriesKo),
    countriesEn: countries(cur.countriesEn),
    devices: devices.map((g) => ({ label: deviceLabel(g.key), visits: g.visits })),
    mismatch: mismatchOf(totals.visits, sum(devices).visits),
    diag: Array.isArray(raw.diag) ? raw.diag.map((d) => ({ node: d.node, rows: d.rows, maxSi: d.maxSi })) : [],
  };
}
