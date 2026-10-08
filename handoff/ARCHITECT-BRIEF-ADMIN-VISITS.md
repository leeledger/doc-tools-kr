# Architect Brief — ADMIN-VISITS (2026-10-08)

## Goal
/admin/ shows, for the selected period (1/7/30/90일), how many visits the site got (Cloudflare Web Analytics,
cookieless), page views, a trend chart (server-side SVG), top pages / referrers / countries / devices, and an
approximate "방문 100회당 처리 시작" ratio. A visits failure never breaks the page. Folded in: guide titles instead
of slugs, Korean labels for every preset id. Weekly report gets one visits line.

## Query shape (verified in Step 0, 2026-10-08; sources: handoff/rum-dashboard-capture.json, rum-probe-query.js, rum-probe-response.json)
- Endpoint: POST https://api.cloudflare.com/client/v4/graphql (Bearer AE_API_TOKEN). The dashboard path /api/v4/graphql is NOT ours.
- viewer { accounts(filter:{accountTag:$accountTag}) { <alias>: rumPageloadEventsAdaptiveGroups(filter:$filter, limit:$n, orderBy:[...]) { count sum { visits } dimensions { ... } } } }
- Filter (type AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject):
  {AND:[{datetime_geq:$start, datetime_leq:$end},{bot:0},{siteTag_in:[$siteTag]}]}. datetime_leq is inclusive:
  split windows end at next start minus 1 second (no double count). datetime_lt is NOT verified; do not use.
- siteTag = c188626389c143ae9567e09d59f3bfb2 (SITE_TAG). Never the beacon token 34842a72...
- Metrics: count = page views, sum{visits} = visits. avg{sampleInterval} exists; not shown (optional debug only).
- Dimensions verified: date, datetimeHour, datetimeFifteenMinutes, requestPath, refererHost ("" = direct),
  countryName (ISO2, e.g. KR/US), deviceType (seen: desktop, mobile). orderBy verified: date_ASC, count_DESC,
  sum_visits_DESC. Aliases verified (one request: total/trend/pages/refs/countries/devices).
- Trend uses datetimeHour (KST bucketing, below). Order trend by datetimeHour_ASC is NOT verified: request without
  orderBy or sort client-side; Bob must not invent orderBy names.
- Real totals for sanity (2026-10-07T00Z to 10-08T06Z): 72 visits, 112 page views; KR 45, US 25; direct 48,
  m.blog.naver.com 11, blog.naver.com 10, search.naver.com 2, google 1.

## Still unverified (keep the visible failure path)
- Whether AE_API_TOKEN (user token, Account Analytics:Read) can read RUM via the public API. 403 -> visits notice
  "HTTP 403"; owner decides on token permission then (agreed by owner).
- Max time window per query (dashboard used 1 day): RUM_MAX_WINDOW_DAYS = 7 as the safe default, constant in one
  place; the post-deploy live check on 30/90 tells whether to raise it. Retention: docs say adaptive datasets keep
  "at least 31 days"; a 90일 failure shows the notice with the CF message.
- Limit "300 GraphQL queries over 5-minute window" per user (documented): 90일 = 13 current windows (no prev) =
  13 requests per page view; fine for one owner. Run windows sequentially-limited (max 4 in flight).

## Fixtures
- Bob builds tests/fixtures/rum-rows.mjs from the exact shape of handoff/rum-probe-response.json (keys, nesting,
  types, alias names) with fake numbers, paths and hosts. Do not copy real numbers into tests.

## Flow
```
GET /admin/?days=N            (auth / 404 / 301 / headers unchanged)
  |
  +-- Promise.allSettled([ usage: fetchUsage + fetchPrevTotals (unchanged SQL),
  |                        visits: fetchVisits({accountId, token, siteTag, days, now}) ])
  |
  +-- visits ok  -> shapeVisits -> 방문 block (KPI, SVG trend + table, 4 tables, ratio)
  |   visits err -> 방문 notice "방문 통계를 불러오지 못했어요 (...)"; rest of page normal
  +-- usage ok   -> existing usage sections
  |   usage err  -> existing notice, now scoped to the usage block only
  +-- render (same CSP; GraphQL host is a server-side fetch only)

fetchVisits:
  windows = [now-days, now) (+ [now-2days, now-days) if days in COMPARE_PERIODS), each split by RUM_MAX_WINDOW_DAYS
  -> per window ONE POST, aliases: total, trend(datetimeHour), pages, referrers, countries, devices
  -> merge by key (sum)
  -> filter {AND:[{datetime_geq,datetime_leq},{bot:0},{siteTag_in:[siteTag]}]}
  -> VisitsApiError on HTTP != 200, errors[], bad JSON / missing nodes, network, 8 s AbortSignal timeout
```

## Build Order
1. Before-shots: npm run qa:admin -- --label before --shots; list paths in REVIEW-REQUEST.
2. scripts/lib/visits.mjs (new; no fs, usable by the Function and ops):
   - SITE_TAG = "c188626389c143ae9567e09d59f3bfb2", RUM_START = "2026-10-07", RUM_MAX_WINDOW_DAYS = 7, TOP_N = 10, GRAPHQL_URL as above.
   - siteTagOf(env.RUM_SITE_TAG): /^[0-9a-f]{32}$/ -> it; empty/undefined -> SITE_TAG; else null.
   - visitsQuery(): one constant query string. accountTag, siteTag, datetimes, limits are GraphQL variables.
     Nothing from the request is interpolated. days must be in PERIODS (throw).
   - windows(days, now): rolling, same as usage.mjs NOW() - INTERVAL.
   - fetchVisits({accountId, token, siteTag, days, now, fetch}) -> { cur, prev | null } merged raw groups.
     VisitsApiError(status, message): message = first errors[].message cut to 160 chars; never the token.
   - shapeVisits(raw, days, now) -> { totals:{visits,pageViews}, prevTotals|null, prevBeforeStart, trend:[{label,
     visits,pageViews}], pages, referrers, countries, devices }:
     - trend: 1일 -> 24 hourly buckets (KST hour labels); 7/30/90 -> one bucket per KST calendar day from UTC
       datetimeHour + 9 h. Missing buckets = 0.
     - pages: TOOL_LABELS for tool paths, guide title (step 5) for /guide/<slug>/, "홈" for /, else the path; path
       cut to 80 chars. Keep the path as a second column.
     - referrers: drop docttak.com and subdomains; empty host -> "직접 방문·알 수 없음".
     - countries: Intl.DisplayNames(["ko"],{type:"region"}) in try/catch, fallback ISO code; empty -> "알 수 없음".
     - devices: desktop/mobile/tablet -> 컴퓨터/휴대폰/태블릿, else raw.
     - prev window starting before RUM_START -> prevTotals null, prevBeforeStart true.
3. scripts/lib/admin-chart.mjs (new): trendSvg(trend, {title, desc}). Inline svg role="img" aria-labelledby with
   title and desc elements (desc: total, busiest bucket and its value). One series (visits) as columns, viewBox
   scaling, no fixed px width (360 px scrollWidth must stay <= 360), y-max label, x labels first/middle/last only,
   colours via currentColor / existing CSS vars (dark mode). All text through esc. No script, no external refs, no
   data in style attributes. All-zero trend -> no SVG, text "이 기간에는 방문 기록이 없어요." Always followed by
   details/summary "표로 보기" with a table (기간 | 방문 | 페이지뷰). Read the dataviz skill first.
4. scripts/lib/admin-view.mjs: renderAdminPage gains visits and visitsNotice. The usage notice now replaces only
   the usage block. Order: header/tabs -> 방문 block -> existing usage sections (unchanged).
   방문 block: h2 "방문"; note "쿠키 없이 센 방문 횟수예요. 같은 사람이 여러 번 오면 여러 번 셉니다. 자동
   프로그램(봇)은 대부분 빠져요. 방문 집계는 2026-10-07부터예요."; KPI cards 방문 / 페이지뷰 / 방문 100회당
   처리 시작 (약) with existing delta(); chart; tables 많이 본 페이지, 들어온 곳, 나라, 기기 (existing section()).
   Ratio = usage kpi.start / visits * 100, one decimal, shown "약 N회"; "-" when visits 0 or usage failed.
   Footnote: "처리 시작은 도구 사용 기록, 방문은 Cloudflare 집계라 서로 다른 방법으로 센 값이에요. 대략적인
   비교로만 보세요." Page title/h1 -> "문서딱 방문·사용 통계".
5. Guide titles: scripts/gen-guide-titles.mjs writes src/data/guide-titles.json ({slug: title}; published guides +
   hubs; sorted keys) using scripts/ops/lib/guides.mjs parsing (extend to hubs if needed). File committed. Unit test
   regenerates in memory and asserts equality (stale -> fails with "run node scripts/gen-guide-titles.mjs").
   shapeUsage guides table shows the title; unknown slug -> slug as is (escaped).
6. Preset labels: usage.mjs VALUE_LABELS covers every PRESETS id. Unit test: each PRESETS id found in
   src/data/id-photo-presets.ts (readPresets/parsePresets) has label === that preset label; custom = "직접 입력".
   id_card/driver_license strings change to the preset labels; the snapshot update is intended (say so).
7. functions/admin/[[path]].ts: Env += RUM_SITE_TAG?. allSettled per Flow. Missing CF_ACCOUNT_ID/AE_API_TOKEN ->
   both notices. siteTagOf null -> visits notice "RUM_SITE_TAG 형식이 올바르지 않음". Auth/CSP/headers untouched.
8. scripts/ops/growth.mjs: one line after the Cloudflare line: "- 방문 7일: N회, 페이지뷰 M (Web Analytics)" via
   fetchVisits days 7 totals; failure -> one note line, report still built. Nothing else in the report changes.
9. qa:admin: stubFetch routes by URL (/graphql -> RUM fixture, else SQL). Scenarios added: visits-7, visits-1
   (hourly), visits-90 (exercises the split if RUM_MAX_WINDOW_DAYS < 91), visits-error (HTTP 200 + errors[]),
   visits-empty, usage-error-visits-ok; xss extended with requestPath/refererHost/deviceType holding a script tag
   and quotes. Fixture tests/fixtures/rum-rows.mjs (see Fixtures). After-shots: --label after --shots.

## Flags (do not guess)
- A dataset/field/orderBy name not listed in Query shape -> stop, ask Arch.
- siteTag: only SITE_TAG (or a valid RUM_SITE_TAG). Never the beacon token.
- No client JS, no new CSP sources, no img/external refs. GraphQL fetch only from the Function / ops script.
- Existing usage SQL, auth, 404/301, headers: unchanged.
- Counts are visits, not people: no UI string says 방문자 or 사람 수 (test).

## Failure modes
| Path | Realistic failure | Handling | User sees | Test |
|---|---|---|---|---|
| GraphQL HTTP | 401/403 (token lacks RUM read), 429 | VisitsApiError | 방문 notice "HTTP 403"; usage normal | unit + qa |
| GraphQL 200 + errors[] | wrong field, range > maxDuration | VisitsApiError(message) | notice with CF message (escaped, <=160) | unit + qa |
| Network / hang | CF API slow | 8 s AbortSignal | notice; page renders | unit |
| Bad JSON / missing nodes | schema change | error, never zeros | notice | unit |
| Range past retention | 90일 > notOlderThan | 7-day windows; error path covers | notice, no crash | unit |
| Prev period before 2026-10-07 | meaningless delta | prevBeforeStart | "비교 없음 (집계 시작 전)" | unit |
| Hostile dimension values | markup in path/host/device | esc everywhere incl. SVG text | literal text | unit + qa xss |
| Usage SQL fails, RUM ok | AE outage | scoped notices | visits shown | unit + qa |
| Ratio | visits 0 / usage failed | "-" | "-" | unit |
| Guide map stale | new guide shipped | drift test | CI red | unit |
| Weekly report | RUM fails | note line | report still sent | ops.test |
No silent path: every error shows a notice.

## Test map
- visits.mjs: query has no interpolated values [GAP]; windows/split + merge [GAP]; KST bucketing across 15:00Z [GAP];
  empty groups [GAP]; HTTP / errors[] / bad JSON / network / timeout [GAP]; siteTagOf [GAP]; referrer self-host drop,
  country fallback, device labels [GAP]; prevBeforeStart [GAP].
- admin-chart: title/desc/aria, table fallback, all-zero -> no SVG, escaping [GAP].
- admin-view: visits x usage present/absent (4 combos) [GAP]; ratio [GAP]; no 방문자 string [GAP]. Existing
  admin-view / usage tests [TESTED] stay green (regression).
- Function: auth/404/301/headers [TESTED]; allSettled combos + bad RUM_SITE_TAG [GAP].
- Guide-title drift + shapeUsage titles [GAP]; preset labels == presets file [GAP].
- growth visits line + failure note [GAP].
- qa: 360 px scrollWidth <= 360 for every scenario.

## Out of Scope
Unique visitors, per-guide funnels, Core Web Vitals, browser/OS tables, client-side charts, caching GraphQL results,
a 180-day tab, a timeout for the usage SQL. Log in BUILD-LOG Known Gaps if they surface.

## Acceptance
- npm test, astro check, lint green; wrangler pages functions build functions compiles.
- npm run qa:admin -- --label after --shots: all scenarios, light/dark, 360 px ok; before/after paths in REVIEW-REQUEST.
- Post-deploy live check (orchestrator, owner Chrome): /admin/?days=1,7,30,90 visits roughly match the Web Analytics
  dashboard for the same range (rolling vs calendar differs slightly). If a notice shows, its CF message names the fix
  (token permission, field name, range).
