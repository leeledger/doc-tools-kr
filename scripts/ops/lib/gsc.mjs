// Search Console API with a service account (A-5): an RS256 JWT signed with node:crypto, exchanged for an
// access token (OAuth 2.0 JWT bearer grant), then searchAnalytics.query. Read-only scope. The key comes from
// the GSC_SERVICE_ACCOUNT_JSON secret and is never written anywhere.
import { createSign } from 'node:crypto';

export const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const PROPERTY = 'sc-domain:docttak.com';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Parses the service account key JSON; throws with a readable message if a field is missing. */
export function parseServiceAccount(json) {
  let sa;
  try {
    sa = JSON.parse(json);
  } catch {
    throw new Error('GSC_SERVICE_ACCOUNT_JSON is not JSON (paste the whole key file).');
  }
  if (!sa.client_email || !sa.private_key) throw new Error('GSC_SERVICE_ACCOUNT_JSON has no client_email/private_key (it must be a service account key).');
  return { email: sa.client_email, key: sa.private_key, tokenUri: sa.token_uri || TOKEN_URI };
}

/** The signed assertion: header.claims.signature, valid for one hour from `nowSec`. */
export function signJwt({ email, key, tokenUri = TOKEN_URI }, nowSec = Math.floor(Date.now() / 1000), scope = SCOPE) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: email, scope, aud: tokenUri, iat: nowSec, exp: nowSec + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(key))}`;
}

export async function accessToken(sa, { fetchImpl = fetch, nowSec } = {}) {
  const res = await fetchImpl(sa.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signJwt(sa, nowSec) }).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`Google token: ${res.status} ${body.error ?? ''} ${body.error_description ?? ''}`.trim());
  return body.access_token;
}

/** A searchAnalytics.query client for one property. query({ startDate, endDate, dimensions, rowLimit }) → rows. */
export function gscClient(token, { property = PROPERTY, fetchImpl = fetch } = {}) {
  return async function query(body) {
    const res = await fetchImpl(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataState: 'final', ...body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Search Console: ${res.status} ${json.error?.message ?? ''}`.trim());
    return json.rows ?? [];
  };
}

const metrics = (r) => ({ clicks: r?.clicks ?? 0, impressions: r?.impressions ?? 0, ctr: r?.ctr ?? 0, position: r?.position ?? 0 });

/**
 * The growth numbers: totals for the last 7 and 28 days (ending `end`, Search Console data lags ~3 days), top
 * queries (28 days, up to 500 for A-6; 7 days, top 25) and top pages (28 days).
 */
export async function fetchGrowth(query, end) {
  const day = (n) => new Date(end.getTime() - n * 86_400_000).toISOString().slice(0, 10);
  const endDate = day(0);
  const r7 = { startDate: day(6), endDate };
  const r28 = { startDate: day(27), endDate };
  const [t7, t28, q28, q7, p28] = await Promise.all([
    query({ ...r7 }),
    query({ ...r28 }),
    query({ ...r28, dimensions: ['query'], rowLimit: 500 }),
    query({ ...r7, dimensions: ['query'], rowLimit: 25 }),
    query({ ...r28, dimensions: ['page'], rowLimit: 25 }),
  ]);
  const rows = (list) => list.map((r) => ({ key: r.keys[0], ...metrics(r) }));
  return {
    range7: r7,
    range28: r28,
    last7: metrics(t7[0]),
    last28: metrics(t28[0]),
    queries28: rows(q28),
    queries7: rows(q7),
    pages28: rows(p28),
  };
}
