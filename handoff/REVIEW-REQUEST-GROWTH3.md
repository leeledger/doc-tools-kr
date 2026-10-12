# Review Request — GROWTH3 (G0, G1, G4, G2, G3; G5 file)
Date: 2026-10-13
Branch: growth3 (worktree C:/dev/doc-tools-kr/.claude/worktrees/agent-affc46c244b6f0a9d), base origin/main 29826f0. Not pushed.
Ready for Review: YES
Status: DONE_WITH_CONCERNS (6 of 13 new guides; G1b touches /id-photo/; see Escalations)

## Commits (each a revert unit)
- fe7ab71 G0 pins + exact-list test
- 5067a58 G1a snippet edits that leave every tool page byte-identical
- fac959d G1b police/kuksiwon titles (these two are pinned on /id-photo/, so its 관련 안내 text changes) — revert alone if Arch keeps decision 3 strict
- d6bec29, 9ed2534 G4 indicators
- 270c6e4 G2 six guides + seven drafts + inbound related + runbook rows
- 839c794, f79277f G3 axe pages + 120 s timeout
- 9183f73 handoff docs

## Files Changed
- src/data/tool-guide-order.ts:8-14 — id-photo, photo-compress, pdf-merge, pdf-compress frozen to their current 4.
- tests/unit/guides-schema.test.ts:355-378 — exact 4 per frozen tool; fails if a new guide names a tool with < 4 own guides (OWN_COUNT).
- src/content/guides/{id-card-photo,police-exam-photo,kuksiwon-photo,history-exam-photo,resume-photo}.md, src/content/hubs/photo-sizes.md — G1 title/description/query/og (table in BUILD-LOG). korcham and admission unchanged (conditions in the brief not met).
- scripts/ops/lib/gsc.mjs:61-92 — pages28 rowLimit 250; pageQueries28 (page×query, 1000) caught separately → null + pageQueriesError.
- scripts/ops/lib/indicators.mjs:1-162 — cluster (id-photo + photo-sizes + guides naming id-photo), top-5 query count, guide vs tool, brand (BRAND imported), top 8 pages × 3 queries, Naver line; renderIndicators, withIndicators (section before growth-data, `indicators` stored without topPages).
- scripts/ops/growth.mjs:130-133 — wires it after renderReport(); previous = latest earlier report with `indicators`.
- scripts/ops/opportunities.mjs:16-17 — `export const BRAND` (+ doc line). **Not on the whitelist**; the brief's G4(c) says "export it, do not copy".
- tests/unit/indicators.test.ts — sums, weighted position, ≤5 count, guide/tool CTR, brand 0 rows, no previous report, page×query API error, 250/1000 limits, report still prints 25 pages, dry-run growth run with fixture data.
- src/content/guides/{hanja-exam-photo,jlpt-photo,intl-driving-license,youth-card-photo,passport-photo-error,gov24-pdf-save}.md — new published guides.
- src/content/guides/{fire-exam-photo,military-civilian-photo,kacta-exam-photo,hsk-photo,kakao-file-limit,naver-daum-mail-limit,hometax-pdf-password}.md — drafts with blockedBy + tried.
- src/content/guides/{history-exam-photo,teps-photo,driver-license-photo,passport-photo,id-card-photo,kosaf-docs}.md — one `related` slug each.
- scripts/lib/guide-titles.mjs — regenerated (45 titles).
- docs/GROWTH-RUNBOOK.md — two calendar rows.
- tests/e2e/growth.spec.ts:123-128 — axe on /guide/hanja-exam-photo/ and /guide/gov24-pdf-save/, timeout 120 s.
- handoff/BUILD-LOG.md (GROWTH3 section), handoff/블로그 팀 전달 2026-10-13 (새 안내 글).md (G5; see Escalations for the path).

## Verification
- check:quotes (network): `source-watch --exact: 214 quotes verbatim`, exit 0.
- vitest: 1416 passed; ga.test.ts fails only with public/vendor/mediapipe present (left by my AUTOFRAME=1 prebuild; the test builds without the flag) → 21/21 after `PUBLIC_ID_PHOTO_AUTOFRAME=0 node scripts/copy-vendor.mjs`. Same on origin/main.
- astro check: 0 errors.
- Build default: check-dist OK, UI font core 611 chars / 44.1 + 47.4 KiB (= baseline), precache 443.5 KB (= baseline). Cloud variant: 608 chars, precache 448.7 KB (= baseline). Only 2 of the 4 variants built (default, cloud); noauto and bg not built.
- Byte compare vs origin/main build (build id normalised, outside /guide/, /og/, sitemap, llms, vendor): default 227 identical + id-photo/index.html (−2 bytes, G1b); cloud 233 identical + id-photo/index.html. At G1a (before G1b): 228/228 identical.
- 관련 안내 on all 14 tool pages: same lists as baseline (dumped from dist).
- e2e (E2E_PORT=4791): growth + site on chromium + mobile-chrome 174/174; hubs 12/12; growth "guides" block on all 5 projects 25/25 with --retries=0.
- Hub /guide/photo-sizes/ lists the 4 new photo spec rows (hanja, jlpt, intl, youth).

## Open Questions
- Richard, please spot-read all six guides against their quotes (decision 4), especially passport-photo-error (FAQ rewording of gov24 error texts) and gov24-pdf-save (claims kept to what the FAQ says: PDF printer port blocked, 전자문서지갑, 열람용 download).
- gov24-pdf-save names tools [pdf-merge] with the CTA on /jpg-to-pdf/: jpg-to-pdf and pdf-to-jpg cannot be named without changing their precached pages. OK?
- After merge, REV3's GUIDE_AFF keys on tools[0]: the five new id-photo guides (hanja, jlpt, intl, youth, passport-photo-error) get the affiliate block automatically, as the brief intends.

## Escalations (Arch)
1. **G1b vs locked decision 3.** kuksiwon-photo and police-exam-photo are 2 of the 4 guides shown on /id-photo/; the brief's G1 retitles both, which changes /id-photo/ (link text only, −2 bytes, no new glyphs, precache unchanged at 0.1 KB). Kept as a separate commit (fac959d) so it can be dropped.
2. **Pins cannot freeze tools with < 4 own guides** (next-step guides fill the rest). New guides were restricted to the 4 frozen tools; hometax-pdf-password is a draft for this reason. Needs a rule if PDF-tool guides are wanted.
3. **Passport preset and error 704.** Our id-photo JPG has no EXIF (no 찍은 날짜); gov24 error 704 checks 찍은 날짜. Unknown whether gov24 rejects a dateless file. passport-photo-error says the file has no date info and points to the gov24 guidance; it makes no promise. Owner upload test suggested.
4. **G5 path.** The worktree sandbox refused writing to C:/dev/doc-tools-kr/reports/; the file is at handoff/블로그 팀 전달 2026-10-13 (새 안내 글).md — please copy it to reports/.
5. **Shortfall:** 43 published guides + 2 hubs (target 50 articles, floor 48). chrome-cdp was unusable all session (connectOverCDP timeout), which blocked the browser path for 7 candidates.
6. opportunities.mjs is outside the whitelist (BRAND export, per brief G4c).

## Out of Scope (logged in BUILD-LOG)
- 주민등록증 카드 크기 FAQ (law.go.kr shell), 대학원 원서 사진, next-t volume estimates, unblocking the 8 older drafts, noauto/bg variant builds.
