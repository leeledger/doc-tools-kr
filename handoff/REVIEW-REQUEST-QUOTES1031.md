# Review Request — QUOTES1031
Date: 2026-10-30
Ready for Review: YES
Status: DONE

## Files Changed
- scripts/ops/source-watch.mjs:5-6 — header notes the one 404 retry after 10 s.
- scripts/ops/source-watch.mjs:17 — `export const RETRY_404_MS = 10_000`.
- scripts/ops/source-watch.mjs:101-108 — `get()`: on status 404 log 「ERR 404 <url> retry」, wait RETRY_404_MS via `io.wait ?? sleep`, fetch once more, use that answer. Only 404.
- tests/unit/ops.test.ts:13 — import RETRY_404_MS.
- tests/unit/ops.test.ts:251-293 — 4 tests (a 404→200 passes after one 10 s wait; b 404→404 still one UNREACHABLE HTTP 404, exit 1; c 200 single fetch, no wait; d 403 single fetch, UNREACHABLE HTTP 403).
- src/content/guides/pdf-split.md:15-34 — Apple quote #1 replaced with the iOS 27 sentence (byte-exact, spaces before 을/이 and after 「(」 kept); 5 Apple `retrieved` -> '2026-10-30'.
- src/content/guides/pdf-split.md:115 — 쪽 빼기 step per brief (사이드바 보기 버튼; 안 보이면 PDF를 한 번 눌러요).

## Gate results
- npm run check: 0 errors, 0 warnings, 12 hints.
- npm test: 112 files, 2400 tests passed (2396 + 4 new).
- PUBLIC_SITE_URL=https://docttak.com npm run build: check-dist OK (2683 files); guide-length all ok.
- npm run check:quotes (live): `source-watch --exact: 17 problem(s) in 699 quotes` — NOT VERBATIM 0; UNREACHABLE 17, all https://www.jlpt.or.kr/html/information_01.html (fetch failed; D2 known outage). historyexam OK, pdf-split Apple verbatim.
- E2E_PORT=4273 playwright chromium pdf-split + site: 131 passed.

## Open Questions
- The jlpt.or.kr lines report 「fetch failed」 (not a 404 or redirect) from this machine, so D3 doesn't touch them; gate stays red only for those, as D2 intends.

## Out of Scope (logged in BUILD-LOG)
- JLPT keep-vs-drop recheck by 2026-11-13 (D2 Known Gap).
- Redirect-to-home not reported as its own reason.
