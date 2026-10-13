# Review Request — REV5 (free embed widget: 증명사진 규격 맞추기)
Date: 2026-10-13
Ready for Review: YES
Status: DONE_WITH_CONCERNS (gates green locally after the rebase onto origin/main. Still open: the Cloudflare detach is proven only against our e2e server's model of it, not on a real preview deploy; the /terms/ 11항 wording waits for the owner. The orchestrator accepted the script-tag move, the click-to-open preview, the /embed/id-photo/* path and the new-tab privacy link; no discovery link on /id-photo/ for now.)
Base: origin/main 8881a39 (rebased 2026-10-13: GROWTH3, EN0, TWA 1-2, pdf-sign/pdf-split settled() fixes). Nothing is committed (WIP commit, rebase, soft reset). Brief: handoff/ARCHITECT-BRIEF-REV5.md.

## Numbers
| Build | Precache (origin/main → REV5) | Core preload 400+800 |
|---|---|---|
| default (autoframe off) | 407.2 → 407.3 KB (26 URLs both) | unchanged: same font files (identical hashes CCBcVdxZ / DoHqrJ1r) |
| cloud flag-on (CI dist-bgcloud env incl. `PUBLIC_AFF_COUPANG=1`) | 415.2 → **415.3 KB / 450** | unchanged (FpeITnRd / DPPwuzGm) |
| default + `PUBLIC_ID_PHOTO_AUTOFRAME=1` (e2e dist) | – → 409.5 KB | unchanged |

Before the rebase (base f0082d4) the same deltas were 404.6 → 404.7 and 412.5 → 412.7 KB. After the rebase the /id-photo/ comparison was rerun against fresh origin/main builds (default and cloud flag-on): the page script moved from after `</html>` to right after the tool section, otherwise identical.

- The +0.1-0.2 KB is file names only: the shared CSS file is now `anolim-ui-800.*.css` instead of `Base.*.css` (same bytes, same hash) in every precached page, and /id-photo/ names `IdPhotoTool.astro_astro_type_script…` instead of `index.astro_astro_type_script…`. /embed/ and /embed/id-photo/ are never precached (NOT_PRECACHED prefix; unit + postbuild tests).
- Core characters: 0 new. Every non-ASCII character outside comments in the REV5 files is in HEAD's core set (`uiCharSets` on HEAD's src); the built font files have the HEAD hashes in default and cloud. Three draft words (붙, 좁, 째) were reworded to existing glyphs before building.
- Lighthouse (local, 5 runs each, default build, median LCP): /id-photo/ HEAD 1,664 → REV5 1,668 ms; /embed/ 1,667 ms; CLS ≤ 0.0003; performance/accessibility/SEO/best practices 1/1/1/1.
- Discovery link from /id-photo/ (Decision 6): **not added**. It would change /id-photo/ HTML again and every flag-on precache byte; headroom is 34.7 KB if Arch wants it. /embed/ is reachable from the sitemap, llms.txt and the terms 11항 link.

## R5.1 proof: /id-photo/ unchanged except one script tag (Open Question 2)
Against a HEAD build of the same env, normalising asset names (`/_astro/<name>.<hash>.(js|css)`) and the build id:
```
R5.1 alone (script still in the page), default:  raw identical: true 22501 22501   (byte for byte, hashes included)
R5.1 alone, cloud flag-on:                        raw identical: true 23534 23534
final REV5, default and cloud flag-on:
  HEAD: page script after </html> | REV5: right after the tool </section> | otherwise identical: true
  ~ /_astro/Base.B7L20Z2Y.css -> /_astro/anolim-ui-800.B7L20Z2Y.css   (same content hash; name only)
  ~ /_astro/index.astro_astro_type_script_index_0_lang.*.js -> /_astro/IdPhotoTool.astro_astro_type_script_index_0_lang.*.js
```
R5.1 is not a separate commit (I do not commit); the R5.1-only state is `IdPhotoTool.astro` + the page change with the script left in the page. The CSS file is named after its first module because Embed.astro imports the same three stylesheets. Initial JS /id-photo/ is 12.4 KB (default) / 13.2 KB (cloud), as at HEAD.

## Preview probe (local, tests/e2e/serve.mjs on dist-bgcloud; NOT a Cloudflare preview)
```
== /embed/id-photo/
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors *
X-Robots-Tag: noindex
== /id-photo/
Content-Security-Policy: default-src 'self'; script-src 'self' https://www.googletagmanager.com 'wasm-unsafe-eval'; … frame-ancestors 'none'
== /embed/
Content-Security-Policy: … frame-ancestors 'none'
```
Cloudflare doc (developers.cloudflare.com/pages/configuration/headers, "Detach a header"): "You may wish to remove a default header or a header which has been added by a more pervasive rule. This can be done by prepending the header name with an exclamation mark and space (`!` )." Also: "If a header is applied twice in the `_headers` file, the values are joined with a comma separator." serve.mjs now models both (join with ", ", detach drops the earlier value), so a missing detach shows up as two policies and a refused frame (unit test "without a detach both policies are sent").

## Files Changed
- src/components/IdPhotoTool.astro:1-205 — (new, R5.1) the tool body moved verbatim from the page; `embed` drops the 인화·사진관/affiliate block, Share, #idp-next and the AdSlot, and opens the privacy link in a new tab; 199-205 the entry script, here so both pages load one script file.
- src/pages/id-photo/index.astro:1-81 — imports reduced; `<IdPhotoTool />` replaces the section; its own `<script>` removed.
- src/tools/id-photo/controller.ts:138-139,169,662 — #idp-next is optional (absent in the widget); hide/show only when present.
- src/layouts/Embed.astro:1-65 — (new) minimal layout: same CSS and the two core preloads, noindex + canonical to the tool, full og/twitter set from the tool's share preview, no site script (no SW, menu or share), no GA/beacon, credit footer `문서딱 제공` → `/id-photo/?via=embed` (new tab) + `파일은 이 기기 밖으로 나가지 않아요.`
- src/pages/embed/id-photo/index.astro:1-15 — (new) the widget page: hidden h1, `<IdPhotoTool embed />`.
- src/pages/embed/index.astro:1-98 — (new) info page: what/who, the snippet in `<pre><code>`, 코드 복사 (clipboard, else selects the code; status text from data attributes), 조건, white-label line + mailto when PUBLIC_CONTACT_EMAIL is set, terms link, preview on demand (「미리 보기 열기」 makes the frame; without JS the link opens the widget); `.prose guide-page` (system-font selector already in app.css); inline style attributes, no page stylesheet.
- src/data/embed.ts:1-20 — (new) `embedSnippet(site)` (the brief's two lines, absolute on Astro.site), EMBED_HEIGHT, EMBED_UPDATED.
- public/_headers:7-10 — `/embed/id-photo/*`: `! Content-Security-Policy`, the site policy with `frame-ancestors *` (everything else identical), `X-Robots-Tag: noindex`.
- scripts/lib/csp.mjs:1-22 — (new) `extendSiteCsp`: transforms only the CSP line of the `/*` block, null unless exactly one there (the "exactly one line" helper; REV4 should reuse it).
- scripts/lib/analytics.mjs:4,21-24 / scripts/lib/ga.mjs:5,30-39 — withAnalyticsCsp / withGaCsp go through extendSiteCsp (same error messages).
- scripts/lib/csp-connect.mjs:8-9 — its probe policy gets a `/*` line (the generators now need the block).
- scripts/lib/embed-check.mjs:1-84 — (new) `embedPageProblems` (noindex, canonical = tool, no sponsored/Coupang/data-out/share/next-steps/ad-slot, no GA tag, no beacon, no `serviceWorker` in its initial JS, not in the sitemap) and `embedHeaderProblems` (/* keeps 'none'; exactly one framing block, a widget block, detach before its policy, policy = site policy except frame-ancestors *, noindex).
- scripts/check-dist.mjs:20,90-91,111,133-145 — the widget is exempt from "every page has the GA tag / beacon" and gets the R5.7 rules; _headers is checked (the pre-gen-headers copy).
- scripts/gen-sw.mjs:52-55 — NOT_PRECACHED += the `/embed/` prefix.
- scripts/lib/bgcloud.mjs:62-64 — LOCAL_SCOPE_RE += `embed/index.html`, `embed/id-photo/index.html` (their "never leaves" claims are about the id-photo tool; the cloud build failed without it).
- src/lib/ui/usage.ts:43,101-105 — Via += 'embed'; `arrival()` returns via=embed and no arrive for any `/embed/` path (path only; the referrer is not read there).
- scripts/lib/usage.mjs:20,48,458,547,576-580 — VIAS += embed; per-tool embed success/fail; the weekly via table gains 「다른 누리집」.
- scripts/lib/admin-view.mjs:168-169 — admin via section 「어디서 왔는지에 따른 성공률」 with the 「다른 누리집」 column.
- src/pages/privacy/index.astro:5,103,117 + src/data/legal.ts:23-36 — the usage list gains 「다른 누리집에 넣은 도구에서 쓴 것인지」; PRIVACY_EMBED (2026-10-13, history line, 시행일 in usage builds); TERMS_EMBED 2026-10-20 (11항 only; the page-top 시행일 stays TERMS_EFFECTIVE).
- src/pages/terms/index.astro:4,44-47 — 11항 「다른 누리집에 넣어 쓰기」 (DRAFT, owner approval).
- src/pages/sitemap.xml.ts:5,19-20 / src/pages/llms.txt.ts:25-28 — /embed/ listed; the widget never.
- lighthouserc.json:23 — /embed/ added.
- tests/e2e/serve.mjs:34-74 — `! Name` detach and comma-join, like Cloudflare; `headersFor` exported with a return type.
- tests/e2e/host-page.ts:1-40 — (new) a loopback host site on localhost (another site than 127.0.0.1) serving one iframe. A page.route stub does not work: Chromium refuses the frame (net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS).
- tests/e2e/embed.spec.ts:1-210 — (new) see Tests.
- tests/e2e/usage.spec.ts:13,26,287-314,426-431 / tests/e2e/ga.cloud.spec.ts:14-15,97 — the widget in a host frame sends pick/start/success/download, all via=embed, with no host in any body; privacy expectations follow PRIVACY_EMBED.
- tests/e2e/site.spec.ts:148-150 — sitemap list + /embed/, never /embed/id-photo/.
- tests/unit/embed.test.ts:1-178 — (new) snippet, headers, CSP extensions, extendSiteCsp, serve.mjs semantics, check-dist rules, precache, via=embed, admin column.
- tests/unit/usage.test.ts, admin-view.test.ts, __snapshots__/admin-full-7.html, ga.test.ts:64-65, bgcloud.test.ts:423-424, postbuild.test.ts:842-859,913-921 — the new column/title, two CSP lines, LOCAL_SCOPE, a REV5 built-output test; the plain-language check skips `<pre>` code blocks (the snippet's `max-width:720px` is code, not prose).
- docs/OPS-RUNBOOK.md:145-154 (§12) / docs/REVENUE-MODEL.md:17 — runbook section; status "W: 구현(REV5)".

## Tests
- vitest 1,428/1,428 on the default dist. One run showed 1 failure in ga.test "GA-on build": it builds from public/, and public/vendor still held the MediaPipe files of the previous autoframe build; after `copy-vendor` in the default env it passes (environment, not code).
- astro check: 0 errors.
- check-dist OK: default, cloud flag-on, autoframe, noauto.
- e2e embed.spec.ts on 5 projects (11 tests each; the clipboard test is Chromium-only by design): cross-origin frame flow with a download event and the JPEG checked (413×531), blocked localStorage/IndexedDB in the frame, no SW registration (serviceWorkers allowed), framed /id-photo/, / and /embed/ refused, the widget's single policy + noindex, axe (widget alone, widget in a frame, /embed/), the exact snippet, copy and copy fallback. Totals for the full runs: BUILD-LOG REV5.

## Open Questions
1. **Owner approval: /terms/ 11항 wording** (draft, round 2): 「여권·증명사진 규격 맞추기 도구는 다른 누리집에 무료로 넣어 쓸 수 있습니다(넣는 방법). 넣어 쓸 때는 도구 아래의 「문서딱 제공」 링크를 지우거나 가리지 말아 주세요. 넣어 쓰는 도구에도 이 약관이 적용되며, 운영자는 이 기능을 바꾸거나 멈출 수 있습니다. 로고를 바꾸거나 문서딱 표시를 빼려면 운영자에게 메일로 문의해 주세요. 이 항은 2026년 10월 20일부터 시행합니다.」 plus a new 「변경 이력」 list: 「2026년 10월 20일: 11항(다른 누리집에 넣어 쓰기)을 더함」. The page-top 시행일 is unchanged (2026년 9월 30일; 2026년 10월 2일 in the cloud build). TERMS_EMBED = deploy + 7 days (9항); PRIVACY_EMBED and the sitemap lastmod use 2026-10-13: re-confirm at the gate.
2. **/id-photo/ script tag moved (Arch ruling; deviation from "byte-identical"):** with a `<script>` in each page, both importing `entry.ts`, Rollup made entry.ts its own chunk and the /id-photo/ script a 28-byte `import"./entry.….js"` wrapper. The HTML stayed byte-identical, but Lighthouse LCP on /id-photo/ went 1,664 → 1,822 ms (local median). Tried and dropped: a dynamic import from the widget (the export chunk joined the /id-photo/ initial closure, 358 KB, check-dist failed); a manualChunks rule (this Vite pulled ui-shared modules into it and five tool controllers went over budget). Chosen: the script lives in IdPhotoTool.astro, so both pages load one file. Cost: the /id-photo/ tag moves from after `</html>` (where Astro put the page script) to right after the tool section; everything else is identical (proof above); LCP 1,668 ms. Untried alternative: a `?embed` query import (keeps the HTML byte-identical, duplicates entry.ts into the widget, needs a module-declaration hack).
3. **Header pattern deviation:** the brief says `/embed/*`, but Cloudflare's splat also matches `/embed/` itself, which would make the indexable info page framable and noindex. The block is `/embed/id-photo/*`; check-dist accepts only `/embed/<tool>/*` framing blocks. A second widget adds one block.
4. **Detach on Cloudflare not proven:** the docs show detach in a narrower rule; they do not show detach + re-add in the same block. Please curl a preview deploy (`curl -sI <preview>/embed/id-photo/` and `/id-photo/`) before production. If Cloudflare sends both policies, the fallback is moving the site CSP off `/*` into explicit blocks (a bigger change, Arch).
5. **Privacy link inside the widget:** kept (new tab), next to the 기관 source and 외교부 links that were already new-tab. I read "only link out is the credit" as "no commercial or navigation links"; say if the privacy link should go.
6. **Info page font:** the copy renders in the system font via the existing `.guide-page` selector (0 CSS bytes) and uses only existing core glyphs; a dedicated `.embed-info` selector would add a few bytes to the shared CSS.
7. **Preview on demand (deviation from "a live preview iframe, loading=lazy"):** on this short page a lazy frame still loads at once, and its requests put local LCP at 1,962 ms. The frame is now made by 「미리 보기 열기」 (LCP 1,667 ms); without JS the button is a link to the widget.

## Out of Scope (logged in BUILD-LOG Known Gaps)
- `?via=embed` arrival on /id-photo/ is not counted (the arrive path reads only a same-origin /guide/ referrer).
- photo-compress and other widgets, paid white-label, postMessage auto-resize, host analytics, other languages (brief).
- CLAUDE.md Privacy/runtime clause ("/embed/* allows framing by any site; it ships no third-party script"): Arch shows the owner at the gate.

## Round 2 (Richard cleared, 0 Must Fix; applied, not committed)
- scripts/lib/embed-check.mjs embedHeaderProblems: a block with `! Content-Security-Policy` must be `/embed/<tool>/*` and must set a policy of its own; every policy outside `/*` must name frame-ancestors. Tests in tests/unit/embed.test.ts "round 2" (detach on /guide/*, detach without a policy on a widget path, a policy without frame-ancestors).
- Terms: TERMS_EFFECTIVE back to its previous value (9월 30일, cloud 10월 2일); 11항 keeps 「2026년 10월 20일부터 시행」 and a 「변경 이력」 list notes the addition.
- Wording aligned: /embed/ 조건 and terms 11항 both say 「도구 아래의 「문서딱 제공」 링크를 지우거나 가리지 말아 주세요」 (existing core glyphs; /embed/ is system font anyway).
- PRIVACY_EMBED kept as its own history line (same date as PRIVACY_OUT); merging would rewrite the REV3 line that tests and the gate already checked.
- Gates: vitest 1,470/1,470; astro check 0 errors; check-dist OK default 407.3 KB and cloud flag-on 415.3 KB, font files unchanged; e2e embed.spec chromium + mobile-chrome 22 passed.

## Rebase onto origin/main (8881a39)
- Conflicts: handoff/BUILD-LOG.md only (both entries kept, GROWTH3/TWA first, then REV5). public/_headers and tests/unit/postbuild.test.ts merged cleanly: `_headers` has both the `/.well-known/assetlinks.json` block and the `/embed/id-photo/*` block; check-dist's framing rule passes with both.
- After the rebase: vitest 1,469/1,469; astro check 0 errors; check-dist OK on default (407.3 KB) and cloud flag-on (415.3 KB) and autoframe (409.5 KB); e2e embed.spec + id-photo.spec on chromium + mobile-chrome: 93 passed, 7 skipped (by design: the Chromium-only clipboard test on mobile-chrome and the id-photo tests that need other projects), 0 failed.

## Overlap with other worktrees
- twa (manifest/.well-known/_headers): **public/_headers** (4 lines inserted right after the `/*` block). Merge by keeping both.
- en0 (pdf-merge/pdf-compress/image-to-jpg catalogs): none.
- growth3 (guides): no src/content change; sitemap.xml.ts and llms.txt.ts gained one row each; postbuild.test.ts got one new test and the `<pre>` exemption (a conflict is possible if growth3 edits the same test file).
- REV4 (AdSense, if separate): scripts/lib/analytics.mjs, ga.mjs and the new scripts/lib/csp.mjs; check-dist.mjs GA/beacon loops; OPS-RUNBOOK §11 left for it.
