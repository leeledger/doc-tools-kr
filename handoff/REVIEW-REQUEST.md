# Review Request — C2-cloud (배경 지우기 via Cloudflare; on-device stays opt-in)
Date: 2026-10-02
Ready for Review: YES. Status **DONE_WITH_CONCERNS**: not committed and not pushed (see Concerns).
Worktree `C:\dev\doc-tools\c2`, branch `c2-cloud` (from 9361850). Brief: `handoff/ARCHITECT-BRIEF-C2-CLOUD.md` §3–§11 step 4. Build notes: BUILD-LOG "C2-cloud build".

## Files Changed
**Server**
- `functions/api/remove-bg.ts` — rewritten for release.
  - Only `onRequest`: 405 / 403 (Sec-Fetch-Site) / 413 / 415 guards, then `env.BG.fetch(request)`.
  - 503 `engine` with no binding; 502 `engine` if the binding throws.
  - The spike's GET `cf.image` probe and its IMAGES fallback are gone.
- `public/spike/*` — deleted (`git rm`, staged). Copies are kept git-ignored in `spikes/c2-cloud/photos/`.
- `workers/bg/*` — unchanged.

**Flag, gate, copy**
- `scripts/lib/bgcloud.mjs` (new) — the `PUBLIC_BG_CLOUD` flag (needs `PUBLIC_BG_REMOVE` too), `privacyGate`, `EXCEPTION_RE` / `EXCEPTION_PAGES`, `API_PATH`.
- `astro.config.mjs:6,21-25,72` — the build throws on the privacy gate; adds the `__BG_CLOUD__` define. Matching declarations in `src/env.d.ts` and `vitest.config.ts`.
- `scripts/check-dist.mjs:183-210` —
  - no `spike/` in dist;
  - the privacy gate;
  - flag off: no file names `/api/remove-bg` and no page carries exception wording;
  - flag on: the wording is on exactly 4 pages, privacy has `id="bg"` and the officer, and the cloud client is not in the page's initial JS (budget 3 KB).
- `src/data/site.ts:47-53,85-96` — `PRIVACY_OFFICER`; the share preview takes og.json `cloud.description` / `cloudLine` when the flag is on.
- `src/data/legal.ts` — `PRIVACY_V1` / `PRIVACY_CLOUD`; `PRIVACY_REVISED`, `TERMS_EFFECTIVE` and `PRIVACY_TERMS_UPDATED` (sitemap) follow the flag.
- `src/pages/privacy/index.astro` — §2 title suffix, the new §3 `id="bg"` (the brief's §7.1 list plus `이용 목적`; see Open Questions), the 개인정보 보호책임자 section, and the change log. Section numbers follow the beacon and cloud flags.
- `src/pages/terms/index.astro` — the description (brief) and one §2 sentence (builder).
- `src/pages/index.astro` — the hero footnote and the bullet suffix (brief). `src/styles/global.css:85` adds `.hero-note`.
- `src/data/tools.ts:52-55,59-61,88-92` — cloud description, both FAQ answers, and a privacy link under the flag.
- `src/data/og.json`, `scripts/gen-brand.mjs:223-236,247-252` — the cloud share line and description.
- `docs/COPY.md` — new section "배경 지우기 예외" listing the exception sentences. `CLAUDE.md:13` — the approved rule change.

**Client**
- `src/lib/bgremove/cloud.ts` (new):
  - `makeCopy`: ≤1024 px, on white, JPEG q0.9; refuses APP1, empty or over-2 MB copies; returns the checked bytes.
  - `requestCutout`: one POST, no cookies, no cache, `redirect: 'error'`, 30 s timeout, no retry.
  - `readAnswer`: busy / quota / failed.
  - `decodeAlpha` / `alphaMask` / `sameShape`.
- `src/lib/bgremove/mode.ts` (new) — `docttak-bg-mode=device`, wrapped in try/catch.
- `src/tools/remove-background/bg.ts` —
  - `ready` after the pick (prefetches cloud.ts); `sendCloud`; `cloudFail` (quota goes to the C2 path through `onDevice`); `toDevice`.
  - `finish` / `cutOut` accept any mask size.
  - Retry repeats the path the photo took; 취소 while sending; the mode line.
  - All of this sits behind `__BG_CLOUD__`.
- `src/tools/remove-background/model.ts` — `ready` and `sending` phases, their moves, and `view.ready`; cancel is offered while sending.
- `src/tools/remove-background/copy.ts` — `CLOUD`: the brief's §4 and §7.3 lines plus 4 builder lines (marked).
- `src/tools/remove-background/page.astro` — flag variants:
  - the notice `#bg-notice` above the picker;
  - no `.bg-privacy` line;
  - the ready panel, the 기기에서 처리 button in the error row, and the mode line;
  - lead, 사용 방법 and 안전한 이유.
- `bg.css` — notice, mode line, `.link-btn`; the empty-row rule now handles two buttons.

**Tests and CI**
- `tests/unit/bgcloud.test.ts` (new, 52 tests):
  - Function guards and forwarding with a fake `BG`;
  - Worker with fake IMAGES and rate limits: magic bytes, 429, quota 503 vs engine 502, no-store headers, wrangler.toml;
  - privacy greps of `functions/` + `workers/bg/src/` (`caches.`, `.put(`, R2, KV, `console.`, …);
  - the encoder against a GPS-tagged EXIF JPEG and the `exif6_gps.jpg` fixture;
  - the request, the answers and the 30 s timeout;
  - mode storage, page states, the brief's copy, the flag and gate, the SW bypass;
  - the no-upload allowlist cases (a), (b) and (c) from §10.
- `tests/unit/network-guard.test.ts` — `lib/bgremove/cloud.ts` added to the fetch allowlist, plus a test pinning it to one POST to `/api/remove-bg`, imported only by bg.ts behind `__BG_CLOUD__`.
- `tests/unit/postbuild.test.ts:384-415,438-441,522` —
  - `buildEnv` follows the build's cloud state;
  - a cloud-state test, both directions, refused by check-dist;
  - the beacon test accounts for the gate;
  - `docttak-bg-mode` is an internal key.
- `tests/e2e/upload-guard.ts` (new, pure) and `tests/e2e/no-upload.ts` — the `allowUpload` fixture option, default `[]`.
- `tests/e2e/remove-background.cloud.spec.ts` (new, 9 tests × 5 browsers, page.route only).
- `tests/fixtures/bgcloud/{disc,empty}.webp`, `tests/fixtures/build-bgcloud.mjs`, `SOURCES.md`.
- `playwright.config.ts` — the `cloud-*` projects on `dist-bgcloud` (port 4183).
- `.github/workflows/ci.yml` — builds `dist-bgcloud` and runs `cloud-<project>` in every e2e job.
- `scripts/regress/bgremove-cloud.mjs` (new) and `scripts/regress/bgremove.mjs` (`--engine cloud`).
- `tsconfig.json` and `.gitignore` — `dist-bgcloud`.

## Gates (real numbers, 2026-10-02)
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 45 files, **841 passed**.
- Builds (`PUBLIC_SITE_URL=https://docttak.com`):
  - flag off → check-dist OK (2,372 files).
  - `PUBLIC_BG_REMOVE=1` → OK (controller 13.1 / 14 KB).
  - `PUBLIC_BG_REMOVE=1 PUBLIC_BG_CLOUD=1 PUBLIC_PRIVACY_OFFICER=이종림 PUBLIC_CONTACT_EMAIL=robotncoding@kakao.com` → OK (controller 13.8 / 14 KB, cloud client 1.3 / 3 KB, precache 435.8 / 450 KB).
  - Cloud on without the officer and email → the build stops with both messages.
- check-dist cross-checks: each dist checked under the other flag state fails with the expected messages. postbuild against the cloud dist: 45/45.
- `check:licenses`: OK (BG off and BG on).
- `regress:bgremove --engine cloud` (preview, 16 GT): MAE **0.00397** (≤ 0.0045), IoU **0.9645** (≥ 0.955).
- e2e (local, Playwright):
  - **cloud-chromium, cloud-firefox, cloud-webkit, cloud-mobile-chrome, cloud-mobile-safari: 45 / 45 passed**, none retried. This is the `remove-background.cloud.spec.ts` suite, 9 tests × 5 browsers.
  - **bg-chromium** (the C2 on-device spec on `dist-bg`): all passed. Together with the cloud and chromium projects: 271 passed, 14 skipped.
  - **chromium**: everything passed except 13 id-photo tests, which ran against a dist built without auto-framing. That is a gate-setup error on my side, not this change. After rebuilding with `PUBLIC_ID_PHOTO_AUTOFRAME=1` as CI does, `id-photo.spec.ts` on chromium gave 35 passed, 2 skipped.
  - **firefox, webkit, mobile-chrome, mobile-safari, bg-mobile-safari: 841 passed, 149 skipped, 4 flaky, 0 failed.** The 4 flaky tests passed on retry and are all outside this change: firefox pdf-merge bad inputs, firefox polish footer, firefox polish 목표 용량, mobile-safari pdf-compress soft limit.
  - Every test ran under the no-upload fixture. The only allowed upload is the cloud spec's `POST /api/remove-bg`.

## Open Questions
1. **Commit and push are not done.** The auto-mode classifier blocked `git commit … && git push origin c2-cloud` ("Git Destructive") and then every git command. Suggested commits:
   - (1) Function + spike removal;
   - (2) flag, gate, copy and client (`scripts/lib/bgcloud.mjs`, `astro.config.mjs`, `scripts/check-dist.mjs`, `scripts/gen-brand.mjs`, `src/**`, `docs/COPY.md`, `CLAUDE.md`, `tsconfig.json`, `.gitignore`, `vitest.config.ts`);
   - (3) tests, e2e, fixtures, CI, regress;
   - (4) handoff.
   With (2) and its check-dist in one commit, every pushed commit builds on Preview with the cloud env.
2. **Privacy section 3 has one line more than the brief: `이용 목적: 사진의 배경 지우기`.** 개인정보 보호법 제28조의8 ② 4 requires it (text in BUILD-LOG decision 4). Please confirm it counts as within the approved copy.
3. **Builder copy, for owner review** (BUILD-LOG decision 3): the ready line, 보내기를 멈췄어요, the mode line with its button, the privacy §3 opening line, the terms §2 sentence, the FAQ "누끼 따기는…" cloud answer, the page lead and 안전한 이유 / 사용 방법, and the share preview line and description.
4. **Pre-existing lines left alone** (the owner said to leave other rules):
   - CLAUDE.md:14 "No … privacy-officer lines until ads";
   - home eyebrow "파일이 밖으로 안 나가요" and section title "파일이 기기 밖으로 나가지 않습니다";
   - the approved bullet's "아래 설명", which points down while the footnote is above it.
5. Richard, please look closely at:
   - `bg.ts` `sendCloud` / `cloudFail` (run guards, the `abort` lifecycle, quota → `onDevice` from the `sending` phase);
   - `upload-guard.ts` (the allowlist must stay exact);
   - check-dist's `EXCEPTION_RE` scope.

## Out of Scope (logged in BUILD-LOG)
- The 시행령 fetch; U4 (the binding's quota error code); the phone/LTE check (§11 step 3); the weekly quota line (§8, needs the owner's analytics token); the production service binding and env (§11 step 5).
- The Function also deploys to production, where it answers 503 `engine` without `BG`. It is never called while the flag is off.
