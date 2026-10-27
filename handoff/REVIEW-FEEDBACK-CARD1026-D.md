# Review Feedback — CARD1026 Step D
Date: 2026-10-26
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/content/guides/qr-code.md:137 and FAQ :94 (confidence: 7/10). The guide says 「Apple의 개발자 영상은 아이폰 카메라가 … 이름을 숨긴 와이파이는 지원하지 않는다고 설명해요」 in the present tense. The saved source (apple-wwdc17-206.txt:51, 「Hidden SSIDs are not supported.」) is the 2017 tech talk 「QR Code Recognition on iOS 11」, so the claim has a version and a date that the paraphrase leaves out. Fix: name the scope, e.g. 「Apple이 2017년 iOS 11을 소개한 개발자 영상은 …」. Keep the advice to use a visible network for guest QRs, which stays sound. E1 (dropping the option) does not change.
- src/content/guides/qr-code.md:123 (confidence: 6/10). 「번호는 … 숫자만 골라 담아요」 is not quite right: payload.ts:38 keeps one leading `+` (「one leading + kept」). Fix: 「숫자만 골라 담아요(맨 앞의 +는 그대로)」, or just 「붙임표와 빈칸은 빼고 담아요」.
- src/content/guides/stamp-image.md:105, src/content/tool-notes/qr-code.md:33, business-card.md:26 (confidence: 5/10). These three link with the brief's working title 「QR코드 만들기 전에 알아 둘 것」, which differs from the shipped title 「QR코드 만들기 전에: 와이파이·연락처 QR, 잘 찍히는 QR」. The links work, but the anchor text should match the page title or use a neutral phrase. This is optional.

## Escalate to Architect
None. The orchestrator decisions hold up. The 「서명·도장」 topic is acceptable: there is no closer topic, and the stamp-image inbound and next-guides cross-links are coherent. The plain /qr-code/ CTA is correct because parseHref does not accept ?tab= (logged as out of scope).

## Cleared
I reviewed the D10 move and the guide.

**The D10 move.**
- NOT_PRECACHED (gen-sw.mjs:65) and RUNTIME_PAGES (sw.ts:36) both list /photo-compress/.
- The page's /_astro/ scripts, worker and controller fall under RUNTIME_PREFIXES, so they are cache-first after the first use. No stale-cache path is added: the runtime page path is the existing one used for /hwp-to-pdf/ and /stamp-signature/.
- The new e2e mirrors the REV3 hwp-to-pdf test: a precache assertion, then one online use, then an offline reload and compress.
- Test edits only move the URL. postbuild still asserts /, /pdf-merge/, /pdf-compress/, /id-photo/ and the id-photo controller are precached. polish and pdf-password gained /photo-compress/. Nothing was loosened.
- `vitest pdf-password + polish`: 115/115 pass.
- Note, no action needed: /photo-compress/ is a manifest shortcut (web-manifest.ts:8). A first-ever offline launch from it now gets the offline page, the same as the existing /hwp-to-pdf/ shortcut.

**The guide.**
- Every number traces to a saved quote dated 2026-10-26: 21×21, +4, 177×177, version-table rows M binary 14/412/450/2,331, and the 4-module margin. I checked them against handoff/sources/card1026/qrcode-com.txt.
- The paraphrases of ZXing (prompting, the escape set \ ; , " :), RFC 2426 (N order, VERSION 3.0), the iCloud vCard 3.0 import and the qrcode.com license and trademark-scope lines keep the sources' meaning. The only meaning issue is the iOS 11 scope above.
- E3: the trademark line is verbatim from qrcode-com.txt:44.
- No Wi-Fi name length, fold length or hidden-network option appears.
- Tool claims match the code: https:// prefix, WIFI field order and escaping, the WPA/WEP/비밀번호 없음 labels, N/FN and displayName (Latin given-family order and the org fallback), DENSE_VERSION 15, QR_MAX_BYTES 2331 and QUIET 4.
- Plain language and the 문서딱 brand are fine.

**The figures.**
- The webp shows only made-up data.
- The SVG's QR decodes with jsQR to "docttak.com" (v1). Its margin geometry is exactly 4 modules (40 px at 10 px per module).
- guide-shots `bottom` is additive.
