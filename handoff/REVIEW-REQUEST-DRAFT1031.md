# Review Request — DRAFT1031 (초안 6개 공개)
Date: 2026-10-30
Ready for Review: YES
Status: DONE

Commits (local, branch draft1031, not pushed): 959e21d (refactor: via pdf), 7d147ac (guides).

## Files Changed
- src/data/guide-schema.ts:46-49 — urlSource `via` is now `z.enum(['browser','pdf'])`.
- src/data/guide-facts.ts:20 — GuideSource `via?: 'browser' | 'pdf'`.
- scripts/ops/source-watch.mjs:17-28, 59-65 — any `via` goes to `manual` (never fetched or counted); table title 「수동 확인 (브라우저·PDF 출처)」; ` (PDF)` after the URL for via pdf.
- tests/unit/ops.test.ts:220-251 — heading asserts updated; new DRAFT1031 test for via pdf (browser row unchanged, watchList keeps via).
- src/content/guides/fire-exam-photo.md — published; 11 via-pdf quotes + preset gosi; spec 137×177 / 35×45 / JPG (source 1).
- src/content/guides/military-civilian-photo.md — published; 13 via-pdf quotes; spec kb 500, JPG·PNG·GIF; no size stated anywhere.
- src/content/guides/kacta-exam-photo.md — published; 26 kacta FAQ quotes + preset half_card; spec format 「반명함판 증명사진」 (no numbers).
- src/content/guides/local-gosi-photo.md — published; 12 quotes + preset id_card; spec mm 35×45; copy says 「해상도 100 이상」, never dpi.
- src/content/guides/kakao-file-limit.md — published; 13 quotes; spec mb 300.
- src/content/guides/naver-daum-mail-limit.md — published; 24 quotes; spec rows 네이버 10 MB (source 1), 다음 25 MB (source 10).
- public/img/guide/{six slugs}/1-*.svg, 2-*.svg — 12 own figures (role="img", title, 1.8–3.2 KB).
- src/content/guides/{gosi-photo, photo-kb, korcham-photo, kakao-photo, email-attachment-limit}.md — one inbound body link each (email-attachment-limit FAQ text too), updated 2026-10-30.
- src/content/guides/{toeic-photo, hsk-photo, mma-photo, teacher-exam-photo, gov24-upload-limit, epeople-upload-limit, hometax-upload-limit, work24-resume-upload}.md — tried rows 2026-10-30; mma blockedBy rewritten.
- scripts/lib/guide-titles.mjs — +6 (gen-guide-titles).
- tests/unit/guides-schema.test.ts (end of file) — describe 「DRAFT1031」, 7 tests.

## Open Questions
- PDF quotes: please spot-check against handoff/sources/draft1031/fire-exam-photo-1.txt and military-civilian-photo-1.txt. pdftotext scrambles mnd p11; every via-pdf quote was matched against a PyMuPDF gap-based line rebuild and the rendered page image (spacing, ～ = U+FF5E, 「500kb」 lowercase, 7·9급 U+00B7).
- The two bare 공고-title quotes were swapped for the next PDF line, because postbuild T9 forbids a rendered quote (the source title shows it). OK?
- kacta spec row `format: 반명함판 증명사진`: the schema needs a number or a format, so the hub 「형식」 column reads 반명함판 증명사진. Acceptable, or drop the row (and the photo-sizes link)?
- kakao-file-limit category PDF / topic PDF·메일 (the brief named two different models).
- Naver source URLs keep the ?osType query as saved.
- Copy judgement calls to check: fire explains 「상반신 전체가 나온 사진」 as "face too small"; local-gosi FAQ "국가직 원서용 파일은 해상도 100에 조금 못 미칠 수 있어요" (137 px / 3.5 cm ≈ 99); naver "네이버에서 다음으로 보낸 대용량 파일은 네이버 기준을 따르는 셈" (an inference from Daum 38506).

## Gates
- npm run check 0/0 (12 hints); vitest 112 files / 2396 green; default and production-flag builds check-dist OK; precache 397.3 / 407.7 KB (unchanged) / 450; check:quotes --exact: all new fetchable quotes verbatim (the 24 failures are pre-existing, in other guides); e2e chromium site + hubs 129 passed.

## Out of Scope (logged in BUILD-LOG)
- check:quotes --exact failures on pdf-split (Apple text changed), history-exam-photo (404), jlpt.or.kr (fetch failed).
- 「토익스피킹 사진 규격」 guide; hometax-pdf-password pin rule; gov24/epeople/hometax/work24 limits.
- The hub shows 「500kb 이하」 (the quote's spelling) for the 군무원 row.

## Fix round 1 (2026-10-30) — Ready for Review: YES
- src/content/guides/local-gosi-photo.md — 「해상도 100 이상의 3.5×4.5 cm 사진」 2nd paragraph rewritten (center's two causes only, id_card = 해상도 300, verified in id-photo-presets.ts/encode.ts); 137 px line 「…못 미치는 파일로 저장돼요」; 「집에서 새로 찍을 때」 closing paragraph, first 등록 bullet and 국가직 비교 paragraph point to /id-photo/?preset=id_card. Length 2,721 ok.
- src/content/guides/naver-daum-mail-limit.md — 「다음 메일로 받을 때는」 scope.
- handoff/sources/draft1031/kakao-file-limit-*.txt — full page text; 13/13 quotes present.
