# Review Request — Ops automation (REVENUE-MODEL §3: A-1~A-6, M-3)
Date: 2026-10-01
Ready for Review: YES
Status: DONE

## Files Changed
- .github/workflows/ops-post-deploy.yml — A-1 (wait for build-id, smoke:assets, live Playwright smoke, ops:deploy issue open/close) and A-2 (IndexNow diff with actions/cache state).
- .github/workflows/ops-health.yml, ops-source-watch.yml, ops-weekly.yml — A-4 daily, A-3 weekly, A-5/A-6/M-3 weekly (report commit `[skip ci]`, contents: write).
- scripts/ops/*.mjs — one CLI per job, all with `--dry-run`; scripts/ops/lib/*.mjs — fetch/retry, GitHub issues, HTML/sitemap/quote parsers, guide+preset readers, GSC JWT client, Cloudflare GraphQL, report + R1 logic.
- tests/live/tools.spec.ts, playwright.live.config.ts — live smoke of the 5 tools.
- tests/unit/ops.test.ts — 41 tests: parsers, quote matching, JWT signature, R1 streak, opportunities, GitHub upsert/close, wait/indexnow/growth/monetize runs (mocked fetch).
- docs/OPS-RUNBOOK.md — jobs, secrets, GSC service account and CF token setup, dry runs, issue handling.
- .gitignore — test-results-live/, playwright-report-live/, .ops-state/.

## Open Questions
- A-4 TTFB limit 2 s and A-6 thresholds (50 impressions / 2 % CTR; 10 impressions uncovered) are first guesses; constants are named in the runbook §7.
- Report push to main vs future branch protection (runbook §2).

## Out of Scope (logged in BUILD-LOG)
- Cloudflare Email Obfuscation injection on /licenses/ (owner dashboard toggle).
