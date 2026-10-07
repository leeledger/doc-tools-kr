# Review Request — ADMIN-UI (readable /admin/ usage page)
Date: 2026-10-07
Ready for Review: YES. Status **DONE** locally (not committed, not pushed). Brief: handoff/ARCHITECT-BRIEF-ADMIN-UI.md.

## Files Changed
- tests/fixtures/usage-rows.mjs (new) — FULL / PREV / XSS / EMPTY rows (6 tools hitting good/warn/bad/few/none, unknown fail code, string `n`, ignored rows).
- scripts/qa/admin-preview.mjs (new) + package.json `qa:admin` — renders the real Function offline from fixtures (fetch stub by alias, `AS kind` first) for full-7/full-90/empty/error/xss; `--shots` saves 1280 light / 360 light / 360 dark PNGs and prints 360 px scrollWidth. strip-types loaded the .ts Function without problems.
- tests/unit/usage.test.ts:233-300 — step-0 inline snapshot of `renderTables(shapeUsage(FULL),'md',3)` and `totals` (written before any usage.mjs change; unchanged at the end).
- scripts/lib/usage.mjs:36 COMPARE_PERIODS; :185-196 usagePrevSql (same guards as usageSql); :203-232 `runSql` extracted from fetchUsage (behaviour-identical, separate step); :234-245 fetchPrevTotals; :262-305 FAIL_LABELS; shapeUsage :398-407 additive `kpi` / `tools` / `failRows` (`totals`, `tables` untouched).
- scripts/lib/admin-view.mjs (new) — renderAdminPage + formatKst / sampleShareOf / delta / rateLevel / barPct; inline CSS with light/dark variables.
- functions/admin/[[path]].ts — page()/html()/notice() replaced by renderAdminPage; Promise.all(fetchUsage, COMPARE_PERIODS ? fetchPrevTotals().catch(() => null) : null); `PUBLIC_USAGE_SAMPLE` added to Env. HEADERS/CSP/REALM/MIN_PASSWORD/301/404/period()/constant-time compare unchanged.
- tests/unit/admin-view.test.ts (new, 21 tests) + tests/unit/__snapshots__/admin-full-7.html (file snapshot, fixed now).
- tests/unit/usage.test.ts Function block — sqlApi stub answers `AS kind` before `AS event` (with its own status); period test expects usagePrevSql for 1/7/30 only; new: prev 500 -> 200 + 비교 없음; 90 days -> no kind query + retention note; bad/0.25 PUBLIC_USAGE_SAMPLE.

## Gates
- `npx vitest run`: 52 files, 1119/1119 passed (a first full run had 1 flaky failure in bgremove.test.ts "licences ..." at 2.5 s under load; passed alone with and without my changes, and the full rerun was clean).
- `npx astro check`: 0 errors, 0 warnings, 1 hint.
- Default build: check-dist OK (2392 files), precache 416.8 / 450 KB. Cloud build (CI dist-bgcloud env, USAGE on): check-dist OK (2411 files), 422.6 / 450 KB.
- `npx wrangler@4.147.0 pages functions build functions`: "Compiled Worker successfully"; renderAdminPage and usagePrevSql present in the bundle.
- Preview: all 360 px shots scrollWidth = 360 (before: xss 444).

## Screenshots (before / after)
C:/Users/force/AppData/Local/Temp/claude/C--dev-doc-tools-kr/c205501f-e2a7-4258-9052-12a611236632/scratchpad/admin-shots/{before,after}/<scenario>-{desktop-light,phone-light,phone-dark}.png, scenarios full-7, full-90, empty, error, xss (HTML next to them).

## Open Questions
- Screen-reader sentence wording: I used "직전 7일보다 12% 늘었어요" (matches the visible label "직전 N일 대비") instead of the brief's example "지난 7일보다…", which could read as the current period.
- Rate levels are judged on the rounded % shown (94.6 -> "95% 좋음"), so the pill word never disagrees with its number.
- Rate delta when the previous period had no attempts: "새로 생김"; current has none: "변화 없음".
- "직전 N일 대비" is one note under the KPI grid, not repeated in every card.
- The sample sentence reads `env.PUBLIC_USAGE_SAMPLE` at runtime: it shows only if that variable is also set as a Pages runtime variable (today it is a build variable only, so production shows no sentence — correct while the share is 1).
- FAIL_LABELS covers 39 codes found at the call sites (incl. not-hwp, password, distribution, heic, canvas, crash, mask, nosubject, unreachable, target-unreachable, network, model-corrupt, allpaper, noink, cloud-busy/quota/failed, too-big, too-many).

## Out of Scope (logged in BUILD-LOG)
- Korean fail-code labels in the weekly md report; weekly report HTML.
- renderTables' html branch is now unused by the admin page; kept per Decision 1 (exact output preserved).
