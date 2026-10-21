# Review Feedback — CONTENT1021 Step B1
Date: 2026-10-21
Ready for Builder: NO

## Must Fix
- src/content/guides/kuksiwon-photo.md (「원서는 인터넷으로 내요」, 1st paragraph) (confidence: 8): this sentence describes a 국시원 procedure that no source backs: 「졸업 예정자는 대학이 졸업예정자 명단을 등록하고 국시원이 확인하는 단계가 먼저 있어요.」 I fetched the cited page (cnt/c_3010/view.do?seq=14) today. It mentions only 「과거에 응시한 적이 있거나 국내대학 기졸업자의 경우 별도의 절차없이 인터넷 접수 가능」; it says nothing about 졸업예정자 or 명단. Fix: delete the sentence, or add the 국시원 page that says it (quote + excerpt).
- src/content/guides/driver-license-photo.md (「나이에 따라 짧아지는 주기」) (confidence: 9): 「갱신 주기는 대개 10년이지만」 is a new number with no quote in front matter and no saved excerpt. The 65/75세 quotes do not cover it. The checker misses it because 년 is not a checked Unit, so this violates D7 by hand. The fact is on the official page (selectDiGuide01, 「2011.12.9. 이후 면허취득자·적성검사자는 10년 주기·1년 기간」). Fix: add that verbatim line as a source and save it in driver-license-photo-2.txt, or drop 「10년」.
- src/content/guides/admission-photo.md (「바꾼 사진이 그대로 예전 사진으로 보일 때」, 1st paragraph) (confidence: 7): 「크롬은 오른쪽 위 점 세 개 메뉴의 인터넷 사용 기록 삭제에서, 엣지는 설정의 개인 정보 항목에서 지울 수 있어요.」 states program menu paths as fact with no citation. D6 requires menu names stated as fact to be cited from the vendor's help (Microsoft for Edge). Fix: cite the Google/Microsoft help pages (quote + excerpt) or delete the sentence. The 진학사 instruction before it is enough.

## Should Fix
- public/img/guide/history-exam-photo/2-exam-morning.svg (「10:20 / 문제지 배부」) (confidence: 8): 10:20 passes because it appears inside the quoted 「10:10~10:20」, but 「문제지 배부」 is not in any quote. The official page does say 「10:20~10:30 답안지 및 문제지 배부」 (verified). Extend the timetable quote and its excerpt to include that row.
- Unsourced asides that describe institutions or third parties (confidence: 6–7; each is small, but D6 forbids invented claims):
  - youth-card-photo: 「박물관이나 공연장, 놀이시설에서 … 직원이 카드의 사진과 얼굴을 견줘 보는 경우가 있어요」
  - id-card-photo: 「주민센터 근처 사진관에서 「주민등록증용」으로 찍어 달라고 하면 크기와 장수를 알아서 맞춰 줘요」
  - history-exam-photo: 「초등학생부터 … 어르신까지 … 가족이 대신 원서를 써 주는 일도 많아요」
  - hanja-exam-photo: 「한자 시험은 초등학생 응시자가 많아서 부모가 사진을 준비하는 경우가 많아요」 and 「어린 학생이 많이 보는 만큼」
  - qnet-photo: 「수험표에도 등록한 사진이 함께 나오니」
  - police-exam-photo: 「응시표에도 원서 사진이 들어가니」 and the 「어디에 물어볼까」 section (「사이트 아래쪽에 적힌 원서접수·결제 문의 전화」)
  Rephrase each as advice without a factual claim, or cite a source.
- Paraphrased boilerplate across siblings (D6 / D5.5 spirit) (confidence: 7): the same advice, reworded to get under the 60-character rule, shows up in several guides:
  - 「원본 파일을 받아 두면 다른 원서에도 그곳 규격으로 다시 맞출 수 있어요」 in gosi, history, id-card-photo, qnet, driver-license
  - 「종이 사진을 휴대폰으로 바로 위에서 찍기 / 사다리꼴」 in admission, teps, korcham, id-card-copy
  - 「단색 벽·눈높이」 photo tips in gosi, qnet, jlpt, youth, hanja, history
  Every page still has plenty of issuer-specific content, so this does not block. For B2, keep each tip on one page and link to it rather than restating it. Consider trimming in B1 where a page keeps a margin above 2,500.
- src/content/hubs/upload-limits.md (Bob's open question) (confidence: 5): reusing the three 전자소송 quotes with `retrieved: '2026-10-02'` + `via: browser` is acceptable, because they add no new number and they match the hub table's existing facts. Re-read them in a browser before Step D so every hub source has a current fetch, and log it.
- Logged gap: guide-facts `Unit` does not include 년 (and 시 for clock times), so year and time numbers bypass unsourcedFacts. This is how 「10년」 got through. Arch should decide whether to add 년 to D7's units in Step D.

## Escalate to Architect
- None. Bob's other open questions: margins of 16–81 characters are fine (the bar is met honestly; B2 need not aim higher). Do not commit the scratch SVG helper unless the SVGs are meant to be regenerated; the committed SVGs are the artefact.

## Cleared
Reviewed the 17 guides, the upload-limits hub, 36 SVGs, the 48 excerpts, guide-length.mjs and guides-schema.test.ts:
- Spot-checks against the live official pages all matched, about 15 quotes in total: gosi 659, the police FAQ, fee and 원서작성 pages, the history timetable and fees, kuksiwon seq=14 and 60, Q-Net guide_04 and 06, TEPS FAQ and IdCard, passport menuPos=4, safedriving 65세 and photo rules.
- No banned plain-language words in new shown copy or SVG text.
- SVGs: no script, foreignObject, image, href or event attributes (only local clip-path url(#…)); each has role="img", a title and an opaque bordered background; all are under 5 KB and their hashes are unique. Every image carries information.
- The guides-schema test change only pins the fixture's `updated`; all assertions are unchanged.
- No threshold was lowered; LENGTH_PENDING only lost the 18 B1 slugs.

---
## Round 2 verdict — 2026-10-21
Ready for Builder: YES

- Must Fix 1 (kuksiwon): the 졸업예정자/명단 sentence is gone. Verified.
- Must Fix 2 (driver-license): the 10년 sentence now states the 2011.12.9 condition and is backed by the verbatim quote 「1종 운전면허 2011.12.9. 이후 면허취득자·적성검사자는 10년 주기·1년 기간」 in front matter and in driver-license-photo-2.txt. It matches the live safedriving page. Verified.
- Must Fix 3 (admission): the Chrome/Edge menu sentence is gone. Verified.
- New sourced additions, checked against the live pages:
  - admission 「매년(4월) 모든 회원의 데이터를 삭제」: on the 진학사 FAQ categoryid=7.
  - history 성적통지 / 「별도의 성적통지서, 인증서를 발급하지 않음」: on apyexmInfo.
  - history timetable: now includes 「10:20~10:30 답안지 및 문제지 배부」.
  - youth-card 「발급권자 : 특별자치도지사, 특별자치시장, 시장·군수·구청장」: on the mogef page.
  - police 「원서접수 및 결제문의 1544-7715」: in the useinfo02_2 page footer, as alt text of footer.gif. The body does not print the number.
  - Each has an excerpt under handoff/sources/content1021/.
- The rephrased asides in youth-card, id-card-photo, history, hanja, qnet and police now read as advice or are sourced.
- Plain words: no 업로드/서버/브라우저/네트워크/EXIF/dpi in the changed shown lines.
- Carried as logged Should Fix (non-blocking): sibling boilerplate trimming (in B2, put each tip on one page and link to it); ECFS browser re-read before Step D; adding 년/시 to the checker's units in Step D.

Step B1 is clear.
