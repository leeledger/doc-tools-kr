# Review Feedback — Post-hoc: hwp-direct + Growth G (live on docttak.com, main 37aa511)
Date: 2026-10-01
Reviewer: Richard. Range a01af5e..37aa511, worktree doc-tools-kr-hotfix (cloud-handoff = origin/main).

## Verdict: FIX FORWARD

I found no user harm that justifies a rollback.
- **No file bytes leave the device.** I checked live in Chromium, Firefox and WebKit: every request is a same-origin GET with no body, and there are no non-GET requests.
- **Downloads work.** Each one produced a correct PDF with extractable text on every page.
- **Guide specs match.** Every spec number I checked on 5 guides matches the official page as fetched today.

The fixes below go forward on main.

Ready for Builder: YES (fix forward; nothing blocks the live site)

## Must Fix (P1, next deploy)
- **Live, every page: Cloudflare injects a third-party script** (static.cloudflareinsights.com/beacon.min.js, data-cf-beacon token 34842a72...). It is not in the repo. Cloudflare Pages Web Analytics adds it at the edge, and only for browser-like requests (curl without Accept: text/html does not get it). (confidence: 9)
  - Our CSP blocks it, so no data leaves, but every page logs a CSP error in all 3 engines.
  - It breaks the owner rule "no third-party scripts". docs/UX-AUDIT-1.md:258 already advised against this beacon.
  - Fix (owner/PC session): Cloudflare dashboard → Pages project doc-tools-kr → Metrics/Web Analytics → disable. Then add a live-smoke check: GET each page with Accept: text/html and a browser User-Agent, and expect no off-origin script src.
- **src/tools/hwp-to-pdf/controller.ts:499-503 + 178-181: back/forward restore leaves the tool stuck in "PDF 만드는 중 0/N쪽" forever.** (confidence: 8)
  - `pagehide` terminates the worker but keeps the document state. There is no `pageshow` handler, unlike pdf-merge, pdf-compress and photo-compress.
  - After a restore, `send()` returns at `if (!worker) return;` before `watchdog.kick()`. So `awaitPage` never resolves and no watchdog fires.
  - Reproduced on live by dispatching pagehide/pageshow(persisted) after opening law05 and clicking 「PDF 내려받기」: no download in 40 s, state `exporting`, "PDF 만드는 중 0/1쪽". A real bfcache restore was not reproduced in headless.
  - This was harmless with the print flow (the worker was done before printing). It matters now because the export needs the worker.
  - Fix: add `pageshow` with `ev.persisted` → `reset(false)`, as the other tools do. Also make `awaitPage` resolve null (→ AbortError/engine error) when `worker` is null. Add an e2e test that dispatches pagehide/pageshow and expects either the empty state or a working download.
- **tests/e2e/hwp-to-pdf.spec.ts:455 fails every time on WebKit** with "focus never reached: ...id === hw-again", 2/2 runs with retries=0. (confidence: 9)
  - The WebKit Tab key skips links by default, so `tabTo` never lands on the 「다시 내려받기」 link.
  - The builder ran chromium only, and the new per-browser CI job for webkit will go red.
  - Fix the test: on WebKit press Alt+Tab for links, or assert the link is reachable through its accessible role. Do not change the product.

## Should Fix (P2)
- **src/pages/404.astro (nf-map set:html): the replaceAll escape for "<" does nothing.** (confidence: 9)
  - The replacement is written as a single-backslash u003c escape. TS decodes that at parse time to "<" itself, so the call replaces "<" with "<".
  - Today the map is build-time data from our own tool and guide names, so nothing is exploitable, but the guard is fake.
  - Fix: double the backslash, so the output contains the six literal characters backslash-u003c.
- **Pre-ship items the spec requires but the cloud merge skipped** (SPIKE-HWP-DIRECT §6.9, §6.12; CLOUD-HANDOFF §3, §5). Run each one now, on main:
  - full-corpus regress:hwp (owner PC, 120 files);
  - real-device checks: iOS Safari, the KakaoTalk in-app browser (does the programmatic click download, and does 「다시 내려받기」 work?), and a mid-range Android;
  - Lighthouse on /hwp-to-pdf/ and the three guide URLs in the brief;
  - qa:visual;
  - full e2e on all 5 projects + manual-chromium.
  Log the results in BUILD-LOG.
- **Raster fallback fonts** (src/lib/hwp/pdf/raster-page.ts: data: woff @font-face inside an SVG drawn via an img). (confidence: 5, verify this)
  - Under the page CSP font-src self, check that the fonts render in all 3 engines.
  - No fixture reaches the fallback (0 of 236 pages), so it is untested in a real page. Add one forced-fallback e2e test (an unsupported element).
- **/hwp-to-pdf/ still has no share button and no quick-links section** (Growth G Known Gap, now unblocked). The hwp-to-pdf and hwp-viewer guides stay drafts until an official Hancom quote is fetched. That is correct; keep them as drafts.
- **Guide source label reads "인사혁신처 공무원 채용시스템 (국가공무원 시험 (공무원 채용시스템))"** on /guide/gosi-photo/, in both the answer line and the sources list. The parentheses are nested, which is awkward. Use the preset label without the inner parentheses. (confidence: 9)
- **Sitemap lastmod for /hwp-to-pdf/ is still 2026-09-30**, although the page content changed with this deploy. Bump `updated` in tools.ts on the next deploy so crawlers come back.
- **Small items:**
  - `npm test` on a fresh checkout fails 13 tests (and astro check reports 1 error) until a build has run, because src/generated is git-ignored. CI builds first, so this only affects local runs. Note it in CLAUDE.md Commands.
  - /guide/rss.xml is served as application/xml. That is acceptable; application/rss+xml would be cleaner.

## Escalate to Architect
- **Process:** two unreviewed WIP branches reached production, bypassing the deploy gate (CLOUD-HANDOFF §3). Decide whether main needs branch protection, or a rule that only a session holding the reviewer "clear" may push main. This is not a code decision.
- **11 guides are published against a launch target of 12** (the brief says Arch decides).
- **UI font headroom is 0.4 KB on the flag-on build.** The next new Hangul syllable in UI text will fail the budget. Decide now: more system-font areas, or a different budget.

## Gates (all with PUBLIC_SITE_URL=https://docttak.com, after npm ci)
- **astro check:** 0 errors (1 hint), on a built tree.
- **Unit:** 587/587 (37 files).
- **Build, flag off → dist-noauto:** check-dist OK, 2,313 files.
  - export chunk 345.1 / 360 KB gzip
  - face list 40.7 / 48 KB
  - fallback faces ≤ 52.2 / 60 KB
  - guide HTML ≤ 4.2 / 30 KB
  - guide JS 1.5 / 4 KB
  - og/guide PNGs 28.5–39.8 / 80 KB
  - **precache 386.0 / 450 KB**
- **Build, flag on:** check-dist OK, 2,320 files, **precache 388.4 / 450 KB**.
- **check:licenses:** OK (36 packages, 5 components).
- **E2E chromium** (hwp-to-pdf, site, polish, growth): 109 passed, 5 skipped, 0 failed.
- **Extra E2E hwp-to-pdf** on mobile-chrome + webkit: 35 passed, 6 skipped, **1 failed** (the WebKit keyboard test above).
- **regress:hwp --fixtures-only:** 10/10 converted, all rules pass.
  - 0 fallback pages of 236, 0 missing glyphs, recall ≥ 0.9999.
  - Open → PDF takes 0.5–5.2 s.
  - Memory Δ is at most 372 MB.

## Live checks (docttak.com, build-id 37aa51137d81)
- **HWP download (Playwright, Chromium / Firefox / WebKit):**
  - law10.hwp → law10.pdf: 26 pages (expected 26), 294 KB. pdf.js text recall 1.0000 against the official text; no empty page.
  - adm02.hwpx → adm02.pdf: 9 pages (expected 9; the official twin has 8, a known R8 difference), 164 KB. Every page has text. The only character differences against the official twin are ㎡ / circled digits / Ⅰ, which are the same glyphs written differently.
  - The done line is "「law10.pdf」를 내려받았습니다 · 26쪽 · 294 KB", with 「다시 내려받기」.
  - No non-GET request and no request body. CSP header unchanged (connect-src self). The only off-origin attempt is the Cloudflare beacon above, and the CSP blocks it.
- **Guide specs, checked against the official sources fetched today (2026-10-01):**
  - passport-photo: passport.go.kr menuPos=12 and 32. 3.5×4.5 cm; head length 3.2–3.6 cm; 413×531 recommended, 395–431 × 507–550; JPG; 500KB; 300dpi; 6개월; white background; the ear, eyebrow and clothing rules; background removal and compositing are refused.
  - gosi-photo: gongmuwon.gosi.kr. 137×177, 3.5×4.5 cm, JPG·PNG, 350KB 미만, 중증장애인 제외.
  - qnet-photo: q-net.or.kr guide_02. JPG/JPEG, 200KB 이하, the 등록 불가 list, the scan-margin line.
  - driver-license-photo: safedriving.or.kr MN-PO-1211. 3.5×4.5 cm 여권용 컬러, 6개월; 2매 for the 1종 적성검사, 1매 for the 2종 갱신; 1매 with a 진단서; the 2026.1.1 rule.
  - email-attachment-limit: Gmail 6584 (25MB, the multi-file total, the Drive link) and Outlook.com (25MB).
  - All verbatim. **No invented spec found.**
- **Guides as pages:** each is unique, answer-first and sourced, with a FAQ, related links and the source date. They are not doorway pages.
  - No 업로드 / 서버 / 브라우저 / 네트워크 / 메모리 / EXIF / dpi / px in the visible text of /hwp-to-pdf/ or the 7 guide pages I scanned.
  - Brand: 문서딱 throughout, no 안올림 / Docttak.
- **OG tags on 7 guide pages:** og:type article, absolute og:url = canonical, og:image is /og/guide/SLUG.png (200, image/png, 1200×630, 31–34 KB), og:image:alt starts with "문서딱:", twitter:card is summary_large_image. JSON-LD is Article + FAQPage + BreadcrumbList.
- **RSS** /guide/rss.xml: 200, valid RSS 2.0, 11 items, +0900 dates, escaped. The alternate link is on /guide/ and on the guides.
- **Sitemap:** 21 URLs, all with lastmod, including /guide/ and the 11 guides. No query URLs.
- **Other files:**
  - robots.txt names the bots and lists both Sitemap lines.
  - The redirects /hwp, /passport/ and /guides return 301 to the right targets.
  - /llms.txt and the IndexNow key file are 200.
  - The draft guides (/guide/hwp-to-pdf/, /guide/kakao-photo/) return 404, as they should.

## Cleared
I reviewed both merged branches and found no rollback-level harm on the live site:
- the HWP direct download, the vector PDF writer and its raster fallback;
- the font fetches (same origin only);
- the guides, deep links, share buttons, RSS, sitemap, robots, redirects and IndexNow;
- the new CI.

Fix forward the P1 items above: the Cloudflare beacon setting, the bfcache hang and the WebKit keyboard test.
