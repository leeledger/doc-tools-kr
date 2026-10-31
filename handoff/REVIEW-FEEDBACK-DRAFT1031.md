# Review Feedback — Step DRAFT1031
Date: 2026-10-30
Ready for Builder: NO

## Must Fix
- src/content/guides/local-gosi-photo.md (body 「해상도 100 이상의 3.5×4.5 cm 사진」 section, 「집에서 새로 찍을 때」 closing paragraph) (confidence: 8)
  This prose says more than the source does. The center lists two separate failure causes: 「규격보다 작은 사이즈의 사진이거나 DPI가 100DPI 미만인 사진」 (local-gosi-photo-1.txt, item C). The page merges them into one: 「해상도 100 이상이라는 말은 사진 파일이 너무 작으면 안 된다는 뜻이에요」. It then promises 「사진관에서 받은 원본 파일이나 휴대폰 사진은 대부분 넉넉하니, 크기를 너무 많이 줄인 파일만 조심하면 돼요」 and 「휴대폰 사진은 크기가 넉넉해서 해상도 100 이상이라는 조건에 걸릴 일이 거의 없어요」. No source says this. It is also likely wrong: phone and scanned JPGs often carry a 해상도 value of 72 however many pixels they have, and the center checks 「DPI 미만」 separately from size. The page also contradicts itself. Its own gosi warning (137 px over 3.5 cm → 「해상도가 100에 조금 못 미쳐요」) reads 해상도 as the file's stored value, not as the pixel count.
  Fix:
  - Delete the two phone/photo-studio reassurances and the 「너무 작으면 안 된다는 뜻」 equation.
  - Say only what the center says: a photo smaller than the 규격 or with 해상도 under 100 is not accepted.
  - Point to the id_card CTA as the way to get a file saved at 해상도 300 (true: encode.ts writes JFIF 1/300/300).
  - Keep the 「해상도」 wording (no dpi).
  - Re-check the 「등록이 안 되거나 이상할 때」 first bullet. It is fine as written: 「원본 사진으로 … 다시 만드세요」 is acceptable only if it points to the tool.

## Should Fix
- handoff/sources/draft1031/kakao-file-limit-1073209424.txt, -1073209399.txt, -1073209427.txt (confidence: 9). The three saved Kakao texts are cut off at about 2.7 KB, mid-line, e.g. 「■ 이미지 • jpg, jpeg, g」 and 「▣ 유의사항 • 용량을 초과할 경우 전송에」. 7 of the 13 kakao-file-limit quotes (sources 2, 3, 5, 6, 9, 10, 13) are therefore not in the saved files. I fetched all three live pages today and all 13 quotes are there word for word, so the page is correct; only the saved record is incomplete. Re-save the full page text.
- src/content/guides/naver-daum-mail-limit.md, 「다른 메일에서 온 대용량 첨부는 보낸 쪽 기준」 first sentence (confidence: 6). 「대용량 첨부의 기간과 횟수는 받는 사람이 쓰는 메일이 아니라 보낸 쪽 메일의 기준을 따라요」 is stated as a rule for every mail service. Daum 38506 only says this about mail received in Daum. Scope it to 「다음 메일로 받을 때는」. The 네이버→다음 inference that follows is fine.

## Escalate to Architect
- None.

## Cleared
I checked these and they pass:
- Every quote in the 6 guides is in a saved source or on the live page.
  - fire (11) and military (12) via-pdf quotes: checked with PyMuPDF on PDFs whose sha256 matches the brief (e5bb4353…, ddcd4e66…). The 5 quotes pdftotext scrambles also pass: 접수방법, the 공고 line, 500kb, 모바일, and the fee quote with U+FF5E.
  - kacta (26), local-gosi (12) and naver-daum (26): all in the saved texts.
  - kakao (13): checked on the live pages.
- No number in the prose goes beyond its quote:
  - 소방 never says 350.
  - 군무원 states no cm/px.
  - kacta's only size is the half_card 354×472 계산값, labelled 문서딱-not-한국세무사회.
  - 지방직 uses 「해상도 100」 and the id_card preset (300).
- Plain language and brand: no 업로드/서버/브라우저/네트워크/EXIF/dpi in copy or SVGs; 문서딱 only.
- Bob's judgement calls are all acceptable:
  - Swapping the 공고-title quotes.
  - The kacta format row.
  - kakao's category and topic.
  - Keeping the ?osType query on the Naver URLs.
  - 소방 「상반신 전체」 = can't tell who it is: the PDF lists it under 「본인을 특정할 수 없는 사진*」.
  - The 137 px ≈ 99 line.
  - The 네이버→다음 inference.
- The via:'pdf' refactor (schema enum, type, source-watch manual path and its (PDF) row) has no other consumers. Its test covers: never fetched, the browser row unchanged, and watchList keeping via.
- ops and guides-schema unit tests: 109/109 green.

## Re-review — fix commit 17b1a95
Date: 2026-10-30
Ready for Builder: YES

- Must Fix (local-gosi-photo unsourced 해상도 reassurances): resolved. 「너무 작으면 안 된다는 뜻」 and both 휴대폰 사진 안심 lines are gone; the body now states only the center's two conditions (「규격보다 작은 사이즈의 사진」, 해상도 100 미만), matching the two frontmatter quotes. The new 「해상도 300」 claim for /id-photo/?preset=id_card is true: src/data/id-photo-presets.ts id_card has `dpi: PRINT_PPI` (300) at 3.5×4.5 cm (`printPx(35)`/`printPx(45)`), and src/lib/idphoto/encode.ts writes and verifies JFIF units 1 at `spec.dpi`. No new unsourced claim found.
- Plain language: DPI appears only inside the two verbatim quotes (lines 17, 25); body uses 「해상도」.
- Should Fix (Kakao sources): resolved. All 13 kakao-file-limit.md quotes found (whitespace-normalised) in the re-saved kakao-file-limit-1073209399/-424/-427.txt — 13/13.
- Should Fix (naver-daum 「보낸 쪽 기준」): resolved; now scoped to 「다음 메일로 받을 때」, which is what the Daum source says.

Step DRAFT1031 is clear.
