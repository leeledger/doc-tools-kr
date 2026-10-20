# Architect Brief — ADS1020 (애드센스 재신청 P0)

Source: owner paste 2026-10-20 (AdSense rejected 2026-10-20 05:40 KST, 「가치가 별로 없는 콘텐츠」). P0 only; P1 content consolidation/expansion is a later sprint (do not start it).
Base: main 5a56a39. Supersedes REV4 where they differ (REV4 was never built; its CSP mechanics, privacy-section shape and test pattern are reused).

## Goal
Production shows no Coupang link anywhere, carries the AdSense tag on content pages only (with a content-only CSP and an AdSense privacy section), has /about/ and /contact/, honest guide bylines, noindexed /licenses/ and /embed/, and hreflang x-default pointing to Korean.

## Locked decisions (log in BUILD-LOG "ADS1020")
- D1 **Coupang off by one constant.** `src/data/affiliate.ts`: `export const AFF_ENABLED = false;` and `affOn(v)` returns `AFF_ENABLED && v?.trim() === '1'`. All data (AFF_LINKS, maps, copy) stays. Production keeps `PUBLIC_AFF_COUPANG=1` and still renders 0 links (the constant wins). Re-enabling later (a few long guides) = flip the constant + a new brief. The page files need no change beyond what follows from `affOn` (leave their imports).
- D2 **AdSense client is a committed constant** `ADSENSE_CLIENT_DEFAULT = 'ca-pub-6478963235198426'` (public: already in public/ads.txt). Env: `PUBLIC_ADSENSE_ON=1` turns the tag on; optional `PUBLIC_ADSENSE_CLIENT` overrides (format `ca-pub-` + 16 digits, build fails naming the variable, value not echoed; tests use `ca-pub-0000000000000000`). ON fails the build without `PUBLIC_CONTACT_EMAIL` and `PUBLIC_PRIVACY_OFFICER` (both already set in Production). Slot env vars are NOT built now (serve stage = later sprint). public/ads.txt stays as is.
- D3 **Review stage = tag only, no units.** On content pages, in `<head>`, in this order, right after the GA tag:
  1. `<script src="/ads-cfg.js" data-site-ads-cfg></script>` (same-origin, classic, sync, tiny). Body exactly: `(window.adsbygoogle=window.adsbygoogle||[]).pauseAdRequests=1;window.adsbygoogle.requestNonPersonalizedAds=1;` Written at postbuild only when ON (pattern of gen-ga); OFF build has no dist/ads-cfg.js.
  2. `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=<client>" crossorigin="anonymous"></script>` (Google's snippet verbatim, so the review crawler finds it in static HTML; no self-hosted injector).
  pauseAdRequests=1 guarantees no ad is requested even if the console turns Auto ads on; requestNonPersonalizedAds=1 = owner decision 2026-10-12 (비맞춤 광고만). `_headers` (ON only): `/ads-cfg.js` with `Cache-Control: public, max-age=3600`.
  Flag (unverified claim): both properties must be cited from Google's AdSense help (verbatim line + URL + fetch date) in REVIEW-REQUEST. If pauseAdRequests is not documented for AdSense, drop that half, keep NPA, and say so (console Auto ads off then carries the guarantee).
- D4 **Content routes (single source)** `CONTENT_ROUTES` in `scripts/lib/adsense.mjs`, mirrored in `src/data/adsense.ts` with a unit test keeping them equal (pattern of usage.mjs/affiliate.ts): `/` (home: Arch call; tool list + FAQ, no file handling; the URL Google most likely checks), `/guide/` and everything under it (index, hubs, articles), `/about/`, `/contact/`. Never: tool pages, result screens, 404 (incl. en/404), /offline/, /privacy/, /terms/, /licenses/, /en/*, /embed/*. Base.astro decides from `Astro.url.pathname` with `isContentPath()`; BaseEn and Embed layouts never render it.
  Pre-locked fallback: if the ON-build Lighthouse run of `/` breaks a threshold, drop `/` from CONTENT_ROUTES (never lower thresholds).
- D5 **Route CSP** (REV4 decision 5 reused; gen-headers postbuild, ON only, appended after the GA/analytics extensions so the `/*` line stays exactly what those produce). For each content pattern (`/`, `/guide/*`, `/about/`, `/contact/`): `! Content-Security-Policy`, then
  `default-src 'self'; script-src 'self' https: 'unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https:; img-src 'self' data: blob: https:; frame-src https:; fenced-frame-src https:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'`
  It covers pagead2/tpc.googlesyndication.com, googleads.g.doubleclick.net and Google's other ad hosts without a brittle host list; GA and the CF beacon are covered by https:. OFF: `_headers` byte-identical to today.
  Flag (unverified until probed): cite the Cloudflare doc lines for `!` detach and for exact `/` vs splat `/guide/*` matching `/guide/` itself; paste `curl -sI` of preview `/`, `/guide/`, one guide article, `/about/`, `/pdf-merge/`, `/embed/id-photo/` showing exactly one CSP each and the right one. tests/e2e/serve.mjs already models detach; make sure it matches an exact `/` rule the way Cloudflare does.
  Accepted (log): a 404 served under `/guide/<missing>` gets the content CSP (no tag on it).
- D6 **Privacy section** (ON only) replaces the body of the existing 「{n(4)}. 광고」 section (numbering unchanged; OFF keeps today's 「지금은 광고가 없어요…」), `id="ads"`. Plain Korean, format of the GA section: 어디에 (첫 화면·안내 글·소개·문의 페이지에만 Google 애드센스 코드가 있어요; 도구 화면과 결과 화면에는 없어요); 지금 상태 (광고 심사 중이라 광고를 보여 주지 않아요; 보여 줄 때도 맞춤 광고가 아닌 광고만 보여요); 쿠키 (비맞춤 광고도 노출 횟수 제한·부정 클릭 방지에 쿠키를 쓸 수 있다는 Google 문장: cite verbatim + URL + fetch date in REVIEW-REQUEST); 국외 이전 list (받는 자 Google LLC + the existing Google privacy form link; 미국; 페이지를 열 때마다 인터넷으로 전송; 항목 IP 주소·쿠키·본 페이지 주소·기기 정보; 목적 광고 표시와 부정 클릭 방지; 기간 Google 정책에 따름 + https://policies.google.com/technologies/ads); 문서딱은 그 정보를 받지 않아요; 거부 방법 (쿠키 차단, 광고 차단 기능; 막아도 모든 도구를 그대로 쓸 수 있어요); 14세 미만 (맞춤 광고를 쓰지 않아요). `PRIVACY_ADS = '2026년 10월 20일'` (re-confirmed at the gate = the day ON goes live), history line, PRIVACY_REVISED / PRIVACY_TERMS_UPDATED take it when ON. Terms unchanged (3항 already allows ads after the policy is amended).
- D7 **Privacy, Coupang off:** the usage sentence 「도구 결과 화면과 안내 글의 상품·사진관 링크를 눌렀는지(링크 종류와 화면 이름만)」 becomes, while `!AFF_ENABLED`, 「증명사진 결과 화면의 사진관 찾기 링크를 눌렀는지(링크 종류와 화면 이름만)」. History line (USAGE builds): `PRIVACY_AFF_OFF = '2026년 10월 20일'` 「상품 링크를 없애 익명 사용 통계에서 상품 링크 누름을 뺌」. PRIVACY_REVISED = newest active date (ADS ON → PRIVACY_ADS; else USAGE → PRIVACY_AFF_OFF; else ADDR → PRIVACY_ADDR; else PRIVACY_CHAIN); PRIVACY_TERMS_UPDATED likewise ('2026-10-20' when ADS or USAGE). Old history lines stay.
- D8 **Operator gate** `OPERATOR_ON = !!(CONTACT_EMAIL && PRIVACY_OFFICER)` in src/data/site.ts. /about/ and /contact/ are generated only then (e.g. `src/pages/about/[...p].astro` with `getStaticPaths` returning `OPERATOR_ON ? [{ params: { p: undefined } }] : []`; Bob's call, but zero files when off). Footer links 「소개」「문의」 only then (right after 「안내」). Production has both env vars, so the pages go live. Default build: no page, no link (owner rule "no operator lines until ads" holds).
- D9 **/about/** (title ≤ 40, description 40–80, docs/COPY.md plain language: no 업로드/서버/브라우저/네트워크/EXIF/dpi): H1 「문서딱 소개」. Sections:
  - 만든 사람: 「문서딱은 {officer}{josa 이/가} 만들고 운영해요.」 + link to /contact/. No team, title, 사업자 info or biography.
  - 왜 만들었나: one honest purpose paragraph from SITE.tagline (서류·사진을 낼 때 용량·규격에 막히지 않게; 가입 없이 무료). No invented story.
  - 파일을 다루는 방법 (not the page lead): 대부분의 도구는 고른 파일을 이 기기 안에서 처리하고 문서딱으로 보내지 않아요. In the same section: `__BG_CLOUD__` → the 배경 지우기 exception sentence with the wording privacy/terms already use (EXCEPTION_RE); `__ADDR_EN__` → 「영문주소 변환기는 적은 주소 글자만 행정안전부 주소 검색에 전달해요.」 (must NOT contain ADDR_SEND 「행정안전부 주소 검색으로 보내」); link 「자세한 내용: 개인정보 처리방침」.
  - 규격 정보를 확인하는 방법: 안내 글마다 공식 출처와 확인일을 적고, 옮긴 문장은 원문과 다시 맞춰 봐요 (check:quotes is the fact); 「틀린 곳을 알려 주세요」 → /contact/.
  - 고친 기록 (generated, honest): live tool count (LIVE_TOOLS.length), published guide count, earliest guide `published`, latest `updated`, the 5 most recently updated guides (title link + date); plus a short milestone list in `src/data/about.ts` (date + one plain line), each date proven by `git log --diff-filter=A --format=%ad --date=short -- <page file>` with the commit hash in a code comment (e.g. 사이트 공개와 첫 도구, 안내 글 시작, HWP 도구, 영문 이름·영문주소 변환기). Only what git proves; no plans.
  - JSON-LD: AboutPage with a Person (name = officer, url = /about/); sameAs only BLOGS.
- D10 **/contact/** (same rules): email (mailto, escaped like footerContact); 「보통 3일 안에 답장해요.」 (Arch call; the owner may change it); 「틀린 내용 알리기」 list: 페이지 주소, 쓰는 기기와 앱 (예: 아이폰 카카오톡), 무엇이 틀렸는지, 공식 출처 링크가 있으면 함께; 「서류 파일은 보내지 마세요. 주민등록번호 같은 개인정보가 들어 있을 수 있어요.」; links to /about/ and /privacy/.
- D11 **Guide byline** (Guide.astro `.guide-dates`): OPERATOR_ON → 「글: {officer} · <a href="/about/">소개</a> · 처음 쓴 날 … · 고친 날 …」; off → 「글: 문서딱 · 처음 쓴 날 … · 고친 날 …」 (no link). jsonld.ts guide `author`: OPERATOR_ON → `{ '@type': 'Person', name, url: <absolute /about/> }`, else Organization; publisher stays Organization.
- D12 **noindex + sitemap:** /licenses/ and /embed/ pass Base `noindex` (drops canonical); sitemap drops `/embed/` and `/licenses/`; /embed/id-photo/ unchanged (already noindex). Sitemap adds `/about/` and `/contact/` when OPERATOR_ON (lastmod = an ADS1020 date constant). llms.txt: remove the /embed/ line only if a test ties llms.txt to the sitemap; otherwise leave it (log which).
- D13 **/en/ stays indexed** (EN brief); sitemap hreflang x-default → the Korean URL on both twins. Flip the en-check rule and its unit test (the 「x-default to Korean」 case becomes the passing one). Reason: Korean is the primary audience; EN pages carry no ads; noindexing 6 working pages buys nothing for the review.
- D14 **CLAUDE.md**: text below; the orchestrator applies it at the deploy gate. Bob does not edit CLAUDE.md.

## Flow
```
build env ─┬─ PUBLIC_ADSENSE_ON unset ─> no tags, no dist/ads-cfg.js, _headers as today, privacy 「지금은 광고가 없어요」
           └─ ON=1 (+CONTACT_EMAIL +PRIVACY_OFFICER, else build fails)
                 ├─ content page (/, /guide/**, /about/, /contact/):
                 │     head: … GA tag → /ads-cfg.js (pause=1, NPA=1) → async adsbygoogle.js?client=…
                 │     _headers: ! CSP → content CSP (https: scheme)
                 ├─ every other page: no tag; '/*' CSP unchanged
                 └─ /privacy/: section 4 = 애드센스 (id="ads")
affOn(env) = AFF_ENABLED(false) && env==='1' ─> affBlock null everywhere ─> 0 Coupang links, 0 disclosure lines
OPERATOR_ON ─┬─ yes: /about/, /contact/, footer 소개·문의, byline 「글: <officer> · 소개」, sitemap +2
             └─ no : none of it; byline 「글: 문서딱」
```

## Build Order (separate commits; refactor before behavior)
- A. Coupang off: `AFF_ENABLED` + `affOn`; privacy D7. check-dist + out-links-check: while AFF_ENABLED is false (read from affiliate.ts source, like AFF_COPY today), every dist text file (html, js, json, xml, txt) has 0 `link.coupang.com`, 0 AFF_COPY.top, 0 AFF_COPY.ad, 0 AFF_COPY.heading, 0 COUPANG_DISCLOSURE, **whatever PUBLIC_AFF_COUPANG says**; while true, today's env rules. embed-check / en-check Coupang rules stay. Keep the old affiliate unit coverage by calling the pure `affBlock(kind, tool, true)`; add affOn('1') === false.
- B. `scripts/lib/adsense.mjs` (pure): `adsenseConfig(env)` → `{ on, client }` + validation + operator-gate errors; `CONTENT_ROUTES`, `isContentPath(path)`, `CONTENT_CSP`, `withContentCsp(headers)` (throws without a `/*` CSP), `ADS_CFG_SOURCE`. `src/data/adsense.ts` mirror (ADS_ON, ADS_CLIENT, isContentPath) from `import.meta.env`; equality unit test; unit: committed client === the pub in public/ads.txt.
- C. Base.astro head tags (D3) gated `ADS_ON && isContentPath(path)`; postbuild writes dist/ads-cfg.js (ON only); gen-headers D5 + the `/ads-cfg.js` cache rule.
- D. Privacy D6 + legal.ts dates.
- E. Operator gate, /about/, /contact/, footer, byline, JSON-LD author (D8–D11); src/data/about.ts milestones with commit hashes.
- F. noindex + sitemap (D12), hreflang (D13).
- G. check-dist (new rules; never weaken an old one):
  - ON: every content page has exactly one adsbygoogle tag with the configured client and `crossorigin="anonymous"`, preceded by exactly one `/ads-cfg.js` tag; no other HTML file contains `adsbygoogle`, `googlesyndication` or `/ads-cfg.js` (tool pages, 404s, offline, privacy, terms, licenses, /en/*, /embed/* by name); dist/ads-cfg.js === ADS_CFG_SOURCE; `_headers` has detach + CONTENT_CSP once per content pattern and the `/*` CSP still has no `https:` scheme source; /privacy/ has `id="ads"`; contact + officer set.
  - OFF: none of those strings in any dist text file; no dist/ads-cfg.js; `_headers` has no `fenced-frame-src`.
  - Always: /licenses/ and /embed/ HTML carry the robots noindex meta and are absent from sitemap.xml; public/ads.txt line format valid; OPERATOR_ON iff about/index.html and contact/index.html exist iff both in sitemap iff footer links on every Korean page; ON implies OPERATOR_ON.
  - bgcloud: `EXCEPTION_PAGES` gains `about/index.html` only when OPERATOR_ON (cloud on: /about/ must carry the exception; cloud off: must not). LOCAL_SCOPE_RE unchanged. Assert /about/ never contains ADDR_SEND.
- H. Tests: the cloud build gets `PUBLIC_ADSENSE_ON=1` + `PUBLIC_ADSENSE_CLIENT=ca-pub-0000000000000000` (the default build stays OFF). New `tests/e2e/ads.cloud.spec.ts`. The no-upload fixture gets an `ads` option (pattern of `ga`): route the adsbygoogle.js URL to a stub that records `window.adsbygoogle.pauseAdRequests` / `requestNonPersonalizedAds`; allow only that bodiless GET and only on content URLs; every other spec keeps zero off-site requests.
- I. Docs: `docs/OPS-RUNBOOK.md` new §11 「애드센스 재신청 (대표만)」 = the owner checklist below; `scripts/ops/monetize.mjs` ticks match it; `docs/REVENUE-MODEL.md` status (Coupang off 2026-10-20; AdSense review stage). OPS-RUNBOOK §10 gets: 「2026-10-20부터 코드에서 꺼 둠(AFF_ENABLED). 환경 변수만으로는 다시 켜지지 않아요.」
- J. BUILD-LOG + `handoff/REVIEW-REQUEST-ADS1020.md` with line ranges, probes, citations, Lighthouse numbers.
- Flag: never raise a budget or lower a threshold. New footer/about/contact text must pass the UI-font gates (rephrase, or use the system-font prose path earlier sprints used; log any glyph decision).
- Flag: Korean pages only; 「Docttak」 never appears on them.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| Coupang | Production env PUBLIC_AFF_COUPANG=1 still set | AFF_ENABLED wins; check-dist asserts 0 in a build with the env set | No links |
| Coupang | A disclosure string left in a JS chunk | dist-wide text scan | Build fails |
| Tag | Tag leaks onto a tool/404/embed/en page | check-dist named-page rule + e2e on /pdf-merge/, /id-photo/ result, /404, /embed/id-photo/, /en/ | Build fails |
| Tag | Review crawler misses the code | Static async tag in head, Google snippet verbatim | n/a |
| Ads | Auto ads turned on in console after approval: personalized/anchor ads on content pages | pauseAdRequests=1 + NPA=1 (cited) + owner checklist | No ads until the serve sprint |
| CSP | Two CSP headers on a content route: tag blocked | detach + unit + curl probe | Caught by probe before ship |
| CSP | /guide/* misses /guide/, or the / rule matches everything | doc citation + curl probe + serve.mjs model test | Caught by probe |
| CSP | GA/analytics extension rewrites the content line | withContentCsp runs after them; unit with GA+CF+ADS | CI red |
| Perf | adsbygoogle.js hurts home/guide Lighthouse | ON-build LH (median of 5) of / and one guide pasted; / over threshold: drop / (pre-locked) | No regression shipped |
| Gate | ON without contact/officer | build fails naming the variable | Failed deploy log |
| Operator | Default build ships /about/ without a name | OPERATOR_ON gate + check-dist iff rule | Build fails |
| Privacy | ON without the section, or the section without ON | check-dist id="ads" iff ON | Build fails |
| Claims | /about/ unqualified "files never leave" in a cloud build | EXCEPTION_PAGES + existing unqualifiedClaims scan | Build fails |
| SEO | /embed/ or /licenses/ still indexable or in sitemap | check-dist noindex + absence | Build fails |
| hreflang | x-default still EN | en-check rule flipped + unit | Build fails |
No silent and untested path remains.

## Test map
- affOn('1') false; affBlock with affOn('1') null for every TOOL_AFF/GUIDE_AFF key [GAP→unit]; pure affBlock(kind, tool, true) cases [TESTED, adapted].
- Coupang-zero rule with PUBLIC_AFF_COUPANG=1 [GAP→unit on out-links-check + one build run].
- adsense.mjs: config/validation/operator gate; isContentPath table (true: /, /guide/, /guide/x/, /guide/photo-sizes/, /about/, /contact/; false: /pdf-merge/, /privacy/, /licenses/, /embed/, /embed/id-photo/, /en/, /404.html, /offline/); CONTENT_CSP; withContentCsp; TS/MJS equality; client === ads.txt [GAP→unit].
- gen-headers: OFF byte-identical to main; ON with GA+CF [GAP→unit].
- check-dist ON/OFF/always rules [GAP→unit on lib functions + both builds in CI].
- e2e ads.cloud.spec (5 cloud projects): content pages request the stub once, pause=1 and NPA=1 set before it runs, 0 securitypolicyviolation events, no ad iframe; /pdf-merge/, /id-photo/ result, /404, /embed/id-photo/, /en/, /privacy/ request nothing off-site [GAP→e2e].
- e2e /about/ + /contact/ (cloud build): headings, officer name, mailto, footer links on a tool page, guide byline link, axe clean [GAP→e2e]; default build: no about/contact file, no footer link [GAP→check-dist].
- Byline both forms; JSON-LD author Person iff operator [GAP→unit].
- Sitemap: no /embed/, /licenses/; about/contact iff operator; x-default = ko [GAP→unit].
- Regression: all gates (check, unit, check-dist both builds, licenses, e2e 5 projects + cloud + axe, Lighthouse CI unchanged thresholds, qa:visual, regress --fixtures-only); GA cloud, usage, embed, en specs [TESTED].
- Manual: ON-build Lighthouse / + one guide; preview curl probes (D5) [GAP→REVIEW-REQUEST].

## Out of Scope (→ BUILD-LOG Known Gaps)
- Ad units/slots, serve stage, ad notice line, CLS reserves, COOP same-origin-allow-popups check for ad clicks (serve sprint).
- P1: guide consolidation/expansion, thin-page pruning, Coupang return on long guides.
- google-adsense-account meta tag, CMP/Funding Choices, Kakao AdFit.
- English /about/ or /contact/.

## Acceptance
- Default build: check-dist OK; 0 Coupang strings with and without PUBLIC_AFF_COUPANG=1; no ad strings; `_headers` identical to main's; no /about/, /contact/.
- Production-like build (CONTACT_EMAIL, PRIVACY_OFFICER, GA, CF, ADDR_EN, AFF_COUPANG=1, ADSENSE_ON=1, test client): check-dist OK; tag on exactly the content pages; /privacy/#ads; /about/, /contact/, footer links, bylines; sitemap without /embed/ and /licenses/, x-default = ko.
- All gates green, thresholds unchanged; LH numbers, curl probes and Google doc citations pasted. Richard "clear".

## Owner checklist (대표만; becomes OPS-RUNBOOK §11)
1. Cloudflare Pages → Production 변수 `PUBLIC_ADSENSE_ON` = `1` (`PUBLIC_ADSENSE_CLIENT`는 넣지 않아도 됨; 연락처·보호책임자는 이미 있음) → 재배포. 확인: 첫 화면과 안내 글의 페이지 소스에 adsbygoogle 코드가 있고, /pdf-merge/에는 없음. (The orchestrator may do this through the owner's logged-in Chrome if the owner allows; otherwise the owner.)
2. 애드센스 콘솔 → 광고 → 사이트별 → docttak.com: 자동 광고 끄기 (앵커·전면(비네트) 포함).
3. 검토 요청은 11월 중순 이후 한 번만, P1(안내 글 정리·보강)이 배포된 뒤에. 거절 뒤 반복해서 누르지 않기.
4. 승인 전에는 광고가 나오지 않아요 (코드가 광고 요청을 멈춰 둠). 광고 단위는 승인 뒤 다음 스프린트에서.
5. `PUBLIC_AFF_COUPANG`는 지워도, 그대로 둬도 돼요 (코드에서 꺼져 있음).

## CLAUDE.md edits (orchestrator applies at the deploy gate)
- Privacy/runtime bullet, after the Google Analytics sentence (ends "…stubbed."), insert: "Google AdSense (`PUBLIC_ADSENSE_ON=1`, scripts/lib/adsense.mjs; owner-approved 2026-10-12, code requested 2026-10-20): Google's async adsbygoogle.js tag (client ca-pub-6478963235198426) plus the same-origin /ads-cfg.js (non-personalized only; ad requests paused until ad units exist) only on content pages (home, /guide/*, /about/, /contact/), each served with its own scheme-source CSP (`! Content-Security-Policy` detach); tool and result pages, 404, offline, privacy/terms/licenses, /en/* and /embed/* never load it and keep script-src/connect-src 'self'; auto, anchor and vignette ads stay off in the AdSense console; the build fails with it on and no contact email or privacy officer. Coupang Partners links are off in code (`AFF_ENABLED = false`, src/data/affiliate.ts, 2026-10-20); check-dist asserts 0 Coupang links and disclosure lines in dist."
- No-contact bullet: replace "the 배경 지우기 exception is named only on /privacy/, /terms/ and /remove-background/" with "the 배경 지우기 exception is named only on /privacy/, /terms/, /remove-background/ and /about/". Append: "Exception (ADS1020): with `PUBLIC_CONTACT_EMAIL` and `PUBLIC_PRIVACY_OFFICER` both set, /about/ names the operator, /contact/ gives the email, the footer links both and guide bylines name the operator; without both, none of it is built."
