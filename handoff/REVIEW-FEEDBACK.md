# Review Feedback — Step REV2
Date: 2026-10-12
Ready for Builder: NO

## Must Fix
- scripts/lib/print-links-check.mjs:43-44, 58-61 (confidence: 8/10). Whether a link counts as sponsored is decided only by the prefix of its `rel`: `const sponsored = /^sponsored\b/.test(rel);`. H(a) works the same way: `/rel="sponsored/`. So a `link.coupang.com` anchor with no `sponsored` (for example `rel="noopener noreferrer"`), or with `rel="noopener sponsored"`, is treated as an info link. It then passes every rule: no disclosure needed, no 「광고」 needed, no new tab needed. It is flagged only if it comes after the disclosure. `coupangProblems` checks only that the href is present (`/href="https:\/\/link\.coupang\.com\//`), not its rel. Your own fixture shows the gap. A rel-less Coupang link is caught only because it sits on stamp-signature. On /id-photo/ the same link before the disclosure gives `[]`. The brief's failure-mode table names check-dist H(b) as the guard if "a refactor drops it". A refactor of the template's rel ternary would ship an undisclosed Coupang link through check-dist. Fix:
  1. Treat a link as sponsored when `rel` contains `sponsored` as a whole word, anywhere in the value: `/(^|\s)sponsored(\s|$)/`. Use the same test in H(a).
  2. In `coupangProblems` (or `sponsoredProblems`), require every `link.coupang.com` anchor to be sponsored. It then gets all the H(b)/H(c) checks.
  3. Add postbuild fixtures for both cases on PRINT_PAGE: a Coupang link without `sponsored` placed before the disclosure, and `rel="noopener sponsored"`. Both must fail.

## Should Fix
- src/styles/app.css:244 + src/pages/id-photo/index.astro:191 (confidence: 6/10, verify). The disclosure is `<p class="hint">`, and `.hint` is `color: var(--muted); font-size: 15px`. That makes it the faintest text in the block, smaller and greyer than the links it discloses. Under the 공정위 심사지침, a disclosure must be easy for the consumer to recognise (size and colour). axe passes on contrast, but a faint disclosure is the opposite of "clearly shown", and the owner is about to send this screen to Coupang for final approval. Recommendation: give the disclosure normal body colour and size. A plain `<p>` inside `.print-links-ad` is enough.
- tests/e2e/id-photo.spec.ts:666-675, tests/e2e/usage.spec.ts:302-308 (confidence: 6/10). Answer to Bob's open question: scoping the exclusion to the stub host, after checking that the requests are bodiless GETs, is acceptable. Do not widen upload-guard. But a GET can still carry data in its URL, and the filter accepts any URL on `map.naver.com`. Tighten it so only the popup's own navigation is dropped: assert `r.url() === STUDIO_URL` before you splice. The stub page has no subresources, so this should hold. In usage.spec, also assert `external.length > 0` like id-photo.spec does, so a silently skipped popup is not a pass.
- src/pages/privacy/index.astro:103 (confidence: 5/10). The privacy sentence and the change-log line say 「사진관·인화 링크」. With the flag on, the counted links are also 포토프린터 and 흰색 촬영 배경천, so the wording is a little narrow. Consider 「사진관·인화 관련 링크」 or 「사진관 찾기·쿠팡 링크」. If the wording changes, re-measure core font bytes.
- scripts/lib/print-links-check.mjs:80 (confidence: 5/10). The image/script check `<(?:script|iframe|img)\b[^>]*coupang` misses `<link>`, `<source>`, `<object>`, `<embed>`, and inline `<script>` bodies that mention coupang. The CSP limits the real risk. Widen the tag list cheaply, or log it.
- src/lib/ui/usage.ts:16 (confidence: 9/10). Formatting drift: `export type UsagePhase ='load' | ...` lost its space. Restore it.
- Precache with the flag on is 448.7 / 450 KB, so 1.3 KB of headroom is left. Any later id-photo change will hit the gate in the owner's flag-on Pages build but not in CI, because CI builds with the flag off. Log this in BUILD-LOG Known Gaps.

## Escalate to Architect
- The stamp-signature and HWP placements were deferred for precache. Bob suggests putting the Hancom link on /hwp-viewer/ and /hwpx-to-hwp/ only, because those pages are not precached. That is a product placement decision, and it would also need OUT_DESTS, the H(a) page whitelist and the coupangProblems page rule to cover pages other than id-photo.

## Cleared
Reviewed against the brief and the orchestrator's changes. These are correct:
- affiliate.ts / print-links.ts data and the flag
- the id-photo block: disclosure → placement line → links, 「광고」 in every label, `rel="sponsored noopener"`, new tab, text links only
- the delegated listener and the `out` whitelist: only the kind is sent, `t`/`o`/`v` are pinned, `o=out` on other events is rejected, and no URL is sent (the e2e test proves it)
- the outs SQL: the dataset regex and period whitelist are kept, no user input
- the admin `s-out` section, escaped through shapedSection
- the privacy date, revised and terms-updated values
- the M-3 checklist strings
- OPS-RUNBOOK §10 and COPY.md
- REVENUE-MODEL.md, checked against the report. The scenario table matches report L135-139 with 25% as 기본. The 11-10 rule is removed. The 7-row indicator table with sources, the policy, tax and seasonality notes, and the guide count are correct: 45 files, 8 drafts, 37 public.
