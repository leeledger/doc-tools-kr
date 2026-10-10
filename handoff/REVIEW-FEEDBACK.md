# Review Feedback — Step HWPX2HWP
Date: 2026-10-10
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- tests/unit/hwp-features.test.ts:66-70 (confidence: 6/10) — the only negative case is an empty self-closing manifest
  (`<odf:manifest .../>`). A plain HWPX whose manifest lists `<odf:file-entry ...>` parts without encryption is not
  covered, which is exactly the shape a non-rhwp writer would produce. The matcher (`ByteCounter(':encryption-data')`,
  `ByteCounter('<encryption-data')`, features.ts:246-247) looks correct, but pin it — add a manifest with two
  `file-entry` elements and no `encryption-data` and expect `null`. Two minutes.
- tests/e2e/polish.spec.ts:672 (confidence: 6/10) — `i <= items + 1` grants the extra tab stop to every project, not
  just Firefox. A future extra stop in Chromium/WebKit would now pass silently. Gate the `+ 1` on
  `browserName === 'firefox'`.

## Escalate to Architect
- 해요체 ERRORS lines (messages.ts:33-36) in a 합니다체 file, with the COPY.md exception — brief wording, Bob flagged
  it; a copy-style call, not code.
- Desktop 도구 menu now scrolls at 1280 × 720 (43 px). On the a11y question: Firefox's tab stop on a scrollable
  panel is UA behaviour that helps keyboard users scroll, the global `:focus-visible` outline (global.css:55)
  makes it visible, and it is not a WCAG failure. No product fix needed for a11y; a layout change (two columns,
  fewer rows) is a design decision for later.
- (confidence: 4/10, verify) 배포용 HWPX: if Hancom writes `encryption-data` in the manifest for distribution
  HWPX too, those files now say 비밀번호 instead of 손상 on all three HWP pages. Not worse than before, and the
  brief lists 배포용 HWPX as out of scope, but worth checking against a real 한글-made 배포용 HWPX when one turns up.

## Cleared
I reviewed and passed: the export/reload gate in export-hwp.ts (the order matches the brief and frees the source
on every path; it re-opens the exact shipped bytes, checks CFB magic and pages > 0 with an equal count, and an
unreadable loss report counts as 1, never 0), the worker message addition (an additive union with no second
wasm init; existing tools never send it, and the transfer only happens on a JS-owned buffer), password-HWPX
detection before the engine with regression e2e on /hwp-viewer/ and /hwp-to-pdf/, .hwp → already-hwp with
links and no worker, the controller run token/terminate/revoke paths, the application/x-hwp blob with a
`.hwpx`-only strip, the usage events (codes and phases only, no file data, whitelist and labels updated),
title 38 / description 62, HOME_DESC_ORDER after hwp-to-pdf, the check-dist laziness and budget block, and
font/budget numbers as reported.
