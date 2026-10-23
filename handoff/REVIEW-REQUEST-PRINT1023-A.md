# Review Request — PRINT1023 Step A (CI flag-off job + IDCAM1022 D gap)
Date: 2026-10-24
Ready for Review: YES
Status: DONE (CI wall time to be logged from the PR run)

## Files Changed
- .github/workflows/ci.yml:64-115 — new parallel job `flag-off` (ubuntu-24.04, 25 min, npm ci, no Playwright): build 1
  PUBLIC_ID_CAMERA=0 defaults + postbuild/en-check/hwp-viewer tests; build 2 PUBLIC_ID_CAMERA=0 + the dist-bgcloud env
  (verbatim copy) + en-check/hwp-viewer. `checks` and `e2e` untouched (diff has 0 removed lines).
- src/data/tool-notes.ts:26-38 — gateNoteHtml(html, idCamera): `<span data-requires="id-camera">…</span>` unwrapped (on) or
  dropped with its trailing space (off); any leftover data-requires marker throws (fails the build).
- src/components/NoteGate.astro (new) — renders its slot through gateNoteHtml with __ID_CAMERA__.
- src/components/ToolNotes.astro:7,24 — `<Content />` wrapped in `<NoteGate>`.
- src/content/tool-notes/remove-background.md:41 — the two 증명사진 촬영 hand-over sentences wrapped in the marker; the
  passport/driver-licence warning (외교부 quote) stays unconditional and reads on its own.
- scripts/check-dist.mjs:689-691 — flag-off rule: dist/remove-background/index.html must not contain 「증명사진 촬영」
  (/id-photo-camera/ in any html was already covered by the existing rule at 684-687).
- tests/unit/tool-notes.test.ts:84-99 — gateNoteHtml on/off/unknown-marker; no note but id-photo-camera names 증명사진 촬영
  once gated off; the remove-background note carries the marker.
- tests/unit/postbuild.test.ts:1190-1195 — root cause of 9 failures the new job found on a camera-off dist: publishedGuides()
  called isVisibleGuide without the camera flag (default true), so it expected /guide/self-id-photo/; now passes
  existsSync(dist/id-photo-camera).

## Gates run locally (sequentially)
- npm run check: 0 errors / 0 warnings.
- Default build: check-dist OK (2633 files), precache 427.1/450 KB; postbuild+en-check+hwp-viewer 121/121.
- CI build 1 (PUBLIC_ID_CAMERA=0): 41 s, check-dist OK, precache 424.5 KB; same 3 files 121/121 (after the postbuild.test fix;
  9 failed before it).
- CI build 2 (PUBLIC_ID_CAMERA=0 + dist-bgcloud env): 42 s, check-dist OK, precache 435.6 KB; /remove-background/ has 0
  「증명사진 촬영」, keeps 「여권과 운전면허 사진은 배경을 지우면」, 0 data-requires; en-check+hwp-viewer 44/44.
- Rule bites: 「증명사진 촬영」 injected into that dist page -> check-dist reports
  "remove-background/index.html: names 증명사진 촬영 in a build with PUBLIC_ID_CAMERA off"; page restored byte-identical.
- Camera-on production build: the passage is present (1 hit), marker unwrapped (0 data-requires), check-dist OK 438.8 KB.
- tool-notes + guides-schema: 52/52. ci.yml parsed with `yaml`: jobs [checks, flag-off, e2e].
- Full `npm test` not run (memory; ga.test.ts spawns its own build). check:quotes: 1 problem, an Apple 미리보기 quote drifted
  on the live source page — unrelated to this step, not touched.

## Open Questions
- postbuild.test.ts runs after build 1 only. On any dist-bgcloud-like dist (camera on OR off, verified both) 5 of its tests
  fail: check-dist re-run after gen-headers rejects the AdSense CSP detach (2 tests), privacy 시행일 chain (GA/usage), a
  `docttak` string in ui-shared/utm-land chunks (usage on; not 안올림), example.kr contact line with the officer set.
  Pre-existing assumptions of the test file, not camera-related; logged as a Known Gap rather than fixed here. Agree?
- NoteGate is a generic slot filter but only knows id-camera (YAGNI); unknown markers fail the build.

## Out of Scope (logged in BUILD-LOG)
- postbuild.test.ts vs production-flag dist (above). check:quotes Apple quote drift.
