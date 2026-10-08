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

/** The window of a request body: { start, end } from variables.filter.AND[0]; full = the query has the top tables. */
export function windowOf(requestBody) {
  const b = JSON.parse(String(requestBody));
  const range = b.variables.filter.AND[0];
  return { start: range.datetime_geq, end: range.datetime_leq, full: String(b.query).includes('pages:') };
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
  countries: [g('countryName', 'KR', 60, 40), g('countryName', 'JP', 5, 4), g('countryName', 'ZZ', 2, 2), g('countryName', '', 1, 1)],
  devices: [g('deviceType', 'mobile', 50, 30), g('deviceType', 'desktop', 30, 20), g('deviceType', 'tablet', 3, 2), g('deviceType', 'smarttv', 1, 1)],
};

/** The answer to one request: its window's trend, plus the top tables for a "full" query. */
export function rumAnswer(requestBody, { tops = TOPS, si = 1 } = {}) {
  const w = windowOf(requestBody);
  return rumBody({ trend: trendRows(w.start, w.end, si), ...(w.full ? tops : {}) });
}

export const RUM_EMPTY = rumBody({ trend: [], pages: [], referrers: [], countries: [], devices: [] });

/** HTTP 200 with errors[] (a wrong field, a range past retention): the message holds markup to prove escaping. */
export const RUM_ERRORS = { data: null, errors: [{ message: 'cannot request data older than 31d <b>"x"</b>', path: ['viewer'] }] };

const XSS_TEXT = '<script>alert(1)</script>';
const XSS_IMG = '"><img src=x onerror=alert(1)>';
/** Markup and quotes in every free-text dimension. */
export const XSS_TOPS = {
  pages: [g('requestPath', XSS_TEXT, 5, 3), g('requestPath', `/${XSS_IMG}/`, 2, 2)],
  referrers: [g('refererHost', XSS_IMG, 4, 4), g('refererHost', XSS_TEXT, 1, 1)],
  countries: [g('countryName', XSS_TEXT, 1, 1)],
  devices: [g('deviceType', `'${XSS_IMG}`, 3, 3)],
};
