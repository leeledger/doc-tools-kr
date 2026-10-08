# Review Request — TOOLS5 U3 round 3
Date: 2026-10-08
Ready for Review: YES
Status: DONE. Not committed, not pushed. Richard's round 2 Should Fix 1–2 (round 2 and round 1 requests kept below).

## Files Changed
- src/tools/pdf-sign/controller.ts:497 — arrow keys move from the box as shown on this page (`moveBox(clampBox(p.box, page), …)`), as the drag does; the first press now moves visibly on a smaller page.
- src/tools/pdf-sign/controller.ts:943 — size slider resizes from the box as shown (`resizeBox(clampBox(p.box, page), …)`).
- tests/e2e/pdf-sign.spec.ts:83-98 — `stageReady(page, boxes)`: waits for canvas.sign-page, two equal stage size reads 100 ms apart, and the drawn boxes (data-state=ready is set before the page render sizes the stage). Used by both mixed-size tests before any baseline.
- tests/e2e/pdf-sign.spec.ts:272-325 — round 2 mixed test uses stageReady; new round 3 test: on the 200 × 300 page the shared 150 × 75 box shows at (50, 225); one ArrowLeft → x 49; slider 50 % → width 100 (top-left kept); output pixels at (49, 225, 100 × 50).

## Verification
- Regression proof: with the old `moveBox(p.box, …)` put back temporarily (default dist rebuilt), the round 3 test failed on chromium; restored byte-identical (cmp).
- Default build (auto-frame) check-dist OK (precache 430.2 KB / 450, controller 15.4 / 18.4 KB, fonts unchanged); astro check 0 errors; unit pdf-sign + usage 143 passed.
- e2e, retries 0: both mixed-size tests `--repeat-each=10` on chromium + mobile-chrome + webkit 60/60 (run first after a fresh build, the situation of the earlier unexplained failure; that failure was the position poll never resolving before stageReady existed); full pdf-sign spec ×3 35 passed / 1 skipped.

---

# Review Request — TOOLS5 U3 round 2
Date: 2026-10-08
Ready for Review: YES
Status: DONE. Not committed, not pushed. Richard's U3 items 1–3 (round 1 request kept below). Orchestrator: 4 related links on /stamp-signature/ and the shared-placement model stay; CLAUDE.md by the orchestrator.

## Files Changed
- src/tools/pdf-sign/controller.ts:391-424 — drawBoxes no longer writes the clamped rect back: `boxButton(p, k, shown)` gets a display-only `clampBox(p.box, page)`; the shared box changes only on an explicit move/resize on a page.
- src/tools/pdf-sign/controller.ts:458 — a drag starts from the box as shown on this page (clamped copy), so the first move does not jump.
- src/tools/pdf-sign/controller.ts:581 — 그림 바꾸기 reshapes without clamping to the current page (`reshapeBox(box, imgW, imgH)`).
- src/tools/pdf-sign/place.ts:59-61,67-69,91-104 — `edge()` (finite, ≥ MIN_EDGE) and `aspectOf()` (1 when a side is 0/negative/NaN); clampBox uses both; resizeBox forces ≥ MIN_EDGE on both sides (w ≥ MIN_EDGE / aspect), so the ratio can never become 0 or NaN; reshapeBox no longer clamps.
- tests/unit/pdf-sign.test.ts:117-160 — reshape unclamped; resizeBox with 0, −40, NaN, ∞, 1 and degenerate boxes (all finite, ≥ MIN_EDGE, aspect kept); mixed page sizes through stampsFor (600×800 at 414,36; 200×300 clamped to 50,0; box object unchanged).
- tests/unit/pdf-sign.test.ts:298-345 — unbalanced-cm test now replays pdf.js's operator list: order starts `q cm Q`, the image comes after the Q, and the CTM at paintImageXObject is exactly [80, 0, 0, 40, 100, 100].
- tests/e2e/pdf-sign.spec.ts:257-282 (+ MIXED fixture, `paper` flag on expectStamp) — 600×800 + 200×300 PDF, 모든 쪽, next/prev page: box position relative to the page picture unchanged; output pixels: page 1 at the original box, page 2 at the clamped box.

## Verification
- Regression proof: with the old write-back line put back temporarily (default dist rebuilt), the new e2e failed on chromium; restored file byte-identical (cmp).
- Unit 59 files 1,268 passed; astro check 0 errors; default build (auto-frame) check-dist OK, precache 430.2 KB / 450, controller 15.4 / 18.4 KB, preloaded fonts 91.2 KB (unchanged).
- e2e pdf-sign chromium + mobile-chrome + webkit, retries 0: 32 passed / 1 skipped; mixed test repeat-each 4 on the three projects 12/12. One failure of the mixed test right after the restore rebuild did not reproduce (next run and the 12 repeats green); cause not identified (logged).

---

# (Round 1) Review Request — TOOLS5 U3 (/pdf-sign/ PDF 서명·도장 넣기)
Date: 2026-10-08
Ready for Review: YES
Status: DONE. Not committed, not pushed. Brief: handoff/ARCHITECT-BRIEF-TOOLS5.md (U3, decisions 6, 10–13; owner O3 = no drawing pad).

## Files Changed
New
- src/tools/pdf-sign/place.ts:1-157 — pure placement maths: Box in "page as seen" points, clampBox/startBox/moveBox/resizeBox/reshapeBox, pagesOf/showsOn (넣을 쪽 via parseRange), `toPdfRect(box, info)` (picture's lower-left as seen → pdf.js `convertToPdfPoint`, width/height = PDF-space edge lengths, rotate = page /Rotate), stampsFor, placeValue (usage), signName.
- src/tools/pdf-sign/limits.ts:1-37 — PDF limits = /pdf-split/ (PC 500 MB, phone 100 MB); picture 50 / 30 MB; IMAGE_EDGE 2,000 px.
- src/tools/pdf-sign/controller.ts (whole file) — states empty→opening→locked→ready→working→done; pdf.js open/password (mirror of /pdf-split/), page preview on a stage with overlay `<button class="sign-box">` per placement (drag, corner handle, arrow keys 1 pt / Shift 10 pt, Delete), size slider, 넣을 쪽 chips + range field, page nav, picture → PNG via sniff/decodeImage/canvas (HEIC native only), save through merge.worker `sign`, result notes (signature warning; "암호 없이 저장했습니다. 다시 걸려면 PDF 암호 해제·설정을 쓰세요." with link), hand-over read once on start.
- src/tools/pdf-sign/entry.ts:1-50 — lazy controller on first interaction; starts at once when `hasSignPng()`.
- src/tools/pdf-sign/sign.css — inlined on the page only (/stamp-signature/ pattern).
- src/pages/pdf-sign/index.astro:1-191 — hero, picker, picture row, editor, actions, result, 사용 방법, 알아 두면 좋아요 (first point = honest "그림 서명" copy), FAQ, related [stamp-signature, pdf-merge, pdf-password].
- src/lib/pdf/sign.ts:1-56 — `signPdf`: load with password, hasSignature, embedPng once, drawImage per stamp (pdf-lib wraps existing content in q/Q on normalize), producer, save; PDF/A-1 inputs retry without object streams.
- src/lib/ui/sign-handoff.ts:1-87 — key `docttak:sign-png`, store / has / take-once (+ 'invalid'), sendToPdfSign, HANDOFF_FAILED copy.
- tests/unit/pdf-sign.test.ts:1-344 — toPdfRect vs real pdf.js viewports (0/90/180/270 × CropBox (0,0)/(36,36)) by mapping drawImage's corners back; box rules; 넣을 쪽; names; limits; signPdf (pages, producer, encrypted→unencrypted, wrong password, signed flag, not-pdf, unbalanced cm); hand-over incl. QuotaExceeded.
- tests/e2e/pdf-sign.spec.ts:1-318 — four-colour PNG; output rendered with pdf.js + @napi-rs/canvas in Node: each quarter at its place inside the box, paper 2 pt outside (plain, /Rotate 90, /Rotate 270 + CropBox 36); keys; 모든 쪽; 쪽 범위 incl. error; drag/handle/slider/add/remove; page nav; encrypted; signed; not-image picture; arrival from /stamp-signature/ (read once); axe.

Changed
- src/lib/pdf/merge.worker.ts:1-2,6,28,35,54-63 — `sign` request / `signed` response (no second pdf-lib copy).
- src/pages/stamp-signature/index.astro:97,164,219 — 「PDF에 넣기」 buttons (photo + pad); related gains pdf-sign (first of four).
- src/tools/stamp-signature/photo.ts:62,96-99,385-414 — setSaveable(), shared encodeCurrent(), PDF에 넣기 handler; pad.ts:91,130,192-222 — same for the pad.
- Registration: src/data/tools.ts:10,78-82,407-450 (entry after pdf-split, 7 FAQ, numbers from limits); og.json (image + page description); site.ts HOME_DESC_ORDER after stamp-signature; tool-facts.ts (maxFileMb); guides.ts NEXT_GUIDES `pdf-sign: e-signature-law, stamp-image, pdf-password`; scripts/lib/usage.mjs (TOOLS, PLACE_MODES/`place`, TOOL_LABELS, `no-image` label, 넣을 쪽 / 고른 쪽·범위·모든 쪽); src/lib/ui/usage.ts types; gen-sw.mjs NOT_PRECACHED + sw.ts RUNTIME_PAGES; bgcloud.mjs LOCAL_SCOPE_RE; lighthouserc.json; scripts/qa/visual.mjs; docs/COPY.md term line ("그림", "그림 서명").
- scripts/check-dist.mjs:228-243 — /pdf-sign/ block: controller (owns #sg-range-error) lazy and not in initial JS; initial JS free of pdf.js/pdf-lib/merge worker; budget 18.4 KB (15.4 measured + 20 %).
- Tests: site/polish e2e lists, related map (/stamp-signature/ four, /pdf-sign/ three), landing 13 cards, sitemap; usage.spec pdf-sign happy path; stamp-signature.spec PDF에 넣기 (stores + navigates, QuotaExceeded stub); unit lists (postbuild OG/precache/imageOf + brand regex allows `docttak:sign-png`, polish, bgcloud, admin-view `no-image`, usage).

## Decisions (Bob)
- Worker: `sign` message on merge.worker. esbuild gzip of the worker 255,977 → 256,267 B (+290 B); a separate sign.worker would carry its own pdf-lib (~250 KB gzip). Built merge.worker 248,266 B (gzip -9).
- Model: a placement = one box shared by its pages ("같은 자리에"); 넣을 쪽 per placement [이 쪽만 | 쪽 범위 | 모든 쪽]; several placements; one picture for all. Moving a placement on any page moves it on all its pages; each page clamps it to its own size.
- The picture is always re-encoded to PNG on the main thread (orientation applied, ≤ 2,000 px long edge); JPG keeps its white box (FAQ points to /stamp-signature/).
- Signature warning in the result notes before 내려받기 (the /pdf-split/ pattern Richard cleared), not a blocking dialog.
- Honest copy: brief text verbatim except "얹는" → "올리는" (얹 would be a new core glyph); also "바탕"→"배경", "들어옵니다"→"들어갑니다". New core characters: none.
- `no-image` fail = the stored hand-over value is not a PNG data URL. The hand-over adds no usage field; /stamp-signature/ sends nothing extra.
- Hand-over failure: alert "PNG를 내려받은 뒤 PDF 서명·도장 넣기에서 골라 주세요."; the page stays and its related list links /pdf-sign/.
- PDF/A-1 inputs: pdf-lib refuses object streams for them (found with signed_fake), so the save retries with `useObjectStreams: false`.
- CLAUDE.md line 3 not edited (orchestrator rule): needs "PDF 서명·도장 넣기".

## Gates (local, Windows, 2026-10-08)
- astro check 0 errors; unit 59 files 1,266 passed.
- Four CI builds (noauto, auto-frame dist, bg, bgcloud) check-dist OK. Precache 428.0 / 430.2 / 431.4 / 434.3 KB / 450. Core 603/607/604/604, late 38 (unchanged from U2); preloaded 92,884 / 93,380 / 93,044 / 93,044 B (margins 2,000 / 1,504 / 1,840 / 1,840). Initial JS /pdf-sign/ 9.0 KB (9.7 cloud); stamp-signature controls 12.5 / 13.5 KB.
- e2e, retries 0: pdf-sign + stamp-signature chromium/mobile-chrome/webkit 52 passed / 2 skipped (the new PDF에 넣기 test then 3/3 after giving its route stub the real CSP header); site + polish + growth 392 passed / 10 skipped; usage cloud ×3 27 passed / 3 skipped; pdf-sign firefox + mobile-safari 19 passed / 1 skipped, PDF에 넣기 2/2; pdf-merge + pdf-split chromium 16 passed / 1 skipped. After the last CSS fix (picture row grid areas): default dist rebuilt, pdf-sign ×3 29 passed / 1 skipped.
- Unverified (d) confirmed: upright and in place on /Rotate 90 and /Rotate 270 + CropBox (36,36) in chromium, mobile-chrome, webkit, firefox and mobile-safari (pixel check of the output).
- Lighthouse (local lhci, dist-bg, 5 runs): /pdf-sign/ LCP median 1,669 ms (1,665–1,684), perf 1.00, a11y 1.00, CLS 0.0003; /stamp-signature/ 1,666 ms.

## Open Questions
- Placement model (one shared box per placement + 넣을 쪽) vs per-page copies — fine for "같은 자리에 모든 쪽 / range"?
- /stamp-signature/ related list now has four links (brief: "gains pdf-sign"); other tools keep three.
- dist-noauto / dist-bg / dist-bgcloud were built before the final sign.css grid fix (page-inline CSS only; budgets unaffected).

## Out of Scope (logged in BUILD-LOG)
- CLAUDE.md line 3; PDF/A conformance of the output (a transparent PNG adds an SMask); qa:visual not run (manual screenshots 1280 / Pixel 7).
