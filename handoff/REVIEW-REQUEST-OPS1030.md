# Review request — OPS1030 (orchestrator, 2026-10-29): A-4 health check false alarm

Trivial fix, no Arch brief (one-line allowlist + test). Issue #7 「사이트 건강 점검 실패: 3건」 has re-opened every day since 2026-10-24 for
「JSON-LD 없음」 on https://docttak.com/contact/, /en/privacy/ and /en/terms/. Live today: /privacy/, /terms/, /contact/, /en/privacy/, /en/terms/
all have 0 JSON-LD blocks; the A-4 rule already exempts /privacy/, /terms/, /licenses/ "by design" (legal pages). /contact/ (ADS1020) and the two
English legal pages are the same kind of page and were never added.

Decision: extend the exemption (keep these pages without JSON-LD) rather than add markup — same policy as the Korean legal pages; a
ContactPage/WebPage block on these brings no search feature. No threshold lowered: every other page still needs a parsing JSON-LD block.

Files:
- scripts/ops/lib/html.mjs:43-44 — NO_JSONLD_PATHS += '/contact/', '/en/privacy/', '/en/terms/' (+ comment).
- tests/unit/ops.test.ts:98-105 — new case: the three pages pass without JSON-LD; /en/pdf-merge/ without JSON-LD still fails.

Gates: npx vitest run tests/unit/ops.test.ts 51/51.
