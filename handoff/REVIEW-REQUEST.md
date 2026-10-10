# Review Request — CI fix round 2
Date: 2026-10-10
Ready for Review: YES
Status: DONE. Not committed, not pushed. Follows CI run 38015775584 on 8e02171 (checks, chromium, firefox, webkit and mobile-safari green; mobile-chrome 2 failed after retries).

## Failure → root cause → fix

**(1) mobile-chrome pdf-sign.spec.ts:387 axe target-size on #sg-next ("partially obscured, 121 × 14.4 px"; spacing 23.4 px) — layout bug**
- Root cause: /pdf-sign/ has the sticky phone actions bar (`.merge-actions`, #sg-actions) but was missing from the `scroll-padding-bottom` rule, which named only #merge-tool and #ps-tool. Focus and scroll-into-view therefore took no account of the bar. Probe on Linux mobile-chrome after 「쪽 범위」 + fill: the focused #sg-range sat at y 758–802 under the bar at 770–839 (WCAG 2.4.11 focus obscured). The page then stopped wherever that left it. On CI that put #sg-next mostly under the sticky header (14.4 px visible), which is what axe reported. This was not caused by 8e02171: the rule never covered /pdf-sign/, and the scroll position varies with layout.
- Fix: src/styles/app.css:239-240 replaces the per-tool list with `html:has(.merge-actions:not([hidden])) { scroll-padding-bottom: 96px; }`. It applies whenever any tool shows its bar (merge, split, sign, image-to-jpg, jpg-to-pdf, pdf-password, pdf-to-jpg); the bar is 69 px tall. Probe after the fix: #sg-range at 700–744, clear of the bar (mobile-safari: 524–568 against a bar at 595).
- Test: tests/e2e/pdf-sign.spec.ts:396-398 now also asserts that the filled field is not under #sg-actions. Against the old CSS (dist-noauto, pre-fix) it fails (field bottom 882 > 771); with the fix it passes.

**(2) mobile-chrome polish.spec.ts:606 focused merge row covered by the bar (778.5 > 771) — test race, not 8e02171**
- Root cause (trace): the test calls `scrollIntoView({ block: 'start' })` on #merge-list, which runs smoothly because of the site's `scroll-behavior: smooth`. It calls `focus()` on row 7 only 40 ms later (227595 → 227635 ms). The smooth scroll still running then overrides the focus scroll and ends with the list at the top, the row under the bar (last screencast frame). The tools-menu change in 8e02171 has no effect here: the panel is `hidden`, and the built CSS still has the merge scroll-padding rule. Local runs pass because the animation finishes first.
- Fix: tests/e2e/polish.spec.ts:618-620 scrolls with `behavior: 'instant'`, like the `scrollTo` two lines above. The assertion is unchanged.

## Verification (Linux WSL, Playwright 1.63, retries 0)
- Build dist (AUTOFRAME=1): check-dist OK. No unit test reads this CSS rule.
- mobile-chrome, pdf-sign + polish `--repeat-each=5`, 4 workers: first run 294 passed / 25 skipped / 1 failed. The failure was pdf-sign:307 ("round 3"): the #sg-run click did not start the save, and the state stayed ready for 60 s. Not reproduced since: pdf-sign:307 ×15 15/15; pdf-sign ×5 55/55; pdf-sign + polish ×5 295 passed / 25 skipped / 0 failed (both with the new field assertion).
- chromium + webkit + mobile-safari, pdf-sign + polish: 175 passed / 17 skipped. pdf-sign again with the new assertion on chromium + webkit + mobile-safari + firefox: 47 passed / 1 skipped.
- mobile-chrome + mobile-safari, every spec with a sticky bar (pdf-merge, pdf-split, image-to-jpg, jpg-to-pdf, pdf-password, pdf-to-jpg): 110 passed / 6 skipped.

## Open Questions
- The single pdf-sign:307 lost #sg-run click (1 of 320 runs, under load) is unexplained. It never failed in CI. Logged.
- The CSS minifier drops the `100vh` fallback of the tools-menu max-height and keeps only `100dvh` (supported by every target browser). Left as is.

---

# Review Request — CI fix after TOOLS5
Date: 2026-10-10
Ready for Review: YES
Status: DONE (item (e) DONE_WITH_CONCERNS). Not committed, not pushed.

CI on main has been red since TOOLS5 U0+U1 (runs 37753444973, 37758454475, 37769093648, 37774521048, 37787285839).
I read the logs and the uploaded traces for each failure, and kept first tries apart from retries.

## Failure → root cause → fix

**(a) checks: tests/unit/ga.test.ts "GA-on build … check-dist passes" (every run since GA4)**
- Root cause: the CI checks job builds with `PUBLIC_BG_REMOVE=1`, so copy-vendor leaves the 배경 지우기 engine in
  public/vendor/ (birefnet, onnxruntime) and gen-brand leaves brand/og-remove-background.png. The test's own GA-on
  `astro build` ran with the flag unset. Astro copies public/ as is, so check-dist failed that flag-off build for
  carrying 15 배경 지우기 files. It passed locally only because public/ was in the flag-off state (the GA4 BUILD-LOG
  notes "ga.test needs public/ in the no-flag state").
- Fix: tests/unit/ga.test.ts:227-231 builds with `PUBLIC_BG_REMOVE` set to match public/vendor ('1' when birefnet is
  there).
- Proof: after `PUBLIC_BG_REMOVE=1 npm run build` (the checks job), the old test fails with exactly the CI list and
  the new one passes. Full suite: 58 files, 1,252 passed.

**(b) all browsers: id-photo.spec.ts:654 SEO (since SEO-LENGTH, 3/3 tries)**
- Root cause: SEO-LENGTH shortened the /id-photo/ description in tools.ts on purpose (40–80 chars). The spec kept the
  old literal.
- Fix: tests/e2e/id-photo.spec.ts:658 expects the current description.

**(c1) webkit + mobile-safari: pdf-sign.spec.ts:182 `#sg-range` not focused (since U3, 2/2 tries on both) — product bug**
- Root cause: WebKit's label default action first dispatches the simulated click (→ change → `setWhere` →
  `rangeInput.focus()`). Only after that does it focus the radio, when the radio is mouse-focusable (GTK/WPE: yes),
  which takes focus back. Confirmed with a focusin probe on Linux WebKit: `sg-range, range (radio), sg-range` with the
  fix. Chromium and Firefox give `range, sg-range`.
- Fix: src/tools/pdf-sign/controller.ts:542-549 gives focus back to the field after a 0 ms timeout. It does so only if
  a 넣을 쪽 radio still has focus and the range box is shown. The unchanged spec is the regression test: it failed in
  CI and passes on Linux WebKit.

**(c2) webkit + mobile-safari lost clicks: id-photo:206 / :280, image-to-jpg:81 / 174 / 191 / 224, jpg-to-pdf:99,
pdf-compress:52 / 75, pdf-split:99 / 251, usage:166 (cloud), sw:38 (flaky or hard, depending on the run)**
- Root cause: `html { scroll-behavior: smooth }`. On WebKit, Playwright's scroll-into-view before a click animates.
  The actionability check passes mid-animation, and the click lands on whatever is under the point by then. The
  traces show the pattern: the target is scrolled under the sticky header ("header intercepts pointer events"), then
  "not stable", then a click reported "done" with no effect (no download, no 삭제, one 돌리기 of two). The tools
  scroll their result into view smoothly just before the 내려받기 click, so the result specs hit this most.
- Reproduced on Linux WebKit (WSL Ubuntu 24.04, browser deps extracted without sudo). image-to-jpg + jpg-to-pdf +
  pdf-split + pdf-compress ×3, 2 workers, retries 0: 6 of 111 failed (5 image-to-jpg, pdf-compress:75). With the fix:
  0 of 111, in 3.7 min instead of 7.0. The errors and traces of image-to-jpg, jpg-to-pdf, usage, pdf-split:99 and id-photo:206
  show the lost click directly. pdf-split:251 (axe target-size "partially obscured", measured mid-scroll), sw:38 and
  id-photo:280 (a nudge click with no effect) match the pattern but were not reproduced one by one.
- Fix: playwright.config.ts:33-41, 69, 71, 83, 92. The WebKit projects (webkit, mobile-safari, bg-mobile-safari,
  cloud-webkit, cloud-mobile-safari) run with `reducedMotion: 'reduce'`, which the site already honours (global.css,
  app.css). hwp-viewer.spec.ts has done the same since its review. No assertion changes: Chromium and Firefox still
  run with smooth scrolling, and the product's own result scrolls that matter (photo-compress, id-photo) are already
  instant.

**(d) firefox: polish.spec.ts:635 header menu outside click (since U3, 3/3) — product bug**
- Root cause: with /pdf-sign/ the menu lists 13 tools. The panel bottom reached y = 701 in a 720 px window, and the
  test clicked at y = 721 (trace: `mouseClick {"x":5,"y":721}`), outside the viewport, which Firefox drops. On a
  phone the sheet was taller than the window (13 × 48 px plus the header), so its last links were out of reach under
  the sticky header.
- Fix: src/styles/app.css:36-38 limits the panel to the window height (`max-height: calc(100dvh - 76px)`, with a
  100vh fallback) and lets it scroll. tests/e2e/polish.spec.ts:655-660 clicks 8 px below the panel and asserts that
  the point is on screen.

**(e) firefox: pdf-sign.spec.ts:225 drag `r1.y - r0.y` = -119, expected -120 (U3, 3/3) — DONE_WITH_CONCERNS**
- Analysis: x was exact (-80) on all tries. The controller moves the box by pointer delta / scale with no rounding,
  and Playwright's start and end points have the same fraction. So a vertical-only 1 px means the stage moved in the
  window, not that the drag was off. Not reproduced: Linux Firefox ×4 (2 workers) and the full Firefox job pass. The
  CI layout was 1 px different (box at y 639.33 against 640.33 locally, fonts).
- Fix: tests/e2e/pdf-sign.spec.ts:232-248 measures the move relative to `#sg-stage` (still exactly -80 / -120). If
  CI still fails, the drag itself is off and this assertion will show it.

**(f) chromium: pdf-sign.spec.ts:272 flaky, `parentElement` of null**
- Root cause: `locator('.sign-box').evaluate` resolved a box that a redraw then replaced (detached, no parent).
- Fix: tests/e2e/pdf-sign.spec.ts:285-289 reads box and stage in a single evaluate on `#sg-stage`, which is never
  replaced.

**(g) firefox goto timeouts (pdf-split:207 / 287 / 251 and about 13 others per run) — known harness race, not changed**
- Every one is `page.goto: Timeout 20000ms` in gotoReady, and the trace shows every page request answered 200
  (ci-green BUILD-LOG: Playwright-Firefox drops the navigation event under load). Reproduced locally: 16 flaky, all
  goto, all passed on retry. The Firefox projects keep their 2 CI retries. Logged as a Known Gap.

## Workflows (Ubuntu 26 on 2026-10-19, Node 20 actions)
- .github/workflows/{ci,ops-health,ops-post-deploy,ops-source-watch,ops-weekly}.yml: `runs-on: ubuntu-24.04`;
  actions/checkout@v7 (latest v7.0.1) and actions/setup-node@v7 (v7.1.0). I also moved actions/upload-artifact@v4 to
  v7 (v7.0.2) and actions/cache/{restore,save}@v4 to v6 (v6.1.0), because v4 of both still runs on node20. All four
  run on node24 (action.yml checked). Breaking-change notes I read:
  - setup-node v6 limits automatic caching to npm; we set `cache: npm`.
  - checkout v6 keeps credentials in a separate file; ops-weekly's `git push` still works through the includeIf config.
  - upload-artifact v7 and cache v6 are ESM-only internally; no input changes.
- ci.yml:55 comment updated ("v4 and later" skip dot-folders; include-hidden-files kept).

## Verification
- astro check: 0 errors. Unit (after the CI checks build, PUBLIC_BG_REMOVE=1): 58 files, 1,252 passed.
- Builds with check-dist OK: dist-noauto (AUTOFRAME=0), dist-bg, dist-bgcloud (cloud + usage + GA test ID), dist
  (AUTOFRAME=1), and the checks build (BG on).
- e2e on Linux (WSL Ubuntu 24.04, Playwright 1.63, CI=1 so CI retries apply, 4 workers), split like the CI jobs:
  - chromium (+ manual, bg, cloud): 391 passed / 27 skipped, 0 flaky.
  - mobile-chrome (+ cloud): 349 passed / 25 skipped.
  - webkit (+ cloud): 341 passed, 1 flaky (goto), 6 failed. All 6 are test timeouts in hwp-viewer (5) and
    jpg-to-pdf:144 (40 photos); each of these tests took 3–7 min in WSL with 4 WebKit workers on 7.6 GB. Re-run with
    1 worker, retries 0: hwp-viewer + jpg-to-pdf 26 passed / 4 skipped, 0 failed.
  - mobile-safari (+ bg, cloud): 338 passed, 2 flaky (hwp-viewer timeouts), 1 failed (hubs axe over all guides,
    timeout). Re-run with 1 worker, retries 0: hubs + hwp-viewer 28 passed / 1 skipped, 0 failed.
  - firefox (+ manual, cloud): 357 passed, 16 flaky (all goto, see (g)), 0 failed.

## Open Questions
- (c2) is a harness setting, not a product change. If you would rather keep smooth scrolling on WebKit, the
  alternative is a settle-and-retry helper around every click that follows a scroll. pdf-sign and pdf-split already
  wait with `settled()`, which did not cover Playwright's own scroll.
- (d) changes what a user sees only when the menu is taller than the window; it then scrolls inside.

## Out of Scope (logged in BUILD-LOG)
- Firefox goto harness race (g).
- WSL WebKit is too slow for hwp-viewer at 4 workers; CI is fine.

---

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
