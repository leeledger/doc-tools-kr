# Architect Brief — Step USAGE: 익명 사용 통계 + /admin/

Author: Arch. Date: 2026-10-06. Branch: new `usage` from main (813128d), worktree C:/dev/doc-tools/c2.
Owner task (2026-10-06): tool behaviour events → same-origin beacon → Pages Function → Workers Analytics Engine (AE);
password-protected /admin/ tables via AE SQL API; same tables in the weekly growth report (A-5); privacy/COPY/runbook.
No cookies, no GA, no identifiers. Ships **flag off** (`PUBLIC_USAGE_STATS` unset) — production behaviour unchanged
until the owner finishes the Cloudflare setup (Build Order 9) and flips the flag.

## Goal
With `PUBLIC_USAGE_STATS=1` every tool sends whitelisted anonymous events to `/api/usage`, they land in AE, and the
owner reads per-tool usage / success rate / fail codes / top settings / guide→tool conversion at `/admin/` and in the
weekly report. With the flag off, dist/ contains no beacon code (as today).

## Verified facts (doc lines, fetched 2026-10-06)
- AE limits: "up to twenty blobs", "total size of all blobs … must not exceed 16 KB", "up to twenty doubles",
  "up to one index per call … 96 bytes", "maximum of 250 data points per Worker invocation", "stored for three months".
- AE pricing: "100,000 included per day" writes, "10,000 included per day" read queries; "you will not be billed … at present".
- Pages binding: Workers & Pages → project → Settings → Bindings → Add → Analytics engine → Variable name + Dataset → redeploy.
  Code: `context.env.X.writeDataPoint({ indexes, blobs, doubles })`.
- SQL API: `POST https://api.cloudflare.com/client/v4/accounts/<account_id>/analytics_engine/sql`, `Authorization: Bearer <token>`,
  permission *Account | Account Analytics | Read*; counts must use `SUM(_sample_interval)` not `COUNT()`.
- NOT verified (Bob must probe, not assume): (a) Pages Functions bundling a relative import from outside `functions/`
  (`../../scripts/lib/usage.mjs`) — check with `npx wrangler@latest pages functions build functions --outdir=<scratch>`;
  (b) Sec-Fetch-Site on sendBeacon in WebKit — the Origin fallback (decision 9) covers it either way.
- Quota note: Pages Functions requests count against the Workers Free 100k/day, **shared with /api/remove-bg**. Hence
  the sample knob (decision 2) and the per-page cap.

## Flow
```
tool controller ──track(ev)──> src/lib/ui/usage.ts
   (pick/start/success/fail/download; arrive once at load)
        | __USAGE_STATS__ false → noop, tree-shaken (no sendBeacon in dist)
        | sampled per page load (PUBLIC_USAGE_SAMPLE), cap 40 events/page
        v
 navigator.sendBeacon('/api/usage', JSON text ≤ 512 B)   [same origin, connect-src 'self']
        v
 functions/api/usage.ts : POST? → same-origin? → len ≤ 512? → bot UA? (204, drop) → validate (usage.mjs)
        | invalid → 400 (no write)      | no env.USAGE → 503
        v
 env.USAGE.writeDataPoint({indexes:[tool], blobs:[…12], doubles:[weight]})  → 204
        v
 AE dataset (3 months)
   ^                                   ^
   | SQL API (AE_API_TOKEN)            | SQL API (AE_API_TOKEN, GH secret)
 functions/admin/[[path]].ts          scripts/ops/growth.mjs → reports/growth/YYYY-WW.md
  Basic auth (ADMIN_PASSWORD) → 4 queries → server-rendered HTML tables
```

## Locked decisions
1. **One beacon, error beacon retired.** `src/lib/ui/beacon.ts`, `scripts/lib/beacon-path.mjs`, `__ERROR_BEACON_PATH__`,
   `PUBLIC_ERROR_BEACON_PATH` and the privacy "익명 오류 통계" section are removed. Every `reportError(...)` call site
   becomes `track({ e: "fail", ... })`. check-dist **fails** if `PUBLIC_ERROR_BEACON_PATH` is non-empty ("retired; use
   PUBLIC_USAGE_STATS=1") so a stale Cloudflare env var cannot silently do nothing.
2. **Flag:** `PUBLIC_USAGE_STATS` = `1` on, anything else off (parse in new `scripts/lib/usage.mjs`, `usageOn()`),
   passed to Vite as `define.__USAGE_STATS__` (astro.config.mjs; vitest.config.ts `false`; regress/idphoto.mjs `false`;
   src/env.d.ts). Endpoint is a **constant** `/api/usage` (no env path: the Function lives at a fixed path anyway).
   `PUBLIC_USAGE_SAMPLE` optional, number in [0.01, 1], default 1; invalid → check-dist error.
3. **Carry the existing contact rule over:** usage on without `PUBLIC_CONTACT_EMAIL` → check-dist error (the rule the
   error beacon had, check-dist.mjs:51). CLAUDE.md lines 13–14 updated to name the usage beacon as the second allowed POST.
4. **Single-source whitelist** in `scripts/lib/usage.mjs` (plain ESM + JSDoc, importable by node scripts, the Function,
   the client and tests; add `scripts/lib/usage.d.mts` only if `astro check` needs it). Contents: enums, `validate()`,
   `bucketKB()`/`bucketMB()`, SQL builders, row shaping, `renderTables()` (markdown + HTML share the shaped rows).
5. **Payload (client → server), JSON text, short keys, unknown key → 400:**
   - `e` event: `pick` `start` `success` `fail` `download` `arrive`
   - `t` tool: `pdf-merge` `pdf-compress` `photo-compress` `id-photo` `hwp-to-pdf` `hwp-viewer` `stamp-signature` `remove-background`
   - `c` fail code (fail only): regex `^[a-z-]{1,24}$`
   - `p` phase (fail only): `load` `parse` `process` `save`
   - `o`/`v` setting key/value (start only): `o` in `target-kb` `preset` `level` `target-mb` `mode`.
     `v` per key — KB bucket `le100` `le200` `le300` `le500` `le1000` `gt1000`; preset in `PRESET_IDS` or `custom`;
     level in pdf-compress level ids; MB bucket `le1` `le2` `le5` `le10` `gt10`; mode `cloud` `device`.
   - `g` guide slug (arrive only): regex `^[a-z0-9-]{1,60}$`
   - `dl` arrived with a valid deep-link param (arrive only): `0` `1`
   - `via` (every event): `guide` `direct`
   - `d` device: `mobile` `tablet` `desktop` (existing `detectDevice`)
   - `br` browser family + major (fail only): existing `browserFamily()` output, regex `^[a-z]{2,10}( [0-9]{1,4})?$`
   - `b` build id: regex `^([0-9a-f]{7,40}|dev)$`
   - `w` sample weight: integer 1–100
   Never: file name, size, page count, dimensions, content, URL query, referrer string, UA string, timestamps, ids.
6. **Settings are recorded once per run, on `start`** (the effective choice), not on every UI change. Exact numbers are
   bucketed client-side and re-validated server-side.
7. **Guide → tool:** at tool page load, if `document.referrer` is same-origin and its path is `/guide/<slug>/`, send one
   `arrive` (`g`, `dl`) and tag every event of this page load `via: guide`; else `via: direct`, no arrive. Conversion =
   success rate of `via=guide` vs `direct` per tool (no session join, no ids).
8. **AE row schema (fixed order; document it at the top of usage.mjs):** `indexes: [t]`; `blobs: [e, t, c, p, o, v, g, dl,
   via, d, br, b]` (missing → empty string); `doubles: [w]`. Dataset name from env `USAGE_DATASET`, default
   `docttak_usage`, validated `^[a-z0-9_]{1,64}$` before it enters SQL. Binding name `USAGE`.
9. **Abuse floor (minimal by design):** POST only (405); `sec-fetch-site` must be `same-origin`, or, when that header is
   absent, `Origin` must equal the request origin (403); `content-length` integer 1–512 (413); content-type `text/plain`
   (sendBeacon string default) (415); UA matching `bot|crawl|spider|slurp|headless|lighthouse|preview|curl|wget|python`
   (case-insensitive) → 204 without writing; validation failure → 400 without writing; one data point per request;
   `writeDataPoint` wrapped in try/catch (still 204). No IP, no `request.cf` fields, no logging, empty bodies, headers as
   remove-bg (`no-store`, `nosniff`, `X-Robots-Tag: noindex`). An optional WAF rate-limit rule is an owner doc step, not code.
10. **Admin = Pages Function, server-rendered, no client JS:** `functions/admin/[[path]].ts`. `/admin` → 301 `/admin/`;
    anything deeper → 404. `ADMIN_PASSWORD` unset or shorter than 16 chars → **404** (page does not exist). Basic auth,
    user `admin`, compare SHA-256 digests in constant time; wrong → 401 + `WWW-Authenticate: Basic realm="docttak-admin", charset="UTF-8"`.
    Cloudflare Access is documented as an optional extra layer, not required. Period `?days=` in {1,7,30,90}, else 7.
    Response headers: `Cache-Control: no-store, private`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`,
    CSP `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`;
    `<meta name="robots" content="noindex,nofollow">`. Missing `CF_ACCOUNT_ID`/`AE_API_TOKEN` or an SQL API error → page
    renders with a plain Korean notice ("통계를 불러오지 못했어요" + HTTP status, never the token), status 200 so the owner
    sees it. All SQL is built from constants + whitelisted period + validated dataset; no request text enters SQL. Every
    value from AE rows is HTML-escaped.
11. **Admin tables (Korean, plain words):** (a) 도구별: 파일 고름, 처리 시작, 성공, 실패, 성공률 (성공 / (성공+실패); 분모 0이면 "-"), 내려받음;
    (b) 실패 이유: 도구, 오류 코드, 단계, 횟수 (top 20); (c) 많이 쓴 설정: 도구, 설정, 값, 횟수 (top 5 per tool);
    (d) 안내 글에서 도구로: 안내 글, 도구, 넘어옴, 딥링크 비율; plus 도구별 성공률 (안내에서 온 경우 vs 바로 온 경우).
    All counts `SUM(_sample_interval * double1)`. Period links 1일/7일/30일/90일. Footer: "기록은 3개월 동안만 남아요."
    Bucket values shown in Korean (`le500` → "500KB 이하").
12. **Routing / SW:** `public/_routes.json` include `["/api/*", "/admin", "/admin/*"]`. dist/ has no /admin page, so
    sitemap/llms.txt/precache exclude it by construction — add assertions (test map). No robots.txt change (a Disallow
    line would advertise the path; 401 + noindex suffice). Check `src/sw.ts`: navigations to `/admin/` and any `/api/`
    request must go to the network untouched (no cache, no offline-page swap). Fix if not.
13. **Secrets/tokens:** one new read-only API token (Account Analytics Read) stored as Pages secret `AE_API_TOKEN` and
    GitHub secret `AE_API_TOKEN`; `CF_ACCOUNT_ID` in both. The existing GH `CF_API_TOKEN` is untouched.
14. **Growth report:** `collect()` adds `usage` (7 days) when `AE_API_TOKEN` and `CF_ACCOUNT_ID` exist, else a skip note
    like the others; API error → note + `failed`. `renderReport` adds section "도구 사용 (지난 7일)" with tables (a)-(d)
    from `renderTables()`; growth-data JSON gains `usage` (nullable); `parseReportData` must still read old reports.
    `summaryBody` gets one line: total successes and overall success rate. `ops-weekly.yml` passes the two secrets.
15. **Privacy text** (only when usage on; replaces the 익명 오류 통계 section; numbering via the existing `n()`). Draft, owner confirms at the deploy gate:
    > **익명 사용 통계** — 어떤 도구가 많이 쓰이고 어디서 막히는지 알기 위해, 도구를 쓸 때 일어난 일만 이 사이트로 보내 합계로만 봐요.
    > 보내는 것: 도구 이름, 한 일(파일 고르기, 처리 시작, 성공, 실패와 오류 종류, 내려받기), 고른 설정(목표 크기 구간, 증명사진 규격,
    > 압축 단계처럼 정해진 값), 안내 글에서 넘어왔는지, 기기 종류(휴대폰, 태블릿, PC), 실패했을 때 쓰는 앱 종류와 버전, 사이트 버전.
    > 보내지 않는 것: 파일 이름, 크기, 내용, IP 주소, 쿠키, 나를 알아볼 수 있는 값. 기록은 Cloudflare의 통계 저장소에 3개월 동안 남은 뒤 지워져요.
    Section 1 sentence: when ANALYTICS_ON or USAGE_ON → "쿠키도 쓰지 않아요." New `PRIVACY_USAGE` (ship date, KST, "2026년 10월 N일")
    in legal.ts; `PRIVACY_REVISED` priority USAGE, then ANALYTICS, CLOUD, V1; 변경 이력 line "익명 사용 통계를 더함".
    Bump `PRIVACY_TERMS_UPDATED`. Terms page: grep for 오류 통계/beacon wording and align.

## Build Order
1. **Refactor first, no behaviour change:** create `scripts/lib/usage.mjs` (enums, validate, buckets, schema doc) + unit
   tests. Commit.
2. Client `src/lib/ui/usage.ts`: `track(ev)` noop when `!__USAGE_STATS__`; sample decided once per page load; cap 40;
   payload built field by field (never spread); via/arrive logic (decision 7) as a pure function of `(referrer, origin,
   pathname, deepParamValid)`; send via `navigator.sendBeacon(path, string)` inside try/catch. Move `browserFamily` here
   from beacon.ts. Delete beacon.ts and beacon-path.mjs; update astro.config.mjs, env.d.ts, vitest.config.ts,
   regress/idphoto.mjs, polish.test.ts, network-guard.test.ts (sendBeacon allowed only in usage.ts).
3. Wire tools. In each of the 8 controllers hook (a) file chosen → `pick`; (b) job start → `start` (+ `o`/`v` where the
   tool has a whitelisted setting: photo-compress target-kb, id-photo preset, pdf-compress level or target-mb,
   remove-background mode); (c) success; (d) the single place each controller shows an error → `fail` with its existing
   code + phase (user-caused errors included); (e) download click → `download`. `arrive` once at tool entry.
   Flag: if a tool has no natural event for a slot (e.g. hwp-viewer download), skip it and list it in BUILD-LOG.
4. `functions/api/usage.ts` (decision 9) importing validate from usage.mjs. Probe the bundling question (Verified facts (a))
   and record the result. If bundling outside `functions/` fails, move usage.mjs to `functions/_lib/usage.mjs` and import
   from there everywhere — record the decision.
5. `functions/admin/[[path]].ts` (decisions 10, 11) + SQL builders/renderers in usage.mjs.
6. `public/_routes.json`, SW pass-through (decision 12), check-dist rules (decisions 1-3, plus "flag on → dist JS
   contains `/api/usage` and sendBeacon; flag off → neither").
7. Growth report (decision 14) + workflow env.
8. Privacy/terms/legal (decision 15); `docs/COPY.md` new section "익명 사용 통계 (오너 2026-10-06)"; `docs/OPS-RUNBOOK.md`
   (secrets table rows `AE_API_TOKEN`, `CF_ACCOUNT_ID`; new section "익명 사용 통계와 관리자 페이지 켜기" = step 9 below);
   `handoff/CLOUD-HANDOFF.md` section 4 (Functions now: remove-bg + usage + admin share the 100k/day; the "no Functions"
   line is stale); CLAUDE.md lines 13-14.
9. **Owner setup steps (write into OPS-RUNBOOK in plain Korean, numbered):**
   1) Cloudflare → Workers & Pages → project `doc-tools-kr` → Settings → Bindings → Add → Analytics engine:
      Variable name `USAGE`, Dataset `docttak_usage` (Production). The dataset appears on first write.
   2) My Profile → API Tokens → Create Custom Token: Account → Account Analytics → Read, this account only. Copy it.
   3) Pages → Settings → Variables and Secrets (Production): secret `AE_API_TOKEN`; text `CF_ACCOUNT_ID` (account home,
      Account ID); secret `ADMIN_PASSWORD` (16+ random chars, keep it in a password manager); text `PUBLIC_USAGE_STATS=1`
      (optional `PUBLIC_USAGE_SAMPLE`); `PUBLIC_CONTACT_EMAIL` must be set; confirm `PUBLIC_ERROR_BEACON_PATH` is absent.
   4) GitHub → Settings → Secrets → Actions: `AE_API_TOKEN`, `CF_ACCOUNT_ID`.
   5) Retry deployment. Check: `/admin/` asks for a password (user `admin`); after using one tool, rows show within a few minutes.
   6) Optional: Security → WAF → Rate limiting rule on `/api/usage` (e.g. 60 requests / 10 s per IP → block); optional
      Cloudflare Access application on `docttak.com/admin*`.
   To turn off: remove `PUBLIC_USAGE_STATS` and redeploy (beacon code leaves dist/); stored data expires within 3 months.
10. Gates per CLOUD-HANDOFF section 3 (default build + flag-on build), plus the CI change below.

### CI change
- `ci.yml` e2e job: add `PUBLIC_USAGE_STATS: '1'` to the existing **dist-bgcloud** build (it already carries
  `PUBLIC_CONTACT_EMAIL`); no new build. New `tests/e2e/usage.spec.ts` joins the `CLOUD_SPEC` projects.
  `remove-background.cloud.spec.ts` allowlist gains `{ method: 'POST', path: '/api/usage' }`.
- The default (flag-off) e2e keeps the strict no-upload guard unchanged: that is the "off sends nothing" regression test.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| Client send | sendBeacon throws / returns false / blocked by an extension | try/catch, ignore | nothing; tool unaffected (intended) |
| Client privacy | a later edit spreads an object with a file name into the payload | field-by-field builder; server rejects unknown keys; e2e asserts no fixture name/size in bodies | CI fails |
| Function | binding not set (owner skipped setup step 1) | 503, no write; runbook check line | owner: empty admin tables; users: nothing |
| Function | bot / scripted junk posts | origin + size + strict enum validation → 400/204, no write; optional WAF | nothing |
| Function | Workers Free 100k/day exceeded (shared with remove-bg) | `PUBLIC_USAGE_SAMPLE` lowers volume, weights keep totals right; runbook explains | remove-bg could fail: documented, owner watches weekly report |
| Function | AE write quota exceeded / writeDataPoint throws | try/catch, still 204 | nothing |
| Admin | ADMIN_PASSWORD unset or weak | unset or < 16 chars → 404 | owner: 404, runbook says why |
| Admin | SQL API 4xx/5xx, token expired | Korean notice with status, no token echo | owner: clear notice |
| Admin | SW serves a cached/offline page for /admin/ | SW pass-through + unit test | - |
| Admin | stored value with HTML in AE row | server validation + HTML escape on render | - |
| Report | GH secrets missing | skip note, report still written | owner: note in report |
| Build | stale `PUBLIC_ERROR_BEACON_PATH` | check-dist error naming the replacement | build fails loudly |
| Build | usage on without contact email / bad sample value | check-dist error | build fails loudly |
No critical gaps: every path has handling plus a test or a loud failure.

## Test map
Unit (vitest):
- usage.mjs validate: each key accepted/rejected value; unknown key; non-object; > 512 B; `c`/`p`/`br` only on fail,
  `o`/`v` only on start, `g`/`dl` only on arrive (else 400); bucket edges (100, 100.1, 1000, 1001 KB; 1, 1.1, 10, 10.1 MB). [GAP → new]
- usage.ts: off → noop, no navigator access; on → only whitelisted keys; cap 40; sampling decided once per load (rate 0.5
  with stubbed random → all or nothing, `w`=2); via/arrive cases (same-origin guide, cross-origin URL with /guide/ path,
  `/guide/` index without slug, tool-to-tool, empty referrer). [GAP → new]
- functions/api/usage.ts: 405; 403 cross-site; Origin fallback accept + reject; 413 (0, 513, missing); 415; bot UA → 204
  no write; invalid → 400 no write; no binding → 503; valid → writeDataPoint once with exact indexes/blobs/doubles order and
  nothing from `cf`/headers; writeDataPoint throwing → 204. [GAP → new]
- functions/admin: unset / 15-char password → 404; no auth / wrong → 401 + WWW-Authenticate; right → 200 with noindex meta
  + header, no-store, CSP; `/admin` → 301; `/admin/x` → 404; `days=abc` / `days=365` → 7; missing account/token → notice;
  SQL API 500 → notice without the token; fetch mock asserts the SQL body uses only the whitelisted interval and dataset;
  `<script>` in a mocked row is escaped. [GAP → new]
- SQL builders snapshot (4 queries); row shaping incl. zero denominators and Korean bucket labels. [GAP → new]
- growth.mjs: skip note without secrets; tables with a mocked SQL response; an old report without `usage` still parses (regression). [ops.test.ts exists → extend]
- postbuild/check-dist: `PUBLIC_ERROR_BEACON_PATH` set → fails; usage on without email → fails; bad sample → fails; flag off
  → no sendBeacon and no `/api/usage` in JS; flag on → both present. Replaces postbuild.test.ts:481-485. [TESTED → rewrite]
- network-guard: sendBeacon only in src/lib/ui/usage.ts. [TESTED → update]
- sitemap / llms.txt / precache list contain no `/admin` and no `/api/`. [GAP → new]
- privacy render: on → section, date, section-1 sentence; off → same as today (regression). [GAP → new]
- SW: `/admin/` navigation and `/api/*` are never cached or served from cache. [GAP → new]
E2E (`usage.spec.ts`, cloud projects, dist-bgcloud with usage on; `page.route('**/api/usage')` captures and fulfils 204):
- photo-compress happy path → pick, start (`o=target-kb`, bucketed `v`), success, download, in order; every body parses,
  keys within the whitelist, contains neither the fixture file name nor its byte size; method POST; content-type text/plain. [GAP → new]
- pdf-compress with a non-PDF → `fail` with code `not-pdf`. [GAP → new]
- guide → tool: open a published guide, click its deep link → `arrive` with `g=<slug>`, `dl=1`; later events `via=guide`.
  Direct open → no arrive, `via=direct`. [GAP → new]
- Flag-off default e2e: the existing no-upload guard on every spec (no POST at all). [TESTED — regression, must stay green]
Admin has no e2e (the static e2e server runs no Functions): covered by unit tests + live check below.
Live after deploy (flag still off): `curl -i -X POST https://docttak.com/api/usage` → 403; `/admin/` → 404 (no password
yet). After owner setup: 401 without credentials, 200 with.

## Out of Scope
- Page-view counting (Web Analytics covers it), sessions/funnels with ids, retention cohorts, per-guide click maps.
- File-count, size or page-count buckets (owner: no size information).
- Charts on /admin/ (tables only), CSV export, setting up Cloudflare Access itself.
- A Worker-side rate limiter (the WAF rule is the documented option).
- Turning the flag on in production (owner, after setup step 9).

## Acceptance
- Default build: check-dist OK, no sendBeacon in dist, all gates of CLOUD-HANDOFF section 3 green, /privacy/ unchanged.
- Flag-on build (with contact email): check-dist OK; usage.spec.ts green on the cloud projects; full unit suite green incl.
  all new tests; `astro check` clean; wrangler functions build of `functions/` succeeds (result recorded in BUILD-LOG).
- OPS-RUNBOOK has the setup steps; COPY.md, CLAUDE.md, CLOUD-HANDOFF updated; BUILD-LOG "USAGE build notes" lists files,
  decisions taken under "never stop", skipped event slots, and Known Gaps.
