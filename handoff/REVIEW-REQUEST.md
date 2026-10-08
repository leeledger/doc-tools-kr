# Review Request — TOOLS5 U1 round 2
Date: 2026-10-08
Ready for Review: YES. Status **DONE**; not committed, not pushed. Answers handoff/REVIEW-FEEDBACK.md (TOOLS5 U0+U1).

## Files Changed (round 2)
- src/tools/image-to-jpg/controller.ts — `Entry.runError`; `runnable()` (run button counts run-error rows); `clearRunErrors()` + `onOptionChange()` on 저장 형식 / 화질 change; `run()` clears run errors before taking the rows; `markError(…, true)` for run-time errors; hint only for read errors.
- tests/e2e/image-to-jpg.spec.ts — new test "WebP fails on this device … 저장 형식 JPG brings it back and it converts".
- src/content/guides/heic-to-jpg.md:29 — the share quote is Apple's full sentence naming AirDrop, 메시지, 이메일 (check:quotes 148 verbatim).
- handoff/BUILD-LOG.md — round 2 notes; Should Fix 2 and 3 logged as known gaps.

## Results (round 2)
- Builds default / auto-frame / bg / cloud: check-dist OK (controller 18.4 / 22 KB; precache unchanged). astro check 0 errors. Unit image-to-jpg + guides-schema + postbuild 110 passed. e2e image-to-jpg chromium + mobile-chrome + webkit + mobile-safari 42 passed / 2 skipped, retries 0.

## Open Questions
- After a run where every row failed, the run button stays on for the same format (a retry may work, e.g. a transient worker load failure). OK, or should it require an option change?

---

# Round 1 (for reference)

Date: 2026-10-08
Ready for Review: YES. Status **DONE** (U0 and U1) locally; not committed, not pushed. Brief: handoff/ARCHITECT-BRIEF-TOOLS5.md. U0 is meant to be its own commit (files below).

## Files Changed — U0 (refactor, no visible change)
- src/lib/zip/stored.ts:1-40 — `StoredZip`, the streaming stored ZIP moved verbatim from pdf-to-jpg/output.ts (`JpegZip`).
- src/lib/zip/names.ts:1-18 — `dedupeNames` moved verbatim from photo-compress/zip.ts.
- src/lib/image/caps.ts:1-23 — `CanvasCaps`, `fitsCaps`, `fitWithinCaps` (the pageScale clamp, same arithmetic).
- src/tools/pdf-to-jpg/scale.ts:1-22 — `pageScale` calls fitsCaps / fitWithinCaps.
- src/tools/pdf-to-jpg/limits.ts:3 — CanvasCaps from lib/image/caps.
- src/tools/pdf-to-jpg/output.ts:1-4 — JpegZip removed (comment points at lib/zip).
- src/tools/pdf-to-jpg/controller.ts:19-22, 341 — imports StoredZip.
- src/tools/photo-compress/zip.ts:1-20 — imports dedupeNames; keeps zipSync (not a pure move, see BUILD-LOG).
- src/lib/pdf/inspect.ts:3, 105-131, 147 — `renderPageCanvas(doc, pageNo, w)` → `renderPageThumb(doc, index, maxW, maxH = Infinity)` + pure `thumbCssWidth`.
- src/tools/pdf-compress/controller.ts:621, 629 — call renderPageThumb(…, 0, …).
- tests/unit/tools5-shared.test.ts (new) — StoredZip + dedupeNames, fitsCaps / fitWithinCaps edges, thumbCssWidth.
- tests/unit/pdf-to-jpg.test.ts:9-10, 98-128 and tests/unit/photo-tool.test.ts:12-13 — import lines only (JpegZip → StoredZip, dedupeNames path).
- handoff/BUILD-LOG.md — "TOOLS5 — brief" log notes, U0 notes.

## Files Changed — U1 (/image-to-jpg/ 사진 JPG 변환)
- src/tools/image-to-jpg/limits.ts (new) — limits (사진 PDF 변환 numbers) + canvas caps; `planAdd` with 바꾸기 wording.
- src/tools/image-to-jpg/convert.ts (new) — pure rules (accepted formats, canStripOnly, quality, names, drawSize / decodeEdge, notes, oncePerCode) and the injected canvas runner `convertImage` (strip path, transparency + white, WebP type check → fallback, encoder/canvas errors).
- src/tools/image-to-jpg/controller.ts (new) — UI: list, thumbnails, one photo at a time with a yield, 취소, single file or StoredZip, per-row downloads, usage once per code per batch / run; `browserDeps` 103-145 (WebP fallback worker 122-141).
- src/tools/image-to-jpg/entry.ts (new) — lazy controller on first interaction (jpg-to-pdf pattern).
- src/lib/codecs/webp.worker.ts (new) — @jsquash/webp encode in a worker (fallback only).
- src/pages/image-to-jpg/index.astro (new) — page, options, how-to, FAQ, related.
- src/content/guides/heic-to-jpg.md (new) — guide with 5 Apple KR quotes; src/content/guides/kakao-photo.md:13 related += heic-to-jpg; scripts/lib/guide-titles.mjs:9 regenerated.
- src/data/tools.ts:8, 56-65, 389-429 — FAQ numbers from limits; the tool entry after photo-compress.
- src/data/og.json:10, 26; src/data/site.ts:27; src/data/tool-facts.ts:14, 59-62; src/data/guides.ts:51-52, 62 — registration.
- src/lib/ui/usage.ts:13, 23-24 and scripts/lib/usage.mjs:43, 60-63, 266, 293, 315, 354-357 — tool, `to` setting, labels, FAIL_LABELS.encoder.
- src/sw/sw.ts:32, scripts/gen-sw.mjs:50 — RUNTIME_PAGES / NOT_PRECACHED.
- scripts/check-dist.mjs:168-188 — webp.worker budget 11.2 KB, controller budget 22 KB, no ZIP/WebP code in the initial JS, no codec in the controller's static imports.
- scripts/lib/bgcloud.mjs:62, lighthouserc.json:14, scripts/qa/visual.mjs:35 — lists.
- src/styles/app.css:190-191, 211 — `.file-list.no-handle` (rows without the drag column).
- docs/COPY.md:13 — JPG, PNG allowed; HEIC as "아이폰 사진(HEIC)".
- tests/unit/image-to-jpg.test.ts (new) — rules + runner on @napi-rs/canvas (transparency, alpha kept, WebP fallback, encoder/canvas errors, caps, GIF note, strip path, re-encode path).
- tests/e2e/image-to-jpg.spec.ts (new) — 10 tests incl. the forced WebP fallback; tests/e2e/usage.spec.ts:166-188 (HEIC batch → exactly one fail c=heic); site/polish lists; unit polish/postbuild/bgcloud/usage/admin-view lists.
- handoff/BUILD-LOG.md — U1 notes.

## Results
- astro check 0 errors; unit 55 files 1,186 passed; check:quotes 148 verbatim; check:licenses OK.
- Builds default / auto-frame / bg / cloud: check-dist OK; precache 419.8 / 421.8 / 423.1 / 425.6 KB of 450.
- UI font: no new core character; preloaded margins 2,516 / 2,112 / 2,468 / 2,468 B (unchanged).
- e2e chromium + mobile-chrome + webkit: image-to-jpg + site + polish + growth 388 passed / 11 skipped; image-to-jpg also on mobile-safari (38 passed / 2 skipped over 4 projects, retries 0); usage cloud 16 passed; regression merge/pdf-to-jpg/compress/photo 134 passed / 34 skipped.
- Lighthouse local (dist-bg, 5 runs): /image-to-jpg/ 1,656 ms, /photo-compress/ 1,806, /pdf-merge/ 1,807, /guide/heic-to-jpg/ 1,656; CLS 0.

## Open Questions
- U0 `renderPageThumb` takes `(doc, index, maxW, maxH = Infinity)` instead of the brief's `(doc, index, maxPx)`: a long-edge cap would have shrunk the merge card's portrait thumbnail (visible change). OK for U2?
- WebP fallback is a small worker, not a main-thread import (the main-thread import duplicated the MozJPEG/resize wasm in dist). Fine with the extra 9.3 KB lazy worker?
- Usage once per code per batch for every parse code (not only heic) and once per code per run while converting. jpg-to-pdf sends heic once per photo (logged, not changed).
- Problem rows do not block the run (the others continue), unlike jpg-to-pdf where they block. Intended per brief decisions 7/8.
- Main-thread encode keeps the page busy while one large photo is drawn (decision 6; the yield is between photos).

## Out of Scope (logged in BUILD-LOG)
- CLAUDE.md line 3 should name 사진 JPG 변환 (not edited by Bob: owner/orchestrator).
- Firefox parallel-download flake on this PC (also in unchanged specs); qa:visual not run; owner device checks (iOS HEIC picker, real Safari WebP).
- docs/OPS-RUNBOOK.md working-tree change is not Bob's.
