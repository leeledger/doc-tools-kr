# Review Request — TWA step 1 (repository part)
Date: 2026-10-12
Branch: twa-step1 (base origin/main 29826f0)
Ready for Review: YES
Status: DONE_WITH_CONCERNS — everything up to the signed build is in place and tested; the Gradle build itself was not run
(see Concerns). Brief steps 1, 2, 3, 5, 6. Step 4 (keystore, signed AAB) is owner-only by instruction: not done.

## Files Changed
- src/data/web-manifest.ts (new) — manifest object: adds `id: '/'`, `description` = `defaultDescription()`, `categories`, 4 `shortcuts` named via `getTool(slug).name`, 192px icon. No orientation; start_url stays `/`.
- src/pages/manifest.webmanifest.ts — now only serves `webManifest()` (moved out so tests import it without an Astro route).
- public/.well-known/assetlinks.json (new) — one statement for com.docttak.app, `sha256_cert_fingerprints: []` (no invented values).
- public/_headers:23-25 — `/.well-known/assetlinks.json` block: `Content-Type: application/json`, `Cache-Control: public, max-age=3600`.
- twa/scripts/fingerprint.mjs (new) — the only way fingerprints enter assetlinks: Phase A reads the upload key with `keytool -list -v ... -storepass:env BUBBLEWRAP_KEYSTORE_PASSWORD` (password never in argv/disk); Phase B `--add <SHA>`; normalizes, validates, dedupes; `--dry-run`.
- twa/package.json + package-lock.json (new) — `@bubblewrap/cli` pinned 1.27.0 exact; scripts doctor/build/fingerprint/screenshots. Not a root dependency.
- twa/twa-manifest.json (new) — source of truth per brief (packageId, host, startUrl with utm, colors, icons, shortcuts, customtabs, no notifications/billing/location, versionCode 1 / 1.0.0, signingKey path + alias only).
- twa/app/**, build.gradle, settings.gradle, gradle.properties, gradle/wrapper/*, gradlew(.bat), store_icon.png, manifest-checksum.txt (generated) — output of `bubblewrap update --skipVersionUpgrade`, committed for reviewable diffs.
- twa/.gitignore (new) — *.jks, *.keystore, *.aab, *.apk, *.idsig, build/, app/build/, .gradle/, local.properties, node_modules/.
- twa/.gitattributes (new) — keeps twa-manifest.json / manifest-checksum.txt byte-exact (repo has core.autocrlf=true; a CRLF checkout would change the SHA-1 and make `bubblewrap build` prompt and bump the version).
- twa/README.md (new, Korean) — owner commands (keytool, build with env-var passwords), assetlinks phases, version rule, backup, device checklist.
- twa/screenshots.mjs (new) — repo Playwright + tests/e2e/serve.mjs on dist/: 8 shots 360x640@3 = 1080x1920 (PNG, JPEG q85 fallback over 500 KB), feature graphic, icon copy.
- twa/listing/feature.html, feature-graphic.png (1024x500), icon-512.png (512x512 RGBA), screenshots/01..08 (all 1080x1920, 80–245 KB).
- twa/listing/listing.ko.md (new) — title 25 / short 51 / full 1,758 chars; every live tool by name (15), on-device processing with the 배경 지우기 exception stated honestly, offline after first open, shortcuts, no sign-up/ads, 정부·외교부와 무관.
- twa/listing/play-console-answers.md (new) — Data safety, ads, IARC, audience, app access, gov/fin/health, privacy URL, appeal text; header records the live flags it was derived from.
- tests/unit/manifest.test.ts (new) — id/description/categories/shortcuts (names from tools.ts, all live), twa-manifest mirrors the shortcuts, prod URLs, no extras, checksum = SHA-1 of twa-manifest, no password field.
- tests/unit/assetlinks.test.ts (new) — one statement, package = twa-manifest packageId, every fingerprint `^([0-9A-F]{2}:){31}[0-9A-F]{2}$`, unique, `_headers` block; fingerprint.mjs normalize/parseKeytool/addFingerprint.
- tests/e2e/sw.spec.ts:80-94 — offline navigation to `/?utm_source=play&utm_medium=twa` returns home from the precache.
- tests/unit/postbuild.test.ts:866-868 — brand test exempts the package id `com.docttak.app` (identifier in assetlinks.json, never shown), like the existing storage-key exemptions.
- handoff/ARCHITECT-BRIEF-TWA.md — copy of the brief (was only in the c2 tree).

## Probes (brief "Unverified claims")
- Non-interactive generation: `npx bubblewrap update --skipVersionUpgrade < /dev/null` → "Generating Android Project. … Project updated successfully." No prompt. (Needs the icon URLs reachable; they are live.)
- Env var names (node_modules/@bubblewrap/cli/dist/lib/cmds/build.js:89-90): `BUBBLEWRAP_KEYSTORE_PASSWORD`, `BUBBLEWRAP_KEY_PASSWORD`; both must be set or it prompts.
- Template targetSdk: core/template_project/app/build.gradle → compileSdkVersion 36, targetSdkVersion 36, minSdk 21. Generated app/build.gradle has 36. (Not re-checked against developer.android.com — no web access from here; 36 is the expected 2026 requirement.)
- Astro copies the dot-dir: after `npm run build`, `dist/.well-known/assetlinks.json` exists; `dist/_headers` has the block. Pages serving it as application/json: post-deploy only (live today: 404 text/html, as the brief says).
- Affiliate links live? No: production /id-photo/ HTML has the print-links block but no `coupang` (with the flag off, src/data/affiliate.ts emits no link). → 광고 포함 = 아니요 still holds.

## Test results
- `npx vitest run`: 68 files, 1,418 tests passed (incl. 14 new). One failure on the first run (postbuild brand test hit `com.docttak.app`) fixed by the exemption above.
- `npx astro check`: 0 errors, 0 warnings, 6 hints (pre-existing).
- `npm run build` (default flags): exit 0; check-dist unchanged: "OK — 2435 files"; gen-sw 31 precached URLs.
- e2e: sw.spec + polish.spec on chromium, mobile-chrome, firefox, webkit: 217 passed, 18 skipped, 5 firefox flaky (passed on retry; parallel load). Full chromium + mobile-chrome run on the default build: 733 passed, 43 skipped, 20 failed — all in id-photo.spec.ts, all
  because that spec needs the CI flag-on build (`PUBLIC_ID_PHOTO_AUTOFRAME=1`, ci.yml:84-87; the failing page said "직접 맞추기").
  Rebuilt with the flag (check-dist OK, 2442 files) and re-ran id-photo.spec on chromium + mobile-chrome: 68 passed, 9 skipped,
  1 flaky (passed on retry). Not caused by this branch.
- Screenshots come from the default build (autoframe off), which matches production today (live /id-photo/ has no autoframe copy).

## Concerns / Open Questions
1. **Gradle build not run.** I tried `gradlew assembleRelease` (unsigned, no keystore) to prove the project compiles; the permission system denied it. So "the generated project compiles" is unverified until the owner's first `npm run build`. Risk is low (stock Bubblewrap 1.27.0 template, no edits).
2. **Screenshot 02 shows a real, identifiable person** (tests/fixtures/photo/portrait_pd.jpg, a public-domain US congressional portrait). Fine for tests, questionable for a store listing (impersonation/endorsement look). Recommend dropping 02 (7 shots remain, within 6–8) or replacing the fixture with a consented/AI-free model photo before upload. Arch decides.
3. **Data safety "앱 상호작용"**: brief says 앱 상호작용 = no, 페이지 조회 = yes, but Play has no separate page-view item; page views/taps are 앱 활동 > 앱 상호작용. Answers file says **예**. Please confirm.
4. **Delete-request question**: answers file recommends 아니요 (no account, anonymous/aggregate data). Owner/Arch confirm.
5. **Short description** keeps the draft's "파일은 폰 안에서 처리해요" (true for the three tools it names); the full description states the 배경 지우기 exception. Tighten if Arch wants zero ambiguity.
6. **Offline wording**: pages are precached, engines are cached on first use (scripts/gen-sw.mjs), and /jpg-to-pdf/, /remove-background/ pages are not precached. Listing says "한 번 연 뒤에는 … 대부분의 도구"; device checklist verifies.
7. `app/src/main/res/raw/web_app_manifest.json` is a copy of the *current live* manifest (no shortcuts/id yet). README tells the owner to run `bubblewrap update --skipVersionUpgrade` once after this branch is deployed, then build.
8. Bubblewrap passes passwords to apksigner/jarsigner on a command line wrapped in `"…"`; README asks for an alphanumeric password (quotes/`$`/`%` would break the build) and notes the env vars are terminal-only.

## Owner commands (also in twa/README.md)
PowerShell, in `twa/`:
```
npm ci
npx bubblewrap update --skipVersionUpgrade        # after this branch is deployed
$sec = Read-Host "업로드 키 비밀번호" -AsSecureString
$env:BUBBLEWRAP_KEYSTORE_PASSWORD = [System.Net.NetworkCredential]::new('', $sec).Password
$env:BUBBLEWRAP_KEY_PASSWORD = $env:BUBBLEWRAP_KEYSTORE_PASSWORD
New-Item -ItemType Directory -Force C:\Users\force\.docttak-keys | Out-Null
keytool -genkeypair -v -keystore C:\Users\force\.docttak-keys\docttak-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Docttak, C=KR" -storepass:env BUBBLEWRAP_KEYSTORE_PASSWORD -keypass:env BUBBLEWRAP_KEY_PASSWORD
npm run build                                      # bubblewrap build --skipPwaValidation -> app-release-bundle.aab
keytool -printcert -jarfile app-release-bundle.aab
npm run fingerprint                                # Phase A -> public/.well-known/assetlinks.json; commit + deploy
npm run fingerprint -- --add <Play App Signing SHA-256>   # Phase B after first upload
```

## Out of Scope (Known Gaps)
- Web Share Target / file-open intents; push; Play Billing; in-app review; iOS.
- Usage-stats app dimension (whitelist in scripts/lib/usage.mjs has no "app" value).
- Privacy page one-line app sentence (Arch ruling: current policy covers the app).
- Closed-test requirement (12 testers × 14 days) — owner checks in Play Console (E3).
- E2 (package id permanence) and E4 (ads = 예 before affiliate links go live) remain open.
- handoff/BUILD-LOG.md not edited on this branch to avoid merge conflicts with parallel work; gaps are listed here.
