# Review Feedback — RESIGN1027 Step C (/guide/resignation-letter/)
Date: 2026-10-27
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/content/guides/resignation-letter.md:122 (confidence: 6/10). The 661 paragraph ends with 「정해 둔 계약 기간이 끝나서 그만두는 경우라면 사유 칸의 「계약 끝」 버튼으로 …」 straight after the 661 quote. 661 is about ending a fixed-term contract early for 부득이한 사유, not about the term running out, and putting the two side by side could read as "661 covers expiry". Fix: move the 「계약 끝」 sentence into its own paragraph, or into 퇴직 사유 쓰기 next to the preset list. Don't add any interpretation of 661. Under 5 minutes.

## Escalate to Architect
None.

## Decisions asked of me
- 「「전항의 경우」는 위에 옮긴 제1항, 곧 고용기간의 약정이 없는 때를 말해요.」 Correct against minbeop.txt: ② follows ①, and ① is the 「고용기간의 약정이 없는 때」 case. It explains a reference and makes no claim about effect. Passes.
- The ③ pointer 「같은 조에는 제3항이 이어지니 조문 전체를 함께 읽어 보세요」 is accurate: ③ is in the excerpt (「기간으로 보수를 정한 때에는 …」). Keeping ③ unquoted follows R8. The pointer is worth keeping, because ③ changes when termination takes effect for people paid by the period, and the pointer stops ② from reading as the whole rule. Passes.
- 「고용기간을 정해 두고 일하는 경우를 다루는 조문으로는 민법 제661조가 있어요」 matches the 661 text (「고용기간의 약정이 있는 경우에도 …」). Passes. See the Should Fix about the sentence after it.
- Topic: keep 취업·이력서. A 사직서 is an employment document handed to an employer, not a 세금·민원 filing. 차용증 and 위임장 are civil and 민원 papers, so they belong where they are. 취업·이력서 has only 2 guides now (resume-photo and this one), so this also fills a thin hub.
- NEXT_GUIDES (pdf-sign, stamp-image, e-signature-law) fit the 「내는 방법」 section. Accepted.

## Checked
- All 12 law.go.kr quotes are verbatim substrings of minbeop/goyongboheom/geunrogijun.txt, each with retrieved 2026-10-27. 다목 keeps 「그 밖에 고용노동부령으로」 outside the quote; the source's 「고용노동부령 으로」 spacing artifact stays out of the quote. The 58조 lead starts after 「제40조에도 불구하고」: that is still a verbatim substring and is not misleading. The 1350 quote is in sources only, and the body paraphrases it correctly (국번없이 1350, 유료, 평일 09:00~18:00).
- No 실업급여, 법적 효력 or 공식/법정 서식 wording. No advice on which reason to write (twice: 「문서딱은 어느 이유를 쓰라고 권하지 않아요」). No date or amount is computed (said explicitly in 퇴사 날짜 and 정산). 58조 is framed as 「직업안정기관의 장이 인정」 and points to 1350 and 고용24. The R8 line is present, and check-dist enforces it.
- Plain language: no 업로드/서버/브라우저. Legal terms appear only inside quotes or are glossed (통고). The brand is 문서딱 throughout.
- Figures: the SVG contains no digits (only 년/월/일 labels and ○○) and no timeline. The webp shot uses the made-up 홍길동 / ○○ 주식회사 sample with fixed dates.
- Length 3,330: the extra length is real content (the field table, the date explanation, the preset list, the hand-fill steps). It is not padded or gamed.
- Merge 1069419: unions in lighthouserc, guide-shots (qr `bottom` clip plus the resignation shot), guides.ts, tool-guide-order, guides-schema partial/OWN_COUNT and guide-titles are correct. No conflict markers.
- Tests run: resignation-letter + guides-schema + guide-check unit tests, 85/85.

## Cleared
I reviewed the guide content, its sources, the figures, the check-dist block, the pins/NEXT_GUIDES/inbound links and the merge resolution. All pass, with one non-blocking wording fix.
