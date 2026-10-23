# Review Feedback — PRINT1023 Step A
Date: 2026-10-24
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/data/tool-notes.ts:28 (confidence: 5/10, verify) — `CAMERA_SPAN` is non-greedy up to the first `</span>`. If a gated
  passage ever holds its own `<span>…</span>`, the off build cuts at the inner close tag, leaves the rest of the passage and a
  stray `</span>`, and does not throw, because the marker was already consumed. Today's only passage has no nested span, so
  nothing ships broken. Cheap guard: in the replacer, throw if `inner` contains `<span`. That makes "not nested" in the error
  message a hard rule instead of a hope. Under 5 minutes; fix inline or log.
- Camera-on byte identity (confidence: 4/10, informational) — the request shows the passage present and 0 data-requires in
  the camera-on build, but it doesn't show a byte comparison of dist/remove-background/index.html (or any tool-note page)
  against a df5b753 build. By reading, it should be identical: the regex returns `inner + space` unchanged, and
  `Astro.slots.render` of a markdown `<Content />` is plain HTML. If memory allows on the next build, a single
  `cmp` of two tool-note pages would turn that reasoning into a check. Not blocking.

## Escalate to Architect
- Bob's open question: postbuild.test.ts runs only after build 1, because 5 of its tests assume a GA/AdSense/usage-off dist. I agree it is
  a pre-existing assumption of that test file, unrelated to the camera flag, and belongs in Known Gaps rather than this
  step. Arch to confirm the gap is tracked (that file never checks a production-flag dist anywhere in CI).

## Cleared
Reviewed the full code diff against brief Step A (P14):
- ci.yml adds only lines. The `flag-off` job copies the dist-bgcloud env verbatim and leaves `checks` and `e2e` untouched.
- I grepped the dist-reading unit files. indexnow uses its own temp root and ga.test.ts runs its own build, so the job's file choice is right.
- gateNoteHtml fails loud on any leftover marker. Its input is trusted content-collection HTML.
- The postbuild `cameraBuilt()` mirrors `bgBuilt()`. It can't hide a missing camera page, because the same build's check-dist errors on
  "id-photo-camera/index.html: no file found" when the flag is on.
- The check-dist rule at 689-691 is correct. It passes vacuously in build 1 (no page there) and actually checks the page in build 2.
