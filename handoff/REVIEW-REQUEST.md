# Review Request — REV3 (more affiliate placements + HWP notice fixes)
Date: 2026-10-13
Ready for Review: YES
Status: DONE_WITH_CONCERNS (all gates green. Three items need an Arch ruling: the guide click counter is a separate dependency-free module, not `trackOut`; Astro writes an empty orphan chunk in stats-off builds; the PRIVACY_OUT date. See Open Questions.)
Base: 29826f0 (REV2). Nothing is committed. Brief: handoff/ARCHITECT-BRIEF-REV3.md plus the orchestrator addendum (cp-mfp, cp-scanner and cp-tripod links now exist).

## Numbers
| Build | Precache (HEAD → REV3) | Core preload 400+800 (HEAD → REV3) |
|---|---|---|
| default (prod, autoframe off) | 441.4 → 404.6 KB | 91.1 → 91.3 KB (+0.2) |
| cloud = CI dist-bgcloud env incl. `PUBLIC_AFF_COUPANG=1` | 448.7 → **412.5 KB / 450 (37.5 KB headroom)** | 91.3 → 91.5 KB (+0.2) |
| default + `PUBLIC_ID_PHOTO_AUTOFRAME=1` (e2e dist) | – → 406.8 KB | – |

- R3.0 on its own: re-running gen-sw on the HEAD cloud dist with only the R3.0 change gave 448.7 → 411.2 KB (−37.5 KB, 31 → 26 URLs: the page plus its 4 page-only chunks). The brief's T4 measurement was 35.2 KB.
- Fonts: core went from 607/608 to 609/610 characters. The two new characters are 옛 and 승, both from the brief's TRADEMARK_NOTICE wording. The links add 0 bytes: every link, lead, heading and top-line string lives in `AFF_COPY`/`AFF_LINKS`, which stripComments excludes (unit test postbuild "REV2: … adds no character"). Growth is +0.2 KB, under the 0.4 KB stop line.
- ci.yml: `PUBLIC_AFF_COUPANG: '1'` was already in the dist-bgcloud env (REV2 round 2), so R3.0's CI step was skipped as the brief allows.

## R3.1 HTML diff (id-photo, asset hashes normalised)
```
default:  < <div class="print-links" id="idp-print-links">   > <div class="out-links" id="idp-print-links">
flag-on:  < <div class="print-links" id="idp-print-links">   > <div class="out-links" id="idp-print-links">
          < <div class="print-links-ad">                      > <div class="out-links">
```
No other byte changed. The affiliate group is now `<OutLinks>`, nested inside the id-photo `.out-links` block.

## Flag-on HTML (cloud build)
pdf-merge (inside `#merge-result`, after the download row, before `#merge-next`):
```
<div class="out-links"><p>광고: 아래 링크로 주문하면 문서딱이 수수료를 받을 수 있어요. 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</p><p>종이로 내야 하면</p><ul><li><a href="https://link.coupang.com/a/hM4wFTvnPw" rel="sponsored noopener" target="_blank" data-out="cp-mfp">가정용 복합기(인쇄·스캔) (쿠팡, 광고, 새 창)</a></li></ul></div><div id="merge-next" …
```
passport-photo:
```
<h1 id="guide-title">여권사진 규격과 사이즈, 귀·눈썹·옷 기준</h1><p class="guide-aff-top">이 글에는 쿠팡 파트너스 광고 링크가 있어요. 링크로 사면 문서딱이 수수료를 받을 수 있어요.</p><div class="guide-answer-box">…
<aside class="guide-more wrap narrow" aria-label="더 보기"><section aria-labelledby="guide-out-title"><div class="out-links" data-guide="passport-photo" data-tool="id-photo"><h2 id="guide-out-title">도움이 되는 물건 (광고)</h2><p>광고: … 제공받습니다.</p><p>집에서 직접 찍고 뽑으려면</p><ul><li><a href="https://link.coupang.com/a/hM4xVunZkq" rel="sponsored noopener" target="_blank" data-out="cp-tripod">스마트폰 삼각대(리모컨) (쿠팡, 광고, 새 창)</a></li><li>…cp-backdrop…</li><li>…cp-printer…</li></ul></div></section><section aria-labelledby="guide-related-title">…
```

## dist greps
- Script tags (`<script` count) compared with HEAD:
  - Every page in both stats-off builds: equal.
  - Linkless guides in the cloud build (kakao-photo, pdf-compress): equal, 3 = 3.
  - Guides with a block in the cloud build (passport-photo, hwp-on-phone): +1, the tracker, 620 B gzip.
- Sponsored links: none on the home page, 404, pdf-compress, photo-compress, the guide index, kakao-photo or the hubs. check-dist rule (a), the e2e tests and the postbuild built-output test all check this.
- Legal comment `/*! … */`: the minifier drops it. The sentence is in no `_astro/*.js` chunk. It stays in the source files and on /licenses/ (HANCOM_NOTICE_PDF). I did not touch the minifier config, as the brief says.

## Files Changed
**R3.0 precache**
- scripts/gen-sw.mjs:49-54: `/hwp-to-pdf/` is added to NOT_PRECACHED, with a comment citing the /hwp-viewer/ precedent.
- src/sw/sw.ts:30-33: `/hwp-to-pdf/` is added to RUNTIME_PAGES.

**R3.1 / R3.2 data and component**
- src/data/affiliate.ts (rewritten):
  - AFF_LINKS: one entry per product (dest, label, href), now including cp-mfp, cp-scanner and cp-tripod with the brief's labels.
  - AFF_COPY: adds top, heading and the lead lines pdf, scan, photo-guide and backdrop.
  - TOOL_AFF and GUIDE_AFF follow the Decision 1 table.
  - TOOL_LEAD and GUIDE_LEAD give each block's lead line.
  - `affBlock(kind, tool, on, pool)`: returns null when the flag is off, when there is no block, or when 0 links are left. Dests without link data are skipped. At most AFF_MAX = 3 links.
- src/data/print-links.ts: now only the info link (`printLinks`). The affiliate part moved to affBlock and OutLinks.
- src/components/OutLinks.astro (new): `.out-links` block in this order: optional guide h2, AFF_DISCLOSURE, lead line, links. Text links only, `rel="sponsored noopener"`, new tab, `data-out`.
- src/styles/app.css:476-486: `.print-links`/`.print-links-ad` renamed to `.out-links`, including the system-font rule (fontcover reads its exemptions from this rule).
- scripts/lib/ui-font-chars.mjs:26-27: comment updated only. The exclusions already cover every new string because they all live in AFF_COPY/AFF_LINKS.

**R3.3 tool pages and counting**
- OutLinks is added on 9 more result screens. Each page computes `aff = affBlock('tool', slug, affOn(env))`. The block goes right after the download row, or at the end of the result/done area for the HWP pages, and before 이어서 하기:
  - src/pages/pdf-merge/index.astro:80
  - src/pages/pdf-split/index.astro:128
  - src/pages/jpg-to-pdf/index.astro:90
  - src/pages/pdf-sign/index.astro:142
  - src/pages/stamp-signature/index.astro:105: inside `#ss-work`, after the save name.
  - src/tools/remove-background/page.astro:148
  - src/pages/hwp-to-pdf/index.astro:70: inside `#hw-result`, after `#hw-done`, before `#hw-next`.
  - src/pages/hwpx-to-hwp/index.astro:75: inside `#hx-result`, after `#hx-done`.
  - **src/pages/hwp-viewer/index.astro:77: the result-only container is `#hw-result`. The block sits after `#hw-done` and before the toolbar `#hv-bar`.**
- src/pages/id-photo/index.astro:12-22,182-192: id-photo keeps its info link and uses `<OutLinks block={aff}/>` for the affiliate group. Its position is unchanged from REV2 (after `#idp-next`), because R3.1 is a no-behaviour-change step.
- src/lib/ui/usage.ts:
  - OutDest gains the 5 new dests.
  - The out event takes `t: UsageTool` and an optional `g`.
  - buildPayload sends g on out and, with g, sets via=guide.
  - `trackOut(root, t)` (end of file) is one delegated listener: no preventDefault, a no-op when stats are off.
- trackOut is called once per screen:
  - src/tools/{jpg-to-pdf,pdf-sign,pdf-split,stamp-signature,remove-background}/entry.ts and src/tools/pdf-merge/controller.ts, each on its result container.
  - src/tools/hwp-shared/boot.ts:62-69 on the tool root, for the 3 HWP pages.
  - src/tools/id-photo/controller.ts:693-694, which replaces the REV2 listener.

**R3.4 guides**
- src/layouts/Guide.astro:9-11,37-41,58,82-86,118:
  - `aff = affBlock('guide', g.tools[0], flag)`.
  - The `p.guide-aff-top` line comes right after the H1. There is no date row under the H1; the dates are at the end of the aside.
  - The `<section aria-labelledby="guide-out-title">` block is first in `aside.guide-more`.
  - `<GuideOutTracker/>` renders only when `aff && __USAGE_STATS__`.
- src/styles/guide.css:6-7: `.guide-aff-top` is 14 px, muted.
- src/components/GuideOutTracker.astro (new) and src/lib/ui/guide-out.ts (new): see Open Question 1.

**R3.5 server whitelist and admin**
- scripts/lib/usage.mjs:
  - :16-18: header doc.
  - :82: `ONLY.g = ['arrive', 'out']`.
  - :86-119: TOOL_OUT, GUIDE_OUT, `outDests` (guards against prototype keys) and OUT_DESTS with 9 kinds.
  - :209-210: validate; an out with g must match GUIDE_OUT[t], an out without g must match TOOL_OUT[t].
  - :237: the outs SQL adds `blob2 AS tool, blob7 AS guide`.
  - :370-386: OUT_LABELS for the new dests and OUT_GUIDE_PLACE.
  - :519-539: shapeUsage builds tool rows with the share of that tool's own successes, then guide rows summed with share `-`.
  - The table "상품·사진관 링크" has the columns 자리 / 링크 / 누른 횟수 / 저장 성공 대비(%).
- scripts/lib/admin-view.mjs:164,342: the numeric columns are now [2, 3]. The note text is unchanged.

**R3.6 check-dist**
- scripts/lib/out-links-check.mjs (new; replaces print-links-check.mjs):
  - (a) An allowlist from the placement maps. A sponsored link is allowed only on a tool page whose slug is in TOOL_OUT, or on a /guide/ page whose first 바로 쓰는 도구 link is in GUIDE_OUT, and only with a dest of that screen. Every No-block page fails.
  - (b) Uses the innermost `.out-links` block.
  - (c) Unchanged, plus rel is matched case-insensitively (Richard's REV2 appendix).
  - (d) AFF_COPY.top must come before the first h2 and must not appear in `<head>`.
  - (e) Flag off: no Coupang link and no sponsored link. Flag on: id-photo has exactly 3 Coupang links. The embed ban stays.
- scripts/check-dist.mjs:13,19,405-410: wiring.

**R3.7 privacy**
- src/data/legal.ts:16-22,29-34:
  - PRIVACY_OUT_ID_PHOTO = 2026-10-12, the REV2 change-log line.
  - PRIVACY_OUT = 2026-10-13, for REV3.
  - PRIVACY_TERMS_UPDATED = 2026-10-13.
- src/pages/privacy/index.astro:102,117-118: the list sentence now reads 「도구 결과 화면과 안내 글의 상품·사진관 링크를 눌렀는지(링크 종류와 화면 이름만)」, and there is a new change-log line (existing glyphs only).

**R3.8 HWP**
- src/data/hwp-notice.ts (new): TRADEMARK_NOTICE (new wording), HANCOM_NOTICE_PDF and HWPX_STANDARD. They live under src/data, which is in core font scope. If they stayed in src/tools/hwp-shared/messages.ts, check-dist would fail with 옛승 outside the core font, and adding messages.ts to CORE_PATHS would pull every error string into core. messages.ts re-exports all three, so imports are unchanged.
- src/tools/hwp-shared/messages.ts:1-2,12-13; src/tools/hwp-to-pdf/controller.ts:1; src/tools/hwp-viewer/app.ts:1-2; src/tools/hwpx-to-hwp/controller.ts:1-2: the `/*! HANCOM_NOTICE_PDF */` legal comment. Line 1 keeps the existing `// HANCOM_NOTICE` comment that hwp-notice.test pins.
- src/pages/licenses/index.astro: HANCOM_NOTICE_PDF next to HANCOM_NOTICE.
- src/pages/hwp-viewer/index.astro and src/pages/hwpx-to-hwp/index.astro: `<p>{HWPX_STANDARD}</p>` first in the 도움말 section.

**R3.9 docs**
- docs/OPS-RUNBOOK.md §10: where the links show (table), adding a link is one AFF_LINKS line, what to do when a link dies, and turning links off (unchanged).
- docs/REVENUE-MODEL.md §1: row 2 status.
- docs/COPY.md: the REV2 exception line now also covers the top line, the heading and the lead lines.

**Tests**
- tests/unit/affiliate.test.ts (renamed from print-links.test.ts):
  - maps, labels, affBlock (flag off, no block, missing dests skipped, max 3);
  - TOOL_OUT == TOOL_AFF + photo-studio, GUIDE_OUT == GUIDE_AFF (drift guard);
  - OUT_DESTS and their labels.
- tests/unit/guide-out.test.ts (new):
  - guide-out == usage.ts on path, cap, device, weight and payload (same JSON as buildPayload for every GUIDE_OUT pair, and validate accepts it);
  - the listener: no preventDefault, link kind only, sampling, cap, a throwing send.
- tests/unit/usage.test.ts:969-: validate for every TOOL_OUT and GUIDE_OUT pair. These are rejected: a tool-only pair with g, a guide-only pair without g, a screen without a block, a prototype key, a bad g. Also buildPayload with g, the outs SQL, shaping (tool share, guide rows, drops), and the six-query and markdown snapshots.
- tests/unit/admin-view.test.ts and `__snapshots__/admin-full-7.html`: the new table title and columns.
- tests/fixtures/usage-rows.mjs: outs rows carry tool/guide.
- tests/unit/postbuild.test.ts:
  - :525-640: fixtures for (a)-(e), including every No-block page, hubs, a size guide, the innermost block, the head leak and the count of 3.
  - :775-819: privacy lines, plus REV3 blocks in the build (flag-aware: the pdf-merge position and markup, passport-photo top line and aside).
- tests/unit/hwp-tool.test.ts, tests/unit/hwp-notice.test.ts: notice pins and the legal-comment check.
- tests/unit/pdf-password.test.ts: NOT_PRECACHED('/hwp-to-pdf/').
- tests/unit/ga.test.ts: privacy lastmod 2026-10-13.
- tests/unit/network-guard.test.ts: guide-out.ts added to the sendBeacon allowlist.
- tests/e2e/usage.spec.ts:444-525 (cloud projects, flag on):
  - pdf-merge: block hidden until a result, inside the result before 이어서 하기, disclosure first, axe, the popup opens the stubbed href, one beacon `{e:out,t:pdf-merge,o:out,v:cp-mfp,via:direct}`.
  - pdf-sign: beacon `{t:pdf-sign,v:cp-stamp}`, no URL in the body.
  - passport-photo: top line right under the H1, smaller than the answer, not in meta/og/JSON-LD; the aside's first section; axe; one beacon `{e:out,t:id-photo,o:out,v:cp-backdrop,g:passport-photo,via:guide}`.
  - No-block screens: pdf-compress, photo-compress, kakao-photo, /guide/, /, 404.
  - The REV2 tests were updated for the class change and the privacy text.
- tests/e2e/site.spec.ts:293: the default build has no block, sponsored link or top line anywhere (tools, HWP pages, guides).
- tests/e2e/sw.spec.ts:80: /hwp-to-pdf/ is not in the precache list. After one controlled online visit and a conversion, it reloads and converts offline.
- tests/e2e/hwp-{to-pdf,viewer}.spec.ts, hwpx-to-hwp.spec.ts: TRADEMARK pins.

## Test results
- vitest (PUBLIC_ID_PHOTO_AUTOFRAME=1, as in REV2): **1,415/1,415**. One caveat: postbuild "plain language" walks every chunk and takes 60-95 s on this machine, over the 60 s default timeout. It also times out against the HEAD dist, so it is environmental. It passes with `--testTimeout=400000`.
- `astro check`: 0 errors.
- check-dist: OK on the default, cloud flag-on and autoframe builds.
- postbuild on the cloud flag-on dist: 71/72. The one failure is "plain language" on GA privacy text (「브라우저」 in the GA section). It is identical at HEAD (base-cloud privacy has the same sentence) and is not REV3.
- e2e, cloud projects × 5, usage.spec: **83 passed**, 1 flaky (firefox CHAIN, passed on retry), 6 skipped (existing WebKit skips).
  - The first run served a stale build from another server on the default port 4183: 27 "failures", all on the REV2/REV3 tests. I re-ran on private ports (E2E_PORT=5273, E2E_CLOUD_PORT=5283). **If another builder runs e2e at the same time, use private ports.**
- e2e, default projects × 5, site, sw, growth, hwp-to-pdf, hwp-viewer and hwpx-to-hwp: all passed apart from flaky and skipped tests. 3 flaky (firefox goto timeouts, passed on retry). The REV3 site and sw tests passed on all 5 projects; mobile-safari skips the sw test by design.
- e2e id-photo.spec × 5 on the autoframe build (as CI builds dist): 168 passed, 1 flaky (firefox), 26 skipped. The first run on a non-autoframe dist failed 49 tests (MediaPipe expected). That was a harness setup mistake on my side, not a regression.
- LHCI on the cloud flag-on build (5 runs, median):

  | Page | LCP (ms) | LCP element |
  |---|---|---|
  | /guide/passport-photo/ | 1,669 | the answer paragraph, not the top line |
  | /guide/hwp-on-phone/ | 1,668 | the answer paragraph |
  | /guide/pdf-merge/ | 1,666 | the answer paragraph |
  | /pdf-merge/ | 1,816 | – |
  | /hwp-to-pdf/ | 1,661 | – |
  | /id-photo/ | 1,813 | – |

  - CLS ≤ 0.0003 everywhere. Performance, a11y, BP and SEO assertions pass.
  - The only failed assertion is `resource-summary.script.size`. The cloud build has GA on (gtag), which is not REV3: the CI LHCI runs on the default build.
- check:quotes: **not run**. REV3 changes no guide claim, source or quote; only the layout adds the line and the block. It fetches government sites, so I skipped it.

## Open Questions
1. **Guide click counter: a twin module instead of `trackOut` (Arch ruling).** check-dist allows a guide 4 KB of initial JS.
   - Importing `trackOut` statically pulls the `ui-shared` manual chunk into every guide with a block: 8.7 KB gzip, so check-dist fails.
   - `import()` of usage.ts on the first click is worse. Rolldown builds a namespace object for a module inside a manual chunk, and the helper lives in `export-chunk`. The guide's static closure became 354.9 KB.
   - I built `src/lib/ui/guide-out.ts` instead. It has no runtime imports and sends only the guide's own out event, at 620 B gzip.
   - Drift is covered by tests/unit/guide-out.test.ts: the same JSON as `buildPayload`, the same weight, device rule, cap and path, and validate accepts every GUIDE_OUT pair. The cloud e2e also asserts the exact beacon.
   - The alternative is to keep `trackOut` and raise the guide initial-JS budget to about 9 KB, only for flag-on, stats-on guides with a block. That is your call; I did not touch the budget.
2. **Astro emits the GuideOutTracker chunk in every build.** It has the conditional-render behaviour the brief flagged. No page references it unless rendered, and the script-tag counts equal HEAD. In stats-off builds it is a 0-byte file: `if (__USAGE_STATS__)` drops the code, so check-dist's "no sendBeacon while off" rule passes. I did not use the site.ts fallback because it would put the preload helper, and with it ui-shared, on every page.
3. **PRIVACY_OUT = 2026년 10월 13일** (the expected REV3 deploy date). Please re-confirm it at the deploy gate, like PRIVACY_GA. PRIVACY_TERMS_UPDATED is 2026-10-13 to match.
4. Commits: I was told not to commit. The brief wants R3.0 and R3.1 as separate commits:
   - R3.0 = gen-sw.mjs, sw.ts, pdf-password.test.ts and the sw.spec.ts REV3 test.
   - R3.1 = the class rename and OutLinks: app.css, the id-photo page and controller, print-links.ts, OutLinks.astro, and the postbuild/usage.spec class pins.
   - Everything else is the REV3 commit.
5. The id-photo block stays after 이어서 하기 (REV2 position, R3.1 no-change). The 9 new screens place theirs before 이어서 하기, as Decision 4 says. Should id-photo move too?
6. check-dist (a) is an allowlist derived from the placement map, not a hard-coded denylist. It is stricter: any screen outside the table fails. The No-block pages are covered one by one in the fixtures.

## Out of Scope (logged in BUILD-LOG)
- e2e port collisions between worktrees: default ports 4173 and 4183 are reused by `reuseExistingServer`.
- postbuild "plain language" runtime close to the 60 s timeout on Windows.
- The GA-build privacy text trips the plain-language test (pre-existing; GA builds are not in the CI checks job).
