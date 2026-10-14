# Review Request — REQ1014-B (fewer tool failures)
Date: 2026-10-14
Ready for Review: YES
Status: DONE_WITH_CONCERNS (see Open Questions 1–2)
Branch: req-1014-b (base ee4950c), commits 25a2c3d..HEAD (7). Merges cleanly onto origin/main 5bac90a (REQ1014-C), checked with `git merge-tree`.
Brief: handoff/ARCHITECT-BRIEF-REQ1014-B.md (D1–D16 all built).

## Files Changed
- src/lib/file/sniff-format.ts (new) — byte-identical to req-a d26df38 (blob 651e149): FileFamily, sniffFormat(head, tail?), notHwpCode, corruptCode. D1.
- src/tools/hwp-shared/not-hwp.ts (new, lazy) — notHwpHelp (64 KB head + tail, never throws), D3 lines per tool, familyOf (CFB + worker not-hwp = office-old), showActions (「PDF 열기」 blob link revoked on reset/pick/pagehide, 「PDF 쪽 보기·나누기」 → pdf-split, 「사진 PDF 변환으로 열기」 → jpg-to-pdf), handTo (tracks next only after the store). D2–D4.
- src/tools/hwp-shared/session.ts — not-hwp path (page sniff unknown, or worker not-hwp with its container) → notHwp(); #hw-error-actions disposal on reset. D2/D5.
- src/tools/hwp-shared/boot.ts — receivers: pendingHandoff → start at once, receiveHandoff via dynamic import, file held until taken, sweepDue sweep. D6.
- src/tools/hwp-shared/watchdog.ts — deps.doc; hidden clears, visible re-arms a full window, stop() disarms; no doc = old behaviour. D8.
- src/tools/hwpx-to-hwp/controller.ts — keeps the picked File; stage start/engine/parse/export; onTimeoutPlan (one silent retry in start/engine, else phase load/parse/process); notHwp; #hx-error-links hand the file on (fallback: follow href); pageShift line; unverifiedCode. D2/D7/D9/D10.
- src/tools/hwpx-to-hwp/copy.ts — HX_COPY.pageShift.
- src/lib/hwp/export-hwp.ts, errors.ts, hwp.worker.ts — tolerance max(1, round(pagesIn × 5 %)), pagesOut ≥ 1, pageShift, HwpError.detail (pages | reopen | bytes) carried in the worker error. D10.
- src/pages/hwp-viewer, hwp-to-pdf, hwpx-to-hwp index.astro — #hw-arrived, #hw-error-actions; 「바로 보기」「PDF로 바꾸기」 links with data-to, #hx-error-actions, #hx-shift. D5–D7.
- src/lib/bgremove/cloud.ts — CloudKind on failed results (readAnswer 5xx/4xx/200-not-webp; requestCutout timeout vs network). D13.
- src/tools/remove-background/bg.ts, model.ts, copy.ts — cloudOnce + one retry after 1,200 ms for network/server/answer/load (cloudRetry, pure), run token checked after the wait; one cloud-<kind> fail; deviceOnce for #bg-device-retry (not remembered); new failed/deviceButton copy. D13/D14.
- src/tools/stamp-signature/auto.ts (new), photo.ts, copy.ts, src/pages/stamp-signature/index.astro — tip; ladder on the first result of a new photo at 진하기 0; a user change stops it. D15.
- src/tools/jpg-to-pdf/limits.ts, controller.ts, src/pages/jpg-to-pdf/index.astro — planAdd size param, too-big-file/too-big-total, auto 「줄이기」 notice, 「원본 그대로」 disabled + #jp-size-hint while over the cap. D16.
- src/lib/image/decode.ts — a resize-option non-RangeError rejection falls through to plain decode + shrink. D11.
- scripts/lib/usage.mjs — one `// REQ1014-B` block at the end of FAIL_LABELS (11 labels). D12.
- tests: unit not-hwp, stamp-auto, decode-fallback (new); hwp-tool (watchdog), hwp-export-hwp, hwpx-to-hwp, bgcloud, jpg-to-pdf (extended); e2e hwp-fixtures, helpers/hwp.ts, hwp-viewer, hwp-to-pdf, hwpx-to-hwp, remove-background.cloud, stamp-signature, usage.

## Gates (real numbers)
- astro check: 0 errors, 0 warnings, 6 hints (pre-existing).
- vitest (default dist, rebuilt last): 76 files, 1,555 / 1,555 passed.
- Build + check-dist OK: default precache 408.1 KB (base 407.3, +0.8), cloud flag-on (BG_REMOVE, BG_CLOUD, officer, contact, USAGE, GA test id, AFF_COUPANG=1) 416.2 KB (base 415.4), autoframe 410.3 KB (base 409.5), noauto 408.1, bg 411.3; all / 450.
- Budgets (base → now, from an ee4950c build on the same machine): jpg-to-pdf controller (lazy) 12.2 → 12.5 / 13.1 KB; stamp-signature controls 12.5 → 12.7 / 13.5 KB; initial JS /hwp-viewer/ 8.0 → 8.6, /hwp-to-pdf/ 8.1 → 8.6, /hwpx-to-hwp/ 8.0 → 8.5, /stamp-signature/ 8.7 → 9.2, /jpg-to-pdf/ 9.1 → 9.1 (all / 30 KB).
- UI font: core 613 → 614 (+펜, the D15 tip text from the brief), late 37 → 39 (+듭 「만듭니다」, +엑 「엑셀」). No U+FEFF.
- check:licenses OK (54 packages, 5 components, 0 exceptions).
- e2e full sweep (13 projects: 5 + manual-chromium + bg-chromium/bg-mobile-safari + cloud ×5; specs hwp-viewer, hwp-to-pdf, hwpx-to-hwp, chain, preload, site, polish, sw, id-photo, image-to-jpg, jpg-to-pdf, pdf-split, stamp-signature, remove-background, remove-background.cloud, usage; 4 workers, machine shared with other builders): 1,693 passed, 15 failed, 12 flaky, 158 skipped. The 15: 10 were B's own test bugs (cloud spec :169 ×5 used a 500 that is now retried; usage "502 then 200" ×5 used a photo whose shape disc.webp does not match) → fixed, re-run 15/15 passed; 2 = hwp-viewer JPG → jpg-to-pdf on webkit/mobile-safari (no OffscreenCanvas in Playwright WebKit on Windows) → skip like jpg-to-pdf/chain specs; 3 firefox (polish:330 UI font = the U+FEFF bug, fixed; image-to-jpg:224 and pdf-split:282 timeouts under load) → re-run 9/9 passed on firefox/chromium/webkit.
- e2e re-run after the fixes (hwp-viewer, hwp-to-pdf, hwpx-to-hwp, polish × 5 projects): 622 passed, 0 failed, 5 flaky (firefox axe / engine panel / footer timeouts; mobile-chrome hwpx-to-hwp:127 stayed "empty" once, passed on retry), 58 skipped.
- LHCI local, median of 5, default build, all assertions pass: LCP /hwp-viewer/ 1,670, /hwp-to-pdf/ 1,671, /hwpx-to-hwp/ 1,671, /stamp-signature/ 1,675, /jpg-to-pdf/ 1,671 ms; CLS max 0.0003.
- qa:visual: 472 PNGs, 0 hard failures.
- regress:hwp --fixtures-only: all pass (a first run under e2e load failed rule 6 timing, law10 8,696 ms > 4,000; idle re-run all pass). regress:ink 101/101. regress:photo 11/11 rows, 18/18 rules.

## Open Questions
1. ui-shared chunk +0.5 KB gzip: boot.ts (in ui-shared via astro.config manualChunks) now imports handoff-marker and announce statically (D6 asked for a static pendingHandoff). Every page that loads ui-shared pays it (stamp-signature 8.7 → 9.2 KB, not a receiver). Within all budgets and LHCI; the alternative is to keep handoff-marker out of ui-shared (a tiny chunk on the 2 receiver pages, +1 request). Arch call.
2. Merge with -A: sniff-format.ts is identical (no conflict). scripts/lib/usage.mjs (both append a FAIL_LABELS block at the end) and tests/e2e/usage.spec.ts (both append at the end) conflict textually in `git merge-tree` against req-a HEAD; resolution is "keep both". No conflict with origin/main 5bac90a (C).
3. Codes follow -A's notHwpCode, not the brief's fallback list: text → not-hwp-text, xlsx/pptx → not-hwp-office, CFB → not-hwp-cfb (labels are in -A's block). The brief said to use -A's when it exists.
4. jpg-to-pdf total-cap auto 「줄이기」: unit only (planAdd, messages, codes); no e2e (the spec has no cheap way past 150 MB).

## Unverified claims
- U1 (blob PDF tab): the e2e accepts "opens a blob: tab OR downloads" on all 5 projects and records an annotation `U1 popup=… shown=… downloaded=…`; all 5 passed, so the `download` fallback was not added.
- U2 (Android Chrome blob PDF), U3 (iOS < 16.4 403 origin, now visible as cloud-refused): owner phone / post-deploy admin.
- The 85 % success targets: 7-day admin after deploy.

## Out of Scope (logged in BUILD-LOG)
- Temporary C:\dev\doc-tools\reqb-base (ee4950c checkout for the font/size A/B) could not be deleted: a serve.mjs on :4391 holds it. Worktree registration removed; delete the folder once that process ends.
