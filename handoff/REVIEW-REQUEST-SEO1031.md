# Review Request — SEO1031 (구글 검색 클릭 늘리기 2차)
Date: 2026-10-30
Ready for Review: YES
Status: DONE
Brief: handoff/ARCHITECT-BRIEF-SEO1031.md · Branch seo1031 (worktree wt/seo1031), uncommitted.

## Files Changed
- src/content/guides/kuksiwon-photo.md:2-3,6,8,84-85 — D2 title, D3 description, answer gains 규정 and keeps 국가시험, updated, new FAQ 「간호사 국가고시 사진 규정은 무엇인가요?」 (facts from the kuksiwon preset quote).
- src/content/guides/korcham-photo.md:2-3,6,8,27,74,76-77 — title, description, answer 「용량 안내는 따로 없으며」, updated, no=194 quote retrieved 2026-10-30 (re-read in the D6 probe), FAQ rename + new 용량 FAQ (6 total).
- src/content/guides/heic-to-jpg.md:2-3,6,8,59-60 — title, description, answer led by 「아이폰 사진을 JPG로 저장하려면」 (re-cut to 116 code points), updated, new FAQ on the 높은 호환성 setting (Apple quote).
- src/content/guides/remove-background.md:2-3,8,45,47-48 — title 누끼따기, description, updated, FAQ rename to 한글·워드, new 서명·도장 FAQ (body L117/L131 wording; guide FAQ has no link field).
- src/content/guides/hwpx-to-hwp.md:2-3,8,43-44 — title, description, updated, new FAQ using the body's 다른 이름으로 저장 steps 1–3.
- src/content/guides/what-is-hwpx.md:2-3,8,123-124 — title, description, updated, new 뷰어 FAQ (6 total; no claim about other vendors).
- src/content/guides/gosi-photo.md:2-3,8,78 — title, description, updated, FAQ rename 증명사진.
- src/content/guides/passport-reissue-photo.md:2-3,6,8,135 — title, description, answer clause 사진만 바꾸는 것도 재발급·방문 신청 (L21/L25 quotes), updated, FAQ rename.
- src/content/guides/passport-english-name.md:2-3,8,88 — title, description, updated, FAQ rename (answer unchanged).
- src/content/hubs/upload-limits.md:2-3,7 — title, description, updated (no FAQ change).
- scripts/lib/guide-titles.mjs — regenerated (10 entries).
- src/data/tools.ts:816 — english-name FAQ link text = new guide title.
- src/pages/guide/upload-limits/index.astro:2 — comment title.
- tests/e2e/english-name.spec.ts:246,248 — test name and h1 literal.
- tests/unit/guides-schema.test.ts:638-668 — 「SEO1031 D9」 block: title words, FAQ words, 한컴 non-claim negative.

## Gates
- npm run check 0/0 (12 hints). vitest 2344/2344. guide-length all ok.
- check-dist OK on default (precache 394.7 KB), AUTOFRAME=1 (396.8 KB) and production-flag (402.3 KB) builds.
- e2e chromium: site, hubs, english-name, remove-background, image-to-jpg, hwpx-to-hwp, affiliate, embed green on the default dist; id-photo + affiliate + embed 64 passed / 2 skipped on the AUTOFRAME=1 dist (id-photo's 12 failures on the default dist were the autoframe-only specs, env, same as SEO1030).
- dist HTML for all 10 (production-flag build): title, meta description, H1, FAQPage questions match frontmatter — 10/10.

## Open Questions
- kuksiwon answer 「간호사 등 국가시험의 국시원 원서 사진 규정은 …」 keeps 국가시험 per D1a; does it read naturally?
- heic answer re-cut (setting first, then convert, then PC caveat): same facts as before, please confirm nothing lost.
- korcham 용량 FAQ 「수험자가이드의 사진파일 규격 안내에는 용량 기준이 따로 없어요」 rests on the 2026-10-30 probe (no 용량/KB/MB on no=194 or examInfo1).

## Out of Scope (logged in BUILD-LOG)
- Body anchor texts in other guides still use old titles as descriptive link text (HEIC, HWPX가 뭔가요?, 컴활 원서 사진 규격, 여권 영문 이름 정하는 법, 서류 제출 용량 모음); og titles unchanged per brief. Left per D8 (no churn).
