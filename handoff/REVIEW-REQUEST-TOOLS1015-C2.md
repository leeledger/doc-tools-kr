# Review Request — TOOLS1015 tool 2: /id-copy/ 신분증 사본 만들기 (I1) + guide id-card-copy (I2)
Date: 2026-10-15
Ready for Review: YES
Status: DONE
Commits (branch tools-1015, not pushed): I1 `9c57b9f` (tool, I0 sourcing log); I2 = the commit after it (guide only). They ship independently: I1 alone is complete without the guide.
Brief: handoff/ARCHITECT-BRIEF-TOOLS1015.md §I. BUILD-LOG: "TOOLS1015 I0", "TOOLS1015 I1", "TOOLS1015 I2".

## Files Changed
I1
- src/tools/id-copy/mask.ts:1-184 — pure geometry (clampRect / moveRect / resizeRect / startMask / turnRect, coverPixels) and the one drawing pass `drawCopy` (133-157: photo → black boxes widened to whole pixels → watermark), `pdfRequest` (179) = the copy's JPEG only.
- src/tools/id-copy/watermark.ts:1-63 — lines 「{place} 제출용」/「다른 용도 사용 금지」/date, tile grid covering the turned canvas, fixed names.
- src/tools/id-copy/limits.ts — image-to-jpg single-photo limits and caps; decode edge 2,000; JPEG 0.9.
- src/tools/id-copy/controller.ts:109-129 decode (≤ 2,000, page-canvas shrink without OffscreenCanvas); 235-440 stage (preview = drawCopy, box handles, drag, keys, crop mode, rotate); 449-510 open (size, sniff, heic/corrupt/not-image); 524-640 run → JPG → images.worker PDF → finish (fixed names, next steps); 651-732 reset, pagehide release, wiring.
- src/tools/id-copy/entry.ts, id-copy.css, src/pages/id-copy/index.astro — lazy controller, inlined CSS, markup and static copy.
- src/data/tools.ts:607-650 — tool entry (FAQ 6, numbers from limits); og.json, site.ts (HOME_DESC_ORDER pdf-sign → id-copy → char-count), guides.ts NEXT_GUIDES, tool-facts.ts, next-steps.ts:24,44 (FLOW), usage.ts + scripts/lib/usage.mjs (TOOLS, `mark` on/off, labels), gen-sw.mjs + sw.ts (not precached, runtime page), bgcloud.mjs, lighthouserc.json, qa/visual.mjs, CLAUDE.md, docs/COPY.md.
- scripts/check-dist.mjs:648-663 — controller lazy, no pdf-lib/images.worker in initial JS, budget 15.9 KB (13.2 measured).
- src/content/guides/kosaf-docs.md, univ-docs-upload.md — one-sentence body link to /id-copy/ (updated 2026-10-15).
- tests: unit id-copy.test.ts (new), usage/next-steps/polish/postbuild/bgcloud; e2e id-copy.spec.ts (new), site/polish lists, usage.spec (cloud beacon test).
I2
- src/content/guides/id-card-copy.md — the guide (5 sourced quotes, 5 FAQ).
- src/data/tool-guide-order.ts:21-22 (pin), src/data/guides.ts:73, src/data/tools.ts (FAQ link to the guide), tests/unit/guides-schema.test.ts (partial list), scripts/lib/guide-titles.mjs (regenerated), kosaf-docs/univ-docs-upload (link to the guide: link graph).

## Gates
astro check 0/0; vitest 81 files / 1,717 passed; check:licenses OK; check:quotes --exact 248 verbatim; check-dist OK on default, AUTOFRAME=1, cloud flag-on (precache 418.0 / 420.3 / 427.6 KB of 450); 0 new core glyphs (core 615, preloaded 94,276 B / 94,884 B); e2e id-copy 5 projects green (HEIC skipped on webkit), site+polish+growth(+hubs) chromium/mobile-chrome/webkit 505 passed; usage cloud 1 flaky on cloud-firefox (download event once, green 10/10 on repeat); LHCI /id-copy/ LCP 1,668-1,670 ms, guide 1,674 ms, all categories 1.

## Open Questions
- Leak path: please check drawCopy order and coverPixels (a box edge on a fractional scale), and that the PDF is built only from the JPEG blob (pdfRequest; canEmbedRaw path, no second source).
- Guide wording: every advice sentence is either the brief's 「가려도 되는지 먼저 물어보세요」 or attributed (금감원, 정부24, 법 제24조의2). Is the 제24조의2 paraphrase 「법령에 근거가 있는 경우 등을 빼면 개인정보처리자가 주민등록번호를 처리할 수 없게 정하고 있어요」 acceptable to you?
- Tool order: placed after id-photo in TOOLS (photo group). HOME_DESC_ORDER as the brief.
- Empty file uses usage code `corrupt` (brief's code list has no `empty`).

## Out of Scope (logged in BUILD-LOG)
- Brief Known Gaps for I: PDF input, auto-detection/OCR, blur/mosaic, real-size card print, two sides on one page.
- Inbound link skipped: id-card-photo (off-topic), work24-resume-upload (draft, no body).
- O3 real-phone check (iPhone HEIC, Android photo) is owner-only.
