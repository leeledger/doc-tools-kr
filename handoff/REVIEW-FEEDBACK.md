# Review Feedback — SEO-LENGTH + U2 follow-ups
Date: 2026-10-08
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/content/guides/yearend-tax-pdf.md:3 (confidence: 6/10) — the trim dropped the object of the second clause: was "…간편제출)과 간소화에서 나오지 않는 서류를 함께 낼 때 볼 점을…", now "…간편제출)과 함께 낼 때 볼 점을 국세청 안내로 정리했어요." "함께 낼 때" no longer says what is submitted together; it reads as a fragment. Not false, but unclear. — Restore a short object within 80, e.g. "…간편제출)과 빠진 서류를 함께 낼 때 볼 점을…" (count with metaLen; must stay ≤ 80 and add no new fact).

## Escalate to Architect
- Phone memory on /pdf-split/ while saving (U2 item 3). Measured: 141 MB PDF, renderer ready ~0.39 GB, save peak ~0.86–1.03 GB (Pixel 7 emulation, desktop Chromium, so no real mobile cap was in play). Peak is about 6–7x the file size. The limit is a product decision, so it is yours, but my recommendation:
  - **Lower the pdf-split mobile limit to 100 MB** (src/tools/pdf-split/limits.ts:17, today `MERGE_LIMITS.mobile.hardBytes` = 150 MB; give pdf-split its own constant so pdf-merge is untouched). Linear scaling puts the 100 MB peak at ~0.6–0.7 GB, which a 3–4 GB Android phone tab can usually hold; 1 GB often cannot. pdf-split keeps a pdf.js document open next to the save copies, which pdf-merge does not, so sharing merge's cap was never justified by a measurement.
  - **Do not close the pdf.js doc during save** in this step. It saves at most the ~0.39 GB ready baseline, adds a reopen on 다시 편집하기 (time, thumbnails redrawn, a new failure path after a successful save), and it is new behaviour, not a follow-up fix. Revisit only if a real phone still fails at 100 MB.
  - Either way, log "real-phone measurement" as open (already in BUILD-LOG). Keep the thumbnail pause; it is harmless.

## Cleared
Every built page (55 HTML, 404/offline included, Naver file correctly excluded) re-measured from dist with the shared counter: all titles ≤ 40 (max 40, /jpg-to-pdf/), all descriptions 40–80 (max 79), og/twitter consistent, 0 metaProblems; tool titles/descriptions, home title, guide index, terms, licenses, privacy, both hub and the four brief-example guide descriptions match the brief verbatim; changed titles keep the front keyword (사진 PDF 변환, PDF 분할·쪽 삭제·회전, HEIC·PNG JPG 변환, HWP 뷰어, PDF 합치기, 증명사진 용량 줄이기) and unchanged titles are byte-identical; the 30 guide trims only remove text — no new facts, numbers or sources (kuksiwon-photo dropping the agency, driver-license-photo "도로교통공단 안내" and open-hwp-without-hangul "한컴 뷰어" are faithful shortenings; ecfs "100M" is verbatim from the court source); check-dist runs metaProblems on every page in pageHtml with head-only parsing and entity decoding, plus the summary line asserted in postbuild.test; site.spec regex now escapes "|" and enforces 34+suffix; VISITS_NOTE is the owner's exact sentence and the "사람 수" negative check strips only that note; U2 multi-file notice survives the open (cleared in clearFile, re-set after it), pump idles in 'working' and resumes on setState('ready'), bulk remove focuses 모두 선택 or the first 되살리기, #ps-run is described by the existing #ps-hint; no "80–120" left; targeted unit suites (meta-length, guides-schema, polish, visits) pass 157/157.
