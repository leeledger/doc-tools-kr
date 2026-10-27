# Review Request — RESIGN1027 Step B (/resignation-letter/ 사직서 만들기)
Date: 2026-10-27
Ready for Review: YES
Status: DONE

## Files Changed
- src/pages/resignation-letter/index.astro:1-109 — the page: FormTool (groups 내 정보 / 일한 기간과 이유 / 내는 날과 받는 사람), form-tool.css + form-presets.css inlined, #rs-general R8 line (고용24 link, 국번없이 1350), 함께 준비하는 것, steps, points, ToolNotes, FAQ, related.
- src/tools/resignation-letter/{config,copy,controller,entry}.ts — loan-note pattern; RS_TODAY = ['date']; 해요체 status lines (「사직서를 …」).
- src/content/tool-notes/resignation-letter.md:1-78 — tool note; 7 sources (고용보험법 제58조 heading, lead, 2호, 가·나·다; 1350 home line) + toolFacts reason 3 lines / 100.
- src/data/tools.ts:1069-1105 — tools entry after loan-note (title 37, description 62, FAQ ×5, keywords).
- src/components/FormTool.astro:58 — a plain text input with a hint gets aria-describedby (받는 사람 hint); no POA/loan text field has a hint.
- scripts/check-dist.mjs:1061-1063, 1091-1100 — FORM_TOOLS entry (budgets 13.2 / 9.4 = measured 11.0 / 7.8 + 20 %) and the page block (7 presets on #rs-reason, 회사 권고 → 권고사직, #rs-general, banned claims).
- Registration (one line each): src/data/og.json, src/data/site.ts (HOME_DESC_ORDER), src/data/tool-facts.ts:92-94, src/lib/ui/next-steps.ts:28,56-57, src/lib/ui/usage.ts:13,25,122, scripts/lib/usage.mjs (TOOLS, DOWNLOAD_SETTING, label), scripts/gen-sw.mjs, src/sw/sw.ts, scripts/lib/bgcloud.mjs, lighthouserc.json, scripts/qa/visual.mjs, docs/COPY.md:84.
- Reverse related links: src/pages/{loan-note,power-of-attorney,stamp-maker}/index.astro (RelatedTools only lists).
- tests/e2e/resignation-letter.spec.ts — 8 tests: page + axe incl. chips; chip before the controller (controller chunk held by page.route: value replaced, one input event, focus + caret at end, then the build/PDF has the fill); filled HWP/PDF (「…일자로 사직하고자」, fonts embedded, no storage/URL); blank; chip after a build → stale, rebuild, reset = today only; all-max (1 page, also 3 wrapped lines); emoji raster; chain → /pdf-sign/.
- tests/e2e/usage.spec.ts:489-513 — cloud usage: chip press sends nothing; start/success/download/next only; no typed value, preset text or file name.
- tests/unit/resignation-letter.test.ts — registration, FAQ guards (R6/R7/R8), usage whitelist, copy, note sources, RESIGN_HWP + presets CSS wiring.
- tests: site.spec, polish.spec, next-steps, usage, polish, postbuild, bgcloud, tool-notes — lists and counts +1.
- reports/growth/사직서 시장 조사 2026-10-27.md — orchestrator's research file (added as asked).

## Open Questions
- Budgets: the brief's measured + 20 % gives 13.2 / 9.4 KB, looser than POA/loan's shared 12.8 / 8.4 (same code, measured 11.0 / 7.8). I followed the brief; say if you want the shared limits instead (they pass today).
- The 1350 pointer is on the page and in the FAQ (0 new glyphs, so R8 allows it); the note carries the quoted line with the date.
- Note wording around 제58조: 「조문의 말 그대로, 각 호에 해당하는지는 직업안정기관의 장이 인정합니다.」 — please check it reads as the quote, not advice.
- FAQ 「워드」: 「PDF는 휴대폰과 PC 어디서나 열 수 있습니다」 is general (no source); drop if you see it as a claim.

## Gates
- npm run check 0/0 · vitest related 583/583 · full 2318/2319 (char-count timing under load; alone 21/21)
- build default + production flags: check-dist OK; preload 92.1 / 92.66 KB (92.2 flags), late-800 7.9 / 8, precache 385.4 (default) / 393.1 (flags) / 450; 0 new core / late glyphs
- check:quotes --exact (note only): 7/7 verbatim
- e2e chromium 1 worker: resignation-letter 8/8, power-of-attorney + loan-note 17/17, site + polish 187 / 1 skipped
- Not run here: usage.spec cloud (needs dist-bgcloud → CI), 4 other browsers (CI), LHCI, forms:hancom (owner O1)

## Out of Scope (logged in BUILD-LOG)
- presetsLabel per field (Step A Should Fix) — Known Gap.
- Guide /guide/resignation-letter/, NEXT_GUIDES, tool-guide-order, guide lighthouserc — Step C.
- CLAUDE.md line 3 「사직서 만들기」 — orchestrator.
