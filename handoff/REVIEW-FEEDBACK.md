# Review Feedback — ADMIN-VISITS
Date: 2026-10-08
Ready for Builder: YES (round 1 — estimation deferred)

Note: the orchestrator is changing the estimation approach (count / sum.visits are already extrapolated; new plan is <=7-day chunking with no sampleInterval multiplication). estimateGroups, the per-bucket sampling math, TREND_LIMIT / single-request behaviour, totals and the related tests are NOT cleared here and will be re-reviewed in round 2. Everything else below stands.

## Must Fix
None.

## Should Fix
- scripts/lib/visits.mjs:133-144 (confidence: 6/10) — `signal: AbortSignal.timeout(timeoutMs)` also covers the body read; if the timeout fires during `res.json()`, the catch sets `body = null` and the user sees "응답 형식이 올바르지 않음" (or "HTTP n") instead of "시간 초과". Verify this: catch the body-read error, and if its name is TimeoutError/AbortError throw the same `VisitsApiError(0, '시간 초과 …')`. Cheap; otherwise log to BUILD-LOG.
- scripts/lib/admin-view.mjs:194 (confidence: 5/10) — `delta(ratio, prevRatio, days)` uses kind 'count', so the ratio card shows a percent change of a ratio (e.g. "▲ +20%") rather than a change in "회". Readable but easy to misread next to the "약 N.N회" value. Decision #8 is Bob's addition beyond the brief; harmless, but consider showing the absolute change ("+0.4회") or dropping the delta. Not blocking.

## Escalate to Architect
- Open question carried from Bob: AE_API_TOKEN read access to RUM, `avg { sampleInterval }` inside dimension groups, and `limit: 2200` are unverified live. Failure is contained (visits notice only, escaped, token scrubbed), but the post-deploy check on 1/7/30/90 must actually be run before calling the numbers trustworthy.

## Cleared
Reviewed, excluding the estimation math: visits.mjs (two constant queries, values only as variables, siteTag regex-gated, token only in the Authorization header and scrubbed from messages, 8 s timeout, non-200 / errors[] / bad JSON / missing nodes / cut-off trend all throw, 160-char cut), admin-chart.mjs (role="img" + title/desc, every label escaped, CSS-var colours, no external refs, table fallback), admin-view visits block (all cells escaped, "방문"/"페이지뷰 (추정)" wording, no 방문자 / 사람 수), the Function (auth / 301 / 404 / CSP / headers unchanged; allSettled with independent notices), usage.mjs GUIDE_TITLES + VALUE_LABELS with drift and preset-parity tests, growth.mjs visits line (non-failing note), and re-ran the four affected unit files: 206/206 pass.

---

# Review Feedback — ADMIN-VISITS round 2
Date: 2026-10-08
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- scripts/lib/visits.mjs:221-223 (confidence: 5/10) — 90 days = 13 requests in 4 waves (4/4/4/1) under one shared 8 s deadline, so each wave has ~2 s on average. A slow Cloudflare day turns the 90-day view into "시간 초과 (8초)". Not a bug — the failure is clean and bounded — but verify against live latency in the post-deploy check; if it times out, raise the deadline for multi-piece calls only, or log to BUILD-LOG.
- scripts/lib/admin-view.mjs:242 (confidence: 4/10, cosmetic) — the approximate-ranking note reuses `.ratio-note` (margin-top -12px) under the devices section; check the spacing in the visits-90 screenshot. Appendix-level.

## Escalate to Architect
- Unchanged from round 1 plus Bob's new open question: hour grain inside a 7-day window is assumed to come from the fine tier. The post-deploy check on 1/7/30/90 must compare against the Web Analytics dashboard before the numbers are trusted.

## Cleared
Chunking (visits.mjs:86-96): pieces of at most 7 days, oldest first, each ending 1 s before the next starts, exact cover of [start, end] with no overlap or gap; 7-day windows are one piece (weekly report = 1 request). pool (:189-206) keeps at most 4 in flight, stops new starts after the first failure, and Promise.all rejects on it, so any failing piece fails the whole call (no partial totals). One AbortSignal.timeout covers all pieces; body-read timeouts now map to "시간 초과" (round 1 Should Fix 1 done). readGroups uses count / sum.visits as returned, sampleInterval only sets `estimated`; mergeRows sums by key across disjoint windows, so the shared boundary hour adds up correctly. The trend-cap check runs per piece after shape validation; approxTops is set only for multi-piece periods. The previous period is skipped while it starts before RUM_START, and `compare: false` skips it for the weekly report. "(추정)" and the estimate sentence appear only when sampled; ratioDelta shows the change in 회 with one decimal (round 1 Should Fix 2 done). Queries are still constants with variables only, and escaping and the token scrub are unchanged. Re-ran the four affected unit files: 210/210 pass.
