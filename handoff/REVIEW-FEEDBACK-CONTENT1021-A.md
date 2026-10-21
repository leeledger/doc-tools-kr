# Review Feedback — CONTENT1021 Step A
Date: 2026-10-21
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/data/guide-facts.ts:99 (confidence: 8) — `UNIT` now has `원|세` with `\s*` allowed before it and no Hangul lookahead after it: `…|개월|원|세|M(?![A-Za-z\d]))(?![A-Za-z])`. "가로 600 세로 800" yields the fact "600 세", "200 원본" yields "200 원", "3세대" yields "3 세". It fails loud (build error), never silent, so nothing ships wrong, but B1/B2 writers will hit confusing errors and may drop numbers to get past them. Fix: `원(?![가-힣])|세(?![가-힣])`, plus a unit case ("가로 600 세로 800" → no 세 fact; "만 17세 이상" still flagged).
- scripts/lib/guide-check.mjs svgProblems (confidence: 6) — the href rule only matches quoted values (`href\s*=\s*["']([^"']*)["']`); an unquoted `href=javascript:…` or `<set attributeName="href" to="…">`/`<animate … href>` passes. Low risk (own files; served as <img>; site CSP blocks inline script on direct open), but D5.4 is a safety gate. Recommend: also fail on `\shref\s*=\s*[^"'#\s]` and on `<(set|animate)\b[^>]*attributeName=["'](?:xlink:)?href`.
- tests/unit/guide-check.test.ts / scripts/lib/plain-words.mjs (confidence: 7) — the plain-words gate reads HTML pages only; SVG text (svgText) is user-visible copy but is never run through JARGON. Today's 12 SVGs are clean (I read every text node), but B1/B2 add ~80 more. Add one repo-level unit assertion: `JARGON` finds nothing in `svgText()` of every public/img/guide/**/*.svg.
- tests/unit/guides-schema.test.ts:516-517 (confidence: 6) — `updated` assertion loosened from `toBe('2026-10-14')` to `>= '2026-10-14'` for every slug in that list, though only pdf-merge needed to move. Narrow it: exact '2026-10-14' for the others, '2026-10-21' for pdf-merge.
- src/content/guides/passport-reissue-photo.md (body, 「온라인 신청 순서」 step 5) (confidence: 5, verify) — "진행 상황은 문자 안내나 정부24 조회로 확인해요" has no quote among the 28 sources. Not a number, but D6 wants issuer process stated from the issuer. Source it (menuPos=11) or cut the sentence.

## Escalate to Architect
- Bob's open question 1: D5.3 "never before the first H2" and D5.4 `role="img"` + `<title>` are enforced though they come from D9 prose, not the D5 list. I recommend keeping both (LCP and accessibility); Arch to confirm.
- Bob's open question 2: the 13 one-line hub links ("…[증명사진 규격 모음](/guide/photo-sizes/)…") are each worded differently, under 60 code points (no D5.5 risk) and plain. Fine for Step A; B1 rewrites those pages anyway.

## Cleared
Reviewed the full Step A diff: guide-length metric/CLI/LENGTH_PENDING (bars 2,500/2,000 unchanged, unit-asserted; balanced cutter correct), guide-check.mjs D5.1–D5.6 and its check-dist wiring (expected lists from content, 22 tool slugs matched, stale-pending and passing-pending both fail), hub sources + fact check, 원/세 units, the 8 `_redirects` 301 lines (both spellings, all targets exist, old .md files deleted, no remaining reference in src/scripts/tests/docs/public), the 5 pilot pages and 2 image-only pages (no 업로드/서버/브라우저/네트워크/EXIF/dpi in rendered copy or SVG text; "업로드"/"300DPI" appear only inside unrendered source quotes; every new number backed by a preset, toolFacts or a verbatim quote with a 2026-10-21 excerpt under handoff/sources/content1021/), 12 SVGs (opaque bg, role/title, no script/foreignObject/image/external href, ≤3.3 KB) and 2 own-tool WebP screenshots (no people, ≤14 KB). No threshold lowered.
