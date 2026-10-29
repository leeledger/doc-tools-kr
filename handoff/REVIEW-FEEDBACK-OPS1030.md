# Review Feedback — OPS1030
Date: 2026-10-29
Ready for Builder: YES

## Must Fix
None.

## Should Fix
None.

## Escalate to Architect
None.

## Cleared
The NO_JSONLD_PATHS change (scripts/ops/lib/html.mjs:43-44) adds only the three pages the issue named. They are matched by exact pathname (`NO_JSONLD_PATHS.includes(new URL(pageUrl).pathname)`, line 58), so no prefix makes any other /en/* page exempt. The new test covers both cases: the three exempt pages pass, and /en/pdf-merge/ without JSON-LD still fails. The check is not weakened for any other page. vitest ops.test.ts passes 51/51.
