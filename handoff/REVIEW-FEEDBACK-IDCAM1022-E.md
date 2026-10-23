# Review Feedback — IDCAM1022 Step E (/guide/self-id-photo/)
Date: 2026-10-23
Ready for Builder: YES

Reviewed: `git diff idcam1022-d..53d89b5` (Step D fix df857a2 excluded, already on idcam1022-d), Step E of
handoff/ARCHITECT-BRIEF-IDCAM1022.md. Ran: vitest drop-links + guides-schema 46/46. The 15 quotes were checked offline:
12 外교부 quotes appear verbatim in handoff/sources/idcam1022/official-photo-rules-2026-10-22.txt, 정부24 and the 2
safedriving quotes match existing guides, and I fetched safedriving live (2026-10-23) and found both quotes verbatim. Banned words: none in the diff.
SVGs: no script/handler/href/image/foreignObject, only local clip-path refs, and no numbers in their text. I did not re-run check:quotes or check-dist; Bob's
default-build run stands. The PUBLIC_ID_CAMERA=0 build is still unproven, so CI must pass before merge.

## Must Fix
None.

## Should Fix
- src/content/guides/self-id-photo.md, 「셀카보다 세워 두고 타이머로」 last sentence vs figure 2 (confidence: 7) — the body says
  「화면 속 얼굴이 작아 보여도, 자르는 단계에서 … 확대해 잘라요」 but figure 2 marks 「너무 작음」 and its caption says
  「나머지 셋은 다시 찍는 편이 빨라요」. That is contradictory advice. Reword the body to say a small face can still be
  cropped, that lining it up with the 안내선 avoids re-cropping, and that a very small face can trip the 「너무 작다」 block.
  The figure can stay.
- src/content/guides/self-id-photo.md table row 이력서 (confidence: 6) — 「촬영 규정은 없어요」 is an absence claim with no
  source on this page. Either add the 사람인/잡코리아 quotes already used in resume-photo.md (with their retrieved dates) or
  reword it to 「크기와 형식만 안내해요」 and drop the second sentence.
- package.json (confidence: 8) — astro.config.mjs imports `@astrojs/markdown-satteri` and tests/unit/drop-links.test.ts
  imports `satteri`. Neither is declared, so both are phantom dependencies. npm ci is deterministic from the lockfile, so this
  does not break today. A lockfile regeneration or an astro bump that drops or moves the pin would break only the flag-off
  build, the one build nobody runs locally. Fix: declare both, pinned exactly to the lockfile versions
  (`@astrojs/markdown-satteri` 0.4.2, the same as astro 7.3.5's exact pin, so npm keeps one copy; `satteri` 0.10.5). Add one
  unit assertion that the declared markdown-satteri version equals `astro/package.json` dependencies, so a future astro bump
  fails loudly instead of loading two processors. Both are MIT; run check:licenses after.
- handoff/sources/idcam1022/official-photo-rules-2026-10-22.txt header (confidence: 6) — it says the safedriving popup
  「renders by script (125 chars)」 and that the driver-license-photo quotes 「(retrieved 2026-10-06) remain the citation」,
  but the guide dates them 2026-10-22, and driver-license-photo.md has 2026-09-30 and 2026-10-21, not 10-06. A plain fetch
  does return both quotes (verified live). Correct the note so the audit trail matches the dates.
- drop-links (informational) — the plugin removes a hidden link only inside a p or li. A link in a table cell, heading or
  frontmatter FAQ is left, and check-dist then fails the flag-off build. That is fail-loud and acceptable. Keep the rule
  stated in the file header (it is) and do not widen it now.

## Answers to Bob's open questions
1. Declare `@astrojs/markdown-satteri`: yes, and `satteri` too. Pin both exactly and add the version-equality test (Should Fix above).
2. `updated` bump on the four guides: fine, keep it. The page body changed and the LOAN1022 precedent stands. The sources'
   `retrieved` dates are untouched, so no claim of re-verification is made.

## Escalate to Architect
None.

## Cleared
I reviewed the new guide (every number cited; passport and driver-license rules quoted verbatim; whitening limited to
이력서·반명함, matching the D8c block for passport_* and driver_license; UI labels checked against the camera page code;
plain Korean; 문서딱). I also reviewed the 2 own SVGs, the four one-line links and the tool-note link, the `requires: id-camera`
schema and visibility path, check-dist and gen-brand gating, and the drop-links plugin. Its astro.config wiring is active
only when the flag is off, and Astro 7.3.5's default processor is already `satteri()`, so flag-off swaps only in the same
engine plus one plugin. All of it passes.
