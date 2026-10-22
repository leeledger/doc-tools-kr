# Review Request — LOAN1022 Step L5 (Deploy B: /guide/loan-note/)
Date: 2026-10-22
Ready for Review: YES
Status: DONE
Branch: `loan1022-guide` (from loan1022 @ 504c468; loan1022 / PR #14 untouched). Commit ff70e34. Not pushed.

## Files Changed
- src/content/guides/loan-note.md:1-84 — front matter: title per L-D14, 14 sources (13 law.go.kr statute quotes + 대한법률구조공단 132, all retrieved 2026-10-22 and verbatim in handoff/sources/loan1022/*.txt), toolFacts termsMaxLines 4 / amountMaxDigits 12, 4 FAQ (none copied from tools.ts).
- src/content/guides/loan-note.md:88-94 — 차용증이 하는 일: 민법 598 quote; L-D9 general-information line with 132 (paraphrased: non-statute quotes may not be rendered, postbuild T9).
- src/content/guides/loan-note.md:96-114 — 차용증에 적는 내용: our form's rows ("문서딱이 정한 일반 양식", not "required"), figure 1, signature-line order (채무자 then 채권자, as the spec's signLines), 그 밖의 약속 4줄.
- src/content/guides/loan-note.md:116-124 — 금액은 한글과 숫자로: what the tool does (금 …원정 + digits, 일천/일백/일십, zero groups skipped); no tamper-resistance claim; 12자리 via toolFact; no digit+원 numbers in text (fact checker).
- src/content/guides/loan-note.md:126-138 — 이자와 갚는 날: 이자제한법 2조 ① (cut before 「대통령령 으로」, an HTML link artifact) ② ③ ⑤, 규정 20퍼센트, figure 2, 민법 379 (no claim about an unwritten rate), 600, 603 ①②; 차주/대주 glossed.
- src/content/guides/loan-note.md:140-146 — 가족끼리 빌릴 때: 상증법 41조의4 ① quote + the 단서 paraphrased (기준금액); no computation, no "safe" amount; link to 국세청 home (200 OK today); no 보증인 칸.
- src/content/guides/loan-note.md:148-152 — 공증: our document is not a 공정증서; 민사집행법 56조 lead + item 4 quoted; ask 공증인/expert.
- src/content/guides/loan-note.md:154-176 — 빈 양식 (what the blank doc leaves: 금 … 원정 ( … 원), 연 … %, 년 월 일) + 6-step fill order; 안 될 때 (6 items, loan-specific).
- public/img/guide/loan-note/1-form-shot.webp — 720×560, 9.6 KB, guide-shots of /loan-note/ with the e2e made-up sample (김철수/홍길동, 10000000, fixed dates so the shot is date-independent).
- public/img/guide/loan-note/2-interest-cap.svg — 640×400, 2.2 KB, role="img" + <title>; numbers only 「연 20퍼센트」; two quoted fragments verbatim.
- scripts/guide-shots.mjs:67-79 — the loan-note shot (rerun left the photo-kb and POA webps byte-identical).
- src/content/tool-notes/loan-note.md:29-30 — one link line to the guide (tool page 2,761 ≥ 2,000).
- src/content/guides/power-of-attorney.md (파일로 낼 때, end) and src/content/guides/stamp-image.md:104 — one inbound sentence each; `updated` → 2026-10-22.
- src/data/tool-guide-order.ts:27-28 — pin 'loan-note': ['loan-note'].
- tests/unit/guides-schema.test.ts:418-420 — loan-note in the partial list, OWN_COUNT 1. tests/unit/guide-check.test.ts:108 — the new webp's size.
- scripts/lib/guide-titles.mjs — regenerated (+ loan-note). lighthouserc.json — /guide/loan-note/.

## Gates (local, low-memory host)
- astro check 0 errors / 0 warnings; vitest 2,148/2,149 (char-count 50 ms timing test under load; 21/21 alone).
- Builds: default (PUBLIC_SITE_URL) check-dist OK, 2,621 files, precache 422.1/450 KB; BG (PUBLIC_BG_REMOVE=1) check-dist OK, 2,643 files, 425.1 KB (gen-brand flag-off afterwards). Guide HTML 9.2/30 KB, initial JS 1.5/4 KB, OG 30.3/80 KB.
- guide-length: /guide/loan-note/ 3,307 (both builds); /loan-note/ 2,761; power-of-attorney 2,746, stamp-image 2,613.
- check:quotes --exact: 603 quotes verbatim (first run had transient uwayapply UNREACHABLE only; rerun clean).
- e2e chromium --workers=1: hubs + growth + loan-note 31/31. 5-project matrix and LHCI → CI.

## Open Questions
- 「조문의 차주는 빌린 사람, 대주는 빌려준 사람이에요」 is a plain-word gloss of the statute terms, not a quote. Keep or cut?
- 「숫자에서 0 하나가 빠지면 금액이 열 배 달라지니」 and 「두 사람이 소리 내어 읽어 보면 틀린 곳을 찾기 쉬워요」 are arithmetic/advice, no source. Please check against the CONTENT1021 "no unsourced claims" bar.
- 상증법 단서 is paraphrased (「대통령령으로 정하는 기준금액보다 적은 경우를 빼는 단서」) because the saved text has 「대통령령 으로」 (link artifact) and an exact quote across it could fail --exact.
- 이자제한법 ④ (초과 지급 → 원본 충당) left out on purpose (needs a 원본 gloss = interpretation).

## Out of Scope (logged in BUILD-LOG)
- 국세청 family-loan page still not saved (guide links the 국세청 home only, no quote).
