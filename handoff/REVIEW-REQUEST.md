# Review Request — GA4
Date: 2026-10-08
Ready for Review: YES. Status **DONE_WITH_CONCERNS** (two deviations from the brief, below; everything green). Not committed, not pushed.
Brief: handoff/ARCHITECT-BRIEF-GA4.md (owner decision: G-TFP7W8X8BG behind PUBLIC_GA_ID, no banner, no footer blog link).

## Files Changed
- scripts/lib/ga.mjs:1-67 (new) — GA_ID_RE / gaId, the CSP host lists (Google CSP guide "without Ads features" + `*.analytics.google.com`), withGaCsp (script-src, connect-src, img-src; throws unless exactly one CSP line with all three), loaderSource (ES5 IIFE: loc first, dataLayer, `push(arguments)`, js + config with both signal flags false, cookie_expires 34128000, then load → requestIdleCallback(2000) | setTimeout).
- scripts/gen-ga.mjs:1-17 (new) — postbuild: valid ID → dist/ga.js; else removes it (invalid → check-dist reports).
- package.json:14 — postbuild starts with `node scripts/gen-ga.mjs && `.
- src/data/ga.ts:1-10 (new), src/env.d.ts:11-14 — GA_ID / GA_ON / GA_LOADER; `ImportMetaEnv.PUBLIC_GA_ID`.
- src/layouts/Base.astro:7, 97-99 — `<script is:inline defer src="/ga.js" data-site-ga>` at the end of head next to the CF beacon line; every module script is in body (built HTML checked; check-dist now enforces "before the first module script").
- scripts/gen-headers.mjs:11, 54-61 — on: withGaCsp + `/ga.js  Cache-Control: no-cache` block.
- scripts/check-dist.mjs:10, 48-54, 91-116 — invalid ID error; on: one marked tag per page before module scripts, dist/ga.js === loaderSource(id) and both flags; always: no `googletagmanager` / `gtag(` in HTML; off: no tag, no ga.js, `googletagmanager` in no text file of dist (no whitelist was needed).
- scripts/ops/lib/html.mjs:71-75 — comment only (GA is first-party via /ga.js).
- src/data/legal.ts:2, 13-15, 21-23 — PRIVACY_GA '2026년 10월 8일' (confirm at deploy), PRIVACY_REVISED / PRIVACY_TERMS_UPDATED switch on GA_ON. /terms/ has no 쿠키/분석 wording: unchanged.
- src/pages/privacy/index.astro:5-7, 19-30, 40, 74-95, 117 — n() gains `GA_ON && base >= 4`; section 1 sentence; section `id="ga"` after 사이트를 여는 기록 (purpose, cookies, collected items, 국외 이전 6 items, signals off, refusal); change-log line.
- docs/COPY.md:93-94 — GA bullets (env, what changes, GA admin settings are manual).
- .github/workflows/ci.yml:99-100, 109 — `PUBLIC_GA_ID: 'G-TEST000000'` on the dist-bgcloud build only.
- playwright.config.ts:26-27, 31, 34, 84 — CLOUD_SPEC += ga.cloud; cloud-* projects `use: { ga: true }`; `defineConfig<{ ga: boolean }>`.
- tests/e2e/upload-guard.ts:3, 43-62, 64, 73, 82 — **guard change (see concern 1)**: `isGaRequest`, `uploadProblems(..., ga = false)`.
- tests/e2e/no-upload.ts:23-24, 28-51 — `ga` fixture option (default false); when true, context routes stub gtag.js (GTAG_STUB sends one GET collect with page_location and records afterLoad) and answer GA hosts 204.
- tests/e2e/usage.spec.ts:227-234 — cookieless sentence / usage date asserted only when the build has no `#ga` (dist-bgcloud now has GA).
- tests/e2e/ga.spec.ts (new) — GA-off default build: no tag, no dataLayer, no Google request, no GA section.
- tests/e2e/ga.cloud.spec.ts (new) — tag; gtag.js after load (stub sees loadEventEnd > 0); one collect per page; exact CSP header; zero CSP violations; utm_source kept, hash dropped; `비밀-파일명.pdf` through /pdf-compress/ absent from dataLayer and all Google URLs; privacy numbering on the cloud+usage+GA build (GA = 5, usage = 7, 변경 이력 = 9).
- tests/unit/ga.test.ts (new) — gaId, withGaCsp (+ both compose orders), loaderSource text and behaviour (vm), no document.title assignment in src/, sw route() and gen-sw precache, guard GA allowance, GA-off dist + check-dist refusal, and a GA-on astro build in a temp dir (gen-ga, check-dist, gen-headers, every page's tag, privacy text/numbering/links, sitemap lastmod 2026-10-08, check-dist failure modes).
- tests/unit/ops.test.ts:108-115 — /ga.js + CF beacon pass; raw gtag/js script flagged.
- tests/unit/postbuild.test.ts:507-508 — buildEnv passes PUBLIC_GA_ID when dist has ga.js.

## Concerns / Open Questions
1. **No-upload guard (not in the brief).** The guard fails on any third-party request and on any CSP whose connect-src is not exactly `'self'`. Turning GA on in dist-bgcloud therefore fails every cloud-* spec. I added an opt-in `ga` fixture option, set only on the cloud-* projects: bodiless GETs to `https://www.googletagmanager.com/gtag/js` or `*.google-analytics.com` / `*.analytics.google.com` pass, and the CSP may be exactly `'self'` + the GA connect list. POST/body to Google, other Google paths (gtm.js, www.google.com), http, look-alike hosts and a wider CSP still fail (unit-tested). The fixture also stubs those hosts so no CI test reaches Google. Richard/Arch: please confirm this is acceptable for the privacy guard.
2. **"GA-off dist identical to U1 HEAD dist" holds except the UI font.** gen-ui-font builds the core subset from source text regardless of flags, so the GA policy copy adds 6 core glyphs (꺼 널 략 언 역 틱): anolim-ui-400 44,548 → 44,860 B, -800 47,820 → 48,024 B; hence new font hashes, Base CSS hash, sw.js and deploy-manifest. Every HTML differs only in those hashed names (diff after normalising them: none). The GA-on build needs the glyphs anyway. Same as the cloud/usage sections before.
3. Google contact: policies.google.com/privacy?hl=ko itself links `mailto:googlekrsupport@google.com` as "문의"; I used the privacy form the brief asked for, `https://support.google.com/policies/contact/general_privacy_form?hl=ko` (HTTP 200, 2026-10-08). Opt-out page `https://tools.google.com/dlpage/gaoptout?hl=ko` 200.
4. Section 1 heading stays "받는 개인정보가 없어요" (brief did not change it) while the section now names GA cookies; Arch may want a wording look.

## CLAUDE.md proposal (orchestrator applies; replaces the "only third-party script" sentence)
"Third-party scripts: the cookieless Cloudflare Web Analytics beacon (`PUBLIC_CF_ANALYTICS_TOKEN`, scripts/lib/analytics.mjs) and Google Analytics 4 (`PUBLIC_GA_ID`, scripts/lib/ga.mjs; owner-approved 2026-10-08): a self-hosted /ga.js loads gtag.js after `load`, page_view only, Google signals and ad personalization off, never file data. Each widens the CSP only when its env var is set; otherwise CSP `script-src`/`connect-src 'self'`."
Suggested addition to the Privacy/runtime line: "the cloud-* e2e projects (GA-on build) allow only bodiless GETs to gtag.js and the GA collect hosts, stubbed."

## Gates (2026-10-08, local Windows)
- astro check 0 errors; unit 56 files / 1,208 passed (default dist; ga.test incl. the GA-on temp build, 64 s).
- Builds, all postbuild OK: default (2,401 files), auto-frame (2,408), bg (2,419), cloud+GA G-TEST000000 (2,421; `gen-ga: ga.js for G-TEST000000`, CSP + /ga.js no-cache), GA-only (2,402). Precache cloud 427.3 KB / 450 (was 425.6), default 421.0, bg 424.4, auto 423.2.
- e2e retries 0: ga.spec + ga.cloud.spec + usage.spec + remove-background.cloud.spec on chromium, mobile-chrome, webkit, cloud-chromium, cloud-mobile-chrome, cloud-webkit: 70 passed, 5 skipped (pre-existing skips).
- Lighthouse, GA-on build, **real gtag.js** (collect hits sent, G-TEST000000), 5 runs, median: / perf 0.99, LCP 1,669 ms, CLS 0.000, BP 1; /pdf-compress/ 0.99, 1,822, 0.000, 1; /id-photo/ 0.99, 1,818, 0.000, 1; /guide/passport-photo/ 0.99, 1,670, 0.000, 1. a11y/SEO 1. Only `resource-summary:script:size` fails, as expected on GA-on (158–175 KB; budget stays a GA-off first-party gate, lighthouserc unchanged).

## Out of Scope (logged in BUILD-LOG Known Gaps)
- GA tool events, consent banner / Consent Mode, Ads, GTM, footer blog link, /admin/ changes.
