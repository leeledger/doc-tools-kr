# Review Feedback — Polish Q (+ merge d164fc0), diff 2de05a2..HEAD
Date: 2026-09-30
Ready for Builder: NO

## Must Fix
- tests/unit/postbuild.test.ts:496 (confidence: 10/10) — the merge broke the unit gate. `walk(DIST, /\.html$/)` now includes the Naver ownership file, so the "share previews" test fails:
  `AssertionError: ...\dist\naverab73ee2e778ed2f0eea14328733b50c9.html: og:type: expected null not to be null` (vitest: 522/523).
  check-dist got the exemption on the hotfix side (`!/^(naver|google)[0-9a-f]+.html$/`) but the Polish Q test did not. Fix: filter the same basename pattern out of `pages` in this test. Use an escaped dot, `/^(naver|google)[0-9a-f]+\.html$/`, and ideally share one constant with check-dist so the next verification file cannot break it again. The file must stay: Naver verification needs it byte for byte.

## Should Fix
- src/pages/index.astro:76-77 (confidence: 9/10) — visible missing space on the home page. The expression at the start of the line swallows the newline, and dist renders `…보낸 뒤 처리합니다.문서딱은 처리 프로그램을…`. Fix: put the sentence on one line, or write `{' '}` or `{`${josa(SITE.name,'은/는')} `}` before it. Add a dist assertion that no `다.` is immediately followed by a Hangul letter.
- scripts/check-dist.mjs:58 (confidence: 6/10) — `.html` in the regex has an unescaped dot. It is harmless in practice. Escape it while you are touching the Must Fix.
- src/tools/photo-compress/headline.ts, single `same` case (confidence: 5/10) — "원본 그대로 두었습니다. 원본을 받으셔도 됩니다." says 원본 twice. Consider "원본 그대로 두었습니다. 그대로 내려받으셔도 됩니다." This is copy polish only.

## Escalate to Architect
- Home <title> and H1 carry no tool keyword. The title is "문서딱 — 내야 하는 문서·사진, 용량과 규격에 딱 맞춰 드려요", and it was brand plus tagline before as well, so this is not a regression. The owner's #1 goal is traffic, and the home page is the strongest page for queries like "PDF 합치기 사진 용량 줄이기". Should the home title name the top tools (e.g. "PDF 합치기·사진 용량 줄이기·여권사진 규격 | 문서딱")? This is a product/SEO call, not a code call.
- The titles dropped "업로드 없이" per the owner's jargon rule, against UX-AUDIT-2's search advice. This was already asked in REVIEW-REQUEST; it needs a recorded decision.

## Verified (my runs on d164fc0, PUBLIC_SITE_URL=https://docttak.com)
- Merge: `git diff 132e5e9 HEAD` = only the Naver file + the check-dist exemption. The Naver file is present in public/ and in dist, byte-identical, not in the sitemap or SW. Hotfix 76de652 content is otherwise fully superseded. `grep -r 안올림 dist` = nothing, including /licenses/.
- OG and Twitter: every page (home, 5 tools, privacy, terms, licenses, offline, 404) has og:type/site_name 문서딱/locale/title/description/url/image(+type, w, h, alt) and twitter card/title/description/image/alt, all absolute on https://docttak.com. Titles and descriptions are unique per page. H1 = the tool name ("PDF 합치기" in the title and H1, and so on).
- I looked at all 7 og-*.png images. Korean is crisp and large, the brand is 문서딱 with the icon, and the domain is docttak.com. All text sits inside x≈300–900, so the Kakao 1:1 centre crop keeps it.
- Josa helper: logic checked (받침, ㄹ for 으로/로, digit readings, trailing-0 units, Latin letter names, closers). Unit tests pass.
- Photo already-small: kept rows arise only when there is nothing private to strip (engine.ts:179-182, 376-383). keptSmall = target mode. "원본 내려받기" and the ZIP include originals, with deduped names. The summary counts 줄임/그대로/늘어남/못 줄임/대기 separately, and the size total covers reduced photos only.
- Privacy and terms: short, plain and consistent with what ships (no cookies or analytics found in dist). Beacon and ads stay gated by check-dist on PUBLIC_CONTACT_EMAIL. The missing privacy officer is a logged Known Gap under the owner's rule; it must be fixed before ads or the beacon go on.
- Gates:
  - check: only the pre-existing hwp-to-pdf.spec.ts:183 error.
  - unit: 522/523 (the Must Fix).
  - build: OK in both configurations (dist flag on, dist-noauto flag off).
  - check:licenses: OK.
  - e2e chromium: site + polish + photo-compress passed. id-photo passed 51/51 on chromium + manual-chromium once dist was the flag-on build. My first run against a flag-off dist failed 13 autoframe tests; that was the environment, not the code.
- Manual pass: screenshots of home and /photo-compress/ at desktop, mobile (Pixel 7), and dark on both. Layout, contrast and brand are fine.

## Cleared
Merge, OG/Twitter set and images, josa, photo kept/summary logic, id-photo done-state and the legal pages are sound; one broken unit test from the merge blocks.
