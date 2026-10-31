# Review Feedback — Step SEO1031
Date: 2026-10-30
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/content/guides/what-is-hwpx.md:123-124 (confidence: 6/10) — the new FAQ 「HWPX 뷰어가 따로 필요한가요?」 says nearly the same thing as L121-122 「한글 프로그램 없이 HWPX를 열 수 있나요?」 (both: 문서딱 HWP·HWPX 파일 보기, 설치·가입 없이). D5 asked for it, so it stays. If you touch the page again, give the 뷰어 answer one fact the other lacks that is already in the body (for example that it only shows the file and does not edit it, if the body says so), or merge the two. No action needed this step.

## Escalate to Architect
- None. Known Gap (already logged by Bob, D8): old titles are still used as anchor text in other guides (HEIC ×4, HWPX가 뭔가요? ×4 + hwpx-to-hwp FAQ, 컴활 ×2, 여권 영문 이름 ×3, 서류 제출 용량 모음 ×1). The text is still accurate, so it can wait for a later cleanup.

## Cleared
I checked all 10 frontmatter diffs, the tools.ts, e2e and astro literals, and the D9 test block.
- Every number in the new titles, descriptions, answers and FAQs comes from a quote: kuksiwon (preset quote: 276×354, 3.5×4.5 cm, 6개월, 상반신 컬러, JPG·PNG), korcham (preset no=194: JPG·JPEG·PNG·GIF, 400×500, 1:1.25; the body table already says 「파일 용량 | 안내 없음」), gosi, reissue (L21/L25 quotes for 여권사진 변경 → 방문 신청만), heic (Apple 설정 > 카메라 > 포맷 > 높은 호환성, plus 「모두 JPEG」).
- The hwpx-to-hwp FAQ matches body steps 1–3 word for word.
- The remove-background FAQ matches body L117/L131 and makes no claim that 한컴 한글 removes backgrounds (D9 negative test guards it).
- The heic answer re-cut keeps all of the old facts.
- The korcham retrieved date was bumped only on the no=194 quote, which was re-read in the D6 probe.
- No 업로드/서버/브라우저/네트워크/EXIF/dpi in new copy (the only hits are byte-exact official quotes). Brand is 문서딱 throughout.
- The kuksiwon answer reads naturally and keeps 국가시험.
