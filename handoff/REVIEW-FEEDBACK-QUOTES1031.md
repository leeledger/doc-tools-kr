# Review Feedback — Step QUOTES1031
Date: 2026-10-30
Ready for Builder: YES

## Must Fix
None.

## Should Fix
None.

## Escalate to Architect
None. (JLPT keep-vs-drop is already a logged D2 Known Gap with a 2026-11-13 trigger.)

## Cleared
Reviewed diff draft1031...HEAD (299b089, b7a66ec, bbc78d9):
- Apple quote: fetched https://support.apple.com/ko-kr/guide/iphone/iphbf4977cff/ios live (200, no redirect). Raw markup is 「썸네일을 표시하려면 <img alt="사이드바 보기 버튼">을 탭하십시오. (<img alt="사이드바 보기 버튼">이 나타나지 않으면 PDF를 탭하십시오.)」; the project's own `hasExactQuote(q, pageTextExact(html))` returns true for the new quote and for all 4 other pdf-split Apple quotes, so the 2026-10-30 date bump on all 5 is justified.
- Reworded 쪽 빼기 step (pdf-split.md:115) says only what the quote says: press 사이드바 보기 to show the page thumbnails; if the button isn't there, tap the PDF. 「페이지 삭제」 and long-press are backed by existing quotes #2 and #4. FAQ line 52 has no 페이지 수 wording. No 업로드/서버/브라우저/네트워크/brand slips in the file.
- source-watch 404 retry (source-watch.mjs:101-108): only `r.status === 404` retries, and only once; the second result replaces the first and goes through the same UNREACHABLE path, so a persistent 404 still fails the gate. Network errors return status 0 from fetchText (common.mjs:73), 403/410 return at once (common.mjs:71), and neither is retried. The wait goes through `io.wait ?? sleep`, so the tests don't sleep (ops.test.ts runs 56 tests in 1.5 s).
- Tests a–d (ops.test.ts:251-293) cover 404→200 pass, 404→404 fail (exit 1, one `HTTP 404`), 200 fetched once with no wait, and 403 not retried. All pass locally.
- The diff touches only the files the brief allows. jlpt, id-photo-presets, history-exam-photo and jpg-to-pdf are untouched.
