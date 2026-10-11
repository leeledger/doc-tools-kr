# Review Request — CHAIN-ADMIN (이어서 하기 사용 수 + X2 테스트 보강)
Date: 2026-10-11
Ready for Review: YES
Status: DONE

## Files Changed
- scripts/lib/usage.mjs:187-203: `usageSql` adds `chains` (blob2 AS tool, blob6 AS dest, blob1='next', LIMIT 500); JSDoc now says five queries.
- scripts/lib/usage.mjs:241-249: `fetchUsage` runs the 5th query in the same Promise.all and returns `chains`; JSDoc updated.
- scripts/lib/usage.mjs:395-399, 408: `shapeUsage` takes `chains = []`; the Known-Gap comment is replaced ("next is counted from the chains query").
- scripts/lib/usage.mjs:446-464: pair aggregation with the TOOLS whitelist on both ends, pair sort, perTool sent/received.
- scripts/lib/usage.mjs:476: `shaped.chains = { total, pairs, perTool }`.
- scripts/lib/usage.mjs:505-506: two appended tables (tables[5] pairs, tables[6] per-tool totals).
- scripts/lib/admin-view.mjs:88-93: `section()` takes an optional escaped `note` (muted kpi-note under the h2).
- scripts/lib/admin-view.mjs:161-163: `shapedSection` passes `note`; adds `CHAIN_NOTE`.
- scripts/lib/admin-view.mjs:330-340: destructures `[, , settings, guides, , chainPairs, chainTools]`; adds `s-chain` (with the note) and `s-chain-tools` after `s-via`.
- tests/fixtures/usage-rows.mjs:81-89, 119-125: FULL gets a chains sample (a duplicate pair, a tie, two dropped rows); XSS gets hostile chain tools; EMPTY gets `chains: []`.
- tests/unit/usage.test.ts:167-173: exact chains SQL.
- tests/unit/usage.test.ts:227-276: shapeUsage chains test (sum, sort and ties, whitelist drop incl. hostile names, perTool, tables[0..4] untouched, empty input gives 7 tables).
- tests/unit/usage.test.ts:353-370: weekly-report md inline snapshot gains the two tables (updated deliberately).
- tests/unit/usage.test.ts:382-384: fetchUsage mock 4 → 5 calls; checks r.chains and that the next query was sent.
- tests/unit/admin-view.test.ts:5, 120-121, 180-208: table count 5 → 7 (id regex allows `-`); new s-chain test (order after s-via, note, num columns, chain-only data is not the empty block, noindex, XSS dropped, empty section text); noFails 4 → 6.
- tests/unit/__snapshots__/admin-full-7.html:174-201: the two new sections.
- tests/e2e/chain.spec.ts:242-244: EXIF fixture + NEXT_LAZY_CHUNK pattern (`/_astro/next-steps-lazy.<hash>.js`, verified in dist).
- tests/e2e/chain.spec.ts:266-279: pdf-merge reset (`#merge-reset`) hides `#merge-next` with 0 buttons.
- tests/e2e/chain.spec.ts:357-406: pdf-password fast reset: held route, hit counter, release after `#pp-reset`, waits for the chunk response and module evaluation, then asserts `#pp-next` hidden with 0 buttons.
- tests/e2e/chain.spec.ts:468-490: photo-compress: two results show no group; deleting one shows 사진 PDF 변환 and the handover arrives.

## Test results
- vitest: 65 files, 1,383/1,383. astro check: 0 errors, 0 warnings.
- Default build: check-dist OK, core 605/38, precache 440.5/450.
- Cloud build (CI env vars): check-dist OK, precache 446.8/450.
- e2e chain.spec, chromium + mobile-chrome: 36 passed, 2 skipped (webkit-only test).
- pdf-password fast-reset, --repeat-each=3 on chromium + mobile-chrome: 6/6.
- e2e chain.spec, firefox + webkit (--workers=2): 34 passed, 4 skipped.
- Non-vacuous proof: with the `#pp-reset` click removed, the pdf-password test fails (group visible).

## Open Questions
- pdf-password test waits for "settled" by calling `import(chunkUrl)` in the page plus two rAFs after the response. It is shown to catch the regression; please check that the wait looks sound to you.
- The note is placed via an optional `note` arg on `section()` (brief let Bob decide).

## Out of Scope (logged in BUILD-LOG)
- At the default worker count, firefox/webkit failed 6 tests under load: 3 already existing and 3 that also passed at --workers=1/2. This looks like local load flakiness.
- ga.test GA-on build failed once before a fresh prebuild (stale public/ output).
