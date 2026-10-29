# Review Request — SEO1030 사진 규격 안내 9쪽 검색어 맞추기
Date: 2026-10-29
Ready for Review: YES
Status: DONE

## Files Changed
- src/content/guides/driver-license-photo.md:2-13, 123-128 — D2 title/D3 description/query/updated/related (D8); FAQ 몇 장 renamed, 적성검사 and 규정 FAQs added (6 total).
- src/content/guides/id-card-photo.md:2-8, 78-79 — title/description/query/updated; FAQ 재발급 사진 규격.
- src/content/guides/admission-photo.md:2-13 — title 대학 원서 사진 규정·규격 (no 대학원: probe b not found), description, query, updated, related (D8).
- src/content/guides/resume-photo.md:2-8, 68-69 — title/description/query/answer (크기)/updated; FAQ 잡코리아 사진 크기 조정.
- src/content/guides/kakao-photo.md:3-8, 18-86 (six retrieved dates), 96-97, 160-161 — description/answer (용량), updated, re-read quotes bumped to 2026-10-29, FAQ 파일 전송 용량, one-line hub link.
- src/content/guides/history-exam-photo.md:2-8 — title/description/updated.
- src/content/guides/youth-card-photo.md:2-8, 92-93 — title/description/answer (크기)/updated; FAQ 사진 규정.
- src/content/guides/intl-driving-license.md:2-8, 186-187 — title/description/updated; one-line hub link after the checklist.
- src/content/hubs/photo-sizes.md:2-13, 25-26 — title/description/updated/related +driver-license-photo; FAQ 증명사진 vs 반명함판.
- src/data/tool-guide-order.ts:11 — id-photo pins: passport, driver-license, kuksiwon, id-card.
- src/data/tools.ts:1275 — resume link text = new title.
- scripts/lib/guide-titles.mjs — regenerated (8 titles).
- tests/unit/guides-schema.test.ts:382-402 — pin fixture/frozen-4 lists updated; 606-637 new D9 describe (title words, driver FAQ wording, 8 hub links).
- tests/e2e/hubs.spec.ts:45, tests/unit/usage.test.ts:370, tests/unit/__snapshots__/admin-full-7.html:153 — old literal titles (each diff was that one line only).

## Open Questions
- driver FAQ 「운전면허 사진 규정상 안 되는 사진은?」: please check the wording stays within the 도로교통공단 quotes (흰색 배경, 치아, 수정·합성, 색안경, 인화지) and is not stricter.
- youth FAQ 「청소년증 사진 규정은?」: says only the size is stated; the 「최근 사진이 좋아요」 line is advice, not a rule (no number).
- kakao title was already the D2 target; left unchanged.
- ga.test failing on the AUTOFRAME=1 dist is an env mismatch (public/vendor/mediapipe from that build); green with the matching env and on the default dist.

## Out of Scope (logged in BUILD-LOG)
- 주민등록증 카드 크기 and 한능검 셀카/6개월 facts: probes failed (law.go.kr shell, historyexam NetFunnel), no claim.
- kuksiwon-photo untouched (D1).
