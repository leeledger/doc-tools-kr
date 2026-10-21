# Review Request — CONTENT1021 Step B2
Date: 2026-10-21
Ready for Review: YES
Status: DONE (not committed)

## Scope
22 PDF/HWP/서류/사진 보내기/서명 guides to ≥2,500 rendered characters with 2 own SVGs each; all 22 removed from LENGTH_PENDING (only Step C tool paths remain, now unit-asserted).

## Pages (guideBodyChars, before → after; prod-like dist, remove-background from the PUBLIC_BG_REMOVE=1 build)
pdf-compress 419 → 2,575 · pdf-password 348 → 2,564 · pdf-split 1,174 → 2,569 · pdf-sign 1,154 → 2,538 · pdf-to-jpg 1,005 → 2,557 · jpg-to-pdf 1,148 → 2,541 · email-attachment-limit 274 → 2,570 · ecfs-pdf-limit 923 → 2,545 · yearend-tax-pdf 938 → 2,551 · gov24-pdf-save 456 → 2,554 · kosaf-docs 529 → 2,552 · univ-docs-upload 537 → 2,543 · hwp-on-phone 878 → 2,525 · hwp-to-pdf 1,052 → 2,535 · hwpx-to-hwp 1,005 → 2,520 · open-hwp-without-hangul 358 → 2,543 · what-is-hwpx 481 → 2,567 · heic-to-jpg 563 → 2,518 · kakao-photo 529 → 2,548 · remove-background ~800 → 2,527 · stamp-image 720 → 2,570 · e-signature-law 745 → 2,528

## Files Changed
- src/content/guides/{22 slugs}.md — body expanded (new H2s listed per page in BUILD-LOG), `updated: '2026-10-21'`, 2 figures each after the first H2; new front-matter sources (all `retrieved: '2026-10-21'`) on gov24-pdf-save (+16), kosaf-docs (+9), univ-docs-upload (+12), what-is-hwpx (+20), heic-to-jpg (+3), kakao-photo (+8), e-signature-law (+11). The other 15 pages add no new number: their new copy is number-free or uses numbers already backed by their sources/toolFacts.
- public/img/guide/<slug>/{1,2}-*.svg — 42 new SVGs (21 slugs), hand-specified diagrams (flows, comparisons, mappings, checklists); opaque white bg + 1px border, system font stack, role="img" + title; largest 4.7 KB.
- src/assets/flagged/img/guide/remove-background/{1-cutout-steps,2-good-bad-photos}.svg — the remove-background figures (see Decision 1).
- scripts/gen-brand.mjs:6, 228-248, 286-287 — `FLAGGED_GUIDE_IMAGES`, `FLAGGED_GUIDE_IMAGE_DIR`, `syncFlaggedGuideImages(pub, flags)`; main copies the flagged figures into public/img/guide/<slug>/ when the flag is on, removes them when off.
- .gitignore:16-17 — `public/img/guide/remove-background/` (generated copy).
- scripts/lib/guide-length.mjs:18-23 — the B2 block of LENGTH_PENDING removed.
- tests/unit/guide-check.test.ts — SVG rules read both public/img/guide and the flagged source folder; figure-exists check accepts the flagged source; new describe: flagged figures copied with the flag on, removed with it off, source ≥2 SVGs, public copy gitignored.
- tests/unit/guide-length.test.ts:29-30 — asserts LENGTH_PENDING now holds only tool paths.
- tests/unit/guides-schema.test.ts:520-522 — REQ1014-C `updated` assertion: all five pages now 2026-10-21 (pdf-merge in Step A; hwp-to-pdf, yearend-tax-pdf, ecfs-pdf-limit, hwp-on-phone expanded in B2). Exact value, not loosened.
- handoff/sources/content1021/{gov24-pdf-save-1,-2, kosaf-docs-1, univ-docs-upload-1, what-is-hwpx-1,-2,-3, heic-to-jpg-1,-2, kakao-photo-1, e-signature-law-1}.txt — verbatim excerpts (URL, fetch date, lines) for every new quote.

## Decisions (logged in BUILD-LOG)
1. **remove-background figures behind the flag.** check-dist fails a flag-off build on any dist file whose path contains `remove-background`, and D5.3 requires `/img/guide/<own slug>/`. So the two SVGs are committed under src/assets/flagged/img/guide/remove-background/ and gen-brand (prebuild/predev, which already handles flagged share images) copies them to public/img/guide/remove-background/ only with PUBLIC_BG_REMOVE on. Flag-off build: no file, check-dist OK. Flag-on build: figures in dist, check-dist OK (D5.3 sizes/hash/attrs), page 2,527.
2. **One page owns each tip** (B1 lesson): the HWP error-message list lives only on open-hwp-without-hangul (hwp-on-phone and hwp-to-pdf link to it); "show file extensions" + "renaming the extension does not convert" only on what-is-hwpx (heic-to-jpg links); download location on iPhone sourced on heic-to-jpg; sign-image reuse/security only on pdf-sign; mail-limit tips only on email-attachment-limit; scan-photo tips stay on id-card-copy (kosaf links). Sentences I found repeated across siblings while writing were cut.
3. **Vendor menu paths** stated as fact are cited: Windows 파일 탐색기 「보기 › 파일 이름 확장명 표시」 (Microsoft support, quoted verbatim), Apple 「고효율성」 (Apple 116944), 정부24 MyGOV path and ezPDFReader reinstall path (정부24 FAQ), Kakao PC send methods (카카오 고객센터). Where no official help was available (한글 그림 넣기 menu), the text says to check the program's own help instead of naming a menu.

## Gates
- npm run check: 0 errors, 0 warnings.
- npm test: 94 files, 2,087/2,087.
- `PUBLIC_SITE_URL=https://docttak.com npm run build` + check-dist: OK (2,611 files; 20 WARNINGs = Step C tool pages only); UI fonts preloaded 92.1 / 92.66 KB (no Hangul added to .ts/.astro); precache 431.1 / 450 KB.
- `PUBLIC_BG_REMOVE=1` prod-like build + check-dist: OK; remove-background 2,527 with both figures in dist.
- npm run check:quotes (--exact): 574 quotes verbatim, exit 0.
- npm run check:licenses: OK.
- Playwright chromium: hubs, growth, site, polish, hwp-to-pdf, hwp-viewer specs — 232 passed, 8 skipped.

## Open Questions
- Decision 1 touches the build (gen-brand + .gitignore). Alternative was leaving remove-background pending and escalating; I judged the copy step the smallest safe fix (4 files, mirrors the flagged OG image pattern). Arch/Richard to confirm.
- Margins: heic-to-jpg 2,518 and hwpx-to-hwp 2,520 are the thinnest (honest content, no padding).
- Checker blind spot seen again: 「7」 followed by 「세 번째」 in adjacent SVG text nodes read as "7 세" (age). I reworded the SVG (「셋째」); the 세 lookahead could also require no following space. Not changed (Step D / Arch).

## Out of Scope (logged in BUILD-LOG Known Gaps)
- Step C tool pages (still LENGTH_PENDING).
- qa:visual light/dark on 2 B2 guides not run in this step (SVGs use the same opaque-background template Richard cleared in A/B1).

---
## Round 2 — 2026-10-21 (Richard's Should Fix 1, 2, 4, 5; item 3 deferred to Step D)
1. kakao-photo: the file-type quote 「jpg, jpeg, gif, bmp, png, tif, tiff, tga, psd, ai」 (helps_html/1073209414) is re-read today (`retrieved: '2026-10-21'`), and the 「■ 전송 가능한 이미지 파일 확장자」 lines are appended to kakao-photo-1.txt.
2. kosaf-docs: the three repeats are cut: the 선택서류 restatement, the 「홈페이지와 앱, 어디로 낼까요」 section, and the 온라인 동의 sentence after the TIF paragraph. In their place are two KOSAF-sourced sections. 「「기타서류」가 뜨는 경우의 예」 covers the 재외국민·외국인 / 실종 / 이혼후관계단절 examples. 「가구원은 어떤 서류로 확인하나요」 covers 등본 too, 계부·계모 동의, and 미혼모 → 어머니만. That adds 4 quotes and the excerpt kosaf-docs-2.txt. 2,552 → 2,665.
4. yearend-tax-pdf: the re-saved-file warning is kept once (after figure 1). To refill, a new NTS-sourced section 「내기 전에 세액을 미리 계산해 보기」 covers 예상세액 계산, 맞벌이 절세안내 and its 제공동의 condition, and companies that run all of 연말정산 in 홈택스. That adds 5 quotes and the excerpt yearend-tax-pdf-1.txt. The first draft printed one quote verbatim, which postbuild caught, so I reworded it. 2,551 → 2,802.
5. guide-check.test `imgDir`: a slug in FLAGGED_GUIDE_IMAGES now always reads src/assets/flagged/img/guide/<slug>, never a stale public copy.
Gates:
- npm run check: 0/0.
- npm test: 2,087/2,087.
- Production build with check-dist: OK (UI fonts 92.1/92.66 KB, precache 431.1/450 KB).
- PUBLIC_BG_REMOVE=1 build with check-dist: OK (remove-background 2,526).
- check:quotes --exact: 585 verbatim.
