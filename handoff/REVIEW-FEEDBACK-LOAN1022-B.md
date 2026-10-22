# Review Feedback — LOAN1022 Step L5 (Deploy B: /guide/loan-note/)
Date: 2026-10-22
Ready for Builder: YES

Reviewed: git diff 504c468..loan1022-guide (ff70e34 + handoff), all 14 files.

## Must Fix
None.

## Should Fix
- src/content/guides/loan-note.md:156 (confidence: 8/10) — 「차용증 만들기에서 아무 칸도 채우지 않고 「빈 양식으로 받기」를 누르세요.」 The condition is wrong. `build('blank')` uses `blankValues(SPEC)` and ignores the inputs (src/tools/form-tool/controller.ts:279), and 빌린 날 / 쓴 날 are filled with today's date by default, so a visitor can never leave "every field empty". A reader may clear the form for no reason. Fix: 「「빈 양식으로 받기」를 누르면 쓴 내용과 상관없이 칸만 있는 차용증을 …」, or just drop 「아무 칸도 채우지 않고」.
- src/content/guides/loan-note.md:170 (confidence: 8/10) — 「금액이 너무 크다고 나와요」 does not match what the tool shows. The tool's message is 「1조 원보다 적게 써 주세요.」 (src/tools/loan-note/copy.ts LN_PROBLEMS.tooBig). The item above it quotes the real message, so this one should too. Fix: make the item heading 「「1조 원보다 적게 써 주세요.」가 나와요」 (check the fact checker on 「1조 원」; if it trips, keep the heading and add that message in the body).
- public/img/guide/loan-note/2-interest-cap.svg:2 `<title>` and loan-note.md:132 alt (confidence: 6/10) — 「넘는 부분**만** 무효」. 제2조 ③ says 「초과하는 부분은 무효로 한다」 and says nothing about the rest. The 「만」 is a small inference on a page that is meant to quote, not interpret. Fix: 「넘는 부분은 무효」 in both. The figcaption (「무효로 정하는 것은 점선을 넘는 부분이에요」) is already right.
- loan-note.md:169 and :134 vs src/content/tool-notes/loan-note.md:59 and :51-53 (confidence: 6/10) — tips repeated from the tool note. The 「숫자로만 써 주세요.」 item, including 「소수점 아래 두 자리까지」, repeats the note's 결과가 이상할 때 line. The 379 quote with 「0 → 없음」 repeats the note's 이자 section. Both are under the D5.5 60-char gate, so this does not block. The brief's spirit is no duplicated tips, though. Recommendation: cut the 소수점 sentence from the guide's item. The 379 paragraph can stay because the brief asks for the quote, but drop 「차용증 만들기의 「연 이자」에 0을 쓰면 「없음」」 there; line 162 and the tool page already cover it.

## Rulings on Bob's open questions
- 차주/대주 gloss (line 136): **keep.** It is a plain-word reading of the two statute terms, not a claim about what the law does. Without it the 600/603 quotes are unreadable to the audience (plain-language rule). It does not say who must do what.
- 「0 하나가 빠지면 … 열 배」 (line 118): **keep.** It is arithmetic, not a factual claim that needs a source.
- 「소리 내어 읽어 보면 틀린 곳을 찾기 쉬워요」 (line 124): **keep.** It is a practical checking step with no number and no legal or official claim, and it does not duplicate any other guide or note (grep).
- 상증법 단서 paraphrase (line 144): **accepted.** The live text is 「다만, 다음 각 호의 구분에 따른 금액이 대통령령으로 정하는 기준금액 미만인 경우는 제외한다.」 「그 금액이 … 기준금액보다 적은 경우를 빼는 단서」 is faithful. It gives no threshold, no computation and no "safe" amount, and FAQ 3 sends the reader to 국세청/세무 전문가. It does not overstate.
- 이자제한법 ④ omitted: **accepted** (the 원본 gloss would be interpretation).
- Truncated ① quote (line 128): **honest.** The quote ends at 「범위 안에서」 and the rest is unquoted (「대통령령으로 정하게 하고」), which matches the live text 「… 범위 안에서 대통령령으로 정한다.」.

## Verification done
- (a) Quotes: all 14 front-matter quotes and every inline 「…」 quote of 12+ characters in the body are verbatim substrings of handoff/sources/loan1022/*.txt. All 14 were also checked against the **live** pages fetched today: 민법 284415, 이자제한법 268667, 최고이자율 규정 230727, 상증법 276123, 민사집행법 268837, klac 132. All 14 are LIVE-OK.
- (b) No tax figure, no 적정 이자율 number, no "safe" amount. Each law statement is a quote or a faithful paraphrase of the quoted text (FAQ 1 ③, FAQ 3 41조의4). L-D9 line + 132 present (line 94), 132 wording matches klac 「132 법률상담 콜센터 … 국번 없이 132번」.
- (c) 공증: the only claims are that our document is not a 공정증서 and that a 공정증서 is made by a 공증인 (supported by the quoted 56조 item 4). There are no procedure, cost or "what to bring" claims; the reader is referred to 공증인/전문가. That is fine.
- (d) No banned words (업로드/서버/브라우저/네트워크), brand 문서딱 only, 해요체.
- Tool facts were checked against the code: amount NFKC with comma/space/trailing-원 stripped, 12 digits; rate `\d{1,3}(\.\d{1,2})?`; 일천/일백/일십 and zero groups (form-values tests: 일억이천만-pattern, 오백만); docBlank 「금 … 원정 ( … 원)」 / 「연 … %」 / 년 월 일; sign lines 채무자 then 채권자 after the date line; legend 「빌린 내용」; the comma echo under the field. All match.
- (e) Figures: the webp shows only our form with made-up values (10000000, 2026-10-22/2027-10-21, 5, 매달 25일) and has no real data. The SVG has no script, href or foreignObject, has role="img" + <title>, and its only numbers are 「연 20퍼센트」. Both of its fragments are verbatim substrings of ③ and of the 규정.
- (f) Wiring: TOOL_GUIDE_PINS, the partial/OWN_COUNT list, the guide-check webp size, lighthouserc, guide-titles, the tool-note link and both inbound sentences are in place. No threshold was lowered anywhere in the diff.

## Escalate to Architect
None.

## Cleared
The L5 guide, its 2 figures, the inbound links and the wiring all pass. All 14 quotes are verbatim against the saved and live sources, and the page gives no legal or tax advice. **LOAN1022 B is clear.** The 4 Should Fix items are copy-only; fix inline before Deploy B, then re-run check:quotes --exact and guide-length.
