# Review Request — CONTENT1021 Step D (lock)
Date: 2026-10-21
Ready for Review: YES
Status: DONE (branch content1021-c working tree, not committed; only hubs.spec.ts + site.spec.ts e2e run locally, host memory)

## Files Changed
- scripts/lib/guide-length.mjs:12 — LENGTH_PENDING deleted (constant and doc block).
- scripts/lib/guide-check.mjs:27-38 — lengthProblems(pages, min, label) returns errors only: missing page or under the bar fails; no pending/warning path.
- scripts/check-dist.mjs:27, 806-847 — import trimmed; D5.1–5.3 push straight to errors; the "LENGTH_PENDING names …" check and the pending log line removed; log prints the bars.
- scripts/guide-length.mjs:4-17 — CLI verdict is ok/FAIL only.
- tests/unit/guide-length.test.ts:4-30 — asserts the module exports no LENGTH_PENDING (bars still pinned to 2,500/2,000).
- tests/unit/guide-check.test.ts:45-59 — length rule: 2499/100/null all fail, 2500/2600 pass, no exemption parameter.
- src/data/guide-facts.ts:8-15, 102-110, 137-146 — checker units 년, 시간, 시, 분 and the clock (HH:MM → "10:20 시각"; HH:00 also "H 시"); an agency's dotted date ("2011.12.9.", "2020. 6. 9.") states its year. 시/분 count only before a particle or non-Hangul (3분의 1, 1분기, 2시험장 are not read). 세 set apart from the number and followed by a counter (「7 세 번째」, 「2 세 가지」) is no age; attached 「18세」 still is.
- tests/unit/guides-schema.test.ts:332-349 — unit cases for all of the above (pass and fail).
- src/content/guides/e-signature-law.md:75-78 — new source quote 「[시행 2022. 10. 20.] [법률 제18479호, 2021. 10. 19., 일부개정]」 backing 「2022년 10월 20일 시행본」; excerpt appended to handoff/sources/content1021/e-signature-law-1.txt.
- src/content/guides/qnet-photo.md:56-63, 102-104, 135, 143 — tips replaced by links (see below) and +2 sourced sentences on 자격증 방문 신청 / 국가기술자격취득명세서 (guide_06, 2 new quotes; excerpt appended to qnet-photo-3.txt).
- Repeated tips → one owner, others a short differently-worded link (one line each):
  - File naming → owner univ-docs-upload 「파일 이름 짓는 법」: ecfs-pdf-limit:186, hwpx-to-hwp:103, yearend-tax-pdf:135 (sentence dropped; the line-107 company-rule bullet stays), email-attachment-limit:134, remove-background:97 (keeps the tool fact 「누끼.png」).
  - Leftover document photos/copies → owner id-card-copy 「보내고 난 뒤 정리하기」: kosaf-docs:170 (dropped) + :223 (link), yearend-tax-pdf:145, kakao-photo:156.
  - Keep the 사진관 file → owner gosi-photo 「휴대폰으로 직접 찍는다면」: id-card-photo:144, history-exam-photo:154, qnet-photo:104, driver-license-photo:199 (now only the sourced 6개월 check).
  - Plain wall / eye level → owner gosi-photo (adults), hanja-exam-photo 「아이 사진을 집에서 찍을 때」 (children): qnet-photo:143-144, jlpt-photo:168, youth-card-photo:165, history-exam-photo:150.
  - Paper photo from directly above → owner korcham-photo 「종이 반명함 사진을 스캔한다면」: teps-photo:148 (keeps the TEPS-specific 「구석에 작게」 line), admission-photo:190, qnet-photo:102.

## Newly flagged numbers (checker run on every guide, hub, SVG text and tool note)
- driver-license-photo 「2011년」「2026년」 → backed by the existing quotes' dotted dates 「2011.12.9.」「(시행일 2026.1.1.)」.
- e-signature-law 「2020년」 → existing quote 「<법률 제17354호, 2020. 6. 9.>」; 「2022년」 → new quote (above).
- hanja-exam-photo 「9시」「18시」 → existing quote 「접수시작일 09:00 ~ 접수마감일 18:00」.
- passport-english-name 「2024년」 → existing quote 「2024.10.31.기준 …」.
- Hubs, all guide SVGs and all 22 tool notes: nothing new flagged.

## Gates (this tree)
- npm run check: 0 errors, 0 warnings. npm test: 95 files, 2,096 tests passed.
- PUBLIC_BG_REMOVE=1 build + check-dist: pass, 「47 guides+hubs ≥ 2500, tools 21 ≥ 2000」; remove-background guide 2,517.
- Production build (PUBLIC_SITE_URL=https://docttak.com) + check-dist: pass, 「46 guides+hubs ≥ 2500, tools 20 ≥ 2000」; precache 419.1 KB / 450.
- node scripts/guide-length.mjs: 46/46 ok, min hwpx-to-hwp 2,505. --tools: 20/20 ok, min /pdf-split/ 2,069.
- check:quotes --exact: 589 quotes verbatim, 0 changed/unreachable; 12 browser-only quotes listed for manual check.
- check:licenses OK. Playwright chromium --workers=1 hubs.spec.ts + site.spec.ts: 109 passed.

## Open Questions
- ECFS (upload-limits hub, 3 quotes dated 2026-10-02, via: browser): https://ecfs.scourt.go.kr/psp/index.on?m=PSP623M01 returns HTTP 200, 7,076 bytes, an empty <body> with only the WebSquare bootloader (/psp/websquare/javascript.wq?q=/bootloader); 「20MB」 appears 0 times. Not re-read without a browser; dates left as they are, nothing invented. Owner/orchestrator browser re-read still pending.
- open-hwp-without-hangul:80 (shared-PC section: download folder + 휴지통) kept as is: it is shared-PC advice about this tool's own files, not the "delete document photos after sending" tip. Say if you want it linked too.
- hanja-exam-photo keeps its own child-at-home list (children: adult crouches to eye level) next to gosi's adult version; history now links to hanja.
- Lowest margins after the trims: hwpx-to-hwp 2,505, hanja 2,508, history 2,510, id-card-photo 2,511, teps 2,514 — all real content, no padding added.

## Out of Scope (logged in BUILD-LOG)
- Full e2e (all projects + axe) and LHCI not run locally (host memory): CI must be green before deploy.
- D12 AdSense review request stays an owner item, once, after Step D is live, not before mid-November.

## Round 2 (2026-10-21) — Richard's Must Fix + Should Fix 1–3
Ready for Review: YES · Status: DONE (not committed)
- Must Fix — src/data/guide-facts.ts:105 (세): the exception now needs a whole counter word after a spaced 세: 번째/가지 followed by a word end or a particle (로·는·가·의·를·만·도·에·이·와·씩), or 번/개/장/명/곳/쪽/줄/칸/권 followed by a word end or 째. 「만 65 세 장애인」→ 65 세, 「만 18 세 번호」→ 18 세 (fail cases added, guides-schema.test.ts), 「7 세 번째로」「2 세 가지만」「3 세 번 눌러요」「4 세 장」→ none (pass cases). Doc comment updated.
- Should Fix 1 — 시 now also before 엔·로·가·의·도·마다·만; 분 before 엔·로·가·만 (만에 folded into 만). Test: 「18시로」「19시가」「9시의」「12시엔」「6시마다」「5분만」「7분가량」「8분로」 all read; 「18시로」 unsourced fails. Excluded words (시험, 시작, 분기, 분의) still unread. Nothing newly flagged in guides, hubs, SVGs or tool notes (unit fact-check tests green).
- Should Fix 2 — admission-photo:186 → one short link to gosi-photo 「휴대폰으로 직접 찍는다면」 (keep the 사진관 file + plain wall). police-exam-photo 「집에서 찍는 경찰 원서 사진」 (:155-161) kept on purpose: it follows the 경찰 rule against 배경 있는 사진 and 스냅사진 and is worded differently (logged).
- Should Fix 3 — ECFS: the orchestrator tried a Chrome re-read; the FAQ article opens only through the in-page search, which the tool could not drive. Logged as a pending manual re-read; the three upload-limits quotes keep retrieved 2026-10-02.
- Gates: check 0/0; test 95 files / 2,096 pass; BG build + check-dist 47 ≥2500 / 21 tools ≥2000; prod build + check-dist 46 ≥2500 / 20 tools ≥2000, precache 419.1/450 KB; guide-length 46/46 ok (min hwpx-to-hwp 2,505), --tools 20/20 ok (min /pdf-split/ 2,069); check:quotes --exact 589 verbatim.
