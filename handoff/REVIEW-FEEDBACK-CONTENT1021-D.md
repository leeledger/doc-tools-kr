# Review Feedback — CONTENT1021 Step D (lock)
Date: 2026-10-21
Ready for Builder: YES (after round 2)

## Must Fix
- src/data/guide-facts.ts:105 (UNIT, the 세 branch) (confidence: 9). The new exclusion `(?!(?<=\s세)\s+(?:번|가지|개|장|명|곳|쪽|줄|칸|권|단계|군데|차례|글자|자리))` matches the counter only as a prefix, with no word end after it. Because of that it now lets through ages that the Step C checker caught. I verified this with a scratch vitest probe against the working tree:
  - `numberUnits('만 65 세 장애인')` → `[]`, because 「장」 matches the start of 장애인.
  - `numberUnits('만 18 세 번호')` → `[]`, because 「번」 matches the start of 번호.
  Before this change both were read as 「65 세」 and 「18 세」: the old lookahead `세(?!로|대|…)` does not exclude a space. That is exactly the regression the brief forbids: a check that is weaker than before. No current content hits it (I grepped src/content, tools.ts and the guide SVGs), but the gate exists for future copy.
  Fix: match only the real "native three" forms and require a word end after the counter, for example `\s+(?:번째|가지|번(?![가-힣])|개(?![가-힣])|…)`. The simplest safe version is `\s+(?:번째|가지)(?![가-힣]|를|는|가|의|만)`, or list the counters, each followed by `(?=$|[^가-힣]|째)`. Add the fail cases 「만 65 세 장애인」 and 「만 18 세 번호」 to the Step D unit test (guides-schema.test.ts:342-343), next to the existing pass cases.

## Should Fix
- src/data/guide-facts.ts:105 (시 / 분 lookaheads) (confidence: 8). These are allowlists, so a common particle that is not on the list goes unread. In the same probe each of these returned `[]`: 「18시로 바뀌어요」, 「18시가 넘으면」, 「9시의 접수」, 「12시엔」, 「6시마다」, 「5분만 기다려요」. This is not a regression, because 시 and 분 were never checked before, but these are the forms people write. Add 로|가|의|도|엔|마다|만 to 시, and 만|가|로 to 분. Then add one fail case to the unit test. The excluded words (시험, 시작, 분기, 분의) keep working, because 시험 and 분기 are not particles. No current content uses these forms (grep), so nothing new will be flagged.
- Leftover plain-wall tips not routed to gosi-photo (confidence: 6):
  - src/content/guides/admission-photo.md:186 「사진관 파일이라면 원본을 받아 두고, 휴대폰 사진이라면 밝은 단색 벽 앞에서 정면으로 찍어요.」 restates both owner tips (keep the 사진관 file, plain wall). Link it like the other 15 spots.
  - police-exam-photo 「집에서 찍는 경찰 원서 사진」 (:155-161) covers the same ground as gosi's 「휴대폰으로 직접 찍는다면」. It is tied to the 경찰 rule against 배경 있는 사진 and 스냅사진, and the wording differs, so it can stay. Just make sure it is a deliberate choice, and log it.
- upload-limits hub, ECFS quotes (carried from B1) (confidence: 7). They are still dated 2026-10-02, because Bob could not read the page without a browser, and he logged that honestly. The orchestrator should re-read https://ecfs.scourt.go.kr/psp/index.on?m=PSP623M01 with chrome-cdp before deploy and update `retrieved` only if 「20MB」 is still shown.

## Escalate to Architect
- None.

## Cleared
- (a) LENGTH_PENDING is gone from the lib, the CLI, guide-check and check-dist (grep in scripts/src/tests: only the "not exported" assertion is left). lengthProblems returns errors only, and check-dist pushes D5.1–5.3 straight to errors. The figure rule no longer has a warning path. The bars are still pinned at 2500 and 2000.
- (b) The clock, dotted-date and 년 additions only add facts. 「16:9」, ISO dates and versions stay unread, and the unit tests cover both pass and fail cases. The 세 regression above is the one exception.
- (c) All 5 owner anchors exist (gosi:158, hanja:143, korcham:159, id-card-copy:118, univ-docs-upload:129), and each owner section really holds the tip. The replacement links are worded differently and point to the right guide. I confirm Bob's call on open-hwp-without-hangul:80: it is shared-PC cleanup of this tool's own downloads, not the "delete document photos" tip.
- (d) Live re-fetch today: the Q-Net guide_06 lines (방문신청 …, 국가기술자격취득명세서; the only gap in the quote is a <strong> tag) and the law.go.kr header 「[시행 2022. 10. 20.] [법률 제18479호, 2021. 10. 19., 일부개정]」 match their excerpts verbatim. The new qnet sentences paraphrase the page accurately.
- (e) The changed copy is plain, the Step C Should Fix items are done (image-to-jpg format wording, toolFacts, the RUNTIME_PAGES test), no threshold was lowered and no test was weakened.

---
# Round 2 verdict — 2026-10-21
Ready for Builder: YES

- Must Fix (세), resolved. The exception now needs the whole counter word: 번째 or 가지 followed by a word end or a particle, or a one-syllable counter followed by a word end or 째 (guide-facts.ts:106). I ran my own adversarial probe against the tree:
  - These are now read as ages: 「만 3 세 장애아동」, 「만 7 세 명단」, 「만 7 세 개인」, 「만 12 세 가지고」, 「만 18 세 권리」, 「만 19 세 곳곳」, 「만 65 세 번호표」, 「만 14 세 쪽지」, 「18 세 칸막이」, 「20 세 줄기」, a double space, and a line break.
  - These stay excluded: 「7 세 번째 칸」 and 「6 세 번째」. A real age is never written that way, so this ambiguity is acceptable.
  - Fail and pass cases are both in guides-schema.test.ts. The file passes: 42/42.
- Should Fix 1 (시/분 particles), done. 로·가·의·도·엔·마다·만 are added, and the tests show they are read and that 「18시로」 fails when unsourced. Probe: 「1시간마다」, 「오전 9시 30분」 are read. 「17개 시도」, 「1분기 실적」 and 「3분의 2」 stay unread.
- Should Fix 2, done. admission-photo:186 is now one short, differently worded link to the gosi-photo owner section. The police-exam keep decision is logged at BUILD-LOG:3700.
- Should Fix 3 (ECFS re-read), still pending as a manual owner/orchestrator item, and logged. It does not block: no new number depends on it.

Step D is clear.
