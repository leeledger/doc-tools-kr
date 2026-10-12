# Architect Brief — REV4 (애드센스 준비: 안내 글에만)

Source: owner "수익화 가능한 수단을 최대한 많이" (2026-10-12); `C:/dev/doc-tools-kr/reports/문서딱 수익화 전략 검증.md` L37-45 (CSP, 광고 위치, 개인정보), L66 (조건). Order note: BUILD-LOG REV2 locks 3 임베드 위젯 before 4 애드센스. REV4 is env-gated and can be built any time, but the owner applies only when the conditions below hold; Arch recommends building REV5 first.
Base: REV3 deployed.

## Goal
With env set, AdSense can verify the site and (after approval) show manual ad units on guide articles only, under a guide-only CSP, with ads.txt, an ads privacy section and no LCP/CLS regression; with env unset every byte of dist is identical to today.

## Owner gate (must be true before the owner applies; the build does not wait)
- Real visits about 100/day for 2 weeks running; guides about 50 (now 45 in src/content/guides; no template-only 기관 이름만 바꾼 글: Google spam policy, report L43); privacy policy v2 (this brief).
- AdSense publishes no post-count threshold; "50+" is a community observation (report L43). Most common rejection: low-value content.

## Locked decisions
1. **Two env stages.**
   - `PUBLIC_ADSENSE_CLIENT` (format `ca-pub-` + 16 digits; build fails naming the variable otherwise, value not echoed): stage A "verify". Adds only `<meta name="google-adsense-account" content="ca-pub-...">` to every page head (no script, CSP-neutral) and generates `dist/ads.txt` = `google.com, pub-<16 digits>, DIRECT, f08c47fec0942fa0`. This is what the owner needs to connect the site in the AdSense console (meta tag or ads.txt method).
   - `PUBLIC_ADSENSE_ON=1` plus `PUBLIC_ADSENSE_SLOT_MID`, `PUBLIC_ADSENSE_SLOT_END` (digits only): stage B "serve", only after approval. ON without CLIENT or slots: build fails naming the variable.
   - `src/data/site.ts` `ADS_ENABLED` stops being a hard-coded false: derived from stage B. The existing AdSlot placements (Guide.astro guide-mid, guide-end) are the only slots.
2. **Where ads may appear: guide articles only** (`/guide/<slug>/`). Never: tool pages, result screens, home, 404, offline, /guide/ index, hubs, privacy/terms/licenses, /embed/* (REV5). Google publisher policy forbids ads on no-content / navigation / action screens (report L43). check-dist enforces with an allowlist (only guide article HTML may contain the slot markup or `adsbygoogle`).
3. **Loader:** self-hosted `/ads.js` (pattern of `/ga.js`, scripts/lib/ga.mjs): a classic deferred script, emitted only on guide articles in stage B. After `load` plus `requestIdleCallback` (timeout 3 s) it appends the `pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=...` script and pushes one `{}` per slot present. No inline script (so no 'unsafe-inline' in script-src). Manual units only: **Auto ads, anchor ads, vignette ads OFF in the console** (owner step; floating units conflict with our no-floating rule and with CLS).
4. **Slots, no CLS:** `ins.adsbygoogle` inside the existing `.ad-slot` box with a fixed reserved min-height per size (rect 280 px; leaderboard 100 px mobile / 90 px desktop) set in guide.css (guide pages only, not app.css: no precache or tool-page cost). An unfilled slot keeps its box (never collapse: collapsing shifts content). guide-mid must start below the first screen on a 390x844 viewport (move it after the second body section if it does not). The LCP element stays the H1/answer text.
5. **Route CSP (static, no nonce):** Google supports only nonce-based strict CSP for AdSense, which a static Pages deploy cannot produce per request (report L41). Decision: a **scheme-source policy scoped to `/guide/*`**, not strict CSP and not Functions:
   `default-src 'self'; script-src 'self' https: 'unsafe-eval'; connect-src 'self' https:; img-src 'self' data: https:; frame-src https:; fenced-frame-src https:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'`
   - Rejected: Functions nonce rewriting (every guide request becomes a metered Function call; HTML rewriting on the hot path); hash-based strict CSP (strict-dynamic ignores 'self', so our parser-inserted `/_astro/*` module scripts would need SRI or an inline hashed bootstrap: a build-system fight).
   - Mechanics: Cloudflare Pages joins a header set by two matching rules with a comma, which would enforce two policies (ads break). The `/guide/*` block must first detach (`! Content-Security-Policy`), then set the new one. Flag (unverified until probed): cite the Cloudflare Pages `_headers` doc line for `!` detach in REVIEW-REQUEST, and paste `curl -sI` of a preview guide URL and a preview tool URL showing exactly one CSP each.
   - Generated in `scripts/gen-headers.mjs` (stage B only), appended **after** the GA/analytics extensions run, so the default `_headers` is byte-identical. `withGaCsp` / `withAnalyticsCsp` require exactly one CSP line: keep them targeting the `/*` block line and add a test that a stage-B headers file with GA + analytics + ads has the site-wide policy extended once and the guide policy present once. If GA is on, the guide policy already covers it (https: scheme).
   - Tool pages, home, 404 and embed keep the unchanged 'self' CSP.
6. **Consent approach (report L45):** PIPC lets non-identifying behavioral info be processed without consent if there is transparency + an opt-out. So: no cookie banner, no CMP script, no localStorage. On each guide article with ads, one static line above the first slot: `이 글에는 Google 광고가 나와요.` + link `맞춤 광고 끄기` to `https://myadcenter.google.com/` (new tab, rel="noopener"), plus the privacy section. EEA/UK: without a Google-certified CMP Google limits serving there; accepted (Korean audience). **Owner decision (escalate):** personalized ads ON (default, more revenue) vs non-personalized only (safest given 수험생 incl. under-14 users). One constant switches it.
7. **Privacy policy v2 section** (rendered only in stage B builds, like PRIVACY_USAGE): 「안내 글의 광고(Google 애드센스)」: which pages (안내 글만, 도구 화면에는 없음); what (Google이 쿠키·기기 식별자로 관심사 기반 광고를 보여 줄 수 있음; 문서딱은 그 정보를 받지 않음; 파일은 여전히 기기 밖으로 나가지 않음); 거부 방법 (myadcenter.google.com 맞춤 광고 끄기, 브라우저 쿠키 차단·삭제); 보관 기간 (Google 정책에 따름 + link policies.google.com/technologies/ads); 14세 미만 (맞춤 광고를 의도하지 않음; 문의처); `PRIVACY_ADS` date, revision-history line, PRIVACY_REVISED rule. Legal scope is unverified; the runbook says a 자문 is advisable.
8. **Checks change scope, never weaken:** check-dist A-4 (외부 스크립트 0개) and the live smoke (외부 요청 0) in scripts/ops exempt only guide article URLs in stage B and assert the ad script is absent from every other page. The cloud-* e2e no-upload fixture allows `pagead2.googlesyndication.com` GETs only on guide URLs, stubbed (pattern of the GA allowance).
9. **CLAUDE.md** third-party-script sentence must change before stage B ships. **Owner approval required; Bob does not edit CLAUDE.md.** Proposed text: "Google AdSense (`PUBLIC_ADSENSE_ON`, guide articles only; owner-approved <date>): self-hosted /ads.js loads adsbygoogle.js after load; manual units, auto/anchor/vignette ads off; a separate scheme-source CSP on `/guide/*` only; tool, result, home, 404 and embed pages keep script-src 'self'."
10. **No change** to tool pages, fonts (guide text is system font), precache (guides and /ads.js are not precached: verify), usage beacon.

## Flow
```
env: none ---------------------------> dist identical to REV3
     CLIENT -------------------------> + meta google-adsense-account (all pages) + dist/ads.txt
     CLIENT + ON + SLOT_MID/END -----> guide article only:
          head: <script defer src=/ads.js data-client=...>
          body: [ads notice line] [.ad-slot mid, reserved] ... [.ad-slot end, reserved]
          _headers /guide/*:  ! Content-Security-Policy ; Content-Security-Policy: scheme-source policy
     load -> idle -> /ads.js appends adsbygoogle.js -> push per slot -> Google fills iframes inside reserved boxes
other routes: unchanged CSP, no slot, no /ads.js (check-dist + e2e)
```

## Build Order
- A. `scripts/lib/adsense.mjs`: parse/validate the 4 env vars (pure, unit-tested); `adsTxt(client)`; `guideCsp()`; `withGuideCsp(headers)`.
- B. Stage A: meta tag in Base.astro; ads.txt written in postbuild (gen-headers or a sibling step); check-dist: ads.txt exists iff CLIENT set, content exact; the existing verification-file exemption covers it.
- C. Stage B: `/ads.js` (public, self-hosted, tiny; follows ga.js structure) emitted only on guide articles; AdSlot renders `ins.adsbygoogle` with `data-ad-client`, `data-ad-slot`, `data-ad-format` fixed (no auto-size that can grow the box past the reserve), notice line; guide.css reserves.
- D. gen-headers route CSP (Decision 5) + tests for GA/analytics interplay.
- E. Privacy section (Decision 7).
- F. check-dist allowlist rules (Decision 2, 8) + ops smoke scope + e2e fixture allowance.
- G. `scripts/ops/monetize.mjs` checklist: tick-boxes match this brief (env names, console switches off, owner decision on personalization).
- H. `docs/OPS-RUNBOOK.md` new §11 「애드센스 신청과 켜기 (대표만)」 (below) + REVENUE-MODEL §1 status.
- I. BUILD-LOG + REVIEW-REQUEST with line ranges and the probes.
- Flag: real client/slot IDs are never committed; tests use `ca-pub-0000000000000000` and `1234567890`.
- Flag: never raise a budget; if LHCI on a stage-B build regresses, stop and report.

### OPS-RUNBOOK §11 content (Bob writes, plain Korean)
1. 조건 확인: 실제 방문 하루 약 100회 2주 연속, 안내 글 약 50편, 개인정보처리방침 v2 배포됨.
2. Google 계정으로 adsense.google.com 가입: 사이트 `docttak.com`, 국가 대한민국, 결제 프로필(개인, 실명·주소는 신분증과 같게).
3. 사이트 연결: 「메타 태그」 방법 선택 → 표시되는 `ca-pub-...`를 Cloudflare Pages 변수 `PUBLIC_ADSENSE_CLIENT`에 넣고 재배포(§8과 같은 곳) → 콘솔에서 확인 → 검토 요청. ads.txt도 자동으로 생깁니다.
4. 검토(보통 며칠~몇 주). 거절되면 사유를 알려 주세요(대개 「가치가 별로 없는 콘텐츠」).
5. 승인 뒤: 광고 단위 2개(디스플레이, 고정 크기) 만들기 → 각 슬롯 번호를 `PUBLIC_ADSENSE_SLOT_MID`, `PUBLIC_ADSENSE_SLOT_END`에, `PUBLIC_ADSENSE_ON=1` → 재배포. 콘솔에서 **자동 광고·앵커 광고·전면(비네트) 광고는 끄기**.
6. 지급: 수익 $10에서 우편 PIN으로 주소 확인, 세금 정보(미국 세금 양식, 개인) 제출, 지급 계좌(외화 받을 수 있는 은행 계좌, SWIFT 코드) 등록, $100부터 지급. 수익은 사업소득으로 5월 종합소득세 신고(report L47).
7. 끄기: `PUBLIC_ADSENSE_ON` 지우고 재배포(광고·CSP 완화가 함께 빠짐).
Mark the PIN/tax/payment amounts as "AdSense 화면 기준으로 확인" (not verified by Arch).

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| Env | Malformed client/slot ID pasted | Build fails naming the variable | Failed deploy log only |
| CSP | Duplicate CSP headers on /guide/* (no detach) -> ads blocked | Detach + curl probe + headers unit test | Empty reserved box (no breakage) |
| CSP | GA/analytics extension regex hits the guide line | Exactly-one targeting test on the `/*` block | CI red |
| Policy | Ad markup leaks onto a tool/404 page | check-dist allowlist + e2e on 404/tool | Build fails |
| CLS | Ad iframe taller than the reserve / unfilled collapse | Fixed format, reserve, never collapse; e2e CLS < 0.05 with a 280 px stub iframe | Stable layout |
| LCP | adsbygoogle competes with LCP | Loaded after load + idle; LHCI stage-B run | No change |
| Blockers | Ad blocker blocks the script | Nothing depends on it; box stays empty | Empty box |
| Privacy | Section missing while ads on | check-dist: stage B requires PRIVACY_ADS text in /privacy/ | Build fails |
| Live | AdSense refuses to serve under scheme-source CSP | Preview probe with test ads (`data-adtest="on"`), console CSP errors pasted; if it fails, stop and tell Arch (next option: Functions nonce, owner decision because of metering) | Nothing ships |
No silent and untested path remains.

## Test map
- adsense.mjs env validation, adsTxt, guideCsp, withGuideCsp idempotence [GAP->unit].
- gen-headers: default output byte-identical; stage B with GA + analytics: site line extended once, guide block once with detach [GAP->unit].
- check-dist: ads.txt iff CLIENT; slot/adsbygoogle only on guide articles; privacy section iff ON [GAP->postbuild fixtures].
- e2e stage-B build (5 browsers + axe; adsbygoogle.js routed to a local stub that injects a 280 px iframe): guide article requests the script only after load; reserved boxes; CLS < 0.05 via PerformanceObserver; notice line + opt-out link; /pdf-merge/, /id-photo/ result, /404, / never request it and have no slot [GAP->e2e].
- LHCI: add one guide article URL (default build) [GAP->lighthouserc]; a manual stage-B LH run on preview with numbers pasted.
- Regression: default build dist identical except nothing (hash compare of dist files vs REV3 build) [GAP->scripted diff in REVIEW-REQUEST]; GA cloud spec, usage spec [TESTED].

## Out of Scope (-> BUILD-LOG Known Gaps)
- Auto ads, anchor/vignette, ads on any non-guide route, Funding Choices CMP, Kakao AdFit, AdSense for Search.
- CLAUDE.md edit (owner-approved text, applied by Arch at deploy gate).
- M-4 revenue report changes beyond the checklist.

## Acceptance
- Default build: dist byte-identical to REV3 (listed diff = none); check-dist OK.
- Stage A build (test client): meta on every page, ads.txt exact, no script added, CSP unchanged.
- Stage B build (test IDs): check-dist OK; `_headers` shows the detach + guide policy once; e2e green 5 projects + axe; CLS < 0.05; LHCI guide URL LCP at or under 2,000 ms.
- Preview probe pasted: curl -sI guide vs tool (one CSP each); test-ad run with 0 CSP violations, or a stop report.
- Owner items listed in REVIEW-REQUEST: personalization decision, CLAUDE.md text approval.

## Owner decisions (2026-10-12, in chat)
- AdSense: **non-personalized ads only** (비맞춤 광고만). Configure the ad request accordingly (requestNonPersonalizedAds / npa=1 per Google's current mechanism), privacy policy must say ads are not personalized, and the opt-out wording follows from that.
- CLAUDE.md third-party-script wording change: **approved by the owner** — update it in REV4 to describe the guide-only, env-gated AdSense exception precisely.
