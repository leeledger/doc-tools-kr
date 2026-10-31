# Architect Brief — QUOTES1031 (guide quotes whose official sources changed)

Branch quotes1031 (worktree wt/quotes1031), on draft1031 (PR #42) on seo1031 (PR #41).
Trigger: `npm run check:quotes` on main 2026-10-30 (1 NOT VERBATIM, 17 jlpt UNREACHABLE, 6 historyexam UNREACHABLE).

## Goal
The pdf-split Apple quote is verbatim again, a one-off 404 no longer fails the quote gate, and the JLPT outage is logged with a recheck trigger instead of guessed around.

## What Arch found (2026-10-30, live probes)
1. Apple https://support.apple.com/ko-kr/guide/iphone/iphbf4977cff/ios: the `/ios` URL now serves the **iOS 27** guide (version selector iOS 27 / iOS 26). Every section now reads
   「썸네일을 표시하려면 사이드바 보기 버튼 을 탭하십시오. ( 사이드바 보기 버튼 이 나타나지 않으면 PDF를 탭하십시오.)」
   (the space before 을/이 is the markup of the Apple page, same as our existing 「더 보기 버튼 을」 quote). The old 「…페이지 수를 탭하십시오.」 survives only as the move-section fallback 「(썸네일이 보이지 않는 경우, 화면을 탭하여 페이지 수를 표시한 다음 페이지 수를 탭하십시오.)」.
   Our other 4 pdf-split Apple quotes and the jpg-to-pdf Apple quote: verbatim (exact mode) today.
2. JLPT https://www.jlpt.or.kr/: **the whole domain is parked, not moved.** Every path (/html/information_01.html, _02, /main.html, http and https, bare jlpt.or.kr) 302s to `/`, which is only an image `JLPT_parking_20261027.jpg`: 「시스템 점검 안내 … 시스템 점검 작업으로 인해 서비스가 중단되오니 …」 plus a 「성적증명서 재발급 바로가기」 jotform link and webmaster@jlpt.or.kr / 1544-9760. m.jlpt.or.kr times out. The jlpt.jp overseas list still points Korea to http://www.jlpt.or.kr/. The newest Wayback capture of information_01.html is 2026-08-05 (older than our 2026-10-12/21 reads). **No official copy of the text exists anywhere right now.**
3. historyexam https://www.historyexam.go.kr/pageLink.do?link=apyexmInfo: 200 today, all 6 quotes verbatim (exact). Transient 404. Bump nothing.

## Decisions (Arch, logged)
- D1 Apple: replace the dead quote with the new verbatim sentence; rewrite the 쪽 빼기 step to match; bump `retrieved` to 2026-10-30 only on the pdf-split Apple quotes (all 5 re-verified today). jpg-to-pdf untouched.
- D2 JLPT: **keep all jlpt.or.kr quotes, URLs and their 2026-10-12/2026-10-21 dates unchanged; do not bump; do not drop.** Reason: the text did not move or change; the operator took the whole site down for maintenance on about 2026-10-27. The quotes are honest as dated reads; dropping the numbers of the jlpt-photo guide and the `jlpt` preset over a maintenance page would delete a live traffic page for a temporary outage. The gate stays red for jlpt (no allowlist, no skip: the check is not weakened); the weekly source-watch keeps opening its issue, which is the alarm we want.
  Recheck trigger (Known Gap): when jlpt.or.kr returns, or on 2026-11-13 at the latest, re-run `node scripts/ops/source-watch.mjs --exact`; any jlpt quote not verbatim then: re-find on the new site or drop it and the number it supports (jlpt-photo, youth-card-photo, preset `jlpt` in src/data/id-photo-presets.ts). Still parked on 2026-11-13: escalate keep-vs-drop to the owner.
  No page copy about the outage: a 점검 중 line would turn false the day the site returns, and the only source is an image.
- D3 source-watch: retry **once** on HTTP 404, after a 10 s pause, and report the second answer. `fetchText` already retries 429/5xx/network errors 3x with backoff; it returns 4xx immediately, which is how the historyexam blip failed the gate. A real 404 is still 404 on the retry, so still UNREACHABLE, so the gate still fails. Only 404 (the observed case); 403/410 unchanged.

## Flow (source-watch get, after D3)
```
get(url) - pause 1.5 s - fetchText (retries 429/5xx/net x3)
             |
             +- status 404 - log "ERR 404 ... retry" - wait 10 s - fetchText once more -+
             |                                                                          |
             +- other ------------------------------------------------------------------+- log OK/ERR - return
```

## Build Order
1. **Commit A: source-watch 404 retry**
   - scripts/ops/source-watch.mjs `run()` -> `get`: after the first `fetchText`, if `r.status === 404`, log it, `await (io.wait ?? sleep)(RETRY_404_MS)`, fetch once more, use that result. Export `RETRY_404_MS = 10_000`.
   - Header comment: add "a 404 is fetched once more after 10 s (QUOTES1031)".
   - Tests in tests/unit/ops.test.ts (`describe("quotes (A-3)")`), via `run(["--exact"], io)` with a stub `fetchImpl` and a recording `wait`:
     a. 404 then 200-with-quote: exit 0, no UNREACHABLE, wait called with 10000.
     b. 404 then 404: exit 1, one UNREACHABLE `HTTP 404`.
     c. 200: fetched exactly once (no extra call, no 10 s wait).
     d. 403: fetched once, UNREACHABLE `HTTP 403` (only 404 retries).
   - Existing tests stay green unchanged.
2. **Commit B: pdf-split Apple quote** (src/content/guides/pdf-split.md)
   - Source #1 quote becomes, YAML single-quoted, byte-exact incl. the spaces before 을/이 and after the opening parenthesis (copy the 「…」 text from Found #1 above):
     썸네일을 표시하려면 사이드바 보기 버튼 을 탭하십시오. ( 사이드바 보기 버튼 이 나타나지 않으면 PDF를 탭하십시오.)
   - `retrieved: "2026-10-30"` (keep the file quoting style) on all 5 Apple sources of pdf-split (re-verified today). Nothing else in frontmatter.
   - Body line 115 (쪽 빼기) becomes: 「미리보기」 앱에서 PDF를 열고 「사이드바 보기」 버튼을 눌러 쪽 그림을 띄운 뒤(버튼이 안 보이면 PDF를 한 번 눌러요), 뺄 쪽 그림을 길게 누르고 「페이지 삭제」를 눌러요.
   - Keep line 113 「메뉴 이름은 iOS 버전에 따라 조금 다를 수 있어요.」 (still true: iOS 26 vs 27). FAQ line 52 has no 페이지 수 wording: confirm, no change.
   - Flag: no other word changes; plain-language and 문서딱 rules apply; guide-length minimum must still pass.
3. **Commit C: BUILD-LOG** QUOTES1031 build entry (what changed, gate result).
4. Do not touch: any jlpt.or.kr source/URL/date, src/data/id-photo-presets.ts, history-exam-photo.md, jpg-to-pdf.md.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| 404 retry | Real removed page | 2nd 404: UNREACHABLE, gate exit 1 (test b) | Operator sees the report; no silent pass |
| 404 retry | Weekly watch slowed | max 10 s per 404 URL; one request at a time stays polite | n/a |
| 404 retry | Retry masks a flapping site | Only a 200 with the quote verbatim passes; flapping that ends in 404 still fails | n/a |
| Apple quote | Apple edits again (iOS 27.x) | Weekly watch flags it (existing) | Steps may lag a week; line 113 hedges |
| JLPT | Site returns with new rules | Recheck trigger D2 by 2026-11-13; weekly issue meanwhile | Numbers dated 2026-10-12/21 with source dates: honest, possibly stale; logged, not silent |
| JLPT | Gate red blocks unrelated guide publishes | Reviewer reads the UNREACHABLE list; jlpt lines are the known D2 gap, anything else fails the step | n/a |

## Test map
- 404 then 200 retry passes ...................... [GAP] -> test a
- 404 then 404 still fails ........................ [GAP] -> test b
- 200 path unchanged (single fetch) ............... [GAP] -> test c (regression)
- non-404 4xx not retried ......................... [GAP] -> test d
- checkSources found/changed/unreachable/exact .... [TESTED] existing ops.test.ts
- pdf-split quote verbatim ........................ live gate (Acceptance)
- guide schema / length / plain-language / brand .. [TESTED] npm test + check-dist

## Out of Scope
- JLPT replacement source or dropping JLPT numbers (D2; Known Gap with trigger).
- Reporting "redirected to the home page" as its own reason in source-watch (Known Gap).
- jpg-to-pdf Apple date bump; any other guide.
- Allowlisting/skipping known outages in the gate (would weaken it).

## Acceptance
- `npm run check` 0 errors; `npm test` green incl. 4 new tests.
- `PUBLIC_SITE_URL=https://docttak.com npm run build` + check-dist green.
- `npm run check:quotes` (live): 0 NOT VERBATIM; UNREACHABLE lines only for https://www.jlpt.or.kr/html/information_01.html (the D2 outage). Paste the summary line in the review request.
- `npx playwright test --project=chromium` green.
- Diff limited to scripts/ops/source-watch.mjs, tests/unit/ops.test.ts, src/content/guides/pdf-split.md, handoff/*.
