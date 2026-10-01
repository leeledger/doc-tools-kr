// Cloudflare zone analytics over GraphQL (A-5): requests, cached requests, bandwidth, page views and unique
// visitors per day (httpRequests1dGroups, available on the Free plan). Server-side numbers only: nothing runs on
// the site. Token: CF_API_TOKEN with Zone → Analytics → Read (plus Zone → Zone → Read when CF_ZONE_ID is not set,
// to look the zone up by name).
const API = 'https://api.cloudflare.com/client/v4';

export async function zoneId(token, name, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${API}/zones?name=${encodeURIComponent(name)}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  const id = body.result?.[0]?.id;
  if (!res.ok || !id) throw new Error(`Cloudflare zone lookup for ${name}: ${res.status} ${(body.errors ?? []).map((e) => e.message).join('; ')} — set CF_ZONE_ID or give the token Zone Read.`.trim());
  return id;
}

export const QUERY = `query Growth($zone: String!, $since: Date!, $until: Date!) {
  viewer {
    zones(filter: { zoneTag: $zone }) {
      httpRequests1dGroups(limit: 40, orderBy: [date_ASC], filter: { date_geq: $since, date_leq: $until }) {
        dimensions { date }
        sum { requests cachedRequests bytes cachedBytes pageViews }
        uniq { uniques }
      }
    }
  }
}`;

/** Sums the daily groups whose date is in [since, until]. */
export function sumDays(groups, since, until) {
  const out = { requests: 0, cachedRequests: 0, bytes: 0, cachedBytes: 0, pageViews: 0, uniques: 0, days: 0 };
  for (const g of groups) {
    const d = g.dimensions.date;
    if (d < since || d > until) continue;
    out.days++;
    for (const k of ['requests', 'cachedRequests', 'bytes', 'cachedBytes', 'pageViews']) out[k] += g.sum[k] ?? 0;
    out.uniques += g.uniq?.uniques ?? 0;
  }
  return out;
}

/** Totals for the 7 and 28 days ending `until` (YYYY-MM-DD, normally yesterday in UTC). */
export async function fetchTraffic(token, zone, until, { fetchImpl = fetch } = {}) {
  const day = (n) => new Date(Date.parse(`${until}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const since = day(27);
  const res = await fetchImpl(`${API}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { zone, since, until } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors?.length) throw new Error(`Cloudflare GraphQL: ${res.status} ${(body.errors ?? []).map((e) => e.message).join('; ')}`.trim());
  const groups = body.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
  return { until, last7: sumDays(groups, day(6), until), last28: sumDays(groups, since, until) };
}
