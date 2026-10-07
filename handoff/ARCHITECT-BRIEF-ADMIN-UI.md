# Architect Brief — ADMIN-UI (readable /admin/ usage page)

Owner request 2026-10-07. Worktree C:/dev/doc-tools/c2 (branch c2-cloud). Read before building:
`functions/admin/[[path]].ts`, `scripts/lib/usage.mjs` (lines 283-end), `tests/unit/usage.test.ts` (161-250, 453-550),
`scripts/ops/lib/report.mjs:102`.

## Goal
/admin/ shows a pleasant, phone-friendly dashboard (KPI cards with change vs previous period, segmented period tabs,
per-tool table with volume bars and labelled success rates, Korean labels, friendly empty states, KST "기준 시각",
sampling note, dark mode), still pure server HTML + inline CSS, while the weekly report's markdown stays byte-identical.

## Flow
```
GET /admin/?days=N
  ADMIN_PASSWORD <16 ──> 404          path checks ──> 301/404        bad Basic ──> 401 (unchanged)
  days = period(url)  (PERIODS only, else 7)
  env missing / bad dataset ──> renderAdminPage({notice}) 200
  Promise.all:
    fetchUsage(4 queries, unchanged)  ── reject ──> renderAdminPage({notice:"HTTP n"}) 200
    days in COMPARE_PERIODS(1,7,30)? fetchPrevTotals(1 query) : null
         └─ reject ──> prev = null (page renders, deltas show "비교 없음")   [never fails the page]
  shaped = shapeUsage(rows)            (tables unchanged + new raw fields)
  renderAdminPage({days, shaped, prev, now, sample})  -> HTML (scripts/lib/admin-view.mjs)

Weekly report: fetchUsage -> shapeUsage -> renderTables(md)   (no change, no extra query)
```

## Decisions (locked)
1. **Report keeps markdown.** `renderTables` (md and html branches), `shaped.tables`, `shaped.totals`, `usageSql`,
   `fetchUsage`, `EMPTY_TABLE` keep their exact output. The admin page stops calling `renderTables`; it uses a new
   renderer. Report labels for fail codes = Known Gap (not this step).
2. **New module `scripts/lib/admin-view.mjs`** (plain ESM, no deps, imports from `./usage.mjs` with the `.mjs`
   extension) exporting `renderAdminPage(opts)` and small pure helpers (`formatKst`, `delta`, `rateLevel`, `barPct`).
   The Function keeps auth/headers/period/fetch only. Pure .mjs so the Node preview script and vitest import it.
3. **shapeUsage additive fields only:** `kpi: { start, success, fail, rate, arrive }` (arrive = sum of `events` rows with
   event `arrive` and a whitelisted tool; numbers, not strings) and `tools: [{ tool, label, pick, start, success, fail,
   download, guide:{success,fail}, direct:{success,fail} }]` (raw numbers, TOOLS order) and `failRows: [{ tool, toolLabel,
   code, codeLabel, phaseLabel, n }]`. `totals` unchanged (it is embedded in the report's growth-data JSON).
4. **Previous-period comparison = exactly one extra query, only for 1/7/30 days** (`COMPARE_PERIODS = [1, 7, 30]`).
   90 days: no query, KPI shows "비교 없음 (기록은 3개월만 남아요)" because the previous 90 days are past retention.
   New `usagePrevSql(dataset, days)` in usage.mjs, same guards as `usageSql` (DATASET_RE, COMPARE_PERIODS) ->
   `SELECT blob1 AS kind, ${N} AS n FROM ${dataset} WHERE timestamp > NOW() - INTERVAL '${2*days}' DAY AND timestamp <= NOW() - INTERVAL '${days}' DAY GROUP BY blob1 FORMAT JSON`.
   Alias `kind` (not `event`) so test stubs can tell it apart. No `IN (...)` filter (unverified on AE SQL; ≤6 rows anyway).
   `fetchPrevTotals({accountId, token, dataset, days, fetch})` -> `{start, success, fail, arrive}` numbers, ignoring
   unknown kinds. Refactor first: extract the existing inner `run` of fetchUsage into a module helper both use
   (behaviour-identical; separate commit-able step). Budget: 5 reads per page view instead of 4.
5. **Deltas:** counts -> `+12%` / `-8%` / `0%` vs previous; previous 0 and current >0 -> "새로 생김"; both 0 -> "변화 없음";
   rate -> percentage points `+3%p`. Arrow text ▲/▼ plus visually-hidden words ("지난 7일보다 12% 늘었어요"). Neutral
   colour (no good/bad judgement on deltas). Label: "직전 N일 대비".
6. **KPI cards (5):** 처리 시작, 성공, 성공률, 실패, 안내 글에서 넘어옴. `<section aria-label="요약">` with `<dl>`
   per card (dt label, dd value, delta line). Grid: 5 across desktop, 2 across at ≤600px, 성공률 card may span.
7. **Period tabs:** `<nav aria-label="기간">` with 4 links `?days=N`, labels exactly
   `1일`, `7일`, `30일`, `90일`; the current one `aria-current="page"`, filled brand background; others outlined.
   Min touch target 44px height.
8. **Per-tool table** columns: 도구 | 처리 시작 (number + bar) | 성공 | 실패 | 성공률 | 파일 고름 | 내려받음.
   Bar: `<span class="bar" aria-hidden="true" style="width:NN%">`, NN = integer 0-100 = round(start / max start * 100)
   (max 0 -> 0); computed from numbers only, never from row text. Sorted by 처리 시작 desc, then TOOLS order.
   Success rate: level from success/(success+fail): ≥95 `good` "좋음", 80-94 `warn` "주의", <80 `bad` "낮음",
   success+fail < 20 -> `few` grey "표본 적음" (still shows %), no attempts -> "-". Rendered as a pill containing a
   shape glyph + % + word (●/▲/■ etc.) so it is never colour alone. Wide tables in
   `<div class="scroll" role="region" aria-label="<title>" tabindex="0">` (horizontal scroll on 360px, first column sticky).
9. **Other sections** (same order as today): 실패 이유 (도구 | 이유 = Korean label + `<code>` raw code underneath | 단계 |
   횟수), 많이 쓴 설정 (from shaped table), 안내 글에서 도구로 (shaped table), 안내에서 온 경우 vs 바로 온 경우 성공률 (from
   `tools`, with the same rate pill). Every table: `<caption>` or `aria-labelledby` its h2, `th scope="col"`, numbers
   right-aligned tabular-nums.
10. **Fail-code labels:** new `FAIL_LABELS` in usage.mjs (the single whitelist file). Bob enumerates the codes actually
    sent: grep `track({ e: 'fail'` / `usageFail(` / `fail(` call sites and their code unions under `src/tools`,
    `src/lib` (seen so far: engine, unknown, corrupt, empty, not-image, not-pdf, animated, dims, oom, timeout,
    too-large, truncated, unsupported, verify, zip, encode, noimage, already-encrypted, not-encrypted, plus any
    wrong-password code). Plain Korean, e.g. engine "기능을 불러오지 못함", oom "메모리 부족". Unknown codes show the raw
    code only (escaped). A unit test asserts every code literal found in a fixed list in the test has a label.
11. **Empty states:** no events at all in the period -> one friendly block replacing KPI+tables: "이 기간에는 아직 기록이
    없어요" + "도구를 쓰면 몇 분 뒤에 여기에 나타나요." + links to the longer periods (only those > current). Per-section
    empty -> "이 기간에는 기록이 없어요." (muted, inside the section). Error notice keeps the exact text
    `통계를 불러오지 못했어요 (...)` with `role="status"`, rendered inside the new shell (header + tabs still shown).
12. **Header/footer:** h1 "문서딱 사용 통계"; subline "지난 N일 · YYYY-MM-DD HH:mm 기준 (한국 시간)" from injected `now`
    (Function passes `new Date()`; format with `Intl.DateTimeFormat('ko-KR'/'en-CA', {timeZone:'Asia/Seoul'})` parts,
    not locale strings, so output is deterministic). Footer keeps `기록은 3개월 동안만 남아요.` and adds the sampling
    note: "숫자는 추정치예요. 방문이 많으면 일부만 세고 비율로 보정해요. 기록은 몇 분 늦게 들어올 수 있어요." If
    `env.PUBLIC_USAGE_SAMPLE` parses via `usageSample` to < 1, add "지금은 방문의 NN%만 기록해요." (try/catch; bad value ->
    no sentence).
13. **Style:** one inline `<style>`; CSS variables; brand `#0f766e`; `@media (prefers-color-scheme: dark)` overrides
    (dark brand ~#5eead4 on ~#0b1210 surface). `color-scheme: light dark`. All text ≥4.5:1 contrast in both themes
    (good/warn/bad text colours chosen for that, e.g. #0f766e/#b45309/#b91c1c light, #5eead4/#fbbf24/#f87171 dark).
    System font stack only. No external URL anywhere in the page (test: no `http` in `src=`/`href=`/`url(`).
14. **Unchanged:** HEADERS object and CSP string, REALM, MIN_PASSWORD, 301/404 rules, period(), constant-time compare.
    Inline width attributes (style="width:NN%") are allowed by the existing CSP (style-src unsafe-inline).

## Build Order
0. Before-shots first (no behaviour change). Add tests/fixtures/usage-rows.mjs exporting FULL rows (6+ tools, rates
   hitting good/warn/bad/few, fails incl. an unknown code, settings, guides with dl 0/1, arrive events), PREV rows for
   the kind query, XSS rows (script tag / img payload in code, guide, setting value, tool). Add
   scripts/qa/admin-preview.mjs and npm script "qa:admin": "node --experimental-strip-types scripts/qa/admin-preview.mjs".
   The script imports onRequest from functions/admin/[[path]].ts, stubs globalThis.fetch to answer by alias
   (AS kind / AS event / AS code / AS setting / else guides) with fixture rows, runs scenarios full-7, full-90, empty,
   error (status 500), xss, and writes OUT/LABEL/SCENARIO.html. With --shots it opens each in Playwright chromium
   (already a dep) and saves PNGs at 1280x900 light, 360x780 light, 360x780 dark (colorScheme), and prints
   documentElement.scrollWidth for the 360 shots. Args: --label before|after (default after), --out (default
   os.tmpdir()/docttak-admin-preview). Run once now with --label before --shots (Node is v22.15).
   Flag: if strip-types cannot load the .ts file, stop and report the verbatim error. Do not rewrite the Function to JS.
   Also add now a markdown regression test: inline snapshot of renderTables(shapeUsage(FULL), 'md', 3) and of
   shapeUsage(FULL).totals (locks the weekly report before any change).
1. Refactor usage.mjs: extract the SQL run helper out of fetchUsage (output identical; existing tests green).
2. usage.mjs: COMPARE_PERIODS, usagePrevSql, fetchPrevTotals, FAIL_LABELS, shapeUsage kpi / tools / failRows.
3. scripts/lib/admin-view.mjs: renderAdminPage({ days, shaped, prev, now, sampleShare, notice }) per Decisions 5-13.
   Escape every string with escapeHtml at the point of output.
4. Function: replace page()/html()/notice() with the renderer; Promise.all of fetchUsage and (only for
   COMPARE_PERIODS) fetchPrevTotals(...).catch(() => null); pass now: new Date() and sampleShare.
5. Run npm run qa:admin -- --label after --shots; report the preview folder path for the owner.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| prev query | AE 429/500 on the 5th read | catch -> null; test | page OK, "비교 없음" |
| main queries | AE error / network | existing notice; test | "통계를 불러오지 못했어요 (HTTP n)" |
| 90-day compare | previous window past retention -> fake -100% | no query for 90; test | "비교 없음 (기록은 3개월만 남아요)" |
| prev 0 | Infinity% | delta words; test | "새로 생김" / "변화 없음" |
| unknown fail code / tool | raw text injected | escaped, label falls back to raw; test | raw code |
| bar width | NaN / negative / huge | int clamp 0-100 from numbers; test | bar or none |
| timezone on Workers | wrong hour | formatToParts Asia/Seoul, injected now; fixed-instant test | correct KST |
| bad PUBLIC_USAGE_SAMPLE | throw breaks page | try/catch -> omit sentence; test | no sentence |
| report | md drift from refactor | step-0 snapshot | n/a |
No silent critical gap remains.

## Test map (new tests/unit/admin-view.test.ts + updates in tests/unit/usage.test.ts)
- md report + totals unchanged for FULL — [GAP] step-0 snapshot
- usagePrevSql exact SQL for 1/7/30; throws for 90 and bad dataset — [GAP]
- fetchPrevTotals maps kinds, ignores unknown, error -> UsageApiError — [GAP]
- shapeUsage kpi / tools / failRows numbers and labels; tables unchanged — [GAP]
- each fail code listed in the test has a FAIL_LABELS entry; unknown -> raw — [GAP]
- structure: lang="ko", one h1, 5 KPI cards, 4 period links, exactly one aria-current="page" on the selected period
  (for each of 1/7/30/90), th scope="col", caption or aria-labelledby per table, no "<script", no external URL — [GAP]
- deltas: up, down, zero, prev 0, both 0, rate in %p, prev null -> 비교 없음, screen-reader sentence present — [GAP]
- rate levels at 95/94/80/79, few under 20 attempts, "-" with none; every pill has a word — [GAP]
- bar width int clamp; max 0 -> 0 — [GAP]
- escaping at renderer level with XSS fixture — [GAP] (Function-level test at usage.test.ts:540 [TESTED], keep)
- empty: all-empty -> friendly block with only longer-period links; one empty section -> section message — [GAP]
- error notice text inside new shell with tabs — [TESTED] usage.test.ts:524, keep green
- formatKst(2026-10-07T05:03:00Z) -> "2026-10-07 14:03" — [GAP]
- sample sentence: 0.25 -> 25%; 1 / unset / bad -> none — [GAP]
- full-page HTML file snapshot for FULL at 7 days with fixed now — [GAP]
- Function period test updated: bodies = usageSql values + usagePrevSql for 1/7/30; usageSql only for 90; invalid -> 7 — [TESTED] update
- Function: prev query 500 while main 200 -> 200 and 비교 없음 — [GAP]
- Function: headers, CSP, auth, 404, 301, no script — [TESTED] keep unchanged
- The sqlApi stub in usage.test.ts must check "AS kind" before "AS event".

## Out of Scope (-> BUILD-LOG Known Gaps if raised)
- Weekly report HTML or Korean fail-code labels in the md report.
- Time-series charts (more queries), CSV export, client JS, caching AE results in KV.
- Any change to the beacon, payload, whitelist values or /api/usage.

## Acceptance
- npx vitest run tests/unit/usage.test.ts tests/unit/admin-view.test.ts tests/unit/ops.test.ts green; full unit suite
  green; npx astro check 0 errors.
- Step-0 md report snapshot unchanged at the end.
- Before/after PNGs (1280 light, 360 light, 360 dark) for full-7, full-90, empty, error, xss in the preview dir; at
  360 px scrollWidth <= 360 (tables scroll inside their own region).
- After deploy (Arch with owner): /admin/ 200 with the password, /admin/x 404, period tabs switch, deltas show.
