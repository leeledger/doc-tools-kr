# Review Feedback — TOOLS5 U2 (/pdf-split/)
Date: 2026-10-08
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/tools/pdf-split/controller.ts:872 + 309-310 (confidence: 8/10) — 「고른 쪽 빼기」 removes the chosen pages and clears
  their selection (`p.selected = false`, line 427), so `updateBulk()` sets `removeSel.disabled = !chosen` = true while the
  button still has focus. Chrome/WebKit drop focus to <body>; a keyboard / screen-reader user loses their place after a
  bulk remove. Single-row 빼기 is fine (focus restored via data-role="remove"). — After a bulk remove, move focus to
  `allBtn` when it is enabled, else to the first row's 되살리기 button (or the list). Add one e2e assertion on
  `document.activeElement` after bulk remove.
- src/tools/pdf-split/controller.ts:569 vs 630 (confidence: 8/10) — `showNotice('PDF 파일은 한 번에 하나만 … 첫 번째
  파일만 열었습니다.')` is set before opening, then `showNotice(fileNotice())` on a successful open replaces it (null for
  an ordinary file). The multi-file notice is only visible during "여는 중". — Keep a `multiNote` flag for this open and
  include it in `fileNotice()`; clear it in clearFile().
- src/tools/pdf-split/controller.ts:714-760 (confidence: 5/10, verify) — during save the pdf.js document stays open (its
  worker holds a full copy of the file), the main thread holds `bytes`, and each part posts another full copy to
  merge.worker; thumbnails may keep rendering meanwhile. On a phone at the 150 MB limit that is ~3 copies plus pdf-lib's
  parse. Not a correctness bug and pdf-merge's limits were set for one copy fewer. — Measure peak memory on mobile-chrome
  emulation with a 150 MB file; if it is tight, pause `pump()` while `state === 'working'` (cheap) and log the number.
- src/pages/pdf-split/index.astro:105 (confidence: 6/10) — when 「저장」 is disabled, the reason is only in #ps-hint, which
  the button does not reference. — `aria-describedby="ps-hint"` on #ps-run.

## Escalate to Architect
- Bob's logged deviations look intentional and reasonable; Arch to confirm: one-page part named `{base}_{p}.pdf` (brief
  `{first}-{last}`); a split that yields one part downloads a plain PDF, not a ZIP; `no-pages` whitelisted but never sent
  (button disabled instead of a fail event).
- CLAUDE.md line 3 tool list needs "PDF 나누기·쪽 편집" at commit (orchestrator rule, as Bob noted).

## Answers to Bob's open question
- hasSignature on a 500 MB input: acceptable. It walks `context.enumerateIndirectObjects()` of the document pdf-lib has
  already parsed (no second parse), runs only when `detectSignature` is set, and pdf-split asks only on k === 0, so it is
  once per save. pdf-merge never sets it, so its reports and timing are unchanged (`signed` absent).

## Cleared
Reviewed plan.ts (edit/extract/split over the edited document, per-line parseRange with line numbers, everyN short last
part, names), limits.ts, controller (selection, rotate, ↑↓/drag reorder, 빼기/되살리기, five save modes, parts cap, soft
confirm, encrypted/owner rule identical to pdf-merge inspect, cancel/pagehide/bfcache via runId + terminate, docId-guarded
lazy thumbnails at 64 CSS px × dpr ≤ 2 = 128 px, 2 in flight, caps 500/200), mergePlus/merge.worker opt-in signature
flag, ZIP naming with dedupeNames, usage events (mode only; no names, sizes, counts or ranges), page copy/FAQ numbers
from limits, check-dist laziness + budget, SW runtime page; pdf-split unit suite re-run 21/21 green.
