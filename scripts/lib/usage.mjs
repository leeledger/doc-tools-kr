// Anonymous usage statistics (brief handoff/ARCHITECT-BRIEF-USAGE.md): the single source of the whitelist.
// Imported by the client (src/lib/ui/usage.ts), the Pages Functions (functions/api/usage.ts, functions/admin/),
// the weekly growth report (scripts/ops/growth.mjs), check-dist and the tests. Plain ESM, no dependencies.
//
// Flag: PUBLIC_USAGE_STATS = "1" on, anything else off (no beacon code ships). PUBLIC_USAGE_SAMPLE: optional share
// of page loads that report, a number in [0.01, 1] (default 1); every event carries the weight 1/share.
//
// Payload (client -> server): JSON text of at most 512 bytes with these short keys only (an unknown key is rejected):
//   e   event       pick | start | success | fail | download | arrive
//   t   tool        one of TOOLS
//   c   fail code   fail only, ^[a-z-]{1,24}$
//   p   phase       fail only, load | parse | process | save
//   br  browser     fail only, family and major version ("chrome 131")
//   o/v setting     start only, a key of SETTINGS and one of its values (exact numbers are bucketed client-side)
//   g   guide slug  arrive only
//   dl  deep link   arrive only, "0" | "1"
//   via             every event, guide | direct
//   d   device      mobile | tablet | desktop
//   b   build id    ^([0-9a-f]{7,40}|dev)$
//   w   weight      integer 1-100 (1 / sample share)
// Never: file name, size, page count, dimensions, content, URL query, referrer, user agent, timestamps, ids.
//
// Analytics Engine row (fixed order; the SQL below depends on it):
//   indexes: [t]
//   blobs:   [e, t, c, p, o, v, g, dl, via, d, br, b]   -> blob1 .. blob12 (missing -> '')
//   doubles: [w]                                         -> double1
// Counts are always SUM(_sample_interval * double1) (Cloudflare samples at high volume; we sample on the page).

export const USAGE_PATH = '/api/usage';
export const MAX_BODY = 512;
export const MAX_EVENTS = 40;
export const DEFAULT_DATASET = 'docttak_usage';
export const PERIODS = [1, 7, 30, 90];
export const DEFAULT_DAYS = 7;

export const EVENTS = ['pick', 'start', 'success', 'fail', 'download', 'arrive'];
export const TOOLS = ['pdf-merge', 'pdf-compress', 'photo-compress', 'id-photo', 'hwp-to-pdf', 'hwp-viewer', 'stamp-signature', 'remove-background', 'jpg-to-pdf'];
export const PHASES = ['load', 'parse', 'process', 'save'];
export const VIAS = ['guide', 'direct'];
export const DEVICES = ['mobile', 'tablet', 'desktop'];
export const KB_BUCKETS = ['le100', 'le200', 'le300', 'le500', 'le1000', 'gt1000'];
export const MB_BUCKETS = ['le1', 'le2', 'le5', 'le10', 'gt10'];
/** Equal to PRESET_IDS in src/data/preset-ids.ts (a unit test keeps them equal), plus "custom". */
export const PRESETS = ['passport_online', 'id_card', 'driver_license', 'gosi', 'qnet', 'history', 'korcham', 'teps', 'kuksiwon', 'saramin', 'jobkorea', 'half_card', 'custom'];
/** Equal to the keys of LEVELS in src/lib/pdf/compress/levels.ts (unit test). */
export const LEVEL_IDS = ['high', 'recommended', 'strong'];
export const MODES = ['cloud', 'device'];
/** 사진 PDF 변환 용지 (TOOLS4 T2): 사진 크기에 맞춤 | A4. */
export const PAGE_MODES = ['fit', 'a4'];
/** Setting key -> its allowed values. */
export const SETTINGS = { 'target-kb': KB_BUCKETS, preset: PRESETS, level: LEVEL_IDS, 'target-mb': MB_BUCKETS, mode: MODES, page: PAGE_MODES };

export const CODE_RE = /^[a-z-]{1,24}$/;
export const GUIDE_RE = /^[a-z0-9-]{1,60}$/;
export const BROWSER_RE = /^[a-z]{2,10}( [0-9]{1,4})?$/;
export const BUILD_RE = /^([0-9a-f]{7,40}|dev)$/;
export const DATASET_RE = /^[a-z0-9_]{1,64}$/;

/** Keys in Analytics Engine blob order (blob1 .. blob12). */
export const BLOB_KEYS = ['e', 't', 'c', 'p', 'o', 'v', 'g', 'dl', 'via', 'd', 'br', 'b'];
const KEYS = new Set([...BLOB_KEYS, 'w']);
/** Keys allowed on one event type only. */
const ONLY = { c: 'fail', p: 'fail', br: 'fail', o: 'start', v: 'start', g: 'arrive', dl: 'arrive' };

/** PUBLIC_USAGE_STATS: on only for "1" (after trimming). */
export function usageOn(value) {
  return typeof value === 'string' && value.trim() === '1';
}

/** PUBLIC_USAGE_SAMPLE: the share in [0.01, 1]; unset or empty -> 1; anything else throws (check-dist reports it). */
export function usageSample(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (v === '') return 1;
  const n = /^(0|1)?(\.\d+)?$/.test(v) ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0.01 || n > 1) throw new Error(`PUBLIC_USAGE_SAMPLE "${v}" is not a number between 0.01 and 1`);
  return n;
}

/** The weight one sampled event stands for: 1 / share, rounded, 1-100. */
export function sampleWeight(rate) {
  return Math.min(100, Math.max(1, Math.round(1 / rate)));
}

/** Target size in KB -> bucket (edges inclusive: 100 -> le100, 100.1 -> le200, 1001 -> gt1000). */
export function bucketKB(kb) {
  if (kb <= 100) return 'le100';
  if (kb <= 200) return 'le200';
  if (kb <= 300) return 'le300';
  if (kb <= 500) return 'le500';
  if (kb <= 1000) return 'le1000';
  return 'gt1000';
}

/** Target size in MB -> bucket (edges inclusive: 1 -> le1, 1.1 -> le2, 10.1 -> gt10). */
export function bucketMB(mb) {
  if (mb <= 1) return 'le1';
  if (mb <= 2) return 'le2';
  if (mb <= 5) return 'le5';
  if (mb <= 10) return 'le10';
  return 'gt10';
}

/** The analytics dataset name from USAGE_DATASET (default docttak_usage), or null when it is not a safe name. */
export function datasetName(value) {
  const v = typeof value === 'string' && value.trim() !== '' ? value.trim() : DEFAULT_DATASET;
  return DATASET_RE.test(v) ? v : null;
}

const isStr = (x) => typeof x === 'string';
const VALUE_CHECKS = {
  e: (x) => EVENTS.includes(x),
  t: (x) => TOOLS.includes(x),
  c: (x) => CODE_RE.test(x),
  p: (x) => PHASES.includes(x),
  o: (x) => Object.hasOwn(SETTINGS, x),
  v: () => true, // checked against o below
  g: (x) => GUIDE_RE.test(x),
  dl: (x) => x === '0' || x === '1',
  via: (x) => VIAS.includes(x),
  d: (x) => DEVICES.includes(x),
  br: (x) => BROWSER_RE.test(x),
  b: (x) => BUILD_RE.test(x),
};
const REQUIRED = ['e', 't', 'via', 'd', 'b', 'w'];

/**
 * The event in `text` (the request body), or null when it is not exactly a whitelisted event: over 512 bytes, not a
 * JSON object, an unknown key, a value outside its list, a key on the wrong event type, or a required key missing.
 * The result holds every blob key ('' when absent) and w.
 */
export function validate(text) {
  if (!isStr(text) || new TextEncoder().encode(text).length > MAX_BODY) return null;
  let o;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  for (const k of Object.keys(o)) if (!KEYS.has(k)) return null;
  for (const k of REQUIRED) if (!Object.hasOwn(o, k)) return null;
  if (!Number.isInteger(o.w) || o.w < 1 || o.w > 100) return null;
  for (const k of BLOB_KEYS) {
    if (!Object.hasOwn(o, k)) continue;
    if (!isStr(o[k]) || !VALUE_CHECKS[k](o[k])) return null;
    if (ONLY[k] && ONLY[k] !== o.e) return null;
  }
  if (o.e === 'fail' && !(Object.hasOwn(o, 'c') && Object.hasOwn(o, 'p'))) return null;
  if (o.e === 'arrive' && !(Object.hasOwn(o, 'g') && Object.hasOwn(o, 'dl'))) return null;
  if (Object.hasOwn(o, 'o') !== Object.hasOwn(o, 'v')) return null;
  if (Object.hasOwn(o, 'o') && !SETTINGS[o.o].includes(o.v)) return null;
  const ev = { w: o.w };
  for (const k of BLOB_KEYS) ev[k] = Object.hasOwn(o, k) ? o[k] : '';
  return ev;
}

/** The Analytics Engine data point of a validated event (row schema at the top of this file). */
export function toDataPoint(ev) {
  return { indexes: [ev.t], blobs: BLOB_KEYS.map((k) => ev[k]), doubles: [ev.w] };
}

// ---------- reading back (SQL API) ----------

const N = 'SUM(_sample_interval * double1)';

/** The four queries of the admin page and the weekly report. Throws on a period or dataset outside the whitelist. */
export function usageSql(dataset, days) {
  if (!DATASET_RE.test(dataset ?? '')) throw new Error('usage: invalid dataset name');
  if (!PERIODS.includes(days)) throw new Error('usage: invalid period');
  const where = `timestamp > NOW() - INTERVAL '${days}' DAY`;
  return {
    events: `SELECT blob2 AS tool, blob1 AS event, blob9 AS via, ${N} AS n FROM ${dataset} WHERE ${where} GROUP BY blob2, blob1, blob9 FORMAT JSON`,
    fails: `SELECT blob2 AS tool, blob3 AS code, blob4 AS phase, ${N} AS n FROM ${dataset} WHERE ${where} AND blob1 = 'fail' GROUP BY blob2, blob3, blob4 ORDER BY n DESC LIMIT 20 FORMAT JSON`,
    settings: `SELECT blob2 AS tool, blob5 AS setting, blob6 AS value, ${N} AS n FROM ${dataset} WHERE ${where} AND blob1 = 'start' AND blob5 != '' GROUP BY blob2, blob5, blob6 ORDER BY n DESC LIMIT 500 FORMAT JSON`,
    guides: `SELECT blob7 AS guide, blob2 AS tool, blob8 AS dl, ${N} AS n FROM ${dataset} WHERE ${where} AND blob1 = 'arrive' GROUP BY blob7, blob2, blob8 ORDER BY n DESC LIMIT 500 FORMAT JSON`,
  };
}

/** Thrown by fetchUsage when the SQL API answers with an error (status only; the token never appears). */
export class UsageApiError extends Error {
  constructor(status) {
    super(`analytics engine SQL API: HTTP ${status}`);
    this.status = status;
  }
}

/**
 * Runs the four queries against the Analytics Engine SQL API. `fetch` is injectable for tests.
 * Resolves to { events, fails, settings, guides } (arrays of rows); rejects with UsageApiError (status 0: network).
 */
export async function fetchUsage({ accountId, token, dataset, days, fetch: f = fetch }) {
  const sql = usageSql(dataset, days);
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/analytics_engine/sql`;
  const run = async (q) => {
    let res;
    try {
      res = await f(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: q });
    } catch {
      throw new UsageApiError(0);
    }
    if (!res.ok) throw new UsageApiError(res.status);
    try {
      const body = await res.json();
      return Array.isArray(body?.data) ? body.data : [];
    } catch {
      throw new UsageApiError(res.status);
    }
  };
  const [events, fails, settings, guides] = await Promise.all([run(sql.events), run(sql.fails), run(sql.settings), run(sql.guides)]);
  return { events, fails, settings, guides };
}

// ---------- shaping and rendering ----------

export const TOOL_LABELS = {
  'pdf-merge': 'PDF 합치기',
  'pdf-compress': 'PDF 용량 줄이기',
  'photo-compress': '사진 용량 줄이기',
  'id-photo': '증명사진 규격 맞추기',
  'hwp-to-pdf': 'HWP PDF 변환',
  'hwp-viewer': 'HWP 파일 보기',
  'stamp-signature': '서명·도장 만들기',
  'remove-background': '배경 지우기',
  'jpg-to-pdf': '사진 PDF 변환',
};
const PHASE_LABELS = { load: '준비', parse: '파일 읽기', process: '처리', save: '저장' };
const SETTING_LABELS = { 'target-kb': '목표 용량', preset: '증명사진 규격', level: '압축 단계', 'target-mb': '목표 용량', mode: '처리 방식', page: '용지' };
const VALUE_LABELS = {
  le100: '100KB 이하',
  le200: '200KB 이하',
  le300: '300KB 이하',
  le500: '500KB 이하',
  le1000: '1000KB 이하',
  gt1000: '1000KB 넘음',
  le1: '1MB 이하',
  le2: '2MB 이하',
  le5: '5MB 이하',
  le10: '10MB 이하',
  gt10: '10MB 넘음',
  high: '고화질',
  recommended: '권장',
  strong: '강력',
  cloud: '서버에서',
  device: '이 기기에서',
  id_card: '주민등록증 (인화용)',
  driver_license: '운전면허증',
  custom: '직접 입력',
  fit: '사진 크기에 맞춤',
  a4: 'A4',
};
const label = (map, x) => (Object.hasOwn(map, x) ? map[x] : String(x ?? ''));
const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};
const count = (n) => Math.round(n).toLocaleString('en-US');
const rate = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '-');

/**
 * Query rows -> display tables (strings only, not yet escaped). Shared by the admin page (HTML) and the weekly
 * report (markdown). Also returns the totals for the report summary.
 * @param {{ events?: Array<Record<string, any>>, fails?: Array<Record<string, any>>, settings?: Array<Record<string, any>>, guides?: Array<Record<string, any>> }} rows
 */
export function shapeUsage({ events = [], fails = [], settings = [], guides = [] }) {
  const per = new Map();
  const cell = (tool) => {
    if (!per.has(tool)) per.set(tool, { pick: 0, start: 0, success: 0, fail: 0, download: 0, guide: { success: 0, fail: 0 }, direct: { success: 0, fail: 0 } });
    return per.get(tool);
  };
  for (const r of events) {
    if (!TOOLS.includes(r.tool) || !EVENTS.includes(r.event) || r.event === 'arrive') continue;
    const c = cell(r.tool);
    const n = num(r.n);
    c[r.event] += n;
    if ((r.event === 'success' || r.event === 'fail') && VIAS.includes(r.via)) c[r.via][r.event] += n;
  }
  const tools = TOOLS.filter((t) => per.has(t));
  let success = 0;
  let fail = 0;
  for (const t of tools) {
    success += per.get(t).success;
    fail += per.get(t).fail;
  }

  const bySetting = new Map();
  for (const r of settings) {
    const list = bySetting.get(r.tool) ?? [];
    list.push(r);
    bySetting.set(r.tool, list);
  }
  const settingRows = [];
  for (const t of [...TOOLS, ...[...bySetting.keys()].filter((k) => !TOOLS.includes(k))]) {
    const list = (bySetting.get(t) ?? []).sort((a, b) => num(b.n) - num(a.n)).slice(0, 5);
    for (const r of list) settingRows.push([label(TOOL_LABELS, t), label(SETTING_LABELS, r.setting), label(VALUE_LABELS, r.value), count(num(r.n))]);
  }

  const arrivals = new Map();
  for (const r of guides) {
    const key = `${r.guide}\u0000${r.tool}`;
    const a = arrivals.get(key) ?? { guide: r.guide, tool: r.tool, n: 0, dl: 0 };
    a.n += num(r.n);
    if (r.dl === '1') a.dl += num(r.n);
    arrivals.set(key, a);
  }

  return {
    totals: { success, fail, rate: rate(success, success + fail) },
    tables: [
      {
        title: '도구별',
        head: ['도구', '파일 고름', '처리 시작', '성공', '실패', '성공률', '내려받음'],
        rows: tools.map((t) => {
          const c = per.get(t);
          return [label(TOOL_LABELS, t), count(c.pick), count(c.start), count(c.success), count(c.fail), rate(c.success, c.success + c.fail), count(c.download)];
        }),
      },
      {
        title: '실패 이유',
        head: ['도구', '오류 코드', '단계', '횟수'],
        rows: fails.slice(0, 20).map((r) => [label(TOOL_LABELS, r.tool), String(r.code ?? ''), label(PHASE_LABELS, r.phase), count(num(r.n))]),
      },
      { title: '많이 쓴 설정', head: ['도구', '설정', '값', '횟수'], rows: settingRows },
      {
        title: '안내 글에서 도구로',
        head: ['안내 글', '도구', '넘어옴', '딥링크 비율'],
        rows: [...arrivals.values()].sort((a, b) => b.n - a.n).map((a) => [String(a.guide ?? ''), label(TOOL_LABELS, a.tool), count(a.n), rate(a.dl, a.n)]),
      },
      {
        title: '도구별 성공률 (안내에서 온 경우와 바로 온 경우)',
        head: ['도구', '안내에서 옴', '바로 옴'],
        rows: tools.map((t) => {
          const c = per.get(t);
          return [label(TOOL_LABELS, t), rate(c.guide.success, c.guide.success + c.guide.fail), rate(c.direct.success, c.direct.success + c.direct.fail)];
        }),
      },
    ],
  };
}

export const EMPTY_TABLE = '기록이 아직 없어요.';

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

const mdCell = (s) => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');

/**
 * The shaped tables as markdown (`level`: heading level of each title) or as HTML (`format` "html", every value
 * escaped). Both read the same shaped rows.
 */
export function renderTables(shaped, format = 'md', level = 3) {
  if (format === 'html') {
    return shaped.tables
      .map((t) => {
        const title = `<h2>${escapeHtml(t.title)}</h2>`;
        if (!t.rows.length) return `${title}\n<p>${EMPTY_TABLE}</p>`;
        const head = `<tr>${t.head.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr>`;
        const body = t.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('\n');
        return `${title}\n<table>\n<thead>${head}</thead>\n<tbody>\n${body}\n</tbody>\n</table>`;
      })
      .join('\n');
  }
  const h = '#'.repeat(level);
  return shaped.tables
    .map((t) => {
      if (!t.rows.length) return `${h} ${t.title}\n\n${EMPTY_TABLE}`;
      const lines = [`| ${t.head.map(mdCell).join(' | ')} |`, `| ${t.head.map(() => '---').join(' | ')} |`, ...t.rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`)];
      return `${h} ${t.title}\n\n${lines.join('\n')}`;
    })
    .join('\n\n');
}
