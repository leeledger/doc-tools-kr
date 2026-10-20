# Review Request — ADS1020 (애드센스 재신청 P0)
Date: 2026-10-20
Ready for Review: YES
Status: DONE_WITH_CONCERNS — all local gates green with thresholds unchanged. Two things are still open. (1) Preview curl probes of `_headers`: these need a Cloudflare preview deploy (pending, see below). (2) One escalation to Arch: on the AdSense-on build, Lighthouse fails `resource-summary:script:size`. Details below.
Base: main 5a56a39. Nothing committed.

## Files Changed
**A. Coupang off (D1, D7)**
- src/data/affiliate.ts:103-114: adds `AFF_ENABLED = false`. `affOn(v)` is now `AFF_ENABLED && v.trim() === '1'`. All link data stays.
- scripts/lib/out-links-check.mjs:14-56: adds rule (f). `disclosureStrings` also reads `AFF_COPY.heading`. New `affEnabled(source)`, `AFF_TEXT_RE` and `coupangOffProblems(texts, strings)`.
- scripts/check-dist.mjs:657-668: reads `AFF_ENABLED` from the source. While it is false, no html/js/json/xml/txt file in dist may contain link.coupang.com, AFF_COPY.top/.ad/.heading or COUPANG_DISCLOSURE, whatever `PUBLIC_AFF_COUPANG` says. The env rule (e) now uses `AFF_ENABLED && env`.
- src/pages/privacy/index.astro:179, 194-195: the usage sentence becomes 「증명사진 결과 화면의 사진관 찾기 링크…」 while `!AFF_ENABLED`. Adds the history line `PRIVACY_AFF_OFF` (usage builds).

**B. adsense lib (D2, D4, D5)**
- scripts/lib/adsense.mjs (new, 161 lines): client constant, `adsenseConfig` (bad client → throws, naming the variable but not echoing the value), `adsenseGate` (ON needs a valid contact and the officer), `CONTENT_ROUTES`, `isContentPath`, `distPathname`, `CONTENT_CSP`, `ADS_CFG_SOURCE`, `cfgTag`/`adsTag`, `withContentCsp` (throws without a `/*` CSP), and the check-dist rules `adsPageProblems`, `adsOffTextProblems` and `adsHeaderProblems`.
- src/data/adsense.ts (new): mirrors `ADS_ON`, `ADS_CLIENT`, `CONTENT_ROUTES` and `isContentPath` from `import.meta.env`.
- src/env.d.ts: types for the two env vars.
- astro.config.mjs:8, 37-38: `adsenseGate` joins the build gate.

**C. Tags, /ads-cfg.js, headers (D3, D5)**
- src/layouts/Base.astro:59, 106-109: on content paths only, the `/ads-cfg.js` tag and then Google's async tag (client + `crossorigin="anonymous"`), placed right after the GA tag.
- scripts/gen-ads-cfg.mjs (new) + package.json postbuild: writes dist/ads-cfg.js only when ON (the gen-ga pattern) and removes it otherwise.
- scripts/gen-headers.mjs:48-90: the old main body is now a pure `siteHeaders(headers, env)`. With ADS on, it runs `withContentCsp` after the analytics and GA extensions and before COEP and the host rules. check-dist runs the same function to check the `_headers` that will ship, because check-dist runs before gen-headers.
- scripts/check-dist.mjs:145-202: the ON rules (pair on every content page, the cfg tag first, both in `<head>`; no ad string on any other page; dist/ads-cfg.js === source; `_headers` content blocks; `/*` without `https:`; privacy `id="ads"`), the OFF rules (no ad string in any dist text file, no ads-cfg.js, no fenced-frame-src, no `id="ads"`), plus the always-on rules listed under G.
- scripts/smoke-assets.mjs:109-110: an HTML page now passes if its CSP is a designed connect-src, or if it is a content page served with exactly `CONTENT_CSP`. Without this, `smoke:assets` (§6 gate) would fail on content pages after ON.
- scripts/lib/no-analytics.mjs:10-14: `blockAnalytics` also aborts `*.googlesyndication.com`, `*.doubleclick.net` and `*.adtrafficquality.google`. Our live smoke and qa:visual runs then never load ad code on docttak.com. That avoids invalid ad traffic, and qa:visual's recorder would otherwise hard-fail on the AdSense GET.

**D. Privacy (D6)**
- src/pages/privacy/index.astro:25-35, 53-54, 66-67, 147-173, 194: with ADS on, section 「{n(4)}. 광고」 gets `id="ads"` and covers: where the code is, current state, cookies, overseas transfer, 「문서딱은 그 정보를 받지 않아요」, how to refuse, under-14. Section 1 points to it. The officer section shows when ADS is on. `collects` includes ADS (so section 1 and the description no longer say 「받는 개인정보가 없어요」). With ADS off, the page reads exactly as today.
- src/data/legal.ts:1-3, 40-57, 74: adds `PRIVACY_ADS` and `PRIVACY_AFF_OFF` (both 2026년 10월 20일, re-confirm at the gate). New `PRIVACY_REVISED` chain: ADS, then usage with Coupang off, then ADDR, then UTM, then CHAIN. `PRIVACY_TERMS_UPDATED` becomes '2026-10-20' when ADS is on or usage runs with Coupang off. Removed the now-unused `LEGAL_UPDATED`.

**E. Operator pages, footer, byline (D8-D11)**
- src/data/site.ts:109-113: `OPERATOR_ON = !!(CONTACT_EMAIL && PRIVACY_OFFICER)`.
- src/pages/about/[...p].astro (new): `getStaticPaths` returns `[]` unless `OPERATOR_ON`. Contains H1 「문서딱 소개」, the five sections from the brief, the 영문주소 sentence, the cloud exception sentence (`__BG_CLOUD__`), and generated history (tool count, guide count, first `published`, last `updated`, the 5 most recently updated guides, git-proven milestones). JSON-LD is AboutPage with mainEntity Person (name = officer, url = /about/, sameAs = BLOGS).
- src/pages/contact/[...p].astro (new): has the mailto (escaped by Astro), 「보통 3일 안에 답장해요.」, the 4-item list, 「서류 파일은 보내지 마세요.…」 and links to /about/ and /privacy/.
- src/data/about.ts (new): the milestones. Each one has a commit hash in a comment: 44af82c, ee507ab, 370e655, 7c930c7, be3d693, 0601e70, de6358a. The 영문주소 milestone only appears in ADDR builds. Also `ABOUT_UPDATED`.
- src/layouts/Base.astro:154-155: footer 「소개」「문의」 right after 「안내」, only when `OPERATOR_ON`.
- src/layouts/Guide.astro:12, 30, 114: the byline is 「글: {officer} · <a href="/about/">소개</a> · …」 when `OPERATOR_ON`, otherwise 「글: 문서딱 · …」.
- src/data/jsonld.ts:49-50, 74: `author` is a Person (absolute /about/ url) when a name is passed, otherwise the Organization. The publisher stays the Organization.
- scripts/gen-sw.mjs:57: /about/ and /contact/ added to `NOT_PRECACHED` (keeps the 450 KB precache budget; nobody needs them offline).
- Glyph decision: about/contact render in the system font. `.site-info` is added to the system-font rule in src/styles/app.css:484-486, and `SYSTEM_FONT_PATHS` in scripts/lib/ui-font-chars.mjs:51-55, 84 keeps that text out of the UI font. In the privacy AdSense section I changed three new glyphs: 「부정 클릭」→「광고 부정 사용」, 「기술」→「쿠키」 in the link name, and 「…뺌」→「…항목을 지움」. Without those changes the preloaded-font tripwire failed: 92.7 KB against a 92.66 KB budget. Now it is 92.1-92.2 KB.

**F. noindex, sitemap, hreflang (D12, D13)**
- src/pages/licenses/index.astro:19-21 and src/pages/embed/index.astro:14: now pass `noindex`, so neither page has a canonical.
- src/pages/sitemap.xml.ts:3-5, 22-25, 28-30, 43: drops /embed/ and /licenses/, adds /about/ and /contact/ when `OPERATOR_ON`, and sets x-default to the Korean URL. Removed the unused `EMBED_UPDATED` from src/data/embed.ts.
- scripts/lib/en-check.mjs:133, 164-166 and tests/unit/en-check.test.ts:142-161: the rule is flipped. x-default = ko now passes, x-default = en fails.
- llms.txt keeps its /embed/ line. No test ties llms.txt to the sitemap: the only test that names both (postbuild "REV5 embed") checked that each contains /embed/. That test now expects /embed/ in llms.txt only.
- docs/COPY.md:100: the lastmod line now names `PRIVACY_TERMS_UPDATED`.

**G. check-dist always-on rules**: scripts/check-dist.mjs:172-202.
- /about/ and /contact/ exist iff `OPERATOR_ON`, iff both are in the sitemap, iff every Korean page's footer has both links. ADS on implies operator.
- /licenses/ and /embed/ carry the robots noindex meta and are not in the sitemap.
- public/ads.txt record format.

bgcloud and /about/ rules:
- check-dist.mjs:544-547: `EXCEPTION_PAGES` gains about/index.html only when `OPERATOR_ON`.
- check-dist.mjs:579-580: /about/ never contains ADDR_SEND.

**H. Tests**
- tests/unit/adsense.test.ts (new, 33 tests): config, validation and gate; the content-path table in both copies; dist path mapping; the exact ads-cfg body (executed); the tags; CONTENT_CSP; withContentCsp.
- Under the serve.mjs Cloudflare model with off, GA and GA+CF: each content page gets exactly `[CONTENT_CSP]`, and every other page keeps exactly its old single CSP.
- gen-headers off === public/_headers + domain block (byte-identical to main; `dist/_headers` of the default build also diffed equal to main's). Also a GA+CF off composition.
- Exact `/` rule matching; adsHeaderProblems, adsPageProblems and adsOffTextProblems fixtures; Coupang-off (affOn('1') false, every block null, coupangOffProblems); guide author Person/Organization; the upload guard with ads; ops:monetize ticks === OPS-RUNBOOK §11 items 1-5.
- tests/unit/affiliate.test.ts:74-77: affOn is never true now. The pure `affBlock(kind, tool, true)` cases are unchanged.
- tests/unit/postbuild.test.ts: disclosureStrings with heading; `aff = affOn(env)`; the D7 sentence; the REV5 embed test (llms.txt only, noindex); a new ADS1020 sitemap/noindex/precache test; Growth T7 accepts a Person author only when /about/ is built.
- tests/unit/ops.test.ts:369-374 and tests/unit/no-analytics.test.ts: the new checklist and ad hosts.
- tests/e2e/upload-guard.ts:21, 64-81, 96-110: adds `RequestLike.frameUrl` and `isAdsRequest`, plus the `ads` parameter. With it, a bodiless GET of adsbygoogle.js passes only when the page that made it is a content page, and `CONTENT_CSP` passes only on content URLs.
- tests/e2e/no-upload.ts:10-31, 50-95: `NetworkLog.pages` records each request's page URL at request time. Adds the `ads` option, which routes adsbygoogle.js to `ADS_STUB`; the stub records pause/NPA and its run count.
- playwright.config.ts:26-34, 46, 96: `ads.cloud` is added to CLOUD_SPEC, and cloud projects set `ads: true`.
- .github/workflows/ci.yml: the cloud build gets `PUBLIC_ADSENSE_ON=1` and `PUBLIC_ADSENSE_CLIENT=ca-pub-0000000000000000`. The default and checks builds stay OFF.
- tests/e2e/ads.cloud.spec.ts (new, 7 tests): covers the brief's e2e map and the about/contact/footer/byline/privacy checks.
- ga.cloud.spec.ts: `/` expects `CONTENT_CSP` when the build has ADS; the privacy date is now `PRIVACY_ADS`/`PRIVACY_AFF_OFF`. Both cloud specs ignore WebKit's console notice 「Unrecognized Content-Security-Policy directive 'fenced-frame-src'」. It is not a violation: the securitypolicyviolation listener stays.
- usage.spec.ts: the 5 Coupang-click tests now carry `test.skip(!AFF_ENABLED, …)`, kept for re-enabling. Adds a new test: with `PUBLIC_AFF_COUPANG=1` there is still 0 Coupang link, block or first-part line on result screens and guides, and /id-photo/ keeps only 사진관 찾기. The privacy expectations moved to D7.
- site.spec.ts: /licenses/ left the canonical SEO smoke. New test: /licenses/ and /embed/ are noindex with no canonical. The sitemap list loses /licenses/ and /embed/, and /about/ and /contact/ are listed iff built.
- embed.spec.ts: the info page is noindex, and the site origin is read from og:url.

**I. Docs**
- docs/OPS-RUNBOOK.md:122 (§10 line) and :154-164: new §11, the owner checklist word for word plus an 「끄기」 line.
- scripts/ops/monetize.mjs:16-28: the ticks are now §11.
- docs/REVENUE-MODEL.md rows 2 and 4: status updated.
- lighthouserc.json:29: `/embed/` replaced by `/about/` (see Open Questions 2).

## Gate results (local, Windows, 2026-10-20)
- `npm run check`: 0 errors. Note: a leftover `dist-prod/` folder made astro check run out of memory. tsconfig excludes only dist, dist-noauto, dist-bg and dist-bgcloud; I deleted the folder.
- `npm test` (checks-like dist): 90 files, 2028/2028 passed.
- Builds, all with check-dist OK:
  - Default (`PUBLIC_SITE_URL=https://docttak.com`): no ads-cfg.js, no about/contact; `_headers` byte-identical to main's. Re-ran check-dist with `PUBLIC_AFF_COUPANG=1` on it: OK.
  - Cloud build (CI env + ADSENSE_ON + test client): OK.
  - Production-like (contact, officer, GA, CF token, ADDR_EN, AFF_COUPANG=1, BG_REMOVE, BG_CLOUD, USAGE, ADSENSE_ON, test client): OK. It has 0 Coupang strings in any text file; the tag is on exactly /, /guide/**, /about/ and /contact/; it has /privacy/#ads, /about/, /contact/, footer links and bylines; the sitemap has no /embed/ or /licenses/ and x-default = ko.
  - Checks-like (BG_REMOVE + ADDR_EN + operator): OK.
  - E2E dist (AUTOFRAME=1): OK.
- check-dist negative checks:
  - ON without contact/officer: both gate lines, plus "expected exactly one … in <head>" on every content page.
  - Bad `PUBLIC_ADSENSE_CLIENT`: one line, naming the variable, value not echoed.
  - `astro build` with ON and no operator: stops at the config gate.
- `npm run check:licenses`: OK (54 packages, 0 exceptions).
- `smoke:assets` against the served production-like build: OK, 2526 URLs.
- e2e:
  - chromium + cloud-chromium full suite.
  - firefox, webkit, mobile-chrome and mobile-safari plus the four other cloud projects, on ads.cloud, ga.cloud, usage, english-address.cloud, remove-background.cloud, site, embed, en, sw, polish, growth and hubs: 1088 passed, 70 skipped, 6 Firefox flaky (all passed on retry).
  - The 4 WebKit failures were the fenced-frame-src console notice. After the filter, cloud-webkit, cloud-mobile-safari and cloud-chromium ads+ga: 36/36.
  - Re-run of the chromium failures on the AUTOFRAME=1 dist: everything passes except the two HEIC tests (pre-existing, see Out of Scope).
- axe: covered in ads.cloud.spec on /about/ and /contact/ in 5 browsers (0 violations). Lighthouse a11y was 1 on every URL.
- Lighthouse, full `npm run lhci` (checks-like build, 37 URLs × 5, thresholds unchanged): all assertions passed.
  - /: perf 1, a11y 1, BP 1, SEO 1, LCP 1670 ms, CLS 0.
  - /about/: 1, 1, 1, 1, LCP 1667 ms.
  - /guide/passport-photo/: 1, 1, 1, 1, LCP 1665 ms.
  - Worst median LCP: /pdf-merge/ 1820 ms.
- Lighthouse on the AdSense-on build (median of 5, real Google adsbygoogle.js; see Escalation):
  - Ads only (checks-like + ADSENSE_ON):
    - /: perf 0.99, a11y 1, BP 1, SEO 1, LCP 1538 ms, CLS 0, TBT 91 ms.
    - /about/: 0.99, LCP 1671 ms, TBT 79 ms.
    - /guide/passport-photo/: 0.99, LCP 1671 ms, TBT 59 ms.
    - Script transfer 229.6 KB: adsbygoogle.js 57 KB + show_ads_impl 169 KB.
  - Production-like (also GA + CF): perf 0.98, a11y 1, BP 0.96, SEO 1, LCP 1815-1823 ms, CLS 0, TBT 140-146 ms, script 398.5 KB (GA's gtag.js alone is 156 KB). The BP 0.96 is the Cloudflare RUM CORS error that the fake token gets on 127.0.0.1, not AdSense.
- Not run here:
  - qa:visual: the deploy gate runs it against the live site. It now blocks ad hosts like analytics.
  - `regress:* --fixtures-only`: no tool code changed.

## Escalate to Architect
1. The AdSense-on build breaks `resource-summary:script:size` (30 KB) on every content page: 229.6 KB, all third-party Google script. Performance, LCP, CLS, a11y, BP and SEO all stay within thresholds.
   - The brief's pre-locked fallback reads "drop `/` if its ON-build Lighthouse breaks a threshold". But the breach is the same on guides and /about/, so dropping `/` fixes nothing short of dropping every route, which means no tag at all. I did not apply the fallback. `/` stays in CONTENT_ROUTES.
   - This is the same situation as GA today: 156 KB of third-party script on every page in production. CI's Lighthouse runs on the AdSense-off and GA-off checks build, which still passes every threshold unchanged.
   - Arch call: (a) accept it like GA (third-party script is outside the first-party budget; CI stays OFF), or (b) drop `/` per the literal fallback (the guides still breach), or (c) another rule. No threshold was changed.

## Pending (needs a Cloudflare preview deploy; please run after pushing a preview branch with Preview env `PUBLIC_ADSENSE_ON=1`)
- `curl -sI https://<preview>/`, `/guide/`, `/guide/passport-photo/`, `/about/`, `/contact/`, `/pdf-merge/` and `/embed/id-photo/`: each must show exactly one `content-security-policy`. The content pages must show `CONTENT_CSP`. /pdf-merge/ must show the site policy (no `https:` scheme source). /embed/id-photo/ must show the frame-ancestors * policy. Also check `/ads-cfg.js`, which must have `cache-control: public, max-age=3600`.
- Evidence so far:
  - (a) The local serve.mjs model passes all of these (unit + e2e, and a local curl on the production-like build showed exactly one CSP each).
  - (b) Live production today already shows that a splat rule matches its own directory: `curl -sI https://docttak.com/embed/id-photo/` returns one CSP (`frame-ancestors *`) from the `/embed/id-photo/*` block.
  - (c) Cloudflare docs, quoted below.
  - Exact `/` matching is the one thing only the probe can prove.

## Citations (fetched 2026-10-20)
- AdSense Help, "Ad code examples for ads personalization settings", https://support.google.com/adsense/answer/9042142?hl=en:
  - 「<script>(adsbygoogle=window.adsbygoogle||[]).requestNonPersonalizedAds=1;</script> // The line above makes sure you are requesting non-personalized ads.」
  - 「(adsbygoogle=window.adsbygoogle||[]).pauseAdRequests=1; // This will pause ad requests, so users have time to interact with your consent solution.」
  - 「Later, you can call (adsbygoogle=window.adsbygoogle||[]).pauseAdRequests=0 to resume sending ad requests. Without making this call, no ads will be shown.」
  - The same page shows pauseAdRequests with Auto ads (`enable_page_level_ads`), with the comment 「This usually triggers the ad request, but you have paused these.」
  - Both properties are documented, so both halves are kept.
- AdSense Help, "Personalized and non-personalized ads", https://support.google.com/adsense/answer/9007336?hl=en: 「Although non-personalized ads don't use cookies or mobile ad identifiers for ad targeting, they do still use cookies or mobile ad identifiers for frequency capping and aggregated ad reporting.」
- Google, "How Google uses cookies in advertising", https://policies.google.com/technologies/ads?hl=en: 「we may use cookies for a number of purposes, such as to stop you from seeing the same ad over and over again, to detect and stop click fraud, and to show ads that are likely to be more relevant」. The privacy cookie line and the 「광고 부정 사용 방지」 purpose rest on these two sentences. The 보유 기간 line links this page (ko).
- Cloudflare Pages, "Headers", https://developers.cloudflare.com/pages/configuration/headers/ (last updated Aug 25, 2026):
  - Detach: 「You may wish to remove a default header or a header which has been added by a more pervasive rule. This can be done by prepending the header name with an exclamation mark and space (`! `).」
  - Splats: 「a splat pattern — signified by an asterisk (`*`) — will greedily match all characters.」
  - Multiple rules: 「An incoming request which matches multiple rules' URL patterns will inherit all rules' headers.」
  - Rule limit: 「You may define up to 100 header rules.」 The cloud build (ADS on, GA, COEP) has 25 rules.

## Open Questions
1. Hub pages (/guide/photo-sizes/, /guide/upload-limits/, /guide/hwp-to-pdf/) use Hub.astro. They keep the old dates line and Organization author, because the brief named Guide.astro only. Should the same byline apply? It is a 2-line change.
2. lighthouserc: /embed/ is now noindex, so its SEO category cannot score 1 (is-crawlable fails by design). I swapped it for /about/ in the URL list rather than loosen any assertion. /about/ exists in the CI checks build because that build has the officer and contact. Arch: OK, or would you rather keep /embed/ with a per-URL assertMatrix?
3. Footer: with a contact set, the footer now shows both 「문의: email」 (existing foot-op line) and the 「문의」 link. Fine?
4. `PRIVACY_ADS` and `PRIVACY_AFF_OFF` are both '2026년 10월 20일'. Re-confirm at the gate: ADS is the day ON goes live in production, AFF_OFF is the deploy day.
5. Privacy wording deviations, all for the glyph gate: 「광고 부정 사용 방지」 instead of 「부정 클릭 방지」; history 「…상품 링크 누름 항목을 지움」 instead of 「…뺌」.

## Out of Scope (logged in BUILD-LOG)
- Pre-existing e2e failures on main: id-photo.spec 「bad input fake.heic」 and photo-compress.spec 「bad inputs: HEIC guidance…」 expect 「아이폰 사진 형식(HEIC)은 지금 쓰는 앱에서 열 수 없습니다」. That string is no longer anywhere in src (changed in REQ1015). Not touched.
- tsconfig `exclude` lacks `dist-*` folders other than the listed ones; a stray dist-prod makes `astro check` run out of memory.
- check-dist's embedHeaderProblems would flag the content blocks' `!` detach if it ever ran on a post-gen-headers `_headers` file. Today it only sees the public copy.
- The brief's Known Gaps: ad units, serve stage, notice line, CLS reserves, COOP popups, P1 content, Coupang return, the adsense meta tag, CMP, English about/contact.

---

# Round 2 — Richard's REVIEW-FEEDBACK-ADS1020.md (2 Must, 4 Should)
Date: 2026-10-20 · Ready for Review: YES · Status: DONE

## Must Fix
1. **「브라우저」 gone from /privacy/.** src/pages/privacy/index.astro:
   - 165 (AdSense): 「쓰는 앱 설정에서 쿠키를 막거나 광고 차단 기능을 쓰면 돼요.」
   - 131 (GA): 「기기와 앱의 종류」
   - 143 (GA): 「쓰는 앱 설정에서 쿠키를 막거나…」
   - No other test expected the old strings. Preload tripwire: 92.1 KB default, 92.2 KB on the production-like and cloud builds (budget 92.66 KB). The production-like /privacy/ has 0 「브라우저」.
2. **Resolution logged.**
   - BUILD-LOG 「ADS1020 round 2」: budget unchanged and enforced by Lighthouse CI on the ads-off build (what production ships until the owner flips `PUBLIC_ADSENSE_ON`). The ads-on build is held to perf, LCP, CLS, a11y, BP and SEO (all passed). The overage is Google script only, the GA precedent. `/` stays in CONTENT_ROUTES.
   - docs/OPS-RUNBOOK.md §11 has a new 「Lighthouse」 bullet. It is a bullet, not a numbered item, so the monetize ticks still equal items 1-5.

## Should Fix
- **Plain language on every build.** New scripts/lib/plain-words.mjs holds `JARGON`, `userText` and `plainWordProblems`. check-dist runs it on every HTML page of every build (scripts/check-dist.mjs, just before `initialJs`), so the GA, AdSense and cloud sections of /privacy/ are covered. The postbuild unit test now imports the same `JARGON`/`userText`. New unit test in tests/unit/adsense.test.ts: the old GA/AdSense wording fails, the new passes, /licenses/ is exempt, 「픽셀(px)」 is allowed once, a `<pre>` block is skipped. check-dist passes on the default, cloud and production-like builds.
- **Hub byline + author.** src/layouts/Hub.astro:11, 36, 110 match Guide.astro: 「글: {officer} · 소개」 with a Person author when OPERATOR_ON, else 「글: 문서딱」 and the Organization. New e2e on /guide/photo-sizes/ checks the byline, the Person author, axe (0 violations) and the footer.
- **Footer.** src/layouts/Base.astro:57-59: with OPERATOR_ON, the footer drops the 「문의: email」 line and keeps the 「문의」 link to /contact/; a business number would stay. Without OPERATOR_ON the old email line stays (the custom-domain unit test still sees it). The /contact/ page carries the mailto.
- **isAdsRequest origin.** tests/e2e/upload-guard.ts: now `isAdsRequest(method, url, frameUrl, origin)` and requires `page.origin === origin`. New unit case: a content path on another origin fails.

## Gates (round 2)
- `npm run check`: 0 errors.
- Builds, all check-dist OK including the new plain-language scan:
  - Default (`PUBLIC_SITE_URL=https://docttak.com`): `_headers` still byte-identical to main.
  - Production-like (contact, officer, GA, CF, ADDR, AFF=1, BG cloud, usage, ADSENSE_ON).
  - Cloud.
- Unit: 2029 tests; 2027 pass in the full run. The two failures are timing only:
  - char-count's 「100,000 chars < 50 ms」 measured 61 ms under load; it passes alone.
  - postbuild 「usage statistics … fail check-dist」 runs check-dist 8 times in a 120 s budget. One check-dist takes 11-16 s on this Windows PC, mostly file `open` (cpu-profile). Main's check-dist takes the same 15 s on the same dist (checked in a temporary HEAD worktree, since removed), so this is not ADS1020. The test comment assumes about 5 s per run, the CI figure.
- e2e:
  - ads.cloud + ga.cloud on all 5 cloud projects: 65/65.
  - chromium site + polish + hubs: 163/163.
