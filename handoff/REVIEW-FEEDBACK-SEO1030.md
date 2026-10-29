# Review Feedback — Step SEO1030
Date: 2026-10-30
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/content/hubs/photo-sizes.md:26 (confidence: 6/10) — new FAQ says 「반명함판 3×4 cm는 기관 규격이 아니라 사진관에서 흔히 쓰는 크기예요」. 「사진관에서」 is new framing with no source; the existing FAQ two lines below says only 「흔히 쓰는 크기예요」. Also 진학사 itself asks for 「반명함판(3X4)」 (admission-photo.md:17), so "기관 규격이 아니라" reads slightly off next to that row. Fix: drop 「사진관에서」 and match the existing wording. Not a number, so unsourcedFacts can't catch it.
- src/content/guides/driver-license-photo.md:124 (confidence: 5/10, verify) — 「…받지 않아요」 is a little firmer than the page's own 「사진규격에 부합하지 않는 경우 면허증 발급이 지연 및 반려될 수 있습니다」. It's backed by 「합성된 사진 불가」 and 「사진인화용지에 인화된 사진만 허용」, and each listed item (흰색 배경, 치아, 복사·포토샵 수정, 합성, 색안경, 인화지) is in the 2026-10-21 quotes, so nothing is invented. Optional: 「…은 허용되지 않아요(반려될 수 있어요)」.
- src/content/guides/youth-card-photo.md:93 (confidence: 4/10) — 「최근 사진이 좋아요」 is advice in an FAQ titled 규정. It contains no number and says outright that the source states nothing else, so it's acceptable. Leave it or cut that clause.

## Escalate to Architect
None.

## Cleared
I read the full diff of all 17 files. The checks below passed:
- Facts: every changed number and fact in titles, descriptions, answers and FAQs matches an existing verbatim quote. Driver: 3.5×4.5 cm, 6개월, 2매/1매, 413×531, 500KB. ID card: both gov.kr quotes, 신규 and 재발급. Admission: 3개월, 3X4, jpg. Kakao: file 300MB and 1GB. Youth: 3.5×4.5 cm. Jobkorea preset: 150×210 and 5 MB.
- Probes: the kakao re-read is logged with the verbatim quote, and only that page's dates were bumped. The failed probes are logged verbatim, with no claim made.
- Scope: kuksiwon-photo was not touched.
- Brand and copy: brand and plain language are fine, and nothing leads with a no-upload claim.
- Pins and tests: the pins match D8, and the frozen-4 test and fixture were updated deliberately.
- Snapshots and thresholds: the snapshot and the usage literal were hand-edited, one line each, and nothing was loosened.
- Tests I re-ran: guides-schema, usage and visits, 294/294 green.
