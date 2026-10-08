# Review Request — TOOLS5 U2
Date: 2026-10-08
Ready for Review: YES. Status **DONE** (everything green; two notes for Arch below). Not committed, not pushed.
Brief: handoff/ARCHITECT-BRIEF-TOOLS5.md (U2 /pdf-split/ PDF 나누기·쪽 편집; decisions 2-6, 9, 11-13).

## Files Changed
New
- src/tools/pdf-split/plan.ts:1-114 — pure plan: PageState list (order, extra rotation, removed, selected) → mergePlus `pages`/`rotate` for 편집/추출; `parseParts` (one part per line, `parseRange` per line, line number on error), `everyN`, `splitPlans` (split modes count pages of the edited document), `parseSize`, `turn`, `move`, names.
- src/tools/pdf-split/limits.ts:1-43 — PDF 합치기 limits for one file (500 / 150 MB, soft 200 MB·1,500쪽 / 50 MB confirm with split wording), thumbnail cap PC 500 / phone 200 pages, parts cap 500 / 100.
- src/tools/pdf-split/controller.ts:244-293 — `currentPlan`/`updateRun`: mode → parts or the one blocking message (no pages left, nothing picked, range error, bad size, too many parts); field error shown once (not repeated in the hint).
- src/tools/pdf-split/controller.ts:330-460 — page list: rows (drag handle, page picture, pick box + position, 원래 N쪽 / N° 돌림, 돌리기 / ↑ / ↓ / 빼기↔되살리기), reorder via `startRowDrag` + `move`, bulk 모두 선택 / 고른 쪽 돌리기 / 고른 쪽 빼기.
- src/tools/pdf-split/controller.ts:468-525 — page pictures: IntersectionObserver (300 px margin), max 2 renders in flight, `renderPageThumb(doc, src, 64, 64)`, cached per source page, CSS rotate for the extra rotation, dropped with the document (docId guard).
- src/tools/pdf-split/controller.ts:540-665 — open / password / owner-only note: mirror of pdf-to-jpg's single-file open and pdf-merge's encryption rule.
- src/tools/pdf-split/controller.ts:679-835 — save: soft-limit confirm; one merge.worker, one request per output PDF (buffer copy each, `detectSignature` on the first), StoredZip with `dedupeNames`; 1 part → plain PDF; result notes (signature warning, no-password note); cancel = terminate.
- src/tools/pdf-split/entry.ts:1-48 — lazy controller on first interaction (pdf-to-jpg entry).
- src/pages/pdf-split/index.astro:1-177 — page (hero, picker, password form, bulk row, list, 저장 방식 chips, range textarea with example, 몇 쪽씩 field, confirm, result, 사용 방법, 알아 두면 좋아요, FAQ, related pdf-merge / pdf-compress / pdf-to-jpg).
- tests/unit/pdf-split.test.ts:1-210 — 21 tests: plan, split syntax (valid, overlapping, reversed, out of range, junk, ";" rejected, empty part), every-N incl. short last part, names, limits, mergePlus one input + subset (outlines, rotation, signature, encrypted).
- tests/e2e/pdf-split.spec.ts:1-274 — 10 tests: delete 2 / turn 3 / move 5 first → 4 pages in order with /Rotate; extract 2-3 + bulk turn; range split 1-2 / 3-5, 한 쪽씩 (5 entries), 몇 쪽씩 2; typo messages + all removed; encrypted; signed + owner-only note; thumbnails + not-PDF; axe (list + result); mouse drag; controller/pdf.js/pdf-lib not loaded with the page.

Changed
- src/lib/pdf/mergePlus.ts:25,44-45,50-51,290 — `detectSignature` option → `report.signed` (hasSignature on each loaded source). Only set when asked: pdf-merge reports unchanged.
- src/lib/pdf/merge.worker.ts:11-14,22-23,52-55 — WorkerFile `pages` / `rotate`, request `detectSignature`, passed to mergePlus. merge.worker 248,047 → 248,279 B gzip (+232, signature.ts); no budget line exists for it.
- src/data/tools.ts:9,67-76,360-399 — registration (after pdf-password), FAQ 6 with numbers from limits.ts.
- src/data/og.json, src/data/site.ts (HOME_DESC_ORDER after pdf-password), src/data/tool-facts.ts (4 facts), src/data/guides.ts (NEXT_GUIDES: univ-docs-upload, pdf-merge, email-attachment-limit).
- scripts/lib/usage.mjs:43,62-65,269,297,319,361-365 + src/lib/ui/usage.ts — tool, `SETTINGS.save` (edit/extract/ranges/every/each), labels, `no-pages` label.
- scripts/gen-sw.mjs NOT_PRECACHED, src/sw/sw.ts RUNTIME_PAGES, scripts/lib/bgcloud.mjs LOCAL_SCOPE_RE, lighthouserc.json, scripts/qa/visual.mjs.
- scripts/check-dist.mjs:202-217 — /pdf-split/ controller lazy, initial JS free of pdf.js / pdf-lib / merge.worker / ZIP, controller budget 20.8 KB (17.3 measured + 20 %).
- src/styles/app.css:192-204,226-228,236 — `.page-list` rows (64 px square picture; two-row layout ≤ 520 px, 56 px ≤ 400 px), removed dimming (picture only), bulk row, textarea, scroll-padding under the sticky bar for #ps-tool.
- docs/COPY.md:65 — "쪽 그림", 빼기 / 되살리기 / 돌리기.
- tests: site.spec, polish.spec, usage.spec (new pdf-split test), unit usage / admin-view / polish / bgcloud / postbuild lists; usage.test "unknown tool" example moved from pdf-split to pdf-ocr.

## Decisions (logged in BUILD-LOG)
- Range syntax: **one PDF per line** (textarea, example under it); ";" is a junk error. Within a line the existing `parseRange` syntax ("1-3, 5").
- Split modes and 고른 쪽만 count pages of the **edited** document (the list's 1쪽, 2쪽 …); each row shows "원래 N쪽" when it differs.
- 빼기 marks a row (dimmed, "빼는 쪽") with 되살리기 instead of deleting it.
- One-page part name `{base}_{p}.pdf` (brief: `{first}-{last}`); a split giving one part downloads that PDF, not a ZIP.
- `no-pages` is whitelisted with a label but never sent (the button is disabled when no page is left).

## Open Questions
- Richard: merge.worker now runs hasSignature on every input when asked; pdf-split asks on the first part only. Is the extra full-object walk acceptable on a 500 MB input?
- Arch: CLAUDE.md line 3 tool list not touched (orchestrator rule) — needs "PDF 나누기·쪽 편집" at commit.
- e2e test hardening: `mode()` confirms the radio is checked and `settled()` waits for the smooth scroll to stop before clicks (WebKit under 8 workers and Firefox misclicked during layout shift / smooth scroll otherwise). Product behaviour unchanged.

## Gates
astro check 0 errors; unit 57 files 1,231 passed; builds default / auto-frame / bg / cloud+GA: check-dist OK in all (initial JS /pdf-split/ 8.3 KB, 9.1 cloud; controller 17.3 / 20.8 KB; precache 425.1 / 427.3 / 428.5 / 431.4 KB / 450). New core glyphs: none (preloaded core 92,884 / 93,380 / 93,044 / 93,044 B; margins 2,000 / 1,504 / 1,840 / 1,840 B under 94,884). e2e retries 0: pdf-split + site + polish + growth on chromium + mobile-chrome + webkit 404 passed / 11 skipped / 2 failed → both re-run green (webkit misclick fixed in the test; mobile-chrome ERR_NO_BUFFER_SPACE network flake); pdf-split ×2 repeat on chromium + mobile-chrome + webkit + mobile-safari 71 passed / 4 skipped; firefox serial 10/10; usage cloud-chromium + cloud-mobile-chrome + cloud-webkit 24 passed / 3 skipped; pdf-merge regression 18 passed / 3 skipped. Lighthouse (local lhci, dist-bg, 5 runs): /pdf-split/ LCP median 1,664 ms (1,663–1,686), perf 1.00, a11y 1.00, CLS 0; /pdf-merge/ 1,814 ms.

## Out of Scope (logged in BUILD-LOG)
- Firefox parallel download-event flake (environment, as U1); qa:visual not run (manual screenshots 360 light/dark + 1280 checked).
