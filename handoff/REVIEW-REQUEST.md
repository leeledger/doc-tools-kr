# Review Request — QUOTE1112 A1–A3 + B1/B2 (견적서·거래명세서 /quotation/, Deploy A scope)
Date: 2026-11-12
Ready for Review: YES
Status: DONE_WITH_CONCERNS — built and green locally (chromium + cloud-chromium; Node 26). Owner-only O1 (한글 with a
sealed file) and O2 (phones) open. Shared form controller headroom is 75 B (see Open Questions 2). Not pushed.

Commits on quote1112: 0d0810d (A1 probe) · 9797bfd (A2 engine + ledger) · 4b492d8 (A3 specs + matrix) · then the B
commits listed in BUILD-LOG (engine for the page, page + registration, stamp-maker link, tests). Review A was never
held, so A1–A3 are in this request too (files from those commits: src/lib/form/{spec,values,ledger,build}.ts,
src/data/forms/quotation.ts, tests/unit/{form-ledger,quotation}.test.ts, tests/helpers/form-samples.ts,
scripts/forms/hancom-check.mjs, handoff/sources/quote1112/probe-a1.*).

## Files Changed (B, working tree → commits)
- src/pages/quotation/index.astro:1-130 — the page: hero, FormTool with specs + items group, seal block, #qt-not-tax line + 홈택스 link, 함께 쓰는 것, howto, notes, FAQ, related.
- src/components/FormTool.astro:12-16,18-86,97,116 — `specs` radio 「만들 서류」, items group (rows, 품목 줄 더하기, error line, totals box), fields via FormField.
- src/components/FormField.astro:1-59 — one field, split out of FormTool (+ quantity, choice radio group, item amount without echo).
- src/tools/form-tool/controller.ts:12-14,19-22,70-88,102-103,114-117,141-148,201-204,268-274,306-326,370,449-485,517-526,545,576-578 — FormHooks (spec/input/check/reset/seal), radios, quantity checks, seal transfer, per-build file names, doc enum on start.
- src/tools/form-tool/entry.ts:11-13,32-33,63-73,82-90,113-116 — 품목 줄 더하기 and the 만들 서류 rename before the controller; `now` start for a hand-off.
- src/tools/form-tool/form-items.css:1-27 — radios, item rows (2×2 / 4 across ≥ 720 px), totals box, seal row.
- src/tools/quotation/{config,controller,copy,entry,items,seal}.ts (7/48/53/11/115/129 lines) — page constants, hooks wiring, in-tool copy, entry, totals box + ledger problems, seal input + hand-off read.
- src/lib/form/seal.ts:1-33 — FormSealMsg, SEAL_MAX_PX/BYTES, worker-side sealExtras check, sealFit.
- src/lib/form/doc-text.ts:1-31, digits.ts:1-2, amount.ts:30, build.ts:22-25, values.ts:6-7,61-62,96-103 — docText split out (page chunks never carry 금액 한글), groupDigits module, fieldProblem one path.
- src/lib/hwp/hwp.worker.ts:10-11,24-28,104-113,173 — form-build carries an optional seal.
- src/lib/ui/sign-handoff.ts:4-16,124-146 — sendToQuotation, QUOTATION_PATH, HANDOFF_FAILED_QUOTE.
- src/tools/stamp-maker/controller.ts:5,252-255,349,515-518 — 「견적서에 찍기」 button.
- src/lib/ui/usage.ts:13,25-26,47-49,125 · scripts/lib/usage.mjs:49,89-99,160,405,549-556 — tool, FORM_DOCS doc enum, labels, TOOL_OUT.
- src/data/tools.ts:13-14,1117-1152 · og.json:24,56 · site.ts:51 · tool-facts.ts:26-29,99-110 · affiliate.ts:93-94,129,234 · synonyms.ts:67 · next-steps.ts:28-29,59-60 — registration.
- src/content/tool-notes/quotation.md:1-82 — the note (2,000+), law quotes from vat-law.txt.
- scripts/check-dist.mjs:1070-1073,1081-1082,1100-1111,1128-1139 — qt budgets, handoff-key storage exception, radio-name exception, #qt-not-tax / radio / presets / banned words.
- scripts/gen-sw.mjs:65 · src/sw/sw.ts:36 · scripts/lib/bgcloud.mjs:64 · out-links-check.mjs:56,68 · ui-font-chars.mjs:70-74 · qa/visual.mjs:53 · lighthouserc.json:31 · docs/COPY.md:85 · src/pages/{loan-note,stamp-maker}/index.astro:98/112.
- tests/e2e/quotation.spec.ts:1-331 (new) · tests/unit/quotation-page.test.ts:1-163 (new) · e2e site/polish/affiliate/stamp-maker/usage/loan/resign + unit postbuild/bgcloud/polish/affiliate/next-steps/usage/tool-notes/form-* — lists, counts, imports.

## Open Questions
1. FLOW quotation = [pdf-sign, pdf-edit, pdf-compress], not the brief's pdf-merge (pdf-merge takes no hand-off). OK?
2. The POA/loan/resign 8.4 KB lazy budget: shared chunk trimmed (not the budget) to loan 8,526 / 8,601.6 B in the
   GA-on build. Please check the trims in controller.ts (seal hook returns a ready message; defaultChecked reset) and
   values.ts fieldProblem (one regex path for amount and quantity) for behaviour changes — unit + e2e pass.
3. The doc enum rides the `start` event (the build start) as `o=doc`; a filled build no longer sends build=filled.
4. In-tool 「100억 원 넘는 금액은 만들 수 없어요」 (brief wording) while exactly 100억 is refused; the note now says
   「100억 원 이상이면」. Change the in-tool line too?
5. Law sentences: please check each against handoff/sources/quote1112/vat-law.txt (tool note + FAQ 2 「10%(부가가치세법 제30조)」).

## Out of Scope (logged in BUILD-LOG)
- Guide /guide/quotation/ (Step C, Deploy B). CLAUDE.md line 3 tool list (orchestrator). O1–O4 owner items.
- Known Gaps per the brief (Excel/DOCX/HWPX, 2-up, more than 8 rows, 등록번호 check, saving 공급자 details, /en/).
