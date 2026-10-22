# Architect Brief — LOAN1022 차용증 만들기 + 안내 글 「차용증 쓰는 법」

Owner 2026-10-22: new tool on the FORM1020 engine. Scout 2026-10-16 rank #3 (reports/growth/tool-scout-2026-10-16.md):
차용증 양식 21,430/mo (mobile 56 %), 차용증 10,460, 차용증 쓰는법 6,680, 가족간 차용증 양식 4,710, 차용증 법적효력
3,680; ad clicks 1,192/mo. Competitors 비즈폼·예스폼 (paid / sign-up).
House rules unchanged: FORM1020 lessons, CONTENT1021 bars from the first commit (LENGTH_PENDING no longer exists),
budgets never raised, plain language (docs/COPY.md), brand 「문서딱」, every number/law quoted verbatim with a fetch
date. This file is the brief; handoff/ARCHITECT-BRIEF.md belongs to another sprint running in parallel — do not touch it.

## Goal
/loan-note/ 「차용증 만들기」: fill blanks (or none) → the same 1-page 차용증 as HWP and PDF built on the device, with
the amount written in Hangul automatically; plus /guide/loan-note/ 「차용증 쓰는 법」 (≥2,500 chars, 2 own figures).

## Arch probes already done (2026-10-22, curl from this PC; Bob re-fetches and saves verbatim in L0)
- law.go.kr `lsInfoR.do` needs `efYd`: without it the body is `alert("기본정보 조회 실패")`. With it: server HTML.
- DRF search works without a key: `https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=law&query=<법령명>&type=XML`
  → 법령일련번호 (= lsiSeq) + 시행일자 (= efYd). (A query for a name with spaces returned nothing; URL-encode spaces
  as %20 and retry, or use the law.go.kr search page.)
- 이자제한법 lsiSeq=268667 efYd=20250722 [시행 2025. 7. 22.]: 「제2조(이자의 최고한도) ①금전대차에 관한 계약상의
  최고이자율은 연 25퍼센트를 초과하지 아니하는 범위 안에서 대통령령으로 정한다.」 … 「③계약상의 이자로서 제1항에서
  정한 최고이자율을 초과하는 부분은 무효로 한다.」
- 이자제한법 제2조제1항의 최고이자율에 관한 규정 lsiSeq=230727 efYd=20210707 [시행 2021. 7. 7.]: 「최고이자율은 연
  20퍼센트로 한다.」
- 민법 lsiSeq=284415 efYd=20260317 (same as handoff/sources/form1020/minbeop.txt): 제379조(법정이율),
  제598조(소비대차의 의의), 제603조(반환시기) present in the HTML.

## Locked decisions
- **L-D1 Scope:** a general 금전 차용증 between people. Never: 공정증서, 대부업 계약서, 보증 (no 연대보증인 칸 — a
  separate legal area), any agency form. No legal claim inside the document; page and guide say they are general
  information (L-D9).
- **L-D2 Slugs:** tool `/loan-note/`, guide `/guide/loan-note/`, spec id `loan-note`, fileBase 「차용증」 (차용증.hwp,
  차용증.pdf). Menu/home/tools.ts position: right after power-of-attorney.
- **L-D3 Engine changes (src/lib/form/, small, all unit-tested; POA output must not change):**
  - FieldKind gains `amount` (whole 원) and `number` (decimal). values.ts normalize: NFKC, then strip commas, spaces,
    a trailing 원 (amount) or % (number); amount must match `^\d{1,12}$` (leading zeros stripped; all zeros → empty);
    number must match `^\d{1,3}(\.\d{1,2})?$`; anything else → empty.
  - New pure `fieldProblem(field, raw)` → `number` | `tooBig` | null: raw non-empty but normalizes to empty → `number`
    (amount with more than 12 digits → `tooBig`). The controller runs it on 만들기 and blocks the build with an inline
    field error and focus. What the visitor typed is never dropped silently.
  - New pure `src/lib/form/amount.ts` `amountHangul(digits)`: groups of 4 from the right with 만/억; inside a group
    천/백/십 always with the digit name, 1 included (일천, 일백, 일십 — the tamper-resistant 차용증 habit; document text
    only, no claim about it on the page); all-zero groups skipped. 10000000 → 일천만; 12345000 → 일천이백삼십사만오천;
    100000000 → 일억; 1000010 → 일백만일십; 999999999999 → 구천구백구십구억구천구백구십구만구천구백구십구.
    Own code, not es-hangul (no new package).
  - Document text of a value = new `docText(field, value)` in values.ts, used by build.ts for table cells and slots:
    date → formatDate (empty → 「     년     월     일」); amount → 「금 {한글}원정 ({1,234,567}원)」 (no ₩ sign: glyph
    risk in the PDF faces); number → field.docTemplate with `{v}` (e.g. 「연 {v}%」), value 0 → field.docZero when set;
    empty → field.docBlank when set, else empty. New FormField keys docTemplate, docBlank, docZero are document text:
    add them to the scripts/lib/ui-font-chars.mjs strip regex (line 32) and its unit test.
  - Lint: drop the rule 「a date field belongs on a dateLine」 (dates may sit in table rows); keep 「dateLine needs a
    date field」; docTemplate must contain `{v}`; docZero and docTemplate only on number; docBlank only on
    amount/number/date.
  - Per-spec HWP kill switch: each spec module exports its own const (FORM_HWP stays for POA; LOAN_HWP = true).
- **L-D4 Refactor first (own commit, no behavior change):** extract the POA controller/entry/markup into a generic form
  tool: src/tools/form-tool/{controller,entry}.ts + src/components/FormTool.astro, parameterised by {spec, groups
  (legend + field ids), id prefix, copy object, hwp flag, usage tool id, next source}. POA keeps prefix `pa-` and every
  id, string and behaviour. Proof = POA unit + e2e green unchanged and a diff of the built
  dist/power-of-attorney/index.html before/after showing only asset-hash changes (log it). The loan page is then
  config. Copy stays per tool (src/tools/loan-note/copy.ts); no Korean particle logic.
- **L-D5 차용증 content (our layout, 1 page; everything after the first table plain 10 pt — rhwp 0.8.6 bug):**
  title 「차 용 증」 20 pt, gap, then
  - table docSection 「차용 내용」: amount 「빌린 돈」 (amount; docBlank = 「금」 + spaces + 「원정 (」 + spaces +
    「원)」); loanDate 「빌린 날」 (date); dueDate 「갚을 날」 (date); rate 「이자」 (number; docTemplate 「연 {v}%」,
    docZero 「없음」, docBlank 「연      %」); interestDay 「이자 내는 날」 (text 20); repayHow 「갚는 방법」 (text 50, e.g.
    the account for 계좌이체); terms 「그 밖의 약속」 (multiline 120, maxLines 4, rowLines 3).
  - table 「빌려준 사람(채권자)」: 성명, 생년월일, 주소, 연락처 (maxLength 20/20/50/20 as POA).
  - table 「빌린 사람(채무자)」: the same four.
  - para 「위 돈을 틀림없이 빌렸으며, 위에 적은 대로 갚겠습니다.」 center; dateLine (작성일, default today); signLine
    「채무자 {borrowerName} (서명 또는 인)」 right; signLine 「채권자 {lenderName} (서명 또는 인)」 right.
  - Page defaults: 작성일 and 빌린 날 = today (device date); everything else empty; reset restores exactly that.
  - All-max (every field at max, terms 4 wide lines) = 1 page in rhwp (unit) and in the browser preview (e2e). If it
    does not fit, cut maxLength/rowLines — never the font size; log the numbers.
- **L-D6 UI:** amount input `type=text inputmode=numeric`, live echo under it 「10,000,000원」 (digits + 원 only,
  aria-live polite) so the visitor can count zeros; no Hangul amount echo in the UI (dynamic Hangul is not in the UI
  glyph sets; the preview shows it). rate input `inputmode=decimal` with a 「%」 suffix. 「빈 양식으로 받기」 as POA.
  Field errors (late copy): 「숫자로만 써 주세요.」 / 「1조 원보다 적은 금액만 쓸 수 있어요.」. Stale/reset/downloads as
  POA. No live 「연 20 % 초과」 warning in v1 (glyph + legal-tone cost); the cap is stated, sourced, in the tool note and
  the guide (Known Gap: live warning).
- **L-D7 Glyphs/fonts:** the budget wins and is never raised: preload ≤ 92.66 KB (now 92.1), late-800 ≤ 8 KB (now 7.9 —
  tight). Order: (1) pick label words already in the core set (run the glyph diff on candidate labels before writing
  the page; 빌/갚/채 may be new); (2) document words go under doc keys; (3) long text goes in the .md note; (4) if a
  needed UI word still pushes a budget over, the form labels/legends use the system-font stack (the .tool-notes
  approach) with those strings under a spec key the glyph scan skips (uiSys). Log the glyph list and KB before/after
  either way. Target: 0 new core glyphs; gate: the budgets.
- **L-D8 Privacy = FORM1020 D7:** no storage, no values in URL/history/filenames/usage/GA; fixed filenames; reset clears;
  tool page CSP self; not an ads content page. Usage tool id loan-note, same event set as POA, never a value.
- **L-D9 Not legal advice:** page lead area + tool note + guide each carry one plain line: this is general information;
  for your own case ask an expert or a public counselling service (name 대한법률구조공단 and its phone number only if L0
  saves the official page; else no number). Every statement about law = verbatim quote + fetch date. Family loans: quote
  only (상속세 및 증여세법 제41조의4 ① if saved) + link to 국세청; never compute tax, never call an amount safe.
- **L-D10 Chain:** NextSource loan-note (PDF) → FLOW [pdf-sign, pdf-edit, pdf-compress]; static row 「함께 준비하는 것」:
  /stamp-maker/, /id-copy/, /pdf-merge/. Reverse related links to /loan-note/ from /power-of-attorney/, /stamp-maker/,
  /pdf-sign/ (related lists only).
- **L-D11 Registration** = FORM1020 D9 list with loan-note: tools.ts, page, og.json + OG image, JSON-LD (WebApplication
  + FAQPage), sitemap/llms generators, tool-facts, NEXT_GUIDES + tool-guide-order, lighthouserc, qa:visual,
  site/polish/growth e2e lists + tool-count tests, postbuild OG list, docs/COPY.md line, bgcloud LOCAL_SCOPE_RE,
  HOME_DESC_ORDER after power-of-attorney, usage TOOLS/labels, gen-sw NOT_PRECACHED + RUNTIME_PAGES (precache ≤ 450;
  CONTENT1021 D10 fallback order if needed), check-dist block (= FORM1020 D10 for /loan-note/: no off-site script, no
  storage calls in the tool chunks, not an ads page, initial JS logged). CLAUDE.md line 3 「차용증 만들기」 → the
  orchestrator applies it (Bob does not edit CLAUDE.md).
- **L-D12 Real-한글 gate:** npm run forms:hancom includes loan-note {blank, sample, all-max}. The Node part runs in
  Bob's gates; the 한글 2018 COM part needs a person to click 「접근 허용」 → owner item O1, non-blocking (same decision
  as FORM1020: ship on the rhwp reload gate; LOAN_HWP is the kill switch; on a 한글 FAIL set it false and switch the
  copy to PDF-only).
- **L-D13 Tool note** src/content/tool-notes/loan-note.md: 합니다체, ≥2,000 (metric T), CONTENT1021 C headings
  (「…은 이럴 때 씁니다」/「휴대폰과 PC에서 … 순서」/「결과가 이상할 때」/「주의할 점」), toolFacts for every
  maxLength/maxLines number it states, `sources` for any law number (20 %); no ≥60-char block shared with the POA note
  or any guide (D5.5).
- **L-D14 Guide** slug loan-note, title 「차용증 쓰는 법: 들어갈 내용, 이자, 가족끼리 빌릴 때」, queries 차용증 쓰는법 /
  차용증 양식 / 가족간 차용증, tools: loan-note. Rendered body ≥2,500 (scripts/guide-length.mjs). H2s: 차용증이 하는 일
  (민법 598) · 차용증에 적는 내용 (what our form has, not "legally required") · 금액은 한글과 숫자로 (practical) ·
  이자와 갚는 날 (이자제한법 2조 ①③ + 규정 20 %; 민법 379 and 603 ② quoted) · 가족끼리 빌릴 때 (L-D9) · 공증 (only if
  민사집행법 제56조 is saved; else no such H2) · 빈 양식으로 손으로 쓰기 · 안 될 때 · FAQ ×4 not copied from tools.ts.
  Figures (≥2, CONTENT1021 D5.3: /img/guide/loan-note/<n>-<name>.svg|webp, after the first H2, lazy/async,
  figcaption, alt ≥10, SVG ≤30 KB with role="img" + <title>, raster ≤80 KB, unique hash): 1-form-shot.webp =
  scripts/guide-shots.mjs of /loan-note/ with a made-up sample (홍길동/김철수, an example amount); 2-interest-cap.svg =
  약속한 이자 vs 연 20 % 한도, 넘는 부분 무효 (only quoted numbers; its text passes the fact check). Inbound: one
  sentence each from /guide/power-of-attorney/ and /guide/stamp-image/. If L0 yields < 3 official quotes, the guide
  stays draft (Known Gap) and the tool ships alone.

## Flow
```
 inputs --(차용증 만들기 | 빈 양식으로 받기)--> fieldProblem() per field --problem--> inline error + focus, no build
        | ok                                                         (빈 양식: skipped, all empty)
        v normalizeValues (amount digits, rate decimal, dates ISO)
 postMessage form-build {specId loan-note, values} --> hwp.worker getFormSpec --> build.ts
        |   cell/slot text = docText(field, value): amount → 「금 일천만원정 (10,000,000원)」 · date · number tpl · blank
        |--fail--> HwpError export --> 「차용증을 만들지 못했어요」 + 다시 해 보기
        v parsed --> render pages (SVG kept) --> preview
        v export-hwp (reload gate) --fail--> HWP error; PDF still works        [LOAN_HWP=false → no HWP button]
 「PDF로 받기」 --> pdf/export.ts --> 차용증.pdf --> 이어서 하기 (pdf-sign …)
 any edit after a build --> stale, downloads hidden
```

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| Amount input | 「1천만」, 「10만원정」, full-width digits | NFKC + strip; non-digit → fieldProblem number; unit + e2e | inline 「숫자로만 써 주세요.」 |
| Amount size | 13+ digits | tooBig; unit + e2e | inline error |
| Hangul amount | wrong reading (십 vs 일십, zero group shown) | table-driven unit ≥15 cases (1, 10, 11, 100, 10000, 10001, 100000000, 100010000, max …) | prevented |
| Rate | 「연 5」, 「5.555」, 「abc」 | only digits + one dot (≤2 decimals) after NFKC and strip of %/spaces; else number | inline error |
| Engine change | POA document changes | L-D4 dist diff + POA form-build tests unchanged | prevented |
| Overflow | all-max → 2 pages | maxLength/rowLines; all-max unit pages == 1 + e2e preview | prevented |
| Date in table | empty date row | docText blank 「     년     월     일」; unit | room to handwrite |
| HWP gate / 한글 | reload fails / 한글 refuses | export-hwp.ts codes; LOAN_HWP; O1 | clear HWP error, PDF works |
| Glyphs | labels push preload > 92.66 KB | L-D7 order; check-dist tripwire | build fails, never shipped |
| Privacy | value in beacon/URL/storage/filename | L-D8 unit + e2e (cloud usage spec too) | n/a |
| Legal tone | page reads as advice | L-D9 line + quotes only; Richard checks every law sentence vs the excerpt | n/a |
No silent untested path remains (the old "unparseable → empty" is now surfaced by fieldProblem).

## Test map
- amount.ts table [GAP → unit]; values.ts amount/number normalize + fieldProblem + docText for every kind incl.
  blank/zero/template [GAP → unit]; existing values tests [TESTED → rerun unchanged].
- lint: date in a table OK, docTemplate needs {v}, key/kind mismatches [GAP → unit]; existing lint cases [TESTED].
- build.ts real engine, loan-note blank/sample/all-max: loss 0, reload ok, pages 1, text has every docLabel and every
  docText (Hangul amount present) [GAP → unit]; POA blank/sample/all-max [TESTED → rerun, unchanged].
- ui-font-chars strips docTemplate/docBlank/docZero [GAP → unit].
- L-D4 refactor: POA unit + e2e (5 projects) + dist HTML diff [TESTED → rerun + logged diff].
- e2e /loan-note/ (5 projects, no-upload guard): fill → 만들기 → preview → HWP (Node rhwp reload; text has 「금
  일천만원정 (10,000,000원)」) → PDF (pdf.js text, fonts embedded); blank → 1-page HWP/PDF; 「1천만」 → inline error, no
  build; echo 「10,000,000원」; rate 0 → 「없음」; stale; reset restores defaults; emoji/Hanja raster page; 이어서 하기 →
  /pdf-sign/; 함께 준비 links; axe on form, field error, result; no storage writes; URL unchanged; cloud usage spec:
  payload has no typed value [GAP → e2e].
- Regression: hwp-to-pdf, hwp-viewer, hwpx-to-hwp, power-of-attorney e2e; regress:hwp --fixtures-only; chain FLOW tests
  (extend); tool-count tests [TESTED → rerun/extend].
- check-dist /loan-note/ block; tool note ≥2,000; guide ≥2,500 + D5.3–D5.5 [TESTED infra → extend].
- check:quotes --exact on the new quotes; guides-schema; link-graph; tool-notes test [TESTED → extend].
- LHCI /loan-note/ + /guide/loan-note/ median of 5; forms:hancom Node part [GAP → run, log].

## Build Order (commits; each green before the next)
- **L0** sources → handoff/sources/loan1022/*.txt (URL, Fetched date, verbatim): 민법 379, 598, 600, 603; 이자제한법 2조;
  최고이자율 규정; 상속세 및 증여세법 제41조의4 (lsiSeq via DRF); 민사집행법 제56조 (optional); a 국세청 page on
  가족 간 금전 대여 / 금전 무상대출 (optional); 대한법률구조공단 상담 안내 (optional). Log what could not be fetched.
- **L1** refactor L-D4 (own commit, no behavior change, dist diff logged).
- **L2** engine L-D3 + unit tests (POA tests untouched and green).
- **L3** spec src/data/forms/loan-note.ts + forms index + hancom-check list + 1-page all-max unit.
- **L4** page + copy + note (L-D13) + UI (L-D6) + glyph log (L-D7) + chain (L-D10) + registration (L-D11) + check-dist
  + e2e + axe → Richard → **Deploy A**. Live smoke: phone + PC, filled + blank, downloaded HWP reloads in rhwp, PDF
  opens, 이어서 하기 → pdf-sign, no off-site requests. Then IndexNow ping.
- **L5** guide L-D14 + 2 figures + inbound links → Richard → **Deploy B**.

## Gates (per deploy)
astro check 0 · vitest all · check:licenses (no new package) · check:quotes --exact · check-dist OK on default, cloud
flag-on, BG and checks builds (precache ≤ 450 KB, fonts ≤ 92.66 KB, late-800 ≤ 8 KB — all logged) · tool page ≥2,000 /
guide ≥2,500 · forms:hancom Node PASS · new + regression e2e on 5 projects with the no-upload guard (on CI if the host
runs out of memory, as CONTENT1021 C) · LHCI median of 5 · Richard "clear" · live smoke.

## Out of Scope (→ BUILD-LOG Known Gaps)
- 보증인/연대보증 칸, 분할 상환표, 지연이자·이자 계산기, live 20 % warning, Hangul amount echo in the UI,
  due-before-loan date check, 공정증서/공증 양식, 영수증(변제 확인서) 양식, DOCX/HWPX output, images in the document,
  /en/ twin, saved drafts, any tax computation.

## Acceptance
- /loan-note/ live (menu after 위임장 만들기, home, sitemap, llms.txt, OG, JSON-LD); filled + blank give a 1-page HWP
  (rhwp reload) and a 1-page PDF with embedded fonts; the amount reads 「금 …원정 (…원)」 correctly; invalid amount/rate
  blocked with an inline error; POA unchanged (dist diff + tests); no value in storage/URL/filenames/beacon/GA; budgets
  unchanged; tool page ≥2,000; COPY.md updated; Richard clear; live smoke done. Deploy B: guide live ≥2,500 with 2 own
  figures, check:quotes --exact green, L-D9 line present.

## Owner items (non-blocking; build proceeds on the defaults)
- **O1** run `npm run forms:hancom` at the PC and click 「접근 허용」 for each file (POA + loan-note), or register the
  한글 FilePathCheckerModule. Any FAIL → LOAN_HWP = false + PDF-only copy.
- **O2** push: standing go-ahead per deploy when Richard is clear and CI is green (as FORM1020).
