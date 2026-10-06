# Review Feedback — Step USAGE
Date: 2026-10-06
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- functions/api/usage.ts:37-39 (confidence: 5/10, verify this) — `const len = lenHeader === null ? NaN : Number(lenHeader); if (!Number.isInteger(len) ...) return empty(413);` rejects any request without a Content-Length header. Chrome/Firefox/Safari send one for a string sendBeacon body, but confirm on the live deploy (HTTP/2 and HTTP/3 through the Cloudflare edge) that real beacons get 204 and not 413, before trusting zero counts. Add it to the Known Gaps live curl/browser checks; if it fails, fall back to reading the body and checking its byte length (validate already caps at 512).
- src/data/legal.ts:11 — `PRIVACY_USAGE = '2026년 10월 6일'` is a placeholder (Bob says so). Put "set PRIVACY_USAGE / PRIVACY_TERMS_UPDATED to the real flag-on date" in the OPS-RUNBOOK §8 owner steps, so the policy date matches the day the flag goes on.

## Escalate to Architect
- CLAUDE.md lines 13-14 were not edited (Bob escalated, proposed text in BUILD-LOG "USAGE build notes"). Arch to accept or reword.
- Open questions from Bob, my read (no code objection): `__USAGE_SAMPLE__` as a second define is fine (build-time constant, validated by check-dist, weight = round(1/share) carried per event). Event semantics (photo-compress success/fail per photo; hwp-to-pdf job = export, hwp-viewer job = open; stamp-signature first outcome per photo) are internally consistent: success and fail use the same unit per tool, so the success-rate column is honest; but 파일 고름 (per pick) and 성공 (per photo) are different units on photo-compress. Arch decides whether the table needs a footnote.

## Cleared
Reviewed the whitelist/validator, row schema and four SQL builders (scripts/lib/usage.mjs), the client tracker (src/lib/ui/usage.ts) and every tool's fail-code source (all typed enums or constants, nothing derived from file name, size or content), /api/usage guards in the brief's decision 9 order, the /admin Basic-auth Function (404 under 16 chars, SHA-256 constant-time compare, no-store/noindex/CSP/meta, SQL built only from PERIODS, a regex-checked dataset and constants, every row value escaped, no token in notices), SUM(_sample_interval * double1) counts, _routes.json, the SW bypass, the privacy-page gating and the check-dist off/on assertions. A default build ships no tracker, no sendBeacon and no /api/usage, and the privacy and admin requirements hold.
