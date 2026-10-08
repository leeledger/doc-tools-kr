# Review Feedback — TOOLS5 U3 (/pdf-sign/)
Date: 2026-10-08
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/tools/pdf-sign/controller.ts:402 (confidence: 8/10) — `p.box = clampBox(p.box, info.width, info.height);` inside drawBoxes writes the current page's clamp back into the shared placement. A 모든 쪽 / 쪽 범위 placement on a mixed-size PDF (A4 + a smaller or landscape page) is permanently pulled in or shrunk just by paging past the smaller page, so the saved positions on the other pages depend on which pages the person looked at. toPdfRect (place.ts:120) already clamps per page at save time, so the stored box need not be mutated on view. Fix: keep the clamped box local for display (boxStyle with a clamped copy); write back only on an actual move/resize/key (setBox). Add a unit/e2e case: an 'all' placement on a two-size PDF keeps its page-1 position after viewing page 2.
- src/tools/pdf-sign/place.ts:87-90 (confidence: 7/10) — `const h = (w * box.h) / box.w;` then clampBox computes `aspect = box.h / box.w`. A corner drag that lands exactly on `start.w + dx === 0` (controller.ts:471) gives h = 0, aspect = NaN, and the NaN box sticks (Math.min/max propagate NaN) and reaches drawImage on save. Rare, but cheap: in resizeBox take the aspect from the input box and floor `w` at MIN_EDGE (or a small positive) before computing h; one unit case for w = 0 and w < 0.
- tests/unit/pdf-sign.test.ts:279-281 (confidence: 7/10) — the "unbalanced cm" test only asserts `Contents` has ≥ 3 streams; it would pass if the wrap were in the wrong order or the picture were drawn inside the leaking state. I verified the behaviour itself in pdf-lib (PDFPageLeaf.normalize → wrapContentStreams when autoNormalizeCTM, default on load), so this is a test-strength gap, not a bug. Assert the first stream is `q`, the original is second, a `Q` stream precedes the picture's stream, or render and check the picture's pixel position as the e2e does.

## Escalate to Architect
- /stamp-signature/ related list now has four links (index.astro:219: pdf-sign, photo-compress, hwp-to-pdf, pdf-merge); every other tool has three. Brief says only "gains pdf-sign". Keep four, or drop one?
- Placement model (one shared box per placement + 넣을 쪽 [이 쪽만 | 쪽 범위 | 모든 쪽]): it satisfies "같은 자리에 모든 쪽 / range" in decision 10. Per-page copies are not in the brief. Product call; I see no code reason to change it.
- CLAUDE.md line 3 still needs "PDF 서명·도장 넣기" (orchestrator-owned).

## Cleared
I reviewed the placement maths (toPdfRect through convertToPdfPoint on both corners, rotate = /Rotate counter-clockwise, CropBox origin, clamp; unit-tested against real pdf.js viewports at 0/90/180/270 × crop 0/36 and checked by pixels in e2e) and signPdf (one embedPng, drawImage per stamp, q/Q wrap confirmed in @cantoo/pdf-lib, the PDF/A-1 retry thrown before any mutation in save() so it is safe, page index checked, producer, encrypted input saved without a password, hasSignature taken before drawing). The merge.worker `sign` branch returns before the merge path, and the pdf-merge/pdf-split consumers only match 'done'/'error'/'progress', so they are unaffected. The sessionStorage hand-over is same-origin and tab-scoped, read once and removed even when invalid, strictly parsed as a PNG data URL and re-sniffed/decoded, and QuotaExceeded or blocked storage gives the brief's message without leaving the page. Keyboard and drag work (buttons, arrows 1/10 pt, Delete, slider with aria-valuetext). The honest "그림 서명" copy is first in 알아 두면 좋아요 and the FAQ. The signature warning and the no-password note with its link appear before 내려받기. Usage events carry only place/fail codes. Lazy controller and check-dist budget are fine. The test-only change is fine: fulfilling the stub with the real response's headers (CSP included) makes the e2e stricter, not looser.

---

# Review Feedback — TOOLS5 U3 round 2
Date: 2026-10-08
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- tests/e2e/pdf-sign.spec.ts:258-267 (confidence: 7/10) — likely cause of the unexplained failure, and a real CI flake risk. `open()` returns once `data-state` is `ready`, but the controller sets `ready` (controller.ts `setState('ready')` in openWith) *before* `showPage(0)` has rendered. `stage.style.width/height` are set only after `page.render` finishes. `pickImage()` waits only for `.sign-box` count 1, and the box can be drawn while the stage is still unsized, so `before = await rel()` can be taken against the container width rather than the page picture. The later `expect.poll(rel).toEqual(before)` then compares against a stale baseline and fails. A cold pdf.js load right after a rebuild fits that timing. Fix: before measuring `before`, wait until the page picture is drawn, e.g. `await expect(page.locator('#sg-stage canvas.sign-page')).toHaveCount(1)` and poll `rel` until two reads agree. Check whether other tests that measure the box right after `open` + `pickImage` need the same wait.
- src/tools/pdf-sign/controller.ts:496 (confidence: 8/10) — the arrow keys still start from the unclamped shared box: `setBox(p, moveBox(p.box, move[0], move[1], info.width, info.height));`. On a page where the box is shown clamped (e.g. x 414 on a 200-wide page), the first ArrowLeft computes x 413, clamps back to the same spot, and writes it, so the press does nothing visible and the keyboard behaves differently from the drag you fixed at :458. Fix: `moveBox(clampBox(p.box, info.width, info.height), …)`. The size slider at :942 (`resizeBox(p.box, …)`) has the same issue, less visibly; use the same shown box there.

## Cleared
Round 1 items 1–3 are fixed. drawBoxes now passes a display-only clamped copy (:403). The shared box changes only on an explicit move or resize. A drag starts from the box as shown (:458). 그림 바꾸기 reshapes without clamping (:581, place.ts:101-104). `edge()`/`aspectOf()` keep clampBox and resizeBox finite and at least MIN_EDGE, so a 0/negative/NaN/∞ width can no longer reach drawImage (place.ts:59-61,67-76,91-98), and the new unit cases cover it. The cm test now checks operator order and the exact CTM at paintImageXObject. On the flake: one failure in 14 runs is not noise to wave away, and the race above explains it. Fix the wait before this goes to CI.
