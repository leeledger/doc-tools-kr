# Review Request — EN0 (message catalogs for pdf-merge, pdf-compress, image-to-jpg)
Date: 2026-10-13 (rebased onto origin/main f0082d4, REV3)
Ready for Review: YES
Status: DONE
Branch: en0 (worktree C:\dev\doc-tools-kr\.claude\worktrees\agent-ad930363e3195de73), base origin/main f0082d4.
Orchestrator decision (2026-10-13): EN0's JS growth (+1.8 % / +2.7 % / +1.8 %) is accepted as long as check-dist
budgets pass; no property-mangling config change. REV3 moved /hwp-to-pdf/ out of the precache, so the cloud gate passes.
Rebase: no conflicts; REV3's `trackOut` import/call in pdf-merge/controller.ts and the OutLinks block on the page are kept.

## What changed
Every string the three controllers show now comes from a catalog argument: `initMergeTool(m)`, `initCompressTool(m)`,
`initImageToJpg(m, pending)`. Korean catalogs `src/tools/<tool>/messages.ko.ts` export `interface Messages` and
`KO = {...} satisfies Messages`. No default-to-KO parameter on any in-scope controller, no runtime lang lookup. Workers
untouched (all text-free: merge, compress, webp, photo workers return codes only; checked).

Shared libs stay usable by the out-of-scope Korean tools without edits: each gets an explicit-catalog variant and
the old name becomes a one-line Korean wrapper (no default parameters):
- engine-load: `EngineMessages`, `ENGINE_KO`, `pickEngineCopy(m, deps)`; `engineErrorCopy(deps)` = KO wrapper.
- engine-error: `showEngineErrorIn(m, reload?)`; `showEngineError(reload?)` = KO wrapper.
- next-steps: `NextMessages`, `NEXT_KO`, `showNextStepsIn(m, ...)`; `showNextSteps(...)` = KO wrapper.
- format.ts `formatPages`, pdf-pick `nonPdfMessage`, lib/image `ERRORS`, convert `noteText`, tool format/target helpers:
  unchanged; the KO catalogs reference them (`pages: formatPages`, ...), one source.
- limits.ts (3 tools): logic stays, messages leave. Each check takes a required `LimitCopy` (`m.limits`).

## Files Changed
- src/lib/ui/engine-load.ts:58-84,87-121 — ENGINE_COPY replaced by `ENGINE_KO` (literals + /*@__PURE__*/ body() so the workers that import isEngineLoadFailure drop it; with plain property reads they grew 0.2-0.5 KB); `pickEngineCopy(m)`; `engineErrorCopy` is the KO wrapper.
- src/lib/ui/engine-error.ts:4-29 — `showEngineErrorIn(m)`; `showEngineError` KO wrapper.
- src/lib/ui/next-steps.ts:58-67,111-154 — `NextMessages`, `NEXT_KO`, `showNextStepsIn(m)`; `showNextSteps` KO wrapper.
- src/lib/ui/password.ts:4-9 — `passwordToggle(field, label)`; only caller is pdf-merge (outside the brief's lib list, 2 lines).
- src/tools/pdf-merge/messages.ko.ts (new) — Messages + KO, moved verbatim from controller.ts / limits.ts.
- src/tools/pdf-merge/controller.ts — `initMergeTool(m: Messages)`; all literals -> `m.*`; preload local `m` renamed `mod`.
- src/tools/pdf-merge/limits.ts:20-51 — `LimitCopy`; checks take `copy`.
- src/tools/pdf-compress/messages.ko.ts (new) — as above; level-copy.ts untouched (CORE_PATH, page markup).
- src/tools/pdf-compress/controller.ts — `initCompressTool(m: Messages)`; MESSAGES/PHASE_TEXT/TARGET_COPY/literals -> `m.*`.
- src/tools/pdf-compress/limits.ts:21-58 — `LimitCopy`; checks take `copy`.
- src/tools/image-to-jpg/messages.ko.ts (new) — as above.
- src/tools/image-to-jpg/controller.ts — `initImageToJpg(m, pending?)`; run-error map built from `m` inside init; `.map((m) =>` locals renamed `r`.
- src/tools/image-to-jpg/limits.ts:21-27,41-68 — `LimitCopy`; `planAdd(..., copy)`.
- src/tools/image-to-jpg/entry.ts — `startImageToJpg(engine, loadController)` instead of top-level side effects.
- src/tools/image-to-jpg/ko/controller.ts (new) — Korean binding `init = (p) => initImageToJpg(KO, p)`. Why a file named
  controller.ts in ko/: it is the lazy entry, so controller + KO stay ONE chunk named controller*.js (check-dist finds
  the image-to-jpg controller by that name). A separate dynamic import of the catalog would split
  lib/image/messages + next-steps into a third shared chunk (2 extra requests on first interaction).
- src/pages/pdf-merge/index.astro:130-131, pdf-compress/index.astro:204-205 — `import { KO } ...; init*(KO)`.
- src/pages/image-to-jpg/index.astro:135-137 — `startImageToJpg(ENGINE_KO, () => import('.../ko/controller'))`.
- tests/unit/messages-ko.test.ts (new) — every KO value vs the pre-EN0 literal (sample args for functions); shared
  entries are the same objects (one source).
- tests/unit/helpers.test.ts, compress-helpers.test.ts, image-to-jpg.test.ts — call sites pass `KO.limits` (assertions unchanged).
- tests/unit/polish.test.ts:12,92,105,114 — `ENGINE_COPY.x` -> `ENGINE_KO.x.title` (ENGINE_COPY removed).

## Verification vs a fresh f0082d4 baseline (builds pinned to one build-id via CF_PAGES_COMMIT_SHA)
- Korean HTML: default 60 files: 46 byte-identical, 14 identical after hashed-asset normalization, 0 other.
  Cloud (BG_REMOVE, BG_CLOUD, USAGE, GA test id, AFF_COUPANG=1) 62 files: 47 byte-identical, 15 hash-only, 0 other.
- Fonts: all four anolim-ui woff2 (core 400/800, late 400/800) carry the baseline content hashes (same bytes).
- Workers: same gzip bytes as baseline (ENGINE_KO uses literals + /*@__PURE__*/ so workers importing engine-load drop it).
- check-dist: OK on default and cloud. gen-sw precache: default 404.6 -> 407.2 KB, cloud 412.5 -> 415.2 KB (/450).
- vitest: 68 files / 1427 tests passed. astro check: 0 errors, 0 warnings (6 pre-existing hints).
- e2e default build, pdf-merge + pdf-compress + image-to-jpg on chromium + mobile-chrome: 56 passed, 4 skipped, 0 failed.
  (Pre-rebase, the same three plus polish/chain/preload on chromium + mobile-chrome + webkit: 293 passed, 0 failed,
  3 webkit flaky passed on retry.)

## Budgets vs baseline (exact gzip bytes, check-dist measure; default / cloud)
- initial JS /pdf-merge/: 17,938 -> 18,264 B (+1.82 %) / 18,838 -> 19,151 B (+1.66 %)
- initial JS /pdf-compress/: 17,620 -> 18,124 B (+2.86 %) / 18,553 -> 19,018 B (+2.51 %)
- image-to-jpg controller (lazy): 20,158 -> 20,525 B (+1.82 %) / 20,186 -> 20,551 B (+1.81 %)
- every other page <= +0.45 % (most +16..20 B); pdf-split / pdf-sign lazy controllers -319 / -340 B (pdf-merge/limits
  lost its Korean messages). Cause of the three: the minifier keeps catalog property names (key at definition + `m.key`
  at use). All budgets pass (30 KB / 22 KB limits).

## Open Questions
- Share.astro / EngineError.astro not changed: EngineError.astro has no text; EN1 step 2 creates EN components under
  src/i18n/en/components/, so a props refactor of Share.astro would touch 14 Korean pages + Guide/Hub layouts (guides
  are being edited in parallel) for no EN benefit. Confirm, or EN1 does it.
- ko/controller.ts naming trick (above): acceptable, or would you rather check-dist find the controller another way (EN1)?

## Out of Scope (Known Gaps for EN1/EN2)
- lib/ui/format.ts `safeFileName` falls back to `문서` for an empty base name (EN file names); formatSize/formatMB use
  ko-KR number format (same digits as en-US).
- lib/ui/handoff.ts ARRIVED / TAKE_FAILED (pdf-compress receives handoffs) — EN2 chain.
- lib/ui/quicklinks.ts announcement (pdf-compress binds quick links) — Korean `규격` text.
- KO catalog mark for en-check (c) — EN1.
- BUILD-LOG.md not edited (shared with parallel builders); these gaps live here until Arch merges.
