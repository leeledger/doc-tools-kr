# Architect Brief — QUOTE1112 견적서·거래명세서 만들기 (+ 안내 글 「견적서·거래명세서 쓰는 법」)

Owner task 2026-11-12. Worktree wt/quote1112, branch quote1112 (base origin/main 052cd49). All work in that folder only.
Research: reports/growth/tool-scout-2026-11-01.md on origin/scout/2026-11-01 ranks it #2 (Naver keyword tool 2026-10-27:
견적서양식 13,040 + 거래명세서양식 8,370 /mo, PC 71–74 %; weekly reuse by small businesses). Not re-fetched today
(main Chrome 9333 down after a Windows restart; the new profile has no Naver login). 이력서 (#1) deferred (사람인/잡코리아;
HWP photo unverified then — now partly answered by probe q1 below). House rules: RESIGN1027 brief R3/R7–R14 and the
LOAN1022 brief L-D3…L-D14 apply unless a line below says otherwise; CONTENT1021 bars; budgets never raised; docs/COPY.md
plain words; brand 「문서딱」; every number on a page = official quote + fetch date. English pages untouched.

## Goal
/quotation/ 「견적서·거래명세서 만들기」: pick 견적서 or 거래명세서, fill 공급자/공급받는자 and 품목 rows (품명·규격·수량·단가)
→ 공급가액·세액·합계 and 「일금 …원정」 computed on the device → a 1-page HWP + PDF (optional 직인 picture), or the blank
form; then /guide/quotation/.

## Arch probes (2026-11-12) — handoff/sources/quote1112/
- vat-law.txt — 부가가치세법 lsiSeq 276117, efYd 20260102 「[시행 2026. 1. 2.] [법률 제21065호, 2025. 10. 1., 타법개정]」,
  fetched 2026-11-12 (server HTML): 제29조①③, 제30조 「부가가치세의 세율은 10퍼센트로 한다.」, 제31조, 제32조① lead + 1–5호.
  DRF lawSearch OC=test answered verbatim 「사용자 정보 검증에 실패하였습니다.」 today, so the ids came from
  https://www.law.go.kr/법령/부가가치세법 (iframe src). 「제32조( 세금계산서 등)」 has a link-artifact space: quote around it.
- probe-q1/q1b/q1c/q1d.mjs (+ .out.txt), rhwp 0.8.6 in Node:
  - insertPicture works: inline in a body paragraph (cell_path '') and floating in a table cell both answer ok:true; export
    content-loss count 0; the reloaded file renders an `<image>`. Reload pages 1 in every variant.
  - Two label tables (7 + 3 rows, merged section column) + a 7-column grid of 4–20 rows at row height 1400, short text:
    1 page in memory and after reload (q1c/q1d; merge, applyParaFormat and the 20 pt title do not matter).
  - q1/q1b: the same with all-max cells (long 주소, 15-char amounts in a 6400 HU column → wrapping) = **2 pages in
    memory, 1 after reload**. So: column widths must fit the widest amount on one line, and Bob must find the cause of the
    memory/reload split before A3 (buildForm returns the in-memory count; the preview shows it). Gate = in-memory 1 page.
  - Not probed: the PDF path (hwp-shared export-chunk) with a picture; 한글 opening a file with a picture (owner O1).

## Decisions (Q1…Q18)
- **Q1 Scope:** a general 견적서 / 거래명세서 for small sellers. Neither is a 법정 서식; the page never says "official".
  Never a 세금계산서: one plain line near the form and in the note — 「이 서류는 세금계산서가 아닙니다. 세금계산서는 따로
  발급해야 합니다.」 + 국세청 홈택스 link (link only, no claim about 전자 발급 rules). The note may quote 제32조① lead.
- **Q2 Slugs/ids:** tool `/quotation/`, guide `/guide/quotation/`, usage + FormToolId + NextSource id `quotation`, prefix
  `qt`, two specs `quotation` (fileBase 「견적서」) and `transaction-statement` (fileBase 「거래명세서」), kill switch
  `QUOTE_HWP = true`. Menu / home / tools.ts / HOME_DESC_ORDER: right after resignation-letter.
- **Q3 Two specs, one field list:** src/data/forms/quotation.ts exports both; they share the same `fields` array (unit:
  reference-equal) and differ only in title (「견 적 서」 / 「거 래 명 세 서」, 20 pt), the closing para (「위와 같이
  견적합니다.」 / 「위와 같이 거래하였습니다.」) and fileBase. The page shows a radio 「만들 서류」 (견적서 default /
  거래명세서) above the fields; FormToolConfig gains `specs?: FormSpec[]` (the radio picks the spec id sent to the worker;
  one-spec tools unchanged). Changing the radio after a build = stale.
- **Q4 Engine additions (A2, generic, lint-covered):**
  - kind `quantity`: NFKC, commas/spaces dropped, up to 6 integer digits + up to 2 decimals, 0 allowed; doc text grouped
    (「1,000」, 「2.5」).
  - amount gains `allowZero?: boolean` and `maxDigits?: number` (up to 12; lint: amount only). Item 단가: allowZero, 10 digits.
  - kind `choice` with `options: {value, label, doc?}[]` (2–4, lint), rendered as a radio group; any other value → the
    first option. Used for `vat`: 별도 (default) · 포함 · 없음; labels 「부가세 별도」 「부가세 포함」 「부가세 없음」.
  - block `items { rows: number; vatField: string; colWidths: number[7]; rowHeight }` = the home of every item field and
    of the vat field. Item fields are generated in the spec module: `i{n}Name` text 30, `i{n}Spec` text 16, `i{n}Qty`
    quantity, `i{n}Price` amount (allowZero, maxDigits 10), n = 1…ITEM_ROWS. Grid: header 번호·품명·규격·수량·단가·
    공급가액·세액, ITEM_ROWS rows, a 합계 row (번호…단가 merged 「합 계」, 공급가액 sum, 세액 sum).
  - computed slots `{=totalHangul}` `{=totalDigits}` `{=vatNote}` in para docs; lint: only in a spec with an items block,
    only those names. signLine gains `mark?: string` (default SIGN_MARK) and `seal?: true`.
  - buildForm(doc, spec, values, extras?: { seal?: { bytes, w, h, ext } }); FormDocument gains insertPicture. Seal: inline
    at the end of the seal signLine in place of its mark, 15 mm box keeping the aspect (4252 HU on the long side).
- **Q5 Arithmetic (src/lib/form/ledger.ts, pure, BigInt, own code):** q = quantity in hundredths, p = 단가 won.
  line = floor(q × p / 100). 별도: supply = line, tax = floor(supply / 10). 포함: tax = floor(line / 11), supply = line − tax.
  없음: supply = line, tax 0 (세액 cells empty, 합계 세액 empty). Totals = sums; total = supply sum + tax sum. A row with
  name/spec only (no 수량, no 단가) prints as text, amounts empty, adds nothing. A row with exactly one of 수량/단가 →
  problem `pair` 「수량과 단가를 함께 넣어 주세요」 (blocks the build, names the row). Any line/total over 10 digits →
  problem `tooBig` on the totals line (our own limit, said as 「100억 원 넘는 금액은 만들 수 없어요」). Rows are compacted:
  filled rows top, numbered 1…k, the rest blank. The page note states the method in plain words (「줄마다 계산하고 원
  아래는 버립니다」); 10 % cites 부가가치세법 제30조 (vat-law.txt, 2026-11-12); 포함 mode's split cites 제29조③ 「부가가치세는
  포함하지 아니한다」 for what 공급가액 means. No other rounding claim.
- **Q6 Amount line:** para 「합계 금액  일금 {=totalHangul}원정 ({=totalDigits}원) {=vatNote}」, amountHangul()
  (LOAN1022 own code, 일천 style; no es-hangul). vatNote: 별도/포함 → 「(부가세 포함)」, 없음 → 「(부가세 없음)」. No ₩.
  Blank / no amounts → 「일금 {BLANK_SLOT}원정 ({BLANK_SLOT}원)」 and no vatNote.
- **Q7 Fields** (page label / docLabel; lengths in code points; Bob may cut to keep 1 page, never the font):
  - table docSection 「공급받는자」: recvName 「받는 곳 이름」/「상호(성명)」 30 · recvBizNo 「사업자등록번호」/「등록번호」
    14 · recvPhone 「연락처」/「연락처」 20.
  - table docSection 「공급자」: bizNo 「사업자등록번호」/「등록번호」 14 · bizName 「상호」 30 · ceo 「대표자」/「성명」 20 ·
    address 「주소」 60 · bizType 「업태」 20 · bizItem 「종목」 20 · phone 「연락처」 20.
  - para amount line (Q6) · items (Q4, ITEM_ROWS = 10; cut to 8 if all-max does not fit; log) · table (no section) note
    「비고」 multiline 100, maxLines 3, rowLines 3, presets: 「견적일로부터 30일 동안 유효합니다.」 · 「배송비 별도」 ·
    「납품 후 30일 안에 지급」 (chips short; R5 engine) · closing para (Q3) · dateLine `date` 「작성일」 (today) · signLine
    docLabel 「공급자」 field ceo, mark 「(인)」, seal.
  - No format check on 등록번호 (no number claim without a source; text only). Page fieldset legends: 「우리 쪽 (공급자)」
    and 「받는 쪽 (공급받는자)」.
- **Q8 Page items UI:** each row = a fieldset 「품목 n」 with 4 inputs (inputmode decimal/numeric for 수량/단가); rows 1–3
  shown, 「품목 줄 더하기」 reveals the next up to ITEM_ROWS (entry-level, works before the controller), focus moves to the
  new 품명. Grid on wide screens (720 px and up), 2×2 below. A live totals box (aria-live polite) under the rows: 공급가액
  합계 · 부가세 · 합계 · 일금 …원정, from ledger.ts, updated on every input once the controller is loaded (it loads on
  first focus/pointer). The PDF/HWP numbers equal the box (e2e).
- **Q9 직인 picture (optional):** 「직인 그림 넣기 (선택)」 file input, PNG/JPG; decoded locally, downscaled to 600 px max,
  re-encoded PNG (no metadata), input over 2 MB → a plain error; 「빼기」 button. Never sent anywhere; never stored by us.
  Arrival from 도장 만들기: /stamp-maker/'s result gets a second link 「견적서에 찍기」 that stores the PNG with the
  existing sign-handoff module (same keys, from 'stamp-maker') and opens /quotation/, which reads it once and removes
  it (pdf-sign's read pattern; arrival line 「도장 만들기에서 만든 그림을 가져왔습니다.」). Storage blocked → the existing
  HANDOFF_FAILED path. A link 「직인 그림이 없으면 도장 만들기」 → /stamp-maker/. Picture changes = stale.
- **Q10 Output:** 견적서.hwp / 거래명세서.hwp (reload gate) + .pdf + 「빈 양식으로 받기」 (10 empty rows, blank amount line,
  blank date). No Excel, no DOCX (Known Gaps). FAQ answers 「엑셀」 only with what we make.
- **Q11 Privacy (= RESIGN1027 R9):** no storage of values, nothing in URL/history/filenames/usage/GA; fixed filenames;
  tool page CSP self; not an ads content page. Usage `quotation`, same events as resignation-letter plus one enum on
  build `o: 'doc', v: 'quotation' | 'transaction-statement'` (scripts/lib/usage.mjs whitelist + unit); never a value,
  never whether a seal was used.
- **Q12 Glyphs (= R10):** preload cap 92.66 KB, late-800 cap 8 KB. Core-glyph words first; doc text under doc keys; option
  `doc` and preset `fill` stripped; system-font fallback for chips/option labels only if needed. Log glyphs + KB.
- **Q13 Precache:** CLOUD-HANDOFF says production 444.8 / 450 KB; SEARCH1031 logged 408.8 default / 414.5–419.2
  production-flag — measure now. /quotation/ is runtime-cached (gen-sw NOT_PRECACHED + RUNTIME_PAGES). Log before/after;
  if the menu and home entries push it over 450, first move a low-use page to runtime cache in its own commit (Bob picks
  from reports/growth/2026-46.md, logs why). Never raise the cap.
- **Q14 Chain + affiliate:** NextSource quotation (PDF) → FLOW [pdf-sign, pdf-merge, pdf-compress]; static 「함께 쓰는
  것」: /stamp-maker/, /pdf-sign/. Reverse related links from /stamp-maker/, /loan-note/. Result screen only: TOOL_LP
  quotation { lead 'signgate', dests ['lp-signgate'] } and Coupang fallback TOOL_AFF ['cp-stamp'] + TOOL_LEAD
  'stamp-signature' (loan-note pattern); check-dist placement asserts; 0 on the empty screen.
- **Q15 Registration = R12 list** (tools.ts FAQ ×4–5, OG, JSON-LD, sitemap/llms, tool-facts, lighthouserc, qa:visual,
  e2e lists + count tests, postbuild OG, docs/COPY.md, bgcloud LOCAL_SCOPE_RE, HOME_DESC_ORDER, usage TOOLS/labels,
  check-dist FORM_TOOLS slug quotation prefix qt, initialKb/lazyKb = measured + 20 %, others unchanged and still met,
  form-samples (made-up: ○○상사, 홍길동), forms:hancom list (quotation + statement: blank/sample/all-max/with seal)).
  Title about 「견적서·거래명세서 만들기 — 양식 무료, 부가세·합계 자동, 한글(HWP)·PDF | 문서딱」 (meta-length test
  decides); keywords 견적서 양식, 견적서양식 hwp, 거래명세서 양식, 거래명세표. CLAUDE.md line 3 → orchestrator.
- **Q16 Tool note** src/content/tool-notes/quotation.md: 2,000+, CONTENT1021 C headings, sources for 제30조 / 제29조③ /
  제32조① with fetch date, toolFacts for every limit it states (ITEM_ROWS, lengths, 100억), no 60+-char block shared
  with other notes/guides.
- **Q17 Guide (Step C)** /guide/quotation/ 「견적서·거래명세서 쓰는 법: 들어갈 내용, 부가세 계산, 세금계산서와 차이」,
  tools: quotation, 2,500+ rendered. H2s: 견적서와 거래명세서는 언제 쓰나 (no law claim) · 들어갈 내용 (our form's parts) ·
  공급가액과 부가세 (제29조①③, 제30조, 제31조 verbatim; a worked example from our own arithmetic, labelled as our
  calculation) · 부가세 별도와 포함 · 세금계산서와 다른 점 (제32조① lead + 1–5호 verbatim; 홈택스 link) · 직인 찍기
  (/stamp-maker/, /pdf-sign/) · 빈 양식으로 손으로 쓰기 · FAQ ×4 not from tools.ts. Figures: 1-form-shot.webp
  (guide-shots, made-up, fixed date), 2-quote-parts.svg (parts labelled, no numbers). Fewer than 3 quotes passing
  check:quotes → draft. Inbound: one sentence from /guide/loan-note/ or /guide/stamp-image/.
- **Q18 Steps:** A engine + specs (no page, no deploy) → B page + seal + stamp-maker link (Deploy A) → C guide (Deploy B).

## Flow
~~~
 radio 만들 서류 --+  inputs -(input)-> [controller loaded?] -yes-> ledger.compute(values, vat) -> totals box
                  v
 (만들기 | 빈 양식) -> fieldProblem (number/tooBig/zero) + ledger problems (pair/tooBig) -any-> inline error, no build
                  v ok
 postMessage form-build {specId quotation|transaction-statement, values, seal?: PNG bytes (transferred)}
   -> worker getFormSpec -> ledger (again, worker side) -> build.ts: paras, tables, items grid, {=...} slots,
      seal inline at the sign line -fail-> HwpError -> 「견적서를 만들지 못했어요」 + 다시 해 보기
   -> pages (in-memory = 1) -> preview -> export-hwp (reload gate) -fail-> HWP error; PDF still works
 「PDF로 받기」 -> 견적서.pdf / 거래명세서.pdf -> 이어서 하기 (pdf-sign, pdf-merge, pdf-compress)
 any edit / radio / seal change after a build -> stale, downloads hidden
 /stamp-maker/ result 「견적서에 찍기」 -> sessionStorage (sign-handoff) -> /quotation/ reads once, removes -> seal set
~~~

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| Arithmetic | float rounding / past 2^53 | BigInt ledger; unit table incl. 10-digit price × 999,999.99 | n/a (exact) |
| 포함 split | supply + tax differs from line | tax = floor(line/11), supply = line − tax; unit invariant over random cases | n/a |
| Half row | 수량 without 단가 | pair problem names the row; e2e | 「수량과 단가를 함께…」 |
| Too big | total 100억 or more | tooBig; unit + e2e | plain error, no build |
| Page vs worker | totals box differs from document | same ledger.ts both sides; e2e compares box text to PDF text | n/a |
| Layout | all-max = 2 pages (probe q1) | widths fit widest amount; cut rows/lengths; unit in-memory pages 1 per spec × mode × seal | prevented |
| Seal picture | huge/odd file, decode fails | type/size check, decode error line; unit + e2e with a bad file | plain error, form still builds |
| Seal in PDF | export-chunk drops the image | e2e: PDF has an image XObject when sealed | prevented (test) |
| Seal in 한글 | 한글 refuses the picture | O1; FAIL → seal PDF-only (HWP built without it, line says so) | told plainly |
| Handoff | storage blocked / stale PNG | existing sign-handoff paths; read-once remove; e2e | HANDOFF_FAILED line |
| Two specs | radio changed after a build | stale; e2e | stale notice |
| Engine change | POA/loan/resign output changes | dist HTML diff (hashes only) + their unit/e2e rerun | prevented |
| Precache / glyphs | over budget | gen-sw / check-dist fail the build | never shipped |
| Privacy | value/seal in beacon, URL, storage | Q11 unit + e2e + cloud usage spec; storage only the existing handoff key, removed on read | n/a |
| Tax tone | page reads as tax advice / 세금계산서 | Q1 line; Richard checks each law sentence vs vat-law.txt | n/a |
No silent untested path.

## Test map
- lint: quantity, choice (2–4 options), allowZero/maxDigits only on amount, items block homes, computed slots only with
  items, signLine mark/seal [GAP → unit]; existing lint [TESTED → rerun].
- values: quantity normalize (full-width, commas, 3 decimals rejected, 7 digits rejected), allowZero, maxDigits, choice
  fallback [GAP → unit].
- ledger.ts: 3 modes × a table of cases (incl. 1 × 11,000 포함 → 10,000 / 1,000; 3 × 333 별도 → 999 / 99; 2.5 × 1,001 별도
  → 2,502 / 250), invariant (포함 supply + tax = line), compaction, pair, tooBig [GAP → unit].
- build.ts real engine: both specs × blank/sample/all-max × 별도/포함/없음 × seal on/off → in-memory pages 1, reload ok,
  loss 0, text has every docLabel, the amount line, 「합 계」, the closing para; sealed reload has an image [GAP → unit].
- POA / loan / resign: unit, e2e, dist HTML diff [TESTED → rerun + logged diff].
- e2e /quotation/ (5 projects, no-upload guard): 견적서 filled 3 rows → totals box = PDF text = HWP text (Node rhwp);
  거래명세서 title + filename; 포함 and 없음 modes; add-row to 10 and the button gone; pair/tooBig errors; blank → 1-page
  HWP/PDF; seal file → PDF image XObject; bad file error; stamp-maker 「견적서에 찍기」 → seal arrives, key removed; stale on
  edit/radio/seal; reset; 이어서 하기 → /pdf-sign/; affiliate group on the result only; axe on form, rows, result; no
  storage writes besides the handoff read/remove; URL unchanged; cloud usage spec: no value, only the doc enum [GAP → e2e].
- stamp-maker regression (its e2e + the new link) [TESTED → extend]; hwp-to-pdf, hwp-viewer, hwpx-to-hwp e2e;
  regress:hwp --fixtures-only; chain FLOW + next-steps unit; tool-count tests [TESTED → rerun/extend].
- check-dist form block + affiliate placements; note 2,000+; guide 2,500+ and D5.3–D5.5; check:quotes --exact;
  guides-schema; link-graph; LHCI tool + guide median of 5; forms:hancom Node [GAP → run, log].

## Build Order (commits; each green before the next)
- **A1** probe: extend probe-q1 to all-max with the real widths; find the memory/reload page split; save as
  handoff/sources/quote1112/probe-a1.mjs + out; log the widths chosen.
- **A2** engine Q4 + ledger.ts Q5 + values + lint + unit; POA/loan/resign dist HTML diff (hashes only), logged.
- **A3** specs src/data/forms/quotation.ts (Q3, Q6, Q7, QUOTE_HWP) + forms index + hancom-check list + 1-page matrix
  unit + form-samples → Richard (A). No deploy.
- **B1** page src/pages/quotation.astro + src/tools/quotation/{config,copy,controller,entry}.ts (resignation-letter
  pattern) + FormTool items/choice/specs rendering + totals box + seal input (Q8, Q9) + note Q16 + Q1 line + Q12 glyph log
  + Q13 precache log + Q14 + Q15 + check-dist + e2e + axe.
- **B2** stamp-maker 「견적서에 찍기」 + handoff read on /quotation/ + e2e → Richard (B) → **Deploy A**. Live smoke: PC +
  phone, 견적서 3 rows 별도, 거래명세서 포함, blank, seal from a file and from 도장 만들기, HWP reloads, PDF opens with the
  seal, 이어서 하기 → pdf-sign, no off-site requests beyond the allowed beacons. IndexNow ping.
- **C1** guide Q17 + figures + inbound + NEXT_GUIDES/tool-guide-order + lighthouserc → Richard (C) → **Deploy B**.

## Gates (per deploy)
astro check 0 · vitest all · check:licenses (no new package) · check:quotes --exact · check-dist OK on default and
production-flag builds (precache cap 450 KB, preload 92.66 KB, late-800 8 KB, form KB limits — all logged) · note 2,000+ /
guide 2,500+ · forms:hancom Node PASS · new + regression e2e on 5 projects with the no-upload guard (this PC runs Node 26,
CI 22 — CI is the gate) · LHCI median of 5 · Richard "clear".
**Deploy path:** push branch quote1112 (gh at "C:/Program Files/GitHub CLI/gh.exe", GH_CONFIG_DIR=C:/Users/force/.config/
gh-doc-tools-kr, account leeledger) → PR to main → wait for green CI (--auto does not gate here) → merge → Cloudflare
deploys main → live smoke → BUILD-LOG. Commits list paths explicitly (never git add -A).

## Out of Scope (→ BUILD-LOG Known Gaps)
- 세금계산서/영수증; Excel/DOCX/HWPX output; 공급자·공급받는자 보관용 2-up page; side-by-side party boxes; 단위 and per-row
  비고 columns, 할인 row, more than ITEM_ROWS rows / a page 2; 등록번호 format check; saving 공급자 details for next time
  (needs local storage of values — owner question O4); /en/ twin; tax advice; seal from /stamp-signature/.

## Acceptance
- /quotation/ live (menu after 사직서 만들기, home, sitemap, llms.txt, OG, JSON-LD); 견적서 and 거래명세서, filled and blank →
  1-page HWP (rhwp reload) + 1-page PDF, embedded fonts; totals box = document numbers in all 3 VAT modes; 「일금 …원정」
  correct; seal from a file and from 도장 만들기 shows in the PDF (and the HWP unless O1 fails); 세금계산서 line present;
  POA/loan/resign unchanged (diff + tests); no value in storage/URL/filenames/beacon/GA; budgets unchanged; note 2,000+;
  COPY.md updated; Richard clear; live smoke done.
- Deploy B: guide live 2,500+ with 2 own figures, check:quotes --exact green, no tax-advice sentence.

## Owner-only (non-blocking; the build proceeds on the defaults)
- **O1** npm run forms:hancom at the PC, 「접근 허용」 for quotation/statement blank/sample/all-max/sealed. A sealed FAIL →
  seal PDF-only; any other FAIL → QUOTE_HWP = false + PDF-only copy.
- **O2** phone check after Deploy A: iPhone Safari + Galaxy: add-row, number keyboards, seal file pick, files open.
- **O3** fresh Naver volumes for 견적서양식 / 거래명세서양식 / 거래명세표 when Chrome 9333 is back (log only).
- **O4** product question, later: keep 공급자 details on this device for next time (localStorage)? Today's rule says no
  storage of values; default = no.
