# Review Feedback — CONTENT1021 Step B2
Date: 2026-10-21
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/content/guides/kakao-photo.md (「PC 카카오톡으로 보낼 때」, 3rd paragraph) (confidence: 8): 「PC 버전이 사진으로 보낼 수 있다고 안내하는 확장자는 JPG(JPEG), GIF, BMP, PNG, TIF(TIFF), TGA, PSD, AI예요」 is attributed to Kakao but has no quote in front matter and no line in kakao-photo-1.txt. The fact is true: I fetched cs.kakao.com/helps_html/1073209414 today and it says 「■ 전송 가능한 이미지 파일 확장자 • jpg, jpeg, gif, bmp, png, tif, tiff, tga, psd, ai」. Fix: add that line as a source (retrieved 2026-10-21) and append it to kakao-photo-1.txt.
- src/content/guides/kosaf-docs.md (confidence: 7): the page repeats itself in three places:
  - 「선택서류를 내지 않으면 필수서류를 기준으로 심사해요. 심사는 필수서류로 진행되니…」: the second sentence restates the first.
  - 「홈페이지와 앱, 어디로 낼까요」 repeats the 홈페이지/앱 steps a few lines above (「서류제출현황에서 오른쪽 아래 [서류제출]」, 「앱에서 서류제출 메뉴」).
  - The last sentence of the TIF paragraph (「가구원 동의는 가구원이 직접 온라인으로 동의하는 것이 원칙이니…」) repeats 「가구원 동의는 온라인 동의가 원칙이에요」 four lines earlier.
  The page is at 2,552, so cutting these drops it under the bar. Replace them with kosaf-specific content rather than just deleting them.
- Generic tips repeated across B2 siblings (D6 / B1 Should Fix carried) (confidence: 6): Decision 2 holds for the big tips (HWP error list, extensions, mail limits). Two small tips still appear, reworded, on several pages:
  - Name or rename files so they don't get mixed up: ecfs-pdf-limit, univ-docs-upload (it also has its own 「파일 이름 짓는 법」 section), remove-background, hwpx-to-hwp, yearend-tax-pdf, email-attachment-limit.
  - Delete leftover document photos or copies after sending: kosaf-docs (twice), yearend-tax-pdf, kakao-photo, open-hwp-without-hangul.
  Not blocking, because each page carries plenty of its own content. In Step C or D, give each tip one owner page and link to it from the others. The 「아이폰이라면 「파일」 앱의 다운로드 폴더」 asides on the tool-specific phone sections are acceptable as one-liners.
- src/content/guides/yearend-tax-pdf.md (confidence: 6): the warning 「새로 저장된 파일이라 회사 프로그램이 읽지 못할 수 있어요」 appears three times in a row (after figure 1, in 「메일로 내는데…」 and in 「회사 프로그램이 파일을 읽지 못한다고 할 때」). Keep one.
- tests/unit/guide-check.test.ts `imgDir` (confidence: 5, verify): for a flagged slug the test reads public/img/guide/<slug> first when it exists. A stale gitignored copy from an earlier flag-on run would then be checked instead of the committed source. Read FLAGGED_IMG for any slug in FLAGGED_GUIDE_IMAGES.

## Escalate to Architect
- None. Bob's checker blind spot, where 「7」 next to 「세 번째」 in adjacent SVG text nodes reads as an age, is a Step D item. It fits with the logged 년/시 unit gap.

## Cleared
I reviewed 22 guides, 44 SVGs, the 11 new excerpts, gen-brand/.gitignore, guide-length.mjs and the three test files:
- Quotes: I re-fetched every new 2026-10-21 quote, 79 in all, from the live pages today: Hancom tech, Hancom FAQ 2784, Microsoft extensions, KOSAF FAQ, Apple iPhone and 116944, Kakao ×4, law.go.kr 전자서명법, 정부24 FAQ ×2, and Uway FAQ (EUC-KR). All 79 match verbatim. Context holds too: 「2011년 12월 30일 제정된 한국산업표준」 refers to OWPML, and the Hancom page shows renaming .hwpx to .zip.
- Numbers with 년, 일 or clock units (2020. 6. 9., 2011. 12. 30., 30분, 1일~3일) all carry quotes. MB and 쪽 limits come from existing sources or toolFacts.
- Institution and vendor paths are cited: 정부24 MyGOV and ezPDFReader, Windows 「보기 › 파일 이름 확장명 표시」, Apple 「고효율성」, Kakao PC send, Uway 그림판, KOSAF menus.
- I grepped about 60 tool-UI strings and error messages quoted in the guides. All exist in src.
- Plain words: no 업로드/서버/브라우저/네트워크/EXIF/dpi in the new shown copy or the SVG text. 「업로드하실」 appears only in an unrendered front-matter quote.
- SVGs: role="img", <title>, no external href, all hashes unique.
- Flagged-image design is correct in both builds:
  - gen-brand runs in prebuild and predev. It always removes public/img/guide/remove-background/ first, then copies the figures only when bgRemoveOn(PUBLIC_BG_REMOVE) is true. If the source is missing, cpSync throws and the build fails closed.
  - The public copy is gitignored.
  - check-dist still fails any flag-off dist path containing "remove-background", so a stale copy cannot ship silently.
  - Production builds with `npm run build` (CLOUD-HANDOFF), so prebuild runs. Cloudflare has the flag on: /remove-background/ and /guide/remove-background/ both return 200 live today, and CI's checks job sets PUBLIC_BG_REMOVE=1.
- Tests: LENGTH_PENDING only lost the B2 slugs, and a new assertion pins guides out of it. The guides-schema `updated` value stays exact (2026-10-21). The figure-exists check widens only to the flagged source folder, and dist is still checked by D5.3. No threshold was lowered.

---
## Round 2 verdict — 2026-10-21
Ready for Builder: YES

- kakao-photo: I re-fetched the file-type quote 「jpg, jpeg, gif, bmp, png, tif, tiff, tga, psd, ai」 from helps_html/1073209414 today. It matches verbatim, and the line is now in kakao-photo-1.txt. Verified.
- kosaf-docs: the three repeats are gone. The 4 new quotes (2 on the 관계단절 FAQ, 1 미혼모, 1 「ex. (부)재외국민·외국인…」) match the live KOSAF pages verbatim, and kosaf-docs-2.txt holds them. The new text stays inside what the quotes say: 등본 also counts, 계부·계모 consent, 미혼모 → only the mother, and the three 기타서류 examples. No unsourced claim.
- yearend-tax-pdf: the re-saved-file warning now appears once. All 5 NTS quotes (cntntsId=7706) are on the live page. Two of them showed as mismatches in my plain fetch only because the page writes &middot; and &lsquo;…&rsquo; as HTML entities; the raw HTML confirms the text. I also checked the unquoted wording against the page: 「전산작성한 공제신고서를 이용하여 예상세액 계산」 (방법 2) and the name 「맞벌이 (근로자) 절세안내」 are both there.
- Plain words: no 업로드/서버/브라우저/네트워크/EXIF/dpi in either page's shown copy.
- guide-check.test: `imgDir` now always reads src/assets/flagged/img/guide/<slug> for a slug in FLAGGED_GUIDE_IMAGES. A stale public copy can no longer stand in for the committed source. Verified.
- Still open: Should Fix 3 (sibling tip repeats), deferred to Step D. Bob has logged it.

Step B2 is clear.
