# Review Request — FORM1020 위임장 만들기 + 양식 채우기 엔진 (F0–F4)
Date: 2026-10-20
Ready for Review: YES
Status: DONE_WITH_CONCERNS — everything built and green locally except the D12 real-한글 run of the final layout, which needs a person at the PC (see Open Questions 1). Nothing committed.

## Files Changed
New
- src/lib/form/spec.ts:1-118 — FormSpec/FormField/FormBlock types, BODY_PT, slot helpers, lintSpec (ids, one home per field, docLabel on table rows, references, widths, multiline maxLines, body text after the first table).
- src/lib/form/values.ts:1-55 — normalize: NFC, C0/C1 + lone surrogates stripped, CR/LS → LF, single-line LF → space, maxLines then maxLength by code points; ISO date check and 「2026년 10월 20일」.
- src/lib/form/build.ts:1-168 — buildForm(doc, spec, values): plan paragraphs; pass 1 text + alignment + split, pass 2 tables (cells before merge, heights, multiline via splitParagraphInCell), pass 3 char formats only before the first table (rhwp bug, header comment); every ok:false/throw → HwpError export (RangeError → oom).
- src/data/forms/power-of-attorney.ts:1-49 — the 위임장 spec (D5) + FORM_HWP; src/data/forms/index.ts:1-7 — registry, getFormSpec (own keys only).
- src/tools/power-of-attorney/controller.ts:1-456 — states, worker form-build → pages kept → export-hwp; HWP and PDF fail independently; stale; reset; usage; 이어서 하기 after the PDF.
- src/tools/power-of-attorney/entry.ts:1-66 — today's date, usage start, lazy controller (stamp-maker pattern), pending submit/blank.
- src/tools/power-of-attorney/copy.ts:1-21, sources.ts:1-4, power-of-attorney.css:1-36.
- src/pages/power-of-attorney/index.astro:1-165 — page: form (no action, no names), D1 caution + 정부24 link, result, 함께 준비하는 것, steps, FAQ, related, HWP notices.
- src/content/guides/power-of-attorney.md:1-132 — F4 guide (7 verbatim quotes, FAQ ×4).
- scripts/forms/hancom-check.mjs:1-174, scripts/forms/hancom-open.ps1:1-23 — D12 gate (`npm run forms:hancom`, `-- --file x.hwp`).
- tests/unit/form-build.test.ts:1-239, tests/unit/power-of-attorney.test.ts:1-95, tests/helpers/form-samples.ts:1-50, tests/e2e/power-of-attorney.spec.ts:1-269.
- handoff/sources/form1020/{minbeop,ingam-decree,gov24-ingam}.txt, probe-f1{,b,c,d}.mjs + .out.txt.

Changed
- src/lib/hwp/hwp.worker.ts:9-10, 22-26, 101-120, 170-171 — `form-build` message (spec by id, values normalized again, previous doc freed, answers `parsed`).
- src/lib/ui/next-steps.ts:26, 50-51 — NextSource + FLOW `power-of-attorney: [pdf-sign, pdf-edit, pdf-compress]`.
- src/lib/ui/usage.ts:13, 24-26, 43-44, 53-54, 118-120 and scripts/lib/usage.mjs:48, 84-91, 383 — tool, build (blank|filled) on start, format (hwp|pdf) on download only, label.
- scripts/check-dist.mjs:917-952 — D10 block (controller lazy, no engine/viewer/PDF in initial JS, no storage/history in own chunk + controller closure, no action/name, 「인감」 only in #pa-caution, no AdSense tag, no off-site script, budgets initial 12.8 KB / controller 8.4 KB).
- scripts/lib/ui-font-chars.mjs:30-32 — doc/docLabel/docSection strings left out of the UI glyph sets.
- src/data/tools.ts:861-902 (entry after stamp-signature, slug at 864), site.ts HOME_DESC_ORDER, og.json:18,44, guides.ts NEXT_GUIDES, tool-guide-order.ts pin, tool-facts.ts:21,76-78, scripts/gen-sw.mjs:58, src/sw/sw.ts:35, scripts/lib/bgcloud.mjs:64, scripts/qa/visual.mjs:48, lighthouserc.json:26,44, scripts/lib/guide-titles.mjs (regenerated), docs/COPY.md:82, package.json (forms:hancom).
- src/pages/{id-copy,stamp-maker,pdf-sign}/index.astro — RelatedTools ends with 위임장 만들기 (D8 reverse links).
- src/content/guides/id-card-copy.md, stamp-image.md — one inbound sentence each (updated 2026-10-20).
- Tests updated for the new tool: e2e site/polish/growth/usage, unit bgcloud/guides-schema (partial list + own count)/next-steps/polish/postbuild/usage.

## Gates (local, 2026-10-20)
- npm run check: 0 errors (11 pre-existing hints).
- vitest: 2,057 / 2,058 on the final full run; the one failure is char-count 「100,000 pasted characters count in under 50 ms」 under parallel load (21/21 when rerun alone; untouched file). New: form-build 18, power-of-attorney 11.
- Builds + check-dist OK: production-like (PUBLIC_SITE_URL, final) 2,527 files, precache 431.1 / 450 KB, default-dist recheck OK; cloud flag-on build (BG + cloud + usage + GA + Coupang + addr-en + AdSense) OK, precache 442.4 / 450 KB. /power-of-attorney/ initial JS 9.1 KB (cloud 10.7) / 12.8; controller 6.9 (cloud 7.0) / 8.4 KB gzip; hwp.worker 24.3 KB (was 21.9) / 90 KB.
- UI glyphs: core 615 and late 81 code points, identical to main; preload tripwire 92.1 / 92.66 KB; late-800 7.9 / 8 KB.
- check:licenses OK (no new package).
- check:quotes --exact: the 7 new quotes verbatim (all 4 sources OK); full run 290 quotes, 3 UNREACHABLE on /guide/hanja-exam-photo/ (hanja.re.kr 404, pre-existing, Known Gap).
- e2e power-of-attorney.spec: 9 tests × 5 projects = 45/45 (no-upload guard, 0 CSP violations, axe serious/critical 0 on form, result, engine error, build error). Cloud: cloud-chromium full (usage, ga, ads, english-address, remove-background cloud) 83 passed, 5 skipped; the new 위임장 usage test (no typed value, length or file name in any beacon) on the other 4 cloud projects 4/4.
- Regression e2e chromium: site, polish, growth, chain, hwp-to-pdf, hwp-viewer, hwpx-to-hwp, pdf-sign, id-copy, stamp-maker, sw = 303 passed, 11 skipped (after updating the tool counts 19 → 20). hwp-to-pdf/hwp-viewer/hwpx-to-hwp on firefox, webkit, mobile-chrome, mobile-safari: 297 passed, 1 flaky (firefox adm28 128 pages, passed on retry), 26 skipped.
- regress:hwp --fixtures-only: all pass, nothing flagged.
- LHCI median of 5: /power-of-attorney/ perf 1, a11y 1, BP 1, SEO 1, LCP 1,668 ms, CLS 0, script 11.3 KB; /guide/power-of-attorney/ 1/1/1/1, LCP 1,665 ms, script 2.3 KB; /id-copy/ (new related link) 1/1/1/1, LCP 1,663 ms.
- forms:hancom (D12): Node part PASS (4 files, rhwp 1 page, losses 0); 한글 part unattended = 4 × 「no answer to 한글 (접근 허용) in 10 minutes」 (the script ended only its own 한글 process). See Open Questions 1.

## Open Questions
1. **D12 real 한글.** 한글 2018 asks 「접근 허용」 for every file the automation opens (FilePathCheckerModule not registered). I never answer it from the script. Blank and sample PASSED in 한글 (open, 1 page, every value and label) when the window was answered at the PC, on the first layout; then I widened the label column (10,500 → 12,000 HWPUNIT, so 「생년월일(주민등록번호)」 fits one line) and left-aligned the values; unattended reruns timed out. Before Deploy A someone at the PC runs `npm run forms:hancom` and clicks 「접근 허용」 4 times (blank, sample, all-max, all-max-lines-25); expected PASS ×4 and the 한글 version line. Arch call: accept that as the deploy step, or register the module (owner, system change).
2. **D5 sizes.** The rhwp char-format-after-table bug means 「위 사람에게 …」 and 「… 귀중」 are body 10 pt (brief: 11 pt, bold 12 pt). In 한글 the sample looked fine. OK?
3. **Brief wording vs glyph gate.** UI labels 「위임하는 사람 (위임인)」「대신 가는 사람 (대리인)」「위임할 일」「부탁할 일」 (맡 not a core glyph); stale line 「고친 내용으로 다시 만들어 주세요」 (「바뀐」's 뀐 filled late-800 to its 8 KB budget). Document labels keep the brief's words (성명, 위임인과의 관계, 제출할 곳, 맡기는 일).
4. **D7 vs D8.** The PDF handed to /pdf-sign/ waits in the existing handoff IndexedDB (deleted on take, swept after 10 min), only after a 이어서 하기 press — the brief asks for the chain. Nothing typed is stored otherwise.
5. Please look at build.ts pass order (header comment) and the spec lint rule that enforces it; and at hwp.worker.ts formBuild freeing the previous document.

## Out of Scope (logged in BUILD-LOG)
- CLAUDE.md line 3 「위임장 만들기」: not edited (orchestrator instruction) — orchestrator applies.
- hanja-exam-photo source 404; FilePathCheckerModule registration; upstream report of the rhwp layout bug.
- Pre-logged: DOCX/HWPX outputs, images, 누름틀, saved drafts, pdf-merge as handoff target, /en/ twin, multi-page forms, computed fields.
- Post-deploy (PC session): IndexNow ping, Naver 수집 요청, live smoke (phone + PC; live HWP through `npm run forms:hancom -- --file`).

---
# Round 2 — Richard's Should Fix (2026-10-20)
Ready for Review: YES

## Files Changed
- src/content/guides/power-of-attorney.md:79 — the sign/stamp sentence is now advice (your wording).
- src/content/guides/power-of-attorney.md:132-134 — three new 「안 될 때」 items:
  - 위임장 유효기간: quotes 시행령 13조 ⑦.
  - 대리인 나이: quotes 13조 ①.
  - 서류 묶어 가기: practical advice.
- scripts/lib/guide-length.mjs (new) — the AdSense P1 metric: rendered div.guide-body prose, no whitespace, no URLs, entities decoded.
- scripts/guide-length.mjs (new) — CLI that reads dist/.
- tests/unit/guide-length.test.ts (new) — tests the metric.
- handoff/BUILD-LOG.md — the metric written down once for later guides; the Known Gap now states the 10 pt effect.
- scripts/forms/hancom-open.ps1:4-20 — the Hwp PIDs are compared before and after New-Object. Exactly one new process is required, and only its PID is written. Otherwise the script releases the COM object without Clear or Quit and reports open=false.
- scripts/forms/hancom-check.mjs:46-53 — on a timeout it kills only a numeric PID from that file.

## Numbers
- Guide metric: 2,311 → 2,592 (bar 2,500).
- check: 0 errors.
- vitest: 2,060/2,060.
- Production-like build + check-dist OK (precache 431.1/450 KB).
- check:quotes --exact on the guide: 7/7.
- e2e chromium (growth + power-of-attorney): 24/24.

## Open Questions
- The hancom-open.ps1 change was not exercised against live 한글: each open waits for 「접근 허용」. The PowerShell parse check passes. D12 is unchanged: someone at the PC runs `npm run forms:hancom` before Deploy A.
