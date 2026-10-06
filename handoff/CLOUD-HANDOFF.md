# 문서딱 — cloud handoff (2026-09-30)

Read this first in any new session (local or cloud). It supersedes `SESSION-CHECKPOINT.md`.

## 1. What is live (main)
- https://docttak.com, served from `main` via Cloudflare Pages project `doc-tools-kr`.
- The five tools are live: `/pdf-merge/`, `/pdf-compress/`, `/photo-compress/`, `/id-photo/` (manual framing only) and `/hwp-to-pdf/` (still the old print-to-PDF flow).
- Also live: `/privacy/`, `/terms/`, `/licenses/`, `/offline/`, 404.
- Polish Q is live: plain-language copy, the 문서딱 brand, per-page OG images, the josa helper and the keyword home title (`HOME_TITLE` in `src/data/tools.ts`).
- Every step shipped so far went through Arch → Bob → Richard → push → live smoke test. History is in `handoff/BUILD-LOG.md`, reviews in `handoff/REVIEW-FEEDBACK.md`, audits in `docs/UX-AUDIT-1.md` and `docs/UX-AUDIT-2.md`.

## 2. Open branches (work in progress — NOT on main)
| Branch | What | Spec | State |
|---|---|---|---|
| `hwp-direct` | HWP → PDF as a **direct download**: in-page vector PDF writer (pdf-lib + @cantoo/fontkit), per-page raster fallback, no print dialog, no page/title swap. Also relaxed equation routing, early engine fetch, plain HWP copy, `.woff` + Noto fallback fonts. | `SPIKE-HWP-DIRECT.md` (on the branch) | Bob mid-build; see BUILD-LOG "HWP direct — WIP state" on the branch |
| `growth-g` | Traffic step: `/guide/*` pages with official sources, deep links (`?preset=`, `?target=`), share/copy buttons, RSS, IndexNow script, sitemap lastmod, `docs/GROWTH-RUNBOOK.md` | `handoff/ARCHITECT-BRIEF-GROWTH.md` | Bob mid-build; see BUILD-LOG "Growth G — WIP state" on the branch |

**Snapshots pushed 2026-09-30 (uncommitted work at that moment, not reviewed):** `growth-g-wip` (Growth G working tree on top of a01af5e) and `hwp-direct-wip` (HWP direct working tree on top of `hwp-direct` a4f8abd). If `growth-g`/`hwp-direct` later appear with a newer 'WIP state' commit from the builders, prefer those; otherwise continue from the `-wip` snapshots.


**Update 2026-10-01:** `hwp-direct` = 1aa8874 (builder's WIP commit; BUILD-LOG 'HWP direct — WIP state' lists done/left; known blocker: with PUBLIC_ID_PHOTO_AUTOFRAME=1 the SW precache hits 1,235 KB because rolldown places its runtime helper in the HWP export chunk — fix idea: make the export chunk a tiny entry that dynamically imports the writer). `hwp-direct-wip` is obsolete. `growth-g-wip` = 2c8e4a0: the Growth G builder was cut off by the weekly usage limit while 'rebuilding both dists' — its WIP-state notes were NOT written; first step in a new session: diff it against a01af5e, list what exists vs ARCHITECT-BRIEF-GROWTH.md, then run all gates.

**Merge order:**
1. Finish `hwp-direct`, then Richard review, then merge to main and deploy.
2. Rebase or merge `growth-g` on the new main, finish it (including the two HWP guides it held back), then Richard review, then merge and deploy.

Expect conflicts in `src/data/tools.ts`, `scripts/check-dist.mjs` budgets, `licenses.manifest.json`, `handoff/BUILD-LOG.md` and the e2e lists. Keep both sides.

## 3. Deploy gate (every step)
1. Build with `PUBLIC_SITE_URL=https://docttak.com`. Run all gates: check, unit, check-dist, licenses, e2e with no-upload, axe, Lighthouse, qa:visual, and regress with `--fixtures-only` in the cloud. Lighthouse: median of 5 runs per URL (`numberOfRuns: 5`), thresholds unchanged; the CI runner's result is the source of truth (Arch, G2 A0). Any deploy that adds or edits a guide quote also runs `npm run check:quotes` (network; every quote verbatim with whitespace runs folded to one space, exit 1 otherwise; G2 A1 review).
2. Richard writes "clear" in REVIEW-FEEDBACK.
3. Commit and push `main`. Cloudflare builds in about 1–2 minutes, and the live `<meta name="build-id">` shows the commit.
4. Run the live smoke test (§6).
- If Cloudflare fails with "error occurred while fetching repository", it is transient: push an empty commit or use Retry in the dashboard.

## 4. Infrastructure facts
- **Cloudflare Pages:**
  - Build command `npm run build`, output `dist`. Node 22 comes from `.node-version` plus env `NODE_VERSION=22`.
  - Production env: `PUBLIC_SITE_URL=https://docttak.com`, `PUBLIC_NAVER_SITE_VERIFICATION=f3147822a9c0cfda42200344f9e2206b92c91ffd`.
  - Flags: `PUBLIC_ID_PHOTO_AUTOFRAME` defaults to `0` (manual only). Ads are off. The error beacon is retired (`PUBLIC_ERROR_BEACON_PATH` set = build error); anonymous usage statistics ship off until the owner sets `PUBLIC_USAGE_STATS=1` (docs/OPS-RUNBOOK.md §8).
- **Free-plan limits (verified):** static requests and bandwidth are free and unlimited. 20,000 files per site (we use about 1,250; check-dist fails at 15,000). 25 MiB per file. 500 builds a month. Pages Functions (`public/_routes.json`: `/api/*`, `/admin`, `/admin/*` only; static pages never run one): `/api/remove-bg`, `/api/usage` and `/admin/` share the Workers Free 100k requests/day. `PUBLIC_USAGE_SAMPLE` lowers the usage share if that gets close; watch the weekly report.
- **Domain:**
  - `docttak.com` is registered at hosting.kr, with nameservers on Cloudflare (ada/vicente).
  - Pages custom domains: `docttak.com` and `www.docttak.com`.
  - Account Bulk Redirect `pages_dev_to_docttak`: `doc-tools-kr.pages.dev/*` → `https://docttak.com/*` with 301, keeping path and query.
- **Search:**
  - Google Search Console: domain property `sc-domain:docttak.com`, verified by DNS TXT (do not delete that TXT record). `https://docttak.com/sitemap.xml` has been submitted.
  - Naver 서치어드바이저: `https://docttak.com` verified (meta tag plus `public/naverab73ee2e778ed2f0eea14328733b50c9.html`). Sitemap submitted, and a crawl was requested for the home page and the 5 tools.
  - 2026-10-01 (A0 ship, daad867): Naver crawl, GSC 색인 생성 요청 and Kakao cache reset done for /hwp-viewer/ and the 3 HWP guides. Naver's crawl field only accepts the **full URL typed key by key** (Playwright `pressSequentially('https://docttak.com/…')`); `fill` or a bare path is silently ignored. In Git Bash set `MSYS_NO_PATHCONV=1` or `/path/` args become Windows paths.
  - Cloudflare zone Caching → Browser Cache TTL is **Respect Existing Headers** (was 4 hours, which overrode `sw.js` `no-cache`; fixed 2026-10-01). If smoke:assets flags sw.js cache-control again, check this setting first.
  - Kakao share cache was cleared for the home page and the 5 tools on 2026-09-30. Clear it again for new URLs at developers.kakao.com → 도구 → 공유 디버거.

## 5. Local-only things (not in git)
- **Corpora:** `spikes/` is git-ignored and exists only on the owner's PC.
  - Contents: the HWP 120-file corpus, the PDF corpus and the photo corpus.
  - Cloud sessions can run regress with the committed fixtures only (`--fixtures-only`, or the harness's fixture mode).
  - Full-corpus regress, required before shipping `hwp-direct`, must run on the owner's PC with `CORPUS_DIR=…\spikes\hwp\corpus`. Otherwise record the gap in BUILD-LOG.
- **Browser automation:** dashboard work (Cloudflare, Search Console, Naver, Kakao, hosting.kr) was done through the owner's logged-in Chrome on the PC with the `chrome-cdp` tool. A cloud session cannot do this. Leave those items to a PC session or to the owner.

## 6. Live smoke test after each deploy
- `npm run smoke:assets -- https://docttak.com` must report OK.
- Drive each changed tool on the live site with Playwright (Chrome/Edge/Firefox/WebKit plus Pixel/iPhone emulation) and check the output: pages, bytes, dimensions, and 0 console errors, 0 non-GET or off-site requests.
- After Growth G, run `npm run ping:indexnow -- <changed urls>`, then request a Naver crawl for new pages (PC session).

## 7. Next steps (in order)
1. Finish and ship `hwp-direct` (§2).
2. Finish and ship `growth-g`. Publish only guides with fetched official sources; drafts stay drafts.
3. After Growth G ships: Kakao cache refresh for the guide URLs, a Naver crawl request, and an IndexNow ping.
4. UX-AUDIT-2 leftovers: P1-3, P1-4, P1-7, P1-8, P1-9 and the P2 list (see BUILD-LOG "Polish Q status").
5. Weekly growth checklist per `docs/GROWTH-RUNBOOK.md`, once it lands with Growth G.

## 8. Owner-only (cannot be done by the agent)
- Real-device checks: iPhone Safari 16.4+ and the KakaoTalk in-app browser, covering photo compress, id-photo, HWP download and font weights; plus one mid-range Android.
- Before ads: a service contact email (e.g. a kakao.com mailbox like 아이로그 uses) and a privacy-officer name. Then build a full privacy policy.
- The ID-photo auto-frame licence decision (Eigen MPL2-only proof, fft2d/Ooura licence). Until then it stays manual-only.
- Logins and captchas for any dashboard.

## 9. Resume prompt
"Read CLAUDE.md and handoff/CLOUD-HANDOFF.md. Check out `hwp-direct`, read its BUILD-LOG 'HWP direct — WIP state' and SPIKE-HWP-DIRECT.md, finish the build, run all gates, then run Richard's review. Follow §3 to ship. Then do the same for `growth-g`. Never stop, never ask; log decisions."
