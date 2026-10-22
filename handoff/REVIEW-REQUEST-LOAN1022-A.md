# Review Request — LOAN1022 Steps L0–L4 (Deploy A: /loan-note/ 차용증 만들기)
Date: 2026-10-22
Ready for Review: YES
Status: DONE_WITH_CONCERNS. Everything is built and green locally. Two things are left for others: the real-한글 COM run (owner O1, non-blocking per L-D12), and the 5-project e2e matrix + LHCI, which run in CI on the PR because this machine is low on memory.
Branch: `loan1022` (from main a6814bf). Not pushed. Commits:
- c46bc36 L0: sources
- a8d1f54 L1: refactor, its own commit
- ed83722 L2: engine
- 4753234 L3: spec
- f4508a7 L4: page and registration

## Files Changed

### L0: sources (handoff/sources/loan1022/, fetched 2026-10-22, curl, server HTML)
- minbeop.txt: 민법 [시행 2026. 3. 17.] 제379조, 제598조, 제600조, 제603조 (lsiSeq 284415).
- ijaje.txt: 이자제한법 [시행 2025. 7. 22.] 제2조 ①–⑤ (lsiSeq 268667).
- ijareg.txt: 최고이자율 규정 [시행 2021. 7. 7.] 「최고이자율은 연 20퍼센트로 한다.」 (lsiSeq 230727).
- sangjeung.txt: 상속세 및 증여세법 [시행 2026. 1. 2.] 제41조의4 ①–④ (lsiSeq 276123, found with DRF).
- minjip.txt: 민사집행법 [시행 2026. 2. 1.] 제56조 1–5호 (lsiSeq 268837, found with DRF).
- klac-132.txt: 대한법률구조공단 전화상담 page (132, 평일 상담시간).
- Not fetched: a 국세청 page on 가족 간 금전 대여 (optional; the site is JS-heavy). This only affects the guide in L5.

### L1: refactor (no behaviour change)
- src/tools/form-tool/controller.ts:1-540 — the former POA controller made generic. `FormToolConfig {spec, prefix, copy, hwp, tool, today, problems?}`, and ids come from `${prefix}-…`.
  - The L4 additions in this file: lines 115-121 (`checked`), 251-279 (`setProblem`, `echo`, `fieldsOk`, plus the build gate at 278), 481-484 (reset), 501-507 (input handler) and 534 (initial echo).
- src/tools/form-tool/entry.ts:1-80 — `startFormTool({tool, prefix, today, load})`, which is the former POA entry.
- src/components/FormTool.astro:1-106 — the widget markup. Its POA output is byte-identical.
  - The L4 additions are at lines 40-62: amount, number and date-in-fieldset inputs, the echo, the error lines and the hint.
- src/tools/form-tool/form-tool.css — the moved POA CSS. Lines 37-42 are the L4 unit, echo and invalid styles.
- src/tools/power-of-attorney/{config,entry,controller}.ts — thin config wrappers.
- src/pages/power-of-attorney/index.astro:1-40 — uses `<FormTool>`, with the caution passed as a slot.
- src/lib/ui/usage.ts:13, 24-27, 56, 120 — `FormToolId`. The download format event is typed for the form tools.
- scripts/check-dist.mjs:962-1009 — the POA block is now a loop over `FORM_TOOLS`.
  - It finds the controller as the `controller.*.js` chunk that the page's own initial chunk imports dynamically.
  - It checks that the closure names `hwp-error` and `form-build`.
  - The rules are unchanged: no worker/rhwp/viewer/PDF in the initial JS, no storage or history calls, no form action and no field names, no AdSense, no off-site script, and the same budgets. The 인감 rule stays for POA only.
- **Proof:** I diffed dist/power-of-attorney/index.html from the production build before and after L1. The only difference is the page script's asset hash (`index.astro_astro_type_script_index_0_lang.DGUTZFI-.js` → `.D2S4P9VK.js`). The POA unit tests passed (236), and so did the POA e2e on chromium (9/9).

### L2: engine
- src/lib/form/amount.ts:1-33 — `amountHangul` (groups of 4 digits, 일천/일백/일십, zero groups skipped) and `groupDigits`.
- src/lib/form/values.ts:4-10, 37-99 — `normalizeAmount`, `normalizeNumber`, `AMOUNT_MAX_DIGITS`, `fieldProblem`, `docText` and `BLANK_DATE` (moved here and re-exported from build.ts).
- src/lib/form/spec.ts:3-6, 9-15, 27-37, 91-105, 124 — the new kinds amount/number; the keys docTemplate/docBlank/docZero and `hint`; the new lint rules; the "date belongs on a dateLine" rule is removed.
- src/lib/form/build.ts:19-22, 82-99, 132 — table cells, slots, the date line and sign lines all go through `docText`. POA output is unchanged: its unit tests and e2e pass.
- scripts/lib/ui-font-chars.mjs:30-33 — the strip regex now covers docTemplate/docBlank/docZero. Lines 62-66 and 96 add `DOC_TEXT_PATHS = ['lib/form/amount.ts']`: the 한글 digit names are document text, and without this they would have added 십/육/팔 to the late face.
- tests/unit/form-values.test.ts (new):
  - 20 amountHangul cases, plus throw cases and groupDigits
  - normalize, fieldProblem and docText for every kind
  - the lint rules
  - glyph stripping and DOC_TEXT_PATHS
- tests/unit/form-build.test.ts:90-92 — one lint expectation changed: `d: docLabel` replaces the dropped dateLine rule.

### L3: spec
- src/data/forms/loan-note.ts:1-56 — `LOAN_HWP = true` and `LOAN_NOTE`, laid out per L-D5. The two people's sections break before 「(채권자)」/「(채무자)」.
- src/data/forms/index.ts — registered the new spec.
- tests/helpers/form-samples.ts — the 차용증 sample; the all-max helper now uses the longest amount (12 nines) and the longest number (999.99).
- scripts/forms/hancom-check.mjs:5, 73, 104-112 — `expected()` uses `docText`, so dates and amounts are checked as the document writes them.
- tests/unit/loan-note.test.ts:
  - Lint and registry.
  - L-D1: no 보증, 공정증서 or 대부.
  - docText for the sample, rate 0 and blank.
  - Real rhwp for blank, sample and all-max: 1 page, loss 0, 1 page after reload, every docLabel and docText drawn.
  - all-max with line lengths 15–40: always 1 page.
  - Registration, usage and copy (L4), and the source-watch entry.

### L4: page and registration
- src/pages/loan-note/index.astro:1-110 — the hero with the L-D9 line (`#ln-general`), `<FormTool prefix="ln">`, the 「함께 준비하는 것」 section (stamp-maker, id-copy, pdf-merge), steps, 알아 두면 좋아요, the tool note, FAQ, related tools and the HWP notices.
- src/tools/loan-note/{config,entry,controller,copy}.ts — the defaults (today in 쓴 날 and 빌린 날), the copy, and the field errors `LN_PROBLEMS`.
- src/content/tool-notes/loan-note.md — the tool note in 합니다체. It quotes four sources: 이자제한법 2조 ③, 규정 20퍼센트, 민법 379, and 법률구조공단 132. toolFacts: termsMaxLines 4 and amountMaxDigits 12. It has the L-D9 line.
- src/data/tools.ts:903-943 — the entry after power-of-attorney (title 37 chars, description 67). 6 FAQ entries, none with a new glyph.
- Registration:
  - site.ts: HOME_DESC_ORDER
  - og.json (+ brand/og-loan-note.png)
  - tool-facts.ts:24-26, 85-87
  - guides.ts NEXT_GUIDES (power-of-attorney, stamp-image, pdf-sign until L5)
  - next-steps FLOW `loan-note: [pdf-sign, pdf-edit, pdf-compress]`
  - usage.ts and usage.mjs: TOOLS, DOWNLOAD_SETTING format, label
  - gen-sw NOT_PRECACHED and sw.ts RUNTIME_PAGES
  - bgcloud LOCAL_SCOPE_RE
  - lighthouserc
  - qa/visual
  - check-dist FORM_TOOLS
  - docs/COPY.md (new line after the 위임장 line)
- Reverse related links: /power-of-attorney/, /stamp-maker/, /pdf-sign/.
- scripts/ops/lib/guides.mjs:99-115 + source-watch.mjs — new `readToolNotes()`, so check:quotes now also verifies tool-note quotes. Before this, tool notes had no URL sources.
- tests/e2e/loan-note.spec.ts (new, 8 tests):
  - the page
  - filled (echo; HWP reopen with 「금 일천만원정 (10,000,000원)」 and every docText; PDF text + embedded fonts; storage and URL unchanged)
  - field problems (「1천만」 and 「5.555」 give inline errors, focus and no worker; 13 digits give the 1조 line; full-width input passes; rate 0 → 없음; axe on the error)
  - blank (ignores a bad amount)
  - stale + reset to defaults
  - all-max
  - emoji raster
  - chain to /pdf-sign/
- tests/e2e/usage.spec.ts — a cloud test: a blocked amount sends no beacon, then the event sequence, and no typed value in any beacon.
- tests/e2e/site.spec.ts and polish.spec.ts — the tool lists, related map, card count 21 and the LIVE list.
- Unit count updates: next-steps (15 rows), postbuild (OG list), tool-notes (23 notes), usage (DOWNLOAD_SETTING).

## Verification (local, 2026-10-22)
- npm run check: 0 errors, 0 warnings.
- vitest: 97 files, 2,148/2,148.
- Production build (`PUBLIC_SITE_URL=https://docttak.com`) + check-dist: OK, 2,617 files.
  - Precache: 422.1/450 KB (was 419.1).
  - UI glyphs: core 615, late 81 — the same as main.
  - Preload: 92.1/92.66 KB (unchanged). late-800: 7.9/8 KB.
  - POA: initial 9.3/12.8 KB, controller 7.6/8.4 KB (was 7.0; the shared controller now carries fieldProblem/echo/amount).
  - loan-note: initial 9.3/12.8 KB, controller 7.8/8.4 KB.
- `PUBLIC_BG_REMOVE=1` build + check-dist: OK, 2,639 files.
  - Preload 92.2/92.66 KB. Core 616: src/generated/licenses.json is flag-dependent; the same file at HEAD gives 616 too, so this is not from LOAN1022.
  - Precache 425.1/450 KB.
- guide-length --tools: /loan-note/ 2,710 (bar 2,000), /power-of-attorney/ 2,102.
- check:quotes --exact: 593 quotes verbatim, including the 4 new tool-note quotes. The browser-only list is unchanged.
- check:licenses: OK. No new package.
- forms:hancom, Node part (temp copy with `installed = false`): 8 files built, 0 failures. The 한글 COM part started on POA blank and waited for 「접근 허용」; it is owner O1.
- e2e chromium, --workers=1:
  - loan-note 8/8
  - power-of-attorney 9/9
  - site + polish 173 passed + 3 fixed and rerun green, 1 skipped
  - growth + hubs + chain 41/41
  - sw 5/5
  - The 5-project matrix and the cloud usage spec run in CI.
- Visual check (360 px screenshot): the echo shows under the amount; the 「%」 unit and the error line render. The preview is 1 page.

## Decisions (logged)
- **Labels (L-D7):** 돈, 갚 and 액 are not core glyphs, so the page labels are 「얼마를 빌렸나요」「돌려줄 날」「돌려주는 방법」「연 이자」「쓴 날」 and the legend 「빌린 내용」. The document labels follow the brief (빌린 돈, 갚을 날, 갚는 방법). Result: 0 new core glyphs and 0 new late glyphs; uiSys was not needed.
- **「연 이자」 instead of 「1년 이자」:** the tool-note fact checker reads 「1년」 as an unsourced 「1 년」 fact.
- **tooBig line:** 「1조 원보다 적게 써 주세요.」 instead of the brief's 「…적은 금액만 쓸 수 있어요.」, because 액 is in no UI face.
- **Amount 0:** typing 「0」 in the amount field gives the 「숫자로만 써 주세요.」 error. This is the brief's literal rule (it normalizes to empty), and the input is not silently dropped. The wording is imperfect for this case.
- **L-D9 page line:** it names no organisation (「전문가나 공공 상담 기관」). 법률구조공단 needs 률, which is not a core glyph. The tool note, in the system font, names 대한법률구조공단 and 132 with its source.
- **FormTool class names:** they stay `pa-*` on both pages, and only the ids are prefixed. This keeps the POA HTML byte-identical, and one CSS file serves both pages.

## Open Questions
1. Should source-watch cover tool notes? I added `readToolNotes()` to it, because the brief requires `sources` for law numbers in the tool note and check:quotes is a gate. Is that acceptable scope?
2. The shared controller grew by 0.6 KB because both form tools now ship amount.ts and the field-problem logic. Both are still under 8.4 KB. Should it be split per tool?
3. Is the amount-0 error wording acceptable, or should 0 be accepted as empty?

## Out of Scope (logged in BUILD-LOG)
- CLAUDE.md line 3 「차용증 만들기」 (orchestrator applies).
- L5 guide + figures + inbound links + TOOL_GUIDE_PINS (next step).
- Pre-logged Known Gaps:
  - 보증인 칸
  - 분할 상환표
  - interest calculators
  - live 20 % warning
  - Hangul echo in the UI
  - due-before-loan date check
  - 공증 양식
  - 영수증
  - DOCX/HWPX
  - /en/ twin
  - saved drafts
  - tax computation
- Post-deploy (orchestrator):
  - live smoke on phone + PC
  - IndexNow ping
  - O1 `npm run forms:hancom` at the PC
