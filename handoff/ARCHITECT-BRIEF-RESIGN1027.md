# Architect Brief — RESIGN1027 사직서 만들기 (+ 안내 글 「사직서 쓰는 법」)

Owner 2026-10-27: new tool on the FORM1020/LOAN1022 form engine. Research: reports/growth/사직서 시장 조사 2026-10-27.md
(Naver keyword tool 2026-10-27: 사직서양식 23,280/mo, 사직서 9,970; autocomplete 「사직서 양식 hwp / pdf / 워드 / 한글 /
다운로드 / 쓰는법」, 권고사직서, 사직서 퇴직사유, 사직서 날짜, 사직서 작성방법). Worktree wt/resign1027, branch resign1027.
House rules unchanged: the LOAN1022 brief (handoff/ARCHITECT-BRIEF-LOAN1022.md) L-D3…L-D14 apply unless a line below
says otherwise; CONTENT1021 bars from the first commit; budgets never raised; plain language (docs/COPY.md); brand
「문서딱」; every number / law sentence on a page = verbatim quote + fetch date. handoff/ARCHITECT-BRIEF.md is not ours.

## Goal
/resignation-letter/ 「사직서 만들기」: fill blanks (or none) → a 1-page 사직서 as HWP and PDF built on the device, with
one-tap 사유 presets (권고사직 included); then /guide/resignation-letter/ 「사직서 쓰는 법」.

## Arch probes (2026-10-27, curl + node fetch from this PC) — saved in handoff/sources/resign1027/
- minbeop.txt — 민법 284415/20260317: 제660조 ①②③, 제661조 (verbatim).
- goyongboheom.txt — 고용보험법 284449/20260918 (DRF): 제58조 full (「고용노동부령 으로」 has a link-artifact space:
  quote around it, as LOAN1022 did with 「대통령령 으로」).
- geunrogijun.txt — 근로기준법 285279/20261008 (DRF): 제36조(금품 청산) 「…14일 이내에…」.
- moel-1350.txt — 1350.moel.go.kr/home/: 「국번없이 1350(유료) (이용시간 : 평일 09:00 ~ 18:00)」.
- work24-home.txt — www.work24.go.kr (고용24) 200: link target only, no quote (menu page).
- Not found: a 고용24 page explaining 권고사직 vs 자진 퇴사 in prose (pages are JS menus). So nothing about 실업급여
  beyond the 제58조 quote + the two pointers (R8).
- Bob re-checks each with check:quotes --exact (source-watch) when a page quotes it; mismatch → re-fetch, re-save.

## Decisions (R1…R16)
- **R1 Scope:** a general 사직서 (employee → company). No 법정 서식 exists; the page never calls ours "official" or
  "법적 효력". Never: 퇴직금/실업급여 계산, 이직확인서, 권고사직 합의서, 사직 철회서, 인수인계서 (Known Gaps).
- **R2 Slugs/files:** tool `/resignation-letter/`, guide `/guide/resignation-letter/`, spec id `resignation-letter`,
  prefix `rs`, fileBase 「사직서」 (사직서.hwp, 사직서.pdf), kill switch `RESIGN_HWP = true` in the spec module.
  Menu / home / tools.ts / HOME_DESC_ORDER: right after loan-note.
- **R3 Fields** (page label / document docLabel; maxLength in code points):
  - table docSection 「인적 사항」: dept 「부서」/「소속」 text 30 · position 「직위」/「직위」 text 20 · name 「이름」/「성명」
    text 20 · birth 「생년월일」 text 20 · phone 「연락처」 text 20. No 주민등록번호, no 주소 (minimum data; Known Gap).
  - table docSection 「재직 사항」: joinDate 「입사일」 date · leaveDate 「퇴사 예정일」 date · reason 「그만두는 이유」/
    「사직 사유」 multiline 100, maxLines 3, rowLines 3, presets (R5).
  - para center: 「본인은 위와 같은 사유로 {leaveDate}자로 사직하고자 하오니 처리하여 주시기 바랍니다.」 (「처리」 not
    「허락」: the document must not imply the company's consent is required; we make no claim either way).
  - dateLine `date` 「내는 날」 (default today) · signLine docLabel 「성명」 field name, right · para 「{to} 귀하」 left — to =
    「받는 사람」 text 30 with a hint like 「예: ○○ 주식회사 대표이사」 (final wording per R10).
  - Defaults: only `date` = today (RS_TODAY = ['date']); joinDate/leaveDate empty (blank date 「     년     월     일」;
    in the para 「     년     월     일자로」). Reset restores exactly that.
  - Everything after the first table plain 10 pt (rhwp 0.8.6, LOAN1022 L-D5); no size/bold on the 귀하 line.
  - All-max (every field at max, reason 3 wide lines) = 1 page in rhwp (unit) and in the preview (e2e). If not, cut
    maxLength/rowLines, never the font size; log numbers.
- **R4 Title:** document 「사 직 서」 20 pt. H1 「사직서 만들기」; title tag about 「사직서 만들기 — 사직서 양식 무료,
  한글(HWP)·PDF 저장 | 문서딱」 (meta-length test decides the cut); keywords include 사직서 양식, 사직서 양식 hwp,
  권고사직서, 사직서 쓰는법 (keywords are stripped from the glyph scan).
- **R5 사유 presets (small engine change):** FormField gains optional `presets?: { chip: string; fill: string }[]` (text /
  multiline only; lint: 1–8 presets, fill length ≤ maxLength, fill lines ≤ maxLines). FormTool.astro renders under that
  input a div.pa-presets (role group, aria-label 「자주 쓰는 이유」) holding one type=button per preset with
  data-fill-for = the input id and data-fill = the fill text, showing the chip. startFormTool (entry; works before the
  controller loads) handles clicks by delegation: input.value = fill, dispatch a bubbling `input` event (the
  controller's stale logic runs as for typing), focus, caret at end. Replaces the field's text (no confirm; visible and
  editable). Hint: 「고르면 칸에 들어가요. 고쳐 써도 돼요.」 (or a core-glyph equivalent). POA and loan-note have no
  presets → their built HTML differs only in asset hashes (diff logged, as LOAN1022 L1).
  Presets (chip → fill): 개인 사정 → 「개인 사정」 · 이직 → 「다른 회사로 옮기게 되어서」 · 건강 → 「건강 문제(치료와
  회복)」 · 학업 → 「학업(진학)」 · 가족 돌봄 → 「가족 돌봄」 · 계약 끝 → 「근로계약 기간 만료」 · 회사 권고 → 「회사의
  권고에 따른 퇴사(권고사직)」. Bob may shorten chips for glyphs (R10); fills keep their meaning.
- **R6 권고사직 preset: YES.** 「권고사직서」 is in both autocomplete lists (real intent); the visitor states a fact
  about their own exit and the form needs a correct place to write it; leaving it out would steer people to 「개인
  사정」 by default, itself a choice with consequences. Guard: no claim anywhere that a wording gets or loses 실업급여;
  page/note/guide only quote 고용보험법 제58조 and point to 1350 / 고용24 (R8). FAQ 「권고사직서도 만들 수 있나요?」 →
  「그만두는 이유에서 「회사 권고」를 고르면 됩니다.」 + the R8 pointer, nothing more.
- **R7 Output:** 사직서.hwp (rhwp reload gate) + 사직서.pdf + 「빈 양식으로 받기」 as POA/loan. No DOCX (Known Gap). The
  「워드」 query is answered in the FAQ only by what we make (HWP for 한글, PDF opens anywhere); no claim about Word
  opening HWP unless sourced.
- **R8 Legal care (= LOAN1022 L-D9):** one plain line near the form and in the note: a general form, not legal advice;
  for your own case ask 고용노동부 고객상담센터 (국번없이 1350, quoted from moel-1350.txt with its date — in the note; the
  page line may name it only if 0 new glyphs) or 고용24 (link). Allowed law statements (verbatim + date only): 민법
  제660조 heading + ①② (guide 날짜 section; the heading 「기간의 약정이 없는 고용의 해지통고」 is always quoted with ②,
  never "a resignation takes effect after a month"), 제661조 (optional), 고용보험법 제58조 lead + 2호 가·나·다 (guide +
  note), 근로기준법 제36조 (guide). Never: compute a date or amount; say 「권고사직이면 실업급여를 받습니다」; advise which
  reason to write. Richard checks each law sentence against the saved excerpt.
- **R9 Privacy = FORM1020 D7 / LOAN1022 L-D8:** no storage, no values in URL/history/filenames/usage/GA; fixed
  filenames; tool page CSP self; not an ads content page; usage id `resignation-letter` (FormToolId, scripts/lib/
  usage.mjs TOOLS + label), same events as loan-note, never a value; a chip press sends nothing.
- **R10 Glyphs (= LOAN1022 L-D7):** preload ≤ 92.66 KB, late-800 ≤ 8 KB, never raised. Core-glyph words first (diff
  candidate labels/chips/FAQ before writing); document text under doc keys; preset `fill` is document + input text →
  add `fill` to the ui-font-chars.mjs strip regex (+ unit): in the textarea it renders like any typed text (per-glyph
  font-stack fallback). If chips still add core glyphs: chips get the system-font stack (.pa-presets into the app.css
  line-500 list) and `chip` is stripped too. Log glyphs + KB either way. Target 0 new core glyphs.
- **R11 Chain:** NextSource resignation-letter (PDF) → FLOW [pdf-sign, pdf-edit, pdf-compress]; static 「함께 준비하는
  것」: /stamp-maker/, /stamp-signature/. Reverse related links to /resignation-letter/ from /loan-note/,
  /power-of-attorney/, /stamp-maker/ (related lists only).
- **R12 Registration = LOAN1022 L-D11 list:** tools.ts (FAQ ×4–5, not copied into the note), page, og.json + OG image,
  JSON-LD (WebApplication + Breadcrumb + FAQPage), sitemap/llms generators, tool-facts, NEXT_GUIDES + tool-guide-order
  (Step C), lighthouserc (tool in B, guide in C), qa:visual, site/polish/growth e2e lists + count tests (home cards +1,
  tool-notes +1), postbuild OG list, docs/COPY.md line, bgcloud LOCAL_SCOPE_RE, HOME_DESC_ORDER, usage TOOLS/labels,
  gen-sw NOT_PRECACHED + sw.ts RUNTIME_PAGES for the tool page (guides are already excluded); precache ≤ 450 KB (now
  ~390 KB production flags; log before/after). check-dist FORM_TOOLS: slug resignation-letter, prefix rs, initialKb and
  lazyKb = measured + 20 % (CARD1026 C14), logged; POA/loan limits unchanged and still met after the entry grows.
  tests/helpers/form-samples.ts sample (made-up: 홍길동, ○○ 주식회사). forms:hancom list (blank/sample/all-max).
  CLAUDE.md line 3 「사직서 만들기」 → orchestrator (Bob does not edit CLAUDE.md).
- **R13 Real-한글 gate = LOAN1022 L-D12:** ship on the rhwp reload gate + forms:hancom Node part; 한글 COM = owner O1.
  FAIL → RESIGN_HWP = false + PDF-only copy.
- **R14 Tool note** src/content/tool-notes/resignation-letter.md: 합니다체, ≥2,000 (metric T), CONTENT1021 C headings
  (「사직서 만들기는 이럴 때 씁니다」/「휴대폰과 PC에서 … 순서」/「결과가 이상할 때」/「주의할 점」), toolFacts for each
  maxLength/maxLines it states, `sources` for each quote (고용보험법 58, 1350); no ≥60-char block shared with the POA/
  loan notes or any guide (D5.5).
- **R15 Guide (Step C)** slug resignation-letter, title 「사직서 쓰는 법: 들어갈 내용, 날짜, 퇴직 사유」, queries 사직서
  쓰는법 / 사직서 양식 / 사직서 날짜 / 사직서 퇴직사유 / 권고사직서, tools: resignation-letter. Rendered ≥2,500. H2s:
  사직서가 하는 일 (민법 660 heading + ①) · 사직서에 적는 내용 (our form's parts, not "legally required") · 퇴사 날짜
  정하기 (660 ② with its heading; "근로계약서·취업규칙에 정한 내용이 있는지 먼저 보세요" as practical, no effect claim) ·
  퇴직 사유 쓰기 (presets; 권고사직 → 58조 quote + 1350/고용24) · 퇴사 뒤 정산 (근로기준법 36) · 내는 방법 (인쇄 + 서명,
  /pdf-sign/, /stamp-maker/) · 빈 양식으로 손으로 쓰기 · FAQ ×4 not copied from tools.ts. Figures (CONTENT1021 D5.3):
  1-form-shot.webp (scripts/guide-shots.mjs, made-up sample, fixed dates); 2-letter-parts.svg = the 사직서's parts
  labelled (제목 · 인적 사항 · 재직 사항 · 사직 사유 · 날짜 · 서명 · 받는 사람); no numbers, no timeline (a timeline would
  read as a date computation). Inbound: one sentence each from /guide/loan-note/ and /guide/power-of-attorney/. If < 3
  quotes pass check:quotes, the guide stays draft (Known Gap).
- **R16 Steps:** A engine + spec (no page, no deploy) → B page (Deploy A) → C guide (Deploy B); each its own review.

## Flow
```
 chip press (entry; before or after the controller) --> input.value = fill --> bubbling 'input' --> stale/dirty as typing
 inputs --(사직서 만들기 | 빈 양식으로 받기)--> fieldProblem() (no blocking kinds here) --> normalizeValues
 postMessage form-build {specId resignation-letter, values} --> hwp.worker getFormSpec --> build.ts
        |  slots: {leaveDate} → docText date (empty → BLANK_DATE) · {to} empty → BLANK_SLOT
        |--fail--> HwpError --> 「사직서를 만들지 못했어요」 + 다시 해 보기
        v parsed --> render pages --> preview
        v export-hwp (reload gate) --fail--> HWP error; PDF still works        [RESIGN_HWP=false → no HWP button]
 「PDF로 받기」 --> 사직서.pdf --> 이어서 하기 (pdf-sign / pdf-edit / pdf-compress)
 any edit after a build (typing or chip) --> stale, downloads hidden
```

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| Chip before controller loads | value set, controller misses it | entry sets the DOM value; controller reads values from the DOM at build; e2e chip-then-만들기 | text in the document |
| Chip after a build | document stale but downloads still shown | bubbling input → stale; e2e | stale notice |
| Chip over typed text | the visitor's words replaced | by design, visible, hint says so; e2e asserts replace | new text, editable |
| Preset too long | fill > maxLength / maxLines | lint unit over all presets | prevented |
| Date slot | empty leaveDate | BLANK_DATE + 「자로」; unit text check | room to handwrite |
| Engine change | POA/loan output or HTML changes | dist HTML diff (hashes only) + POA/loan unit/e2e rerun | prevented |
| Overflow | all-max → 2 pages | maxLength/rowLines; unit + e2e | prevented |
| HWP gate / 한글 | reload fails / 한글 refuses | export-hwp codes; RESIGN_HWP; O1 | HWP error, PDF works |
| Glyphs | chips/labels push preload > 92.66 KB | R10 order; check-dist tripwire | build fails, never shipped |
| Precache | menu/home entries push > 450 KB | tool page runtime-cached; gen-sw fails the build | build fails, never shipped |
| Privacy | value or chip text in beacon/URL/storage | R9 unit + e2e + cloud usage spec | n/a |
| Legal tone | page reads as 실업급여 advice | R8 list; Richard checks each law sentence vs excerpt | n/a |
No silent untested path.

## Test map
- spec lint: presets kind/count/length/lines [GAP → unit]; existing lint cases [TESTED → rerun].
- build.ts real engine, resignation-letter blank/sample/all-max: loss 0, reload ok, pages 1, text has every docLabel,
  「사 직 서」, the para with a formatted date and with the blank date, 「귀하」; one build per preset fill [GAP → unit].
- ui-font-chars strips `fill` (and `chip` if the R10 fallback is used) [GAP → unit].
- chip handler: sets value, fires input, focus, before and after load [GAP → e2e].
- POA + loan: unit, e2e, dist HTML diff [TESTED → rerun + logged diff].
- e2e /resignation-letter/ (5 projects, no-upload guard): fill → 만들기 → preview → HWP (Node rhwp reload; text has
  「…일자로 사직하고자」) → PDF (pdf.js text, fonts embedded); blank → 1-page HWP/PDF; chip before load and after a build
  (stale); 회사 권고 fill text in the PDF; reset restores today only; emoji raster page; 이어서 하기 → /pdf-sign/; 함께
  준비 links; axe on form, chips, result; no storage writes; URL unchanged; cloud usage spec: no typed value or preset
  text in the payload [GAP → e2e].
- Regression: hwp-to-pdf, hwp-viewer, hwpx-to-hwp, power-of-attorney, loan-note e2e; regress:hwp --fixtures-only;
  chain FLOW + next-steps unit; tool-count tests [TESTED → rerun/extend].
- check-dist form block; tool note ≥2,000; guide ≥2,500 + D5.3–D5.5; check:quotes --exact; guides-schema; link-graph;
  tool-notes test [TESTED infra → extend]. LHCI tool + guide median of 5; forms:hancom Node [GAP → run, log].

## Build Order (commits; each green before the next)
- **A1** sources: confirm handoff/sources/resign1027/* (re-fetch any a quote will use; keep the headers).
- **A2** engine R5 (spec type + lint + FormTool.astro chips + entry delegation + ui-font-chars `fill`) + unit; POA/loan
  dist HTML diff logged (hashes only).
- **A3** spec src/data/forms/resignation-letter.ts (R3, RESIGN_HWP) + forms index + hancom-check list + 1-page all-max
  unit + form-samples → Richard (A). No deploy.
- **B1** page + src/tools/resignation-letter/{config,copy,controller,entry}.ts (loan-note pattern) + note R14 + R8 line
  + glyph log R10 + chain R11 + registration R12 + check-dist + e2e + axe → Richard (B) → **Deploy A**. Live smoke:
  phone + PC, filled + blank + 회사 권고 chip, HWP reloads in rhwp, PDF opens, 이어서 하기 → pdf-sign, no off-site
  requests beyond the allowed beacons. IndexNow ping.
- **C1** guide R15 + 2 figures + inbound links + NEXT_GUIDES/tool-guide-order + lighthouserc → Richard (C) → **Deploy B**.

## Gates (per deploy)
astro check 0 · vitest all · check:licenses (no new package) · check:quotes --exact · check-dist OK on default and
production-flag builds (precache ≤ 450 KB, preload ≤ 92.66 KB, late-800 ≤ 8 KB, form-tool KB limits — all logged) ·
tool page ≥2,000 / guide ≥2,500 · forms:hancom Node PASS · new + regression e2e on 5 projects with the no-upload guard
(CI if the host is low on memory) · LHCI median of 5 · Richard "clear" · live smoke. Wait for green CI before merging
(LOAN1022 lesson: --auto does not gate here).

## Out of Scope (→ BUILD-LOG Known Gaps)
- DOCX/워드 and HWPX output; 주민등록번호/주소 칸; 퇴직금·실업급여·연차 계산; date-order checks (퇴사 before 입사, 내는
  날 after 퇴사); 권고사직 합의서, 사직 철회서, 인수인계서, 이직확인서; company logo/도장 image in the document; saved
  drafts; /en/ twin; any advice on which reason to choose.

## Acceptance
- /resignation-letter/ live (menu after 차용증 만들기, home, sitemap, llms.txt, OG, JSON-LD); filled + blank → 1-page
  HWP (rhwp reload) + 1-page PDF with embedded fonts; chips fill 사유 (before and after load) and mark stale; the para
  reads 「본인은 위와 같은 사유로 YYYY년 M월 D일자로 사직하고자 하오니 처리하여 주시기 바랍니다.」; POA/loan unchanged
  (diff + tests); no value in storage/URL/filenames/beacon/GA; budgets unchanged; tool page ≥2,000; COPY.md updated;
  Richard clear; live smoke done.
- Deploy B: guide live ≥2,500 with 2 own figures, check:quotes --exact green, R8 line present, no 실업급여 claim.

## Owner-only (non-blocking; the build proceeds on the defaults)
- **O1** `npm run forms:hancom` at the PC, click 「접근 허용」 for 사직서 blank/sample/all-max (and the still-open POA/loan
  files). Any FAIL → RESIGN_HWP = false + PDF-only copy.
- **O2** phone check after Deploy A: iPhone Safari + Galaxy (Chrome / 삼성 인터넷): chip taps, date pickers, 사직서.pdf
  and 사직서.hwp open.
- **O3** merge/push per deploy after Richard clear + green CI.
