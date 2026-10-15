# Review Request — REQ1015 steps 1–4 (HEIC interim copy, admin AI referrers, 해당 없음, PDF→JPG stage codes + reopen)
Date: 2026-10-15
Ready for Review: YES
Status: DONE_WITH_CONCERNS (two gate-forced copy deviations in step 1; the step 4 reopen branch is unit-tested through pure helpers only)
Branch: req-1015 (worktree C:\dev\doc-tools-kr\wt\req-1015), base origin/main 807d8b8. Brief: handoff/ARCHITECT-BRIEF-REQ1015.md. Steps 5–6 not built (they wait for the owner's HEIC samples).

## Commits (one per step, each deployable alone)
- 4a14c12 step 1 · 058ab5e step 2 · 46bbccd step 3 · d9c1a04 step 4

## Files Changed
- src/lib/image/messages.ts:42 — ERRORS.heic = brief text verbatim (shared by every photo tool; e2e substring kept).
- src/data/tools.ts:283,493,521,592,628 — HEIC FAQ answers (deviation, see Open Question 1); :514 image-to-jpg summary (feeds llms.txt).
- src/content/guides/heic-to-jpg.md:6,8,35-38,58-70 — one-sentence answer, updated 2026-10-15, F5 USB quote as a source, new section 「PC에서 HEIC가 열리지 않을 때」 (the old 「보낼 때 저절로 바뀌는 경우」 is folded into it).
- src/i18n/en/tools/image-to-jpg.ts:16, src/i18n/en/tools.ts:105,108,114 — EN error, description (155 limit; dropped "never uploaded"), summary, FAQ.
- scripts/check-dist.mjs:577-581 — guide/heic-to-jpg and llms.txt must not carry the old unconditional HEIC sentence.
- scripts/lib/visits.mjs:49-60 (AI_SERVICES), 430-475 (aiServiceOf, referrerLabel, aiReferrers), 510 (shapeVisits.ai).
- scripts/lib/admin-view.mjs:112-117 (aiSection), 216 (AI_PARTIAL_NOTE), 271 (s-ai after s-referrers).
- scripts/ops/growth.mjs:100 (visits.ai carried), 115-121 (aiLine), 128 (the line after 방문 7일).
- scripts/lib/usage.mjs:514-520 (DEEP_LINK_TOOLS, NO_DEEP_LINK), 651 (arrivals cell), 432-438 (6 PDF→JPG FAIL_LABELS).
- src/tools/pdf-to-jpg/guards.ts:7-57 — RunStage, RunError, WORKER_GONE (pdf.js 6.3.289 messages), runErrorCode(err, isOom, stage), afterRunError, reopenPlan.
- src/lib/pdf/inspect.ts:49-63 — resetPdfJsWorker() (destroys the shared worker directly; resetPdfJs callers unchanged).
- src/tools/pdf-to-jpg/controller.ts:20, 110-114 (stale / lastFail / lastPassword), 180-182 (cleared in clearFile), 262 (lastPassword on open), 275-328 (openFailed shared by openWith and the new reopen), 374-490 (run: reopen when stale, stage tracking, one auto-retry on worker-gone, final-failure usage + message).
- Tests: tests/unit/visits.test.ts:688-780 (aiServiceOf all hosts/apps/www/case/negatives, referrerLabel, aiReferrers, shapeVisits.ai below top 10, s-ai section incl. escaping/empty/partial, weekly line); tests/unit/usage.test.ts:1327-1344 (DEEP_LINK_TOOLS = DEEP_PARAM keys, 해당 없음 vs 75%); tests/unit/pdf-to-jpg.test.ts:150-204 (stage codes, CODE_RE + labels, pinned pdf.js messages, afterRunError, reopenPlan); tests/e2e/pdf-to-jpg.spec.ts:210-241 (two 작게 runs in a row; cancel then 작게 converts).

## Gates (2026-10-15, local Windows)
- astro check 0 errors / 0 warnings (6 hints). vitest 79 files / 1,676 passed. check:licenses OK (no new dependency). check:quotes --exact 241 verbatim.
- check-dist OK on BG_REMOVE, cloud flag-on and AUTOFRAME builds. Precache cloud 421.2 -> 421.8 KB / 450. Initial JS unchanged (base 807d8b8 vs head, KB gzip): image-to-jpg 10.4, jpg-to-pdf 10.5, photo-compress 23.9, id-photo 14.3, pdf-to-jpg 10.3. pdf-to-jpg lazy controller 13.2 -> 13.7 / 14.5. UI fonts preloaded 92.6 KB / 92.66 (unchanged from base).
- e2e (E2E ports 4573/4581/4582/4583): chromium + mobile-chrome on image-to-jpg, jpg-to-pdf, pdf-to-jpg, en, site + cloud-chromium usage.spec: 264 passed, no-upload fixture on every spec.

## Open Questions
1. Step 1 FAQ wording: the brief's 「PC의 크롬·엣지에서는 … 앞으로 찍을 사진」 adds 롬·엣·앞 to the preloaded core font and fails the 92.66 KB tripwire (92.7 KB). Built as 「PC에서는 열리지 않는 경우가 많아요 … 새로 찍을 사진」 in src/data/tools.ts only; the guide keeps 크롬·엣지 (system-font prose). Arch: accept, or decide the font budget.
2. Step 4: reopen does not await the old document's destroy (on a dead worker pdf.js waits forever for "Terminate"). Please check the cancel-during-reopen path (controller reopen(): keeps the fresh doc when the bytes are the same, drops it on new file/reset).
3. Step 4 controller wiring (stale -> reopen, worker-gone -> one retry) has no test that drives it end to end: no deterministic way to kill the pdf.js worker without a production hook. Covered by the pure helpers + the two new e2e runs.

## Out of Scope (logged in BUILD-LOG Known Gaps)
- ~20 bytes of core-font headroom left; step 7 copy needs a font decision.
- A pdf.js worker that dies silently leaves getPage pending (no per-page timeout).
- AI counts limited to the referrer top 50 (partial note).
