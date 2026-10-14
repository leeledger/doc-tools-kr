# Review Feedback — REQ1014-C
Date: 2026-10-14
Verdict: CLEAR
Ready for Builder: YES (no Must Fix)

Reviewed: `git diff origin/main..HEAD` (5 commits on ee4950c) against handoff/ARCHITECT-BRIEF-REQ1014-C.md.

## Must Fix
None.

## Should Fix
- src/data/tools.ts:252-253 (confidence: 6/10) — FAQ 「제출처 기준에 맞춰 바로 줄일 수 있나요?」 says 「안내 페이지의 버튼을 누르면 그 제출처의 용량이 목표로 골라진 채 이 화면이 열립니다」. Only guides with a sourced MB (ecfs-pdf-limit ?target=20, email-attachment-limit ?target=10) do that; yearend-tax-pdf, linked one FAQ above, has its CTA on /pdf-merge/. Fix: narrow the claim, e.g. 「용량 기준이 정해진 안내 페이지의 버튼을 누르면 …」. Under 5 minutes.
- Pre-deploy gate (confidence: 9/10) — my re-run of `npm run check:quotes -- --exact` today: 234/240 verbatim; the 6 others are hanja.re.kr HTTP 503 (faq.do?id=91 and applyMeth.do; curl x3 with a desktop UA also 503). This is the site being down, not a text mismatch, and Bob's run passed 240/240 earlier today. But the new `hanja` preset quote rests on that page: re-run check:quotes once hanja.re.kr answers, before or right after deploy, and log the result.

## Notes (not findings)
- Drift: scripts/qa/visual.mjs (+2 pages) is not in the brief's file list. It exists so the brief's qa:visual gate covers the 2 new guides. Accepted.
- open-hwp-without-hangul.md: outside the file list, forced by the quote gate (한컴 changed its page to Windows 11 이상). Quotes and body/FAQ updated together. Accepted.
- D9 length: BUILD-LOG gives article text with spaces 1,807-2,246 (all ≥ 1,800); my count of the built dist matches (1,805-2,244).

## Verified
- Presets: police printPx(30)×printPx(40)=354×472, no limit, 300 dpi, note says computed; hanja 230×310, 100,000 B, dpiFor(230,30)=195; jlpt 413×531, 1,000,000 B, 300 dpi, note. Quotes match the brief and guides. Order after kuksiwon is the same in PRESETS, PRESET_IDS, usage.mjs PRESETS and VALUE_LABELS (the label map exists, so updating it is in brief scope). REFERENCE_ASPECT_EXEMPT + police, hanja, with the comment extended.
- Guides: police / hanja / jlpt CTAs and `- preset:` lines; 반명함판 and 직접 입력 text rewritten; the test asserts no half_card / passport_online / 직접 입력 is left.
- Passport: I checked against the live pages (visible text only, HTML comments stripped). menuPos=10: 「신청 대상 … 긴급 여권 신청자」, 미성년 법정대리인, 수령시 방문, 규격 불일치 반려 are all visible, not in a comment. menuPos=32 영·유아 block = 성인과 동일 / 보호자·장난감 / 36개월 입, so 「어른과 다르게 봐주는 것은 입 하나」 holds. The reissue facts (사진 변경 = 정정·변경 → 방문만) are correct.
- yearend 유형 4 row: the NTS page (fetched) lists 유형 3 (공제 증명자료 온라인 수집) and 유형 4 (공제신고서까지 수집, 간편제출로 간소화자료와 공제신고서 제출). The new table row is accurate.
- ecfs: the 대법원규칙 제8조 quotes fit the existing 「2페이지 이상이면 하나의 PDF」 text (same document = one file; 주장·증거 = separate). The old false 「사진을 PDF로 바꾸지 않아요」 is gone (ecfs + yearend); /jpg-to-pdf/ is linked.
- The UI labels named in the guides exist: 「PDF로 내려받기」, 「쪽 목록」 (hwp-viewer), 「이미지로 변환」 (pdf-compress), the HWP password refusal (hwp-shared/messages.ts:30), the merge password input and the unencrypted output (tools.ts:188-189), and the HWP font substitution (hwp-viewer:159).
- AVIF FAQ: 「사진 파일을 열 수 없습니다」 = start of ERRORS.corrupt (lib/image/messages.ts:46), reached via controller.ts:429-430. Per row, the rest continue.
- ?target=20 within TARGET_MB 0.5-100; ?target=2500 within targetKb and not the default. _headers RSS block has no CSP and no detach, and the postbuild test holds the exact block.
- Tests cover every test-map GAP item (unit + e2e incl. 시험·원서 order and the exact files of the 3 presets).

## Open Questions — recommendation
1. kakao 2,500 KB not printed with a unit: AGREE with Bob. The owner rule is never to loosen a gate to pass, and the unsourced-number check is that gate. The user still sees 2,500 KB in the tool after the click, and the page explains the 300MB ÷ 120장 basis, so almost nothing is lost. If Arch wants the number on the page, add a "derived fact" rule as its own step (operands must each be quote-backed, the arithmetic is stated, and it is labelled 계산값). Do not add a one-off exception.
2. pdf-compress FAQ links published guides instead of draft gov24/hometax: AGREE. Draft guides are not built, so the links would 404 and fail the link check. Log a follow-up: when gov24-upload-limit / hometax-upload-limit are published, add them to that FAQ (and their ?target= if sourced). Pair it with the Should Fix wording above.
3-4. Accepted as logged (law.go.kr efYd URL watched by source-watch; the AVIF FAQ wording is tied to ERRORS.corrupt, so -B must update both together).

## Escalate to Architect
- Only if Arch wants the 2,500 KB number on the kakao page: that needs the derived-fact rule (OQ1). Otherwise no escalation.

## Cleared
Presets, deep links, the 2 new passport guides, the error-guide strengthening, the D9 bodies with their new quotes, the AVIF/pdf-compress FAQ, RSS noindex and the tests were reviewed against the brief and the live sources, and they pass. REQ1014-C is clear.
