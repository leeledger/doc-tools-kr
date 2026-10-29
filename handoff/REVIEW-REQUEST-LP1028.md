# Review Request — LP1028 (링크프라이스 글자 링크 + 쿠팡 결과 화면 재개)
Date: 2026-10-28
Ready for Review: YES
Status: DONE

Brief: handoff/ARCHITECT-BRIEF-LP1028.md, plus the owner change relayed by the orchestrator (2026-10-28: Coupang Partners back ON for tool result screens only; guides/content pages keep neither network until the AdSense re-review). Decisions are in handoff/BUILD-LOG.md "LP1028 (build)".

## Files Changed
- src/data/affiliate.ts:1-15 — header for two networks; :41-50 LpDest/OutLink/AffLink types; :60-61 cp-hancom generic label (A0 legal rule); :117-160 AFF_ENABLED = true, AFF_GUIDES = false, affOn off only for "0", AffBlock.ad, affBlock null for guides; :162-210 LP_ENABLED, lpOn, LP_COPY, LP_LINKS (verbatim hrefs), TOOL_LP, lpBlock, resultBlock(tool, linkprice, coupang).
- src/components/OutLinks.astro:2-7,19 — renders block.ad instead of the Coupang constant.
- src/pages/pdf-sign|stamp-signature|stamp-maker/index.astro (frontmatter) — resultBlock (LinkPrice 공동인증서; Coupang cp-stamp fallback with PUBLIC_AFF_LINKPRICE=0).
- src/components/IdPhotoTool.astro:13,25-31,200-206 — Coupang group wrapped in #idp-cp; new #idp-lp (hidden) after #idp-print-links; neither in embed.
- src/tools/id-photo/controller.ts:145-147,203,722-723,855 — toggles #idp-lp/#idp-cp per preset on every result, hides #idp-lp off the done phase, trackOut(#idp-lp).
- src/pages/char-count/index.astro:9,13,18-19,93 + src/tools/char-count/controller.ts:24-25,69 + entry.ts — #cc-lp (hidden) after #cc-note, shown while trimmed text is non-empty (render covers input, 지우기, 되돌리기); trackOut.
- src/components/FormTool.astro:11,13-14,30-31,34,117 — optional `aff` prop, last child of the result; src/pages/resignation-letter/index.astro passes resultBlock; src/tools/resignation-letter/entry.ts trackOut(#rs-result).
- src/lib/ui/usage.ts:15, scripts/lib/usage.mjs (TOOL_OUT, OUT_DESTS, OUT_LABELS) — the four lp dests (L11).
- src/data/legal.ts:3,50-69,84-86 + src/pages/privacy/index.astro:5,178,193-195 — COUPANG_ON/LINKPRICE_ON, PRIVACY_LP first in usage builds with either network, 「보내는 것」 wording, history line, PRIVACY_AFF_OFF line kept as history.
- scripts/lib/ui-font-chars.mjs:29-31 — strips LP_COPY and LP_LINKS.
- scripts/lib/out-links-check.mjs (whole file) + scripts/check-dist.mjs:745-772 — rules (b2) (e) exact Coupang placement incl. LP-off fallback (e2) (g) (h) (i) (j); (f) kept.
- src/layouts/Guide.astro:34, the six Coupang pages' comments, scripts/ops/monetize.mjs:24, docs/OPS-RUNBOOK.md §10/§11, docs/COPY.md:11 — wording for the new state.
- Tests: tests/unit/affiliate.test.ts, adsense.test.ts, usage.test.ts, postbuild.test.ts (fixtures pass + fail per rule; Coupang fixture hosts now link.coupang.com because any other sponsored host fails b2); tests/e2e/affiliate.spec.ts (new), site.spec.ts (exact counts per screen, none visible on load), id-photo.spec.ts, usage.spec.ts (cloud: id_card Coupang, LinkPrice beacons for stamp-maker/pdf-sign/char-count, no block on guides, privacy), ga.cloud.spec.ts (시행일 = PRIVACY_LP).

## Gates
- npm run check: 0 errors. vitest 2334/2335: the one red is ga.test "GA-on build … check-dist passes" on the AUTOFRAME=1 dist (it runs check-dist without that flag; 21/21 on the default dist). hwp-viewer legal test was red once, root-caused and fixed by the generic cp-hancom label. check:licenses: fails only in this worktree (junction picks up stray packages); root checkout at the same commit passes; no dependency changed.
- Builds (check-dist OK each): default 387.6 KB precache (main 385.4), AUTOFRAME=1 389.8 KB, PUBLIC_AFF_LINKPRICE=0 386.9 KB, cloud/production flags 398.0 KB (main 395.8; limit 450). Glyphs/preload unchanged vs main in default (615/82, 92.1 KB) and cloud (616, 92.2 KB). Budgets untouched.
- e2e chromium, 1 worker: affiliate, site, id-photo (AUTOFRAME=1 dist), char-count, resignation-letter, stamp-maker, pdf-sign, stamp-signature, embed green; cloud-chromium usage + ga.cloud + ads.cloud 51/51.

## Open Questions
- Coupang env semantics changed to the LinkPrice pattern (off only for "0"). Production keeps working whether PUBLIC_AFF_COUPANG is "1" or deleted. Please confirm you agree this is "keep the env gate".
- Privacy history words 「상품, 공동인증서, eSIM, 이력서 상담」 instead of the brief's 「…이력서 컨설팅」 / 「쿠팡 상품」 to keep 0 new core glyphs (L13 over L12).
- cp-hancom label changed to a generic name because the A0 legal test forbids 한컴오피스 in /hwp-viewer/ page text. Check the wording.
- check-dist (h) treats any ancestor div with `hidden` as the wrapper (#sg-result, #ss-work, #sm-aff, #idp-lp, #cc-lp, #rs-result).

## Out of Scope (logged in BUILD-LOG)
- LinkPrice/Coupang on guides (AFF_GUIDES), 바로빌, 도시락 Japan link.
- CLAUDE.md still describes Coupang as off in code with a "0 Coupang links" check-dist rule; not edited by the builder (Arch/owner).
