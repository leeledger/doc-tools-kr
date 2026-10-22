# Review Feedback — LOAN1022 A (L0–L4, /loan-note/)
Date: 2026-10-22
Ready for Builder: NO (2 Must Fix, both copy-only in src/content/tool-notes/loan-note.md; no re-review of code needed, only of the two paragraphs)

## Must Fix
- src/content/tool-notes/loan-note.md:51 (confidence: 9/10) — Legal misstatement. The paragraph opens 「이자를 따로 정하지 않은 경우에 대해서는 민법 제379조가 「이자있는 채권의 이율은 … 연 5푼으로 한다.」고 정합니다.」 The quote itself applies only to an 「이자있는 채권」 (interest agreed, rate not given). A reader takes the lead to mean "if we write no interest, 5 % applies", which the saved text does not say (and 민법 제600조 「이자있는 소비대차는 …」 shows 이자 is a separate agreement). That is our interpretation dressed as the law, which L-D9 forbids. Fix: drop the interpretive lead. For example: 「이자를 받기로 했다면 비율도 함께 적어 두세요. 민법 제379조는 「이자있는 채권의 이율은 다른 법률의 규정이나 당사자의 약정이 없으면 연 5푼으로 한다.」고 정합니다.」 Then keep the 0 → 「없음」 sentence. No claim about what happens when nothing is written.
- src/content/tool-notes/loan-note.md:43 (confidence: 8/10) — Brief violation. L-D3 says of 일천/일백/일십: 「document text only, no claim about it on the page」. The note renders on the page and says 「한글 금액은 「일천」, 「일백」처럼 자리마다 숫자를 붙여 쓰는 차용증의 오랜 습관을 따랐습니다.」 That is an unsourced claim ("오랜 습관"). Fix: say only what the tool does, e.g. 「한글 금액은 「일천」, 「일백」처럼 자리마다 숫자를 붙여 씁니다.」, or delete the sentence. Then re-run guide-length --tools (≥2,000; now 2,710, so there is room) and the D5.5 shared-block check.

## Should Fix
- src/content/tool-notes/loan-note.md:49 (confidence: 7/10) — 「사람 사이에 돈을 빌려줄 때 받을 수 있는 이자에는 법이 정한 한도가 있습니다.」 is an unquoted general statement, and the saved 이자제한법 제2조 ⑤ excludes 「대차원금이 10만원 미만인 대차」 from ①. Either drop the framing sentence and let the two quotes stand, or soften it to 「이자제한법은 이자의 최고한도를 정합니다.」. Do not add new law text.
- src/tools/loan-note/copy.ts:96 + src/lib/form/values.ts fieldProblem (confidence: 8/10) — Amount 「0」 (and 「00」, 「0원」) gets 「숫자로만 써 주세요.」, which is wrong for something that is a number. Better rule (ruling on decision #4): add a third FieldProblem `zero` for an amount whose digits are all zeros. Its message should use core glyphs only, e.g. 「1원 이상 써 주세요.」 or 「비워 두거나 1 이상을 써 주세요.」; run the glyph diff and pick the one that adds 0 glyphs. Unit test 0/00/0원 → zero, plus one e2e assertion. Do not accept 0 as empty: that drops input silently, which L-D3 forbids. (Rate 「1000」 → 「숫자로만」 is also imprecise, but nobody types that; leave it.)
- src/data/tools.ts:934 (confidence: 6/10) — The FAQ says 「인쇄해서 두 사람이 직접 서명하거나 도장을 찍는 것이 가장 확실합니다.」 In a 차용증 context, "가장 확실" reads as an evidentiary opinion. It follows POA wording, but here the stakes are legal. Suggest 「인쇄해서 두 사람이 직접 서명하거나 도장을 찍으면 됩니다.」. Five minutes; inline.
- No test for the LOAN_HWP kill switch (confidence: 6/10). The false path is shared with FORM_HWP: FormTool omits #ln-hwp, the controller skips export-hwp and uses readyPdfOnly. I read it and it is correct, but nothing exercises it. Cheap option: a unit test that renders FormTool via the Astro container with hwp=false and asserts no `${p}-hwp` button. Otherwise log a Known Gap. Note that flipping it also needs a copy change: the tool note and the FAQ mention HWP (L-D12 already says so).

## Escalate to Architect
- None.

## Rulings on Bob's decisions
1. Page labels 「얼마를 빌렸나요」「돌려줄 날」「돌려주는 방법」「연 이자」「쓴 날」 and legend 「빌린 내용」, with document labels per brief: **accepted.** This is L-D7 step (1) as written, 0 new glyphs. 「연 이자」 over 「1년 이자」 is also accepted (fact checker).
2. tooBig 「1조 원보다 적게 써 주세요.」: **accepted.** Same meaning, no 액.
3. source-watch/check:quotes reading tool-note `sources` (readToolNotes): **accepted, in scope.** L-D13 requires `sources` for law numbers in the note, and an unwatched law quote is exactly the drift source-watch exists to catch. Notes without sources contribute nothing. Keep it.
4. Amount 0 → 「숫자로만 써 주세요.」: **rejected as worded.** Use a distinct `zero` problem with its own core-glyph line (see Should Fix). Still blocks; never silently empty.
5. L-D9 page line without an organisation name (률 not core), with 대한법률구조공단 132 in the system-font note with its source: **accepted.** The brief makes the name conditional, and the note is on the same page.
- Shared controller +0.6 KB (open question 2): **do not split.** Both are under 8.4 KB, and splitting adds a second chunk and more check-dist surface for ~0.5 KB.
- `pa-*` class names on both pages: **accepted.** It is what keeps the POA HTML identical.

## Verified
- amountHangul, run myself: 1 일 · 10 일십 · 11 일십일 · 100 일백 · 110 일백일십 · 1000 일천 · 1010 일천일십 · 10000 일만 · 10001 일만일 · 20000 이만 · 1000010 일백만일십 · 10000000 일천만 · 12345000 일천이백삼십사만오천 · 100000000 일억 · 100000001 일억일 · 100010000 일억일만 · 100000000000 일천억 · 999999999999 구천구백구십구억구천구백구십구만구천구백구십구. All correct; zero groups skipped; 일 kept before 천/백/십/만.
- normalize/fieldProblem: 「1천만」「1000원원」「-5」「1e3」「원」「1.5」 (amount), 「٣」 → number; 13 nines → tooBig; full-width and 「1 000 000」 and 「10,000,000원」 pass; 17-digit leading-zero 1 → 「1」. Rate: 「0」「0.00」 → 없음; 「５．５」「5 %」「05」 normalize; 「5.555」「.5」「5.」「연 5」「%」 → number. Nothing typed is dropped silently; blank build intentionally ignores fields (brief).
- L1: POA page/markup moved verbatim into FormTool (ids, strings, attributes unchanged; the date `after` path is identical), POA e2e spec untouched and still targets #pa-*; build.ts docOf is identity for text fields, and dateLine/signLine output is unchanged for POA. I accept Bob's dist diff (script hash only) without rebuilding.
- Quotes in the note: all four are verbatim in handoff/sources/loan1022/*.txt with Fetched 2026-10-22 and retrieved '2026-10-22'. No tax text and no 증여 text on the page.
- Privacy: no new fetch; the e2e imports ./no-upload; storage/URL asserted; check-dist loops both form tools with the same no-storage, no-action, no-name, no-AdSense, no-off-site rules and budgets.
- Kill switch wiring: page passes LOAN_HWP to FormTool; controller cfg.hwp → no export, PDF-only copy.
- Unit run: form-values, loan-note (rhwp all-max 1 page), form-build, power-of-attorney: 81/81 green.

## Cleared
The L1 refactor, the L2 engine (amountHangul, normalize, fieldProblem, docText, lint, glyph strip), the L3 spec and 1-page proof, and the L4 wiring, privacy, check-dist, e2e and registration all pass. Only the two tool-note paragraphs above block Deploy A.

---
# Re-review — fix commit 05fb3f5 (2026-10-22)
Ready for Builder: YES

- Must Fix 1, 민법 379 (note line 51): **fixed.** It now reads 「이자를 받기로 했다면 비율도 함께 적어 두세요. 민법 제379조는 「…」고 정합니다.」 The quote is verbatim and there is no claim about writing nothing.
- Must Fix 2, 일천/일백 claim (note line 43): **fixed.** It now reads 「한글 금액은 「일천」, 「일백」처럼 자리마다 숫자를 붙여 씁니다.」, which states only what the tool does.
- Interest-limit paragraph: **fixed.** 「이자제한법은 이자의 최고한도를 정합니다.」 mirrors the article title 「제2조(이자의 최고한도)」. Both quotes are unchanged and verbatim against ijaje.txt and ijareg.txt.
- Zero problem: **fixed.** fieldProblem returns `zero` for all-zero amounts (0, 00, 0원, ' 0 ', full-width ０) before tooBig. Rate 0 stays null (→ 없음). The line is 「1원 이상 써 주세요.」. Unit and e2e (「0원」 → the line, state stays empty) are added. Still blocks; never taken as empty.
- FAQ (tools.ts:934): **fixed.** It now reads 「…찍으면 됩니다.」
- LOAN_HWP: the source-level wiring test (page prop → FormTool gate → controller cfg.hwp → no export, PDF-only line) is **accepted**. The runtime PDF-only path as a **Known Gap is accepted.** That path is the same shared code POA's FORM_HWP uses, and it is now pinned by the static test. Condition: if O1 ever flips LOAN_HWP to false, that change must carry a chromium e2e of the PDF-only flow (no #ln-hwp, the readyPdfOnly line, PDF downloads) and the copy switch. Write that into the Known Gap entry.
- Note: 05fb3f5 also carries the IDCAM1022 brief and sources (handoff/ only, no code). This is harmless, but keep other sprints' files out of this branch's commits from now on.
- Unit: form-values, loan-note, tool-notes 59/59 green.

Cleared: both Must Fix items and all Should Fix items are resolved. **LOAN1022 A is clear.** The deploy gates still pending are the CI 5-project matrix, the cloud usage spec, LHCI, and check:quotes --exact plus guide-length --tools on the final tree.
