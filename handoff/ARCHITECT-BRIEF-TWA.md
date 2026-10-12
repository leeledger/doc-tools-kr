# Architect Brief — TWA (문서딱 Android app on Google Play)

## Goal
문서딱 (https://docttak.com) ships on Google Play as a Trusted Web Activity: an AAB built in this repo, verified by Digital Asset Links, with the whole Play listing (texts, screenshots, feature graphic, Data safety, rating, ads) ready to paste.

## Isolation (REV2 + Growth are uncommitted in this tree)
- NEW files only, except: `src/pages/manifest.webmanifest.ts` (not dirty) and `public/_headers` (not dirty).
- Do NOT touch: `scripts/check-dist.mjs`, `package.json`, root `.gitignore`, `src/lib/ui/usage.ts`, `scripts/lib/usage.mjs`, `src/pages/privacy/index.astro`, `src/data/legal.ts` (dirty or REV2-owned). New checks go in new files.
- Bubblewrap is NOT a root devDependency: `twa/package.json` (own lockfile, `@bubblewrap/cli` pinned exact).
- Commit only TWA paths (`twa/ public/.well-known/ public/_headers src/pages/manifest.webmanifest.ts tests/unit/assetlinks.test.ts tests/unit/manifest.test.ts handoff/ARCHITECT-BRIEF-TWA.md`). Never `git add -A`.

## Environment (probed 2026-10-12)
- JDK: OpenJDK 17.0.17 (Microsoft), JAVA_HOME = C:\Program Files\Microsoft\jdk-17.0.17.10-hotspot\, keytool on PATH. OK.
- Android SDK: ANDROID_HOME = C:\Users\force\AppData\Local\Android\Sdk (build-tools 34/35/36.1, platforms 35/36, cmdline-tools/latest, platform-tools). adb/sdkmanager not on PATH (use full path).
- ~/.bubblewrap/config.json already exists: jdkPath above, androidSdkPath C:\Users\force\.bubblewrap\android_sdk (build-tools 34/35, platform 36). Bubblewrap CLI itself NOT installed (no global, no npx cache). Node 22.15.1.
- Decision: **Bubblewrap CLI** (headless, reproducible, in git). PWABuilder = fallback only (web UI via owner's Chrome, not reproducible).

## Current web app vs TWA needs
| Item | State | Action |
|---|---|---|
| manifest name/short_name | long title / 문서딱 | keep |
| start_url `/`, scope `/`, display standalone | OK | add `id: '/'` |
| theme #0f766e, background #ffffff | OK | keep |
| icons 192, 512, maskable 512 | OK (gen-brand, gitignored) | keep |
| description, shortcuts, categories | missing | add (step 1) |
| Service worker + offline | OK: precache + /offline/; navigations use caches.match(path, {ignoreSearch:true}) (src/sw/sw.ts:90) | none; start URL with query still served offline |
| assetlinks.json | **404 live** (text/html fallback) | create |
| Lighthouse | CI asserts perf 0.95 / a11y 1 (PWA category removed in LH12) | none; TWA bar (perf >= 80 mobile) exceeded |

## Flow
```
Play install -> launcher -> LauncherActivity (TWA in Chrome / other TWA browser)
   | opens startUrl https://docttak.com/?utm_source=play&utm_medium=twa
   | browser fetches https://docttak.com/.well-known/assetlinks.json
   |   package com.docttak.app + SHA-256 of the INSTALLED apk's cert listed?
   |     yes -> fullscreen, no URL bar
   |     no  -> URL bar visible (Custom Tab look)   <- F1
   v
 SW controls page -> offline: precached tools work; uncached page -> /offline/
 links: in-scope docttak.com -> same TWA; out-of-scope (쿠팡, 외교부, 정부24) -> Custom Tab toolbar
 downloads: blob <a download> -> Chrome download manager + notification
 file inputs -> Android system picker

Signing:
 upload key (local, outside repo) --signs AAB--> Play --re-signs with--> Play App Signing key --> devices
 assetlinks lists BOTH SHA-256 (upload key: local/sideload builds; app-signing key: Play installs)
```

## Build Order
1. **Manifest tweaks** — `src/pages/manifest.webmanifest.ts`
   - add `id: '/'`, `description` (reuse the home meta description; no new copy), `categories: ['productivity','utilities']`. Do not set orientation.
   - add `shortcuts` (max 4 -> Android long-press shortcuts): 증명사진 /id-photo/, PDF 합치기 /pdf-merge/, HWP->PDF /hwp-to-pdf/, 사진 용량 줄이기 /photo-compress/. Names imported from `src/data/tools.ts` (no hardcoding). Icon `/brand/icon-192.png` (192x192).
   - `start_url` stays `/` (web installs unchanged). App attribution lives in Bubblewrap startUrl.
   - Grep tests for `manifest.webmanifest`; extend, or add `tests/unit/manifest.test.ts`.
2. **Digital Asset Links** — `public/.well-known/assetlinks.json`
   - `[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"com.docttak.app","sha256_cert_fingerprints":["<UPLOAD_SHA256>"]}}]`
   - Phase A: upload-key fingerprint only. Phase B (after first AAB upload): append Play App Signing SHA-256 (Play Console > 앱 무결성 > 앱 서명). Uppercase colon-hex.
   - `public/_headers`: add block `/.well-known/assetlinks.json` with `Content-Type: application/json` and `Cache-Control: public, max-age=3600`.
   - After `npm run build`, `dist/.well-known/assetlinks.json` must exist (dot-dir copy). If not: STOP and report; do not edit check-dist.
   - Run existing check-dist unchanged; must pass.
   - New `tests/unit/assetlinks.test.ts`: valid JSON; one statement for com.docttak.app; every fingerprint matches `^([0-9A-F]{2}:){31}[0-9A-F]{2}$`; no duplicates; package equals `twa/twa-manifest.json` packageId; `public/_headers` has the block.
3. **Bubblewrap project** — `twa/`
   - `twa/package.json` + lockfile; scripts `build`, `fingerprint`.
   - `twa/twa-manifest.json` (committed, source of truth): packageId com.docttak.app; host docttak.com; name/launcherName 문서딱; startUrl `/?utm_source=play&utm_medium=twa`; themeColor #0f766e; navigationColor #ffffff; backgroundColor #ffffff; display standalone; orientation default; iconUrl .../brand/icon-512.png; maskableIconUrl .../brand/icon-maskable-512.png; shortcuts = live manifest; fallbackType customtabs; enableNotifications false; no location delegation, no Play Billing; appVersionCode 1; appVersionName 1.0.0; signingKey path C:\Users\force\.docttak-keys\docttak-upload.jks, alias upload; webManifestUrl https://docttak.com/manifest.webmanifest.
   - Generate the Gradle project non-interactively (probe first, see Unverified). Commit the generated project (reviewable diffs).
   - `twa/.gitignore`: *.jks, *.keystore, *.aab, *.apk, *.idsig, build/, app/build/, .gradle/, local.properties, node_modules/.
   - targetSdkVersion >= current Play requirement (verify number on developer.android.com "target API level requirements"; expect 35+, likely 36 for 2026). If template is lower, set it in app/build.gradle and document re-apply after `bubblewrap update`.
   - `twa/README.md` (Korean, short): build, version rule (versionCode +1 every upload, never reused), key location, assetlinks phases, manual device checklist.
4. **Upload key** — ONLY after the orchestrator returns E1.
   - `keytool -genkeypair -v -keystore C:\Users\force\.docttak-keys\docttak-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Docttak, C=KR"`; passwords via env vars only, never in repo, twa-manifest, README, handoff, logs or commit.
   - Build with BUBBLEWRAP_KEYSTORE_PASSWORD / BUBBLEWRAP_KEY_PASSWORD (verify names in CLI source first).
   - AAB stays in twa/ (gitignored). Upload-key SHA-256 (`keytool -list -v`) -> assetlinks Phase A.
5. **Listing assets** — `twa/listing/` (committed)
   - `listing.ko.md`: title (<=30 chars), short (<=80), full (<=4000). Draft below; facts synced with `src/data/tools.ts` and production flags.
   - `twa/screenshots.mjs`: existing Playwright (no new dep) against local dist server (`tests/e2e/serve.mjs`), viewport 360x640 @ deviceScaleFactor 3 -> 1080x1920 PNG. 6-8 shots: home, 증명사진 result (existing e2e fixture photo), PDF 합치기 with 2 files, PDF 압축 result, HWP->PDF, 사진 용량 줄이기 result, "파일이 기기 밖으로 나가지 않아요" message. Each <= 500 KB.
   - Feature graphic 1024x500: `twa/listing/feature.html` (brand color, logo from public/brand, one Korean line, site font) rendered by the same script. No device frames, no "1위/영구 무료" claims.
   - Icon 512x512 32-bit PNG: copy of public/brand/icon-512.png.
6. **Play Console answers** — `twa/listing/play-console-answers.md` from the section below; Bob re-verifies each item by grep and live probe; mismatch -> report, do not edit policy.
7. **Privacy page** — no edit now (dirty, REV2). Arch ruling: the policy already covers the app (the app IS the website, same collection). Play requires only a reachable URL: https://docttak.com/privacy/. One-line app sentence -> Known Gaps.

Flag (do not guess):
- Package id com.docttak.app is permanent after first upload; use only after E2 confirmed.
- Never put keystore or passwords in repo, logs, handoff or commits.
- Bob never operates Play Console.

## Draft listing (Bob may tighten; not change claims)
- 제목: `문서딱 - 증명사진·PDF 합치기·HWP 변환` (<=30 chars; drop from the end if over)
- 간단한 설명: `증명사진 규격 맞추기, PDF 합치기·압축, HWP를 PDF로. 파일은 폰 안에서 처리해요.`
- 자세한 설명 must emphasise (minimum-functionality defence): every live tool by name; files processed on the phone (no upload), except optional 배경 지우기 cloud mode (state it honestly); works offline after first open (precached tools); home-screen shortcuts; no sign-up, no ads; results saved to the phone. Must state: 정부·외교부와 관계없는 개인 서비스 (misrepresentation policy).

## Play Console answers (derived from code + live probe 2026-10-12)
Live flags: GA4 (/ga.js) ON, Cloudflare Web Analytics ON, anonymous usage stats ON (privacy #usage), 배경 지우기 cloud ON (privacy #bg), affiliate links NOT live (REV2 uncommitted).
- Data safety: data collected = yes; shared = no (Cloudflare/Google act as processors); encrypted in transit = yes; account = none.
  - 사진: 배경 지우기 cloud mode only; optional (user can pick device mode); processed ephemerally (deleted after the result); purpose 앱 기능.
  - 앱 활동 > 앱 상호작용 / 기타 사용자 생성 콘텐츠 = no; 페이지 조회·상호작용 = yes (GA4 page_view, CF Web Analytics, usage events); purpose 분석.
  - 기기 또는 기타 ID: GA4 `_ga` random id (13 months); purpose 분석.
  - 대략적인 위치: GA4 derives region from IP (IP not stored). Arch ruling: declare it (over-declaring is safe, under-declaring is a strike); purpose 분석.
  - 앱 정보 및 성능 > 진단: usage `fail` events (error code, phase, browser family/version); purpose 분석.
  - Not collected: name, email, phone, contacts, precise location, files' names/content (besides the cloud photo), financial, messages, health.
  - 삭제 요청: no account; data anonymous/aggregated; GA opt-out described in policy.
- 광고 포함: 아니요 (now). E4 before affiliate links go live.
- 콘텐츠 등급 (IARC): utility; no violence/sex/drugs/gambling, no user-to-user communication, no location sharing, no purchases -> expected 전체이용가.
- 타겟층: 13-15, 16-17, 18+ (no under-13 -> outside Families policy).
- 카테고리: 생산성. 앱 액세스: 로그인 없이 전부 사용. 뉴스/정부/금융/건강 앱 아님. 개인정보처리방침 URL https://docttak.com/privacy/.
- 연락처 이메일: CONTACT_EMAIL in `src/data/legal.ts` (read only).
- Minimum-functionality appeal text (if rejected): on-device PDF/HWP/image engines (wasm), offline after first open, 15 tools, shortcuts, no ads.

## Analytics for app sessions (no new SDK, no web code change)
- TWA launch sends referrer `android-app://com.docttak.app` -> CF Web Analytics shows it as a referrer.
- startUrl `?utm_source=play&utm_medium=twa` -> GA4 source/medium `play / twa`. SW serves it offline (ignoreSearch).
- Anonymous usage stats: no app dimension now (whitelist in dirty scripts/lib/usage.mjs) -> Known Gap.

## Failure modes
| # | Failure | Handling | User sees |
|---|---|---|---|
| F1 | assetlinks wrong/missing fingerprint (only upload key listed; Play build signed by app-signing key) | Phase B; post-deploy curl + Google DAL API (`https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://docttak.com&relation=delegate_permission/common.handle_all_urls`); install from internal track; unit test format | URL bar (visible, not silent) |
| F2 | Pages does not serve /.well-known/ or wrong type (today 404 text/html) | post-deploy `curl -sI`: 200 + application/json | F1 |
| F3 | upload key or password lost | Play App Signing allows upload-key reset by owner; owner backs up .jks + password in 2 offline places | release blocked for days |
| F4 | targetSdk below Play requirement | verify number, set build.gradle | Play upload error (clear) |
| F5 | no TWA-capable browser | fallbackType customtabs | works with toolbar |
| F6 | first launch offline (SW not yet installed) | listing says "한 번 연 뒤 오프라인" | browser offline page |
| F7 | "website wrapper" rejection | listing/screenshots stress on-device processing, offline, shortcuts; appeal text ready | rejection email (clear) |
| F8 | Data safety drifts (affiliate/ads/new collection later) | E4 gate; answers file records the flags it was derived from | policy strike if missed -> gated |
| F9 | download lands with no visible cue | Chrome download notification + existing result screen; manual device check | notification |

## Test map
- manifest id/description/categories/shortcuts (names from tools.ts) — [GAP] -> tests/unit/manifest.test.ts (or extend existing manifest test).
- assetlinks format + package match + _headers block — [GAP] -> tests/unit/assetlinks.test.ts.
- dist contains .well-known/assetlinks.json; check-dist passes unchanged — [GAP] -> acceptance command.
- offline navigation to `/?utm_source=play&utm_medium=twa` returns home — logic [TESTED] by ignoreSearch; add one case to tests/e2e/sw.spec.ts (not dirty).
- Regression: full unit + e2e + check-dist + Lighthouse CI green (start_url unchanged).
- Device behaviour (no URL bar, picker, download, offline after first open, out-of-scope link) — [GAP, manual] internal-testing install; checklist in twa/README.md.

## Unverified claims (Bob proves with a probe; paste output in REVIEW-REQUEST)
- Bubblewrap generates the project without TTY prompts from a prepared twa-manifest.json.
- Env var names BUBBLEWRAP_KEYSTORE_PASSWORD / BUBBLEWRAP_KEY_PASSWORD.
- Bubblewrap template targetSdk vs current Play requirement.
- Astro copies public/.well-known/ into dist/; Pages serves it as application/json.
- Closed test (12 testers x 14 days) applies to personal accounts created after 2023-11-13 — owner checks Play Console.

## Who does what
- Bob (repo): steps 1-3, 5-6; step 4 after E1.
- Orchestrator (owner's logged-in Chrome, chrome-cdp): create app (문서딱, ko-KR, 앱, 무료); store listing + graphics; App content forms (privacy URL, ads, app access, IARC, target audience, Data safety, gov/financial/health); internal-testing release + AAB upload; read Play App Signing SHA-256 -> Bob Phase B; closed-test track + tester list.
- Owner only: E1-E4; identity/developer verification, any payment; keystore + password backup; recruit >= 12 testers if required; final "검토를 위해 보내기 / 프로덕션 출시" click.

## Escalations
- E1 (owner secret): keystore password. (a) owner sets it in their own terminal env and runs keytool + build; (b) Claude generates one, shows it once, owner stores it in a password manager, never written to disk. Arch recommends (a).
- E2: confirm package id com.docttak.app (permanent).
- E3: closed-test requirement applies? If yes, >= 12 tester Google accounts; production >= 14 days after test start.
- E4: when 쿠팡 affiliate links go live, set 광고 포함 = 예 (paid promotion) before that deploy.

## Out of Scope (-> BUILD-LOG Known Gaps)
- Web Share Target / file-open intents.
- Usage-stats app dimension (after REV2).
- Privacy page one-line app sentence (after REV2).
- Push, Play Billing, any ads/analytics SDK, in-app review.
- iOS / other stores.

## Acceptance
- `npm run build` -> dist/.well-known/assetlinks.json present; check-dist passes unchanged; unit + e2e green incl. new tests.
- twa/ produces a signed app-release-bundle.aab (versionCode 1, targetSdk >= requirement); `keytool -list -v` SHA-256 equals assetlinks entry.
- `git status`: no .jks/.aab/passwords; key at C:\Users\force\.docttak-keys\.
- twa/listing/: listing.ko.md within limits, 6-8 screenshots 1080x1920, feature 1024x500, icon 512, play-console-answers.md.
- Post-deploy: assetlinks 200 application/json; DAL API lists statement; internal-testing install opens without URL bar; picker, download, offline (after first open), out-of-scope link checked on a real phone.
