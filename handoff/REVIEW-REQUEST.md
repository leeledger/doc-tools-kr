# Review Request — TOOLS1015 C1 (/char-count/ 글자수 세기)
Date: 2026-10-15
Ready for Review: YES
Status: DONE
Branch: tools-1015 (worktree C:\dev\doc-tools-kr\wt\tools-1015), base origin/main a7d76b8 + scout report. Brief: handoff/ARCHITECT-BRIEF-TOOLS1015.md (C1 only; I0–I2 and E0–E2 not started). Gate numbers and decisions: handoff/BUILD-LOG.md "TOOLS1015 C1".

## Files Changed
- src/tools/char-count/count.ts:1-112 — pure counts (graphemes line by line with a fast path, code-point fallback, byte rules per code point, lines/paragraphs), parseGoal, goalStatus wording.
- src/tools/char-count/controller.ts:1-159 — textarea → one rAF recount, goal bar (progress, over state, one aria-live line per crossing), copy + select-all fallback, 지우기 + one undo, beforeunload only while non-empty, usage pick / start (basis) / next.
- src/tools/char-count/entry.ts:1-7 — startUsage + init (no lazy split, page script 1.9 KB gzip).
- src/tools/char-count/char-count.css:1-26 — page-only styles, inlined.
- src/pages/char-count/index.astro:1-140 — page: textarea, six numbers, goal fieldset, actions, 「자소서를 다 쓴 다음에는」 chain (published guides only), howto, FAQ, RelatedTools; JSON-LD WebApplication + FAQPage.
- src/data/tools.ts:767-807 — the tool entry (last in TOOLS), 5 FAQ with preset/guide links.
- src/data/og.json:21, 41 — share image line and page description.
- src/data/site.ts:44 — HOME_DESC_ORDER after pdf-sign (id-copy will go between).
- src/data/guides.ts:56-57, 71 — NEXT_GUIDES char-count (work24-resume-upload is a draft: skipped until published).
- src/lib/ui/usage.ts:13, 28-29 — UsageTool + basis setting type.
- scripts/lib/usage.mjs:48, 71-72, 74, 354, 457, 510-513 — TOOLS, COUNT_BASES, SETTINGS.basis, TOOL_LABELS, SETTING_LABELS, VALUE_LABELS.
- scripts/check-dist.mjs:648-663 — char-count block: one page-script chunk, no Web Storage/IndexedDB in it, budgets 2.3 KB and 13.9 KB gzip.
- scripts/gen-sw.mjs:56, src/sw/sw.ts:33 — NOT_PRECACHED + RUNTIME_PAGES.
- scripts/lib/bgcloud.mjs:64 — LOCAL_SCOPE_RE += char-count.
- lighthouserc.json:21, scripts/qa/visual.mjs:43 — URL lists.
- src/content/guides/resume-photo.md:8, 53-54 — updated 2026-10-15, one body sentence linking /char-count/.
- CLAUDE.md:3, docs/COPY.md:69 — tool list; byte / 공백 wording rule.
- tests/unit/char-count.test.ts:1-152 — test map C (empty, ASCII, Hangul, mixed, CRLF, tab/NBSP/U+3000, ZWJ family both ways, NFD jamo, lines/paragraphs, lone surrogate, TextEncoder equality, 100k < 50 ms, goal wording, tools.ts copy rules).
- tests/e2e/char-count.spec.ts:1-151 — six numbers, Segmenter probe, goal/basis/announcement, copy (Chromium) + fallback, clear/undo, beforeunload count, storage untouched, saramin/jobkorea presets, SEO.
- tests/e2e/usage.spec.ts:271-291 — cloud: pick, start (basis), next (id-photo); no text, count or goal in any body.
- tests/e2e/site.spec.ts, tests/e2e/polish.spec.ts, tests/unit/{polish,postbuild,bgcloud,usage}.test.ts — page lists, 15 cards, related three, sitemap, OG list, SW pages, HOME_DESC_ORDER position, usage labels.

## Gates
astro check 0 errors · vitest 80 files / 1,697 passed · check:licenses OK (no new package) · check:quotes --exact 241 verbatim · check-dist OK default / AUTOFRAME / cloud flag-on · precache default 414.9, autoframe 417.9, cloud 425.1 KB / 450 · 0 new core glyphs, preloaded 94,864 / 94,884 B (margin 20 B) · e2e char-count 5 projects green; site/polish/growth chromium + mobile-chrome + webkit green; usage.spec cloud ×5 green · LHCI /char-count/ median perf 1.00, LCP 1,700 ms.

## Open Questions
- Copy deviations forced by the font rule (BUILD-LOG decision 1): the brief's description 「…남은 양도 보여 줘요」 has 줘, which is not core; shipped 「…목표까지 남은 글자 수도 보여요.」 (60 chars). Chain heading 「자소서를 다 쓴 다음에는」 (썼 not core). Please confirm the wording is acceptable.
- count(): the fast path skips the segmenter for lines without joining characters (SIMPLE_RE in count.ts:46). Please check the excluded ranges are enough for Korean/Latin text (Thai/Indic spacing marks are \p{M}, so they take the segmenter path).
- Lines: a trailing line break counts as a new line ("abc\n" = 2 줄). The brief says "split on \n"; this is that literal reading.
- Precache cloud +3.3 KB (menu entry + home card in every precached page), 24.9 KB left.

## Out of Scope (logged in BUILD-LOG)
- work24-resume-upload is a draft (frontmatter only): no inbound link added; it appears in the chain and 관련 안내 when published.
- C Known Gaps: several 문항, 원고지, 단어 수, `?goal=`, draft saving. qa:visual not run this step.
- Tools 2–3 (id-copy, pdf-edit) not started.

## Round 2 (2026-10-15, after REVIEW-FEEDBACK-TOOLS1015-C1.md)
- src/tools/char-count/count.ts:41-50 — SIMPLE_RE excludes astral code points and the BMP joiners outside \p{M} (your regex); comment updated.
- tests/unit/char-count.test.ts:153-end — astral/Thai/halfwidth/Prepend cases + exhaustive BMP fast path ≡ segmenter (both fail on 2cee9c8).
- src/tools/char-count/controller.ts:38-40, 83, 157-165 — first render silent; also a silent render on `pageshow` (Chromium restores form values after the module runs, so restored text showed 0 before).
- tests/e2e/char-count.spec.ts — plain emoji + flag in the six-numbers test; new back/forward test.
- Gates: astro check 0; vitest 1,699 passed; check-dist OK; e2e char-count 5 projects 42 passed / 3 skipped.
