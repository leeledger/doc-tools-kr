# Review Request — Fix-forward 2026-10-01 (Richard's post-hoc FIX FORWARD)
Date: 2026-10-01
Ready for Review: YES
Tree: branch cloud-handoff = origin/main 37aa511 + 73ea1ca (P1-2 and P1-3 only, which can be pushed first) + one follow-up commit (the ports and P2 items). Nothing is pushed.
Status: DONE_WITH_CONCERNS. /hwp-to-pdf/ Lighthouse LCP is 2,190 ms against a 2,000 ms limit. The miss predates this work (2,101 ms without the new section). Details, gates and decisions are in BUILD-LOG, "Fix-forward 2026-10-01".

## Files Changed
- src/tools/hwp-to-pdf/controller.ts (`send`, `pageshow`) — a page request with no worker while a document is shown calls fail('engine'), so no waiter is left hanging. pageshow(persisted) resets the tool.
- tests/e2e/hwp-to-pdf.spec.ts:
  - bfcache tests (pagehide mid-export + pageshow(persisted); pagehide alone);
  - the WebKit keyboard fix (focus the link directly);
  - the forced raster-fallback test (Worker.onmessage wrapper, pixel overlap against the vector page);
  - share and 관련 안내 asserts in the law05 test.
- src/lib/hwp/pdf/export.ts — `missingChars` in ExportStats.
- scripts/regress/hwp.mjs — missingChars in the rows; the rule-7 message names the characters.
- scripts/gen-hwp-fallback.mjs, scripts/fonts/fallback-ext.json, scripts/fonts/fb-math-{2,3,4}.woff(2), fb-sans.woff(2) — wider Noto Math / Noto Sans ranges. The fonts are copied from hwpdl. Unchanged faces are identical.
- licenses/third-party/SOURCES.md — fb-math-1..4 and the fb-sans blocks.
- scripts/check-dist.mjs — fails if any _astro JS statically imports the export chunk.
- src/data/jsonld.ts (`toolListJsonLd`), src/pages/index.astro — the home ItemList of live tools. The existing WebSite and Organization nodes are kept, with no duplicates.
- tests/unit/postbuild.test.ts:
  - Growth T8 home JSON-LD asserts (1 WebSite, 1 Organization, 1 ItemList = LIVE_TOOLS);
  - new test: the 404 map is JSON with "<" escaped, and no guide source line has nested parentheses.
- tests/e2e/id-photo.spec.ts — the kill-switch beforeAll skips manual-chromium.
- src/pages/404.astro — the backslash is doubled in the u003c escape.
- src/data/guide-facts.ts (`resolveSources`) — the preset label loses its own parentheses inside the title's.
- src/data/tools.ts — hwp-to-pdf updated 2026-10-01.
- src/pages/hwp-to-pdf/index.astro — Share in #hw-done, and the QuickLinks section.
- src/data/guides.ts — NEXT_GUIDES fallback for guidesForTool. hwp-to-pdf → pdf-compress, pdf-merge, email-attachment-limit.

## Open Questions
- The raster-fallback test has no product debug flag. It injects `<switch/>` into page 1 through a Worker wrapper. Is the 0.75 overlap threshold acceptable? With fonts: 0.83–0.87 in 3 engines. Fonts stripped: 0.52–0.56, and the test fails.
- NEXT_GUIDES on /hwp-to-pdf/: these are next-step guides, not HWP guides. Is that the right reading of "quick links the way the other tools have them"? The tool has no deep-link options.
- WebKit keyboard: Alt+Tab did not reach the link in Playwright WebKit (Windows), so the test uses .focus(). The Tab-only path stays covered on Chromium and Firefox.

## Escalate to Architect
- /hwp-to-pdf/ LCP is 2,190 ms against the 2,000 ms limit. It is 2,101 ms without the new 관련 안내 section. Likely cause: a second render-blocking stylesheet (hwp.css) and about 13 KB more initial JS than home. The threshold was not lowered.

## Out of Scope (logged in BUILD-LOG)
- P1-1 Cloudflare beacon (owner dashboard) and the live-smoke check; real-device checks.
- The CLAUDE.md "build before npm test" note; the rss content type; the /hwp-to-pdf/ plain-language exemption.
- regress:hwp law07 timed out once in 2 full-corpus runs (passed alone 2/2 and in run 2).
- regress:idphoto p07 chin −1.11 mm (known auto-frame-only gap).
