// Web Analytics (RUM) GraphQL answers for /admin/ visits (brief handoff/ARCHITECT-BRIEF-ADMIN-VISITS.md, Fixtures).
// Same keys, nesting and types as handoff/rum-probe-response.json (data.viewer.accounts[0].<alias>[] with avg
// { sampleInterval }, count, dimensions { … }, sum { visits }; errors null). Every number, path and host here is made
// up. Answers are built per request from its filter window (the code asks once per window of at most 7 days), so a
// stub can answer any number of requests. Used by tests/unit and scripts/qa/admin-preview.mjs.

const HOUR = 3_600_000;

/**
 * One group as the API sends it.
 * @param {string} dim @param {string} value @param {number} count @param {number} visits @param {number} [sampleInterval]
 * @returns {{ avg: { sampleInterval: number }, count: number, dimensions: Record<string, string>, sum: { visits: number } }}
 */
export const g = (dim, value, count, visits, sampleInterval = 1) => ({ avg: { sampleInterval }, count, dimensions: { [dim]: value }, sum: { visits } });

/** A whole answer: { data: { viewer: { accounts: [aliases] } }, errors: null }. */
export const rumBody = (aliases) => ({ data: { viewer: { accounts: [aliases] } }, errors: null });

/**
 * The window of a request body: { start, end } from variables.filter.AND[0]; full = the query has the top tables;
 * paths = it is the countryPaths fallback (REQ1014-A); split = it sends the Korean-page and /en/ filters.
 */
export function windowOf(requestBody) {
  const b = JSON.parse(String(requestBody));
  const range = b.variables.filter.AND[0];
  const q = String(b.query);
  return { start: range.datetime_geq, end: range.datetime_leq, full: q.includes('pages:'), paths: q.includes('countryPaths:'), split: Boolean(b.variables.filterKo) };
}

/** The dimensionless total node: one group summing `rows` (or `override` { count, visits }); [] without page views. */
export function totalOf(rows, si = 1, override = null) {
  const count = override ? override.count : rows.reduce((t, r) => t + r.count, 0);
  const visits = override ? override.visits : rows.reduce((t, r) => t + r.sum.visits, 0);
  return count > 0 || visits > 0 ? [{ avg: { sampleInterval: si }, count, sum: { visits } }] : [];
}

/** Every UTC hour [start, end] touches, as datetimeHour strings. */
export function hoursOf(start, end) {
  const out = [];
  for (let t = Math.floor(Date.parse(start) / HOUR) * HOUR; t <= Date.parse(end); t += HOUR) out.push(new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z'));
  return out;
}

/** Made-up visits of one UTC hour, the same whichever window asks: quiet KST nights, a daytime bump. */
export function hourVisits(datetimeHour) {
  const t = Date.parse(datetimeHour) / HOUR;
  const kstHour = (new Date(datetimeHour).getUTCHours() + 9) % 24;
  return kstHour < 7 ? t % 3 : 2 + ((t * 7) % 9) + (kstHour >= 9 && kstHour <= 18 ? 4 : 0);
}

/** Hourly trend rows of a window (sampleInterval 1, or `si` for a sampled look). */
export const trendRows = (start, end, si = 1) =>
  hoursOf(start, end).map((h) => {
    const v = hourVisits(h);
    return g('datetimeHour', h, v + Math.floor(v / 2), v, si);
  });

export const TOPS = {
  pages: [
    g('requestPath', '/', 40, 25),
    g('requestPath', '/photo-compress/', 22, 14),
    g('requestPath', '/guide/pdf-merge/', 12, 9),
    g('requestPath', '/guide/photo-sizes/', 8, 6),
    g('requestPath', '/guide/', 6, 5),
    g('requestPath', '/guide/no-such-guide/', 3, 3),
    g('requestPath', `/very/long/${'x'.repeat(120)}`, 1, 1),
  ],
  referrers: [
    g('refererHost', '', 30, 26),
    g('refererHost', 'search.example.kr', 14, 12),
    g('refererHost', 'docttak.com', 50, 9),
    g('refererHost', 'www.docttak.com', 4, 2),
    g('refererHost', 'blog.example.com', 6, 5),
  ],
  pagesByVisits: [
    g('requestPath', '/', 40, 25),
    g('requestPath', '/photo-compress/', 22, 14),
    g('requestPath', '/guide/pdf-merge/', 12, 9),
    g('requestPath', '/guide/photo-sizes/', 8, 6),
    g('requestPath', '/guide/', 6, 5),
    g('requestPath', '/guide/no-such-guide/', 3, 3),
    g('requestPath', `/very/long/${'x'.repeat(120)}`, 1, 1),
  ],
  countriesKo: [g('countryName', 'KR', 60, 40), g('countryName', 'JP', 5, 4), g('countryName', 'ZZ', 2, 2), g('countryName', '', 1, 1)],
  countriesEn: [g('countryName', 'US', 9, 6), g('countryName', 'KR', 2, 1)],
  devices: [g('deviceType', 'mobile', 50, 30), g('deviceType', 'desktop', 30, 20), g('deviceType', 'tablet', 3, 2), g('deviceType', 'smarttv', 1, 1)],
};

/** The countryPaths fallback rows (country × path) that split into TOPS.countriesKo and TOPS.countriesEn. */
export const COUNTRY_PATHS = [
  { avg: { sampleInterval: 1 }, count: 50, dimensions: { countryName: 'KR', requestPath: '/' }, sum: { visits: 30 } },
  { avg: { sampleInterval: 1 }, count: 10, dimensions: { countryName: 'KR', requestPath: '/photo-compress/' }, sum: { visits: 10 } },
  { avg: { sampleInterval: 1 }, count: 5, dimensions: { countryName: 'JP', requestPath: '/guide/' }, sum: { visits: 4 } },
  { avg: { sampleInterval: 1 }, count: 2, dimensions: { countryName: 'ZZ', requestPath: '/' }, sum: { visits: 2 } },
  { avg: { sampleInterval: 1 }, count: 1, dimensions: { countryName: '', requestPath: '/' }, sum: { visits: 1 } },
  { avg: { sampleInterval: 1 }, count: 9, dimensions: { countryName: 'US', requestPath: '/en/' }, sum: { visits: 6 } },
  { avg: { sampleInterval: 1 }, count: 2, dimensions: { countryName: 'KR', requestPath: '/en/pdf-merge/' }, sum: { visits: 1 } },
];

/** What Cloudflare says when an input field does not exist (the REQ1014-A like / notlike fallback trigger). */
export const RUM_LIKE_REFUSED = { data: null, errors: [{ message: 'unknown field "requestPath_notlike" in AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject', path: ['viewer'] }] };

/**
 * The answer to one request: the total node (by default the sum of the window's trend; `total` overrides it with
 * { count, visits } to model a sampled hourly node), plus for a current-period query its trend and top tables.
 * `likeRefused`: a split query gets RUM_LIKE_REFUSED; the fallback query gets COUNTRY_PATHS.
 * @param {unknown} requestBody
 * @param {{ tops?: Record<string, unknown[]>, si?: number, total?: { count: number, visits: number } | null, likeRefused?: boolean }} [opts]
 */
export function rumAnswer(requestBody, { tops = TOPS, si = 1, total = null, likeRefused = false } = {}) {
  const w = windowOf(requestBody);
  if (likeRefused && w.split) return RUM_LIKE_REFUSED;
  const trend = trendRows(w.start, w.end, si);
  const node = { total: totalOf(trend, si, total) };
  if (!w.full) return rumBody(node);
  const { countriesKo, countriesEn, ...rest } = tops;
  return rumBody({ ...node, trend, ...rest, ...(w.paths ? { countryPaths: COUNTRY_PATHS } : { countriesKo, countriesEn }) });
}

export const RUM_EMPTY = rumBody({ total: [], trend: [], pages: [], pagesByVisits: [], referrers: [], countriesKo: [], countriesEn: [], countryPaths: [], devices: [] });

/** HTTP 200 with errors[] (a wrong field, a range past retention): the message holds markup to prove escaping. */
export const RUM_ERRORS = { data: null, errors: [{ message: 'cannot request data older than 31d <b>"x"</b>', path: ['viewer'] }] };

const XSS_TEXT = '<script>alert(1)</script>';
const XSS_IMG = '"><img src=x onerror=alert(1)>';
/** Markup and quotes in every free-text dimension. */
export const XSS_TOPS = {
  pages: [g('requestPath', XSS_TEXT, 5, 3), g('requestPath', `/${XSS_IMG}/`, 2, 2)],
  pagesByVisits: [g('requestPath', XSS_TEXT, 5, 3)],
  referrers: [g('refererHost', XSS_IMG, 4, 4), g('refererHost', XSS_TEXT, 1, 1)],
  countriesKo: [g('countryName', XSS_TEXT, 1, 1)],
  countriesEn: [g('countryName', XSS_IMG, 1, 1)],
  devices: [g('deviceType', `'${XSS_IMG}`, 3, 3)],
};
