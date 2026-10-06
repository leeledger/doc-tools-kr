# Review Request — Step USAGE (익명 사용 통계 + /admin/)
Date: 2026-10-06
Ready for Review: YES. Status **DONE_WITH_CONCERNS** (CLAUDE.md lines 13-14 not edited: escalated, text proposed in BUILD-LOG "USAGE build notes"). Not committed. Build notes, decisions, gates: BUILD-LOG "USAGE build notes".

## Files Changed
- `scripts/lib/usage.mjs` (new) — single-source whitelist, row schema doc, `validate`, buckets, flag/sample parsing, dataset check, the 4 SQL builders, `fetchUsage`, `shapeUsage`, `renderTables` (md + escaped HTML).
- `src/lib/ui/usage.ts` (new) — `createTracker` (sampled once, cap 40, field-by-field payload, try/catch sendBeacon), `arrival` (guide -> tool), `browserFamily` (moved); `track`/`startUsage` are no-ops and the tracker is dropped when `__USAGE_STATS__` is false.
- `functions/api/usage.ts` (new) — decision 9 guards (405/403 with Origin fallback/413/415/bot 204/400/503), one `writeDataPoint`, empty answers.
- `functions/admin/[[path]].ts` (new) — 404 without a 16+ char password, `/admin` 301, deeper 404, Basic auth with SHA-256 constant-time compare, whitelisted period, notices without secrets, headers/CSP/meta per decision 10.
- `src/tools/photo-compress/controller.ts`, `src/tools/pdf-compress/controller.ts`, `src/tools/pdf-merge/controller.ts`, `src/tools/id-photo/{controller,entry}.ts`, `src/tools/hwp-shared/{session,boot}.ts`, `src/tools/hwp-to-pdf/controller.ts`, `src/tools/hwp-viewer/app.ts`, `src/pages/hwp-{to-pdf,viewer}/index.astro:138/189`, `src/tools/stamp-signature/{photo,pad,entry}.ts`, `src/tools/remove-background/{bg,entry}.ts` — pick/start/success/fail/download/arrive wiring; every former `reportError` is now a `fail`; error paths carry a code (semantics per tool in BUILD-LOG).
- `astro.config.mjs:9-21,62-64,78`, `src/env.d.ts:1-4`, `vitest.config.ts:4-5`, `scripts/regress/idphoto.mjs:52` — `__USAGE_STATS__` / `__USAGE_SAMPLE__` replace `__ERROR_BEACON_PATH__`; usage modules join `ui-shared`.
- `src/lib/ui/beacon.ts`, `scripts/lib/beacon-path.mjs` — deleted.
- `scripts/check-dist.mjs:12,47-58,286-296` — retired-var error, sample error, contact rule for usage, flag off = no sendBeacon / `/api/usage` in any script, flag on = both present.
- `public/_routes.json` — include `/api/*`, `/admin`, `/admin/*`.
- `src/sw/sw.ts:11,50` — `/admin` and `/admin/*` bypass the SW like `/api/*`.
- `src/pages/privacy/index.astro`, `src/data/legal.ts:10-20`, `src/data/site.ts:47` — 익명 사용 통계 section (only when on), section-1 cookie line, `PRIVACY_USAGE`, `PRIVACY_REVISED` priority, 변경 이력, `PRIVACY_TERMS_UPDATED` 2026-10-06. Terms page had no beacon wording.
- `scripts/ops/growth.mjs:4-5,18,67-79,86-94,110`, `scripts/ops/lib/report.mjs:5,78,101-104,111`, `.github/workflows/ops-weekly.yml:6,42-43` — usage collect (skip note / error note + failed), report section, data-line totals, summary line, secrets.
- `.github/workflows/ci.yml:98-107`, `playwright.config.ts:24-29` — `PUBLIC_USAGE_STATS: '1'` on the dist-bgcloud build; usage.spec joins the cloud projects.
- `tests/unit/usage.test.ts` (new), `tests/e2e/usage.spec.ts` (new); updated `tests/unit/{postbuild,polish,network-guard,ops,bgcloud}.test.ts`, `tests/e2e/{remove-background.cloud,polish}.spec.ts`.
- `docs/COPY.md` (new section), `docs/OPS-RUNBOOK.md` (§2 rows, new §8 owner steps), `handoff/CLOUD-HANDOFF.md` §4.

## Verified
- astro check clean; unit 946/946; postbuild against the flag-on build 49/49; 4 builds check-dist OK; wrangler functions build OK.
- e2e: cloud-chromium 14/14; chromium + bg-chromium 226 passed (id-photo re-run on an auto-frame dist: 59 passed); usage.spec also green on the other 4 cloud browsers (WebKit skips the photo runs).

## Open Questions
- Event semantics are my call where the brief left room (BUILD-LOG): photo-compress success/fail per photo; hwp-to-pdf job = export, hwp-viewer job = open; stamp-signature first outcome per photo. Please check these read well in the success-rate column.
- `__USAGE_SAMPLE__` is a second define the brief did not name. Fine?
- Growth data line keeps only usage totals, not the tables.
- `PRIVACY_USAGE` = '2026년 10월 6일' is a placeholder for the real ship date.
- Playwright tuple form for the two-entry `allowUpload` in the cloud spec (comment in file).

## Out of Scope (logged in BUILD-LOG)
- CLAUDE.md lines 13-14 (escalated; proposed text logged).
- No /admin e2e (no Functions in the static server); live curl checks listed in Known Gaps.
