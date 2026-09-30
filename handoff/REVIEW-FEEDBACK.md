# Review Feedback — Step 5 (HWP PDF 변환 /hwp-to-pdf/), round 2
Date: 2026-09-30
Reviewer: Richard. Worktree C:\dev\doc-tools-kr-step5, branch step5 at 22990da; diff ee507ab..step5.
Ready for Builder: YES

## Gates I ran myself (merged tree)
| Gate | Result |
|---|---|
| npm run check | 0 errors, 0 warnings, 1 hint |
| npm test | 500/500, 25 files |
| Build 1: PUBLIC_ID_PHOTO_AUTOFRAME=0 astro build --outDir dist-noauto, then check-dist / gen-headers / carry-assets / gen-sw with --dist dist-noauto | OK: 1210 files; precache 366.5 / 450 KB; 0 MediaPipe files; 0 FaceLandmarker strings in the JS; 0 auto-frame phrases on /id-photo/; exactly 1 rhwp_bg.wasm |
| Build 2: npm run build (flag off) | check-dist OK. /hwp-to-pdf/ initial JS 9.9 / 30 KB; worker 20.3 / 90; lazy chunk 4.4 / 25; wasm 9.48 MiB raw (brotli q5 3.0 MiB); HWP font CSS 30.3 / 31; largest slice 48.3 KB; fallback face 1.9 KB; UI fonts 184.0 / 190; precache 366.5 KB, 23 URLs (no /licenses/, /vendor/rhwp/ or /fonts/hwp/). No MediaPipe, same as build 1 |
| check:licenses | OK: 31 packages, 4 components (flag off) |
| e2e hwp-to-pdf.spec.ts on chromium, firefox, webkit, mobile-chrome and mobile-safari (E2E_PORT=4395) | 88 passed, 27 skipped, 0 failed, 0 flaky. Every skip states its reason (page.pdf is Chromium-only; phone and desktop caps) |
| regress:hwp --fixtures-only | 10/10, all pass rules pass. measure 0, sanitizer 0, dangling 0; law10 ready 2.34 s (limit 3 s); adm28 5.6 s |
| Container fuzz (mine): 6,000 seeded truncations, bit flips, 0xFF blocks, hostile u32s and tail garbage on law05, law07, adm02 and adm14 | 0 exceptions other than HwpError; slowest input 12 ms |
| Zip bomb (mine): a 622 KB HWPX whose section0.xml inflates to 637 MB | Rejected as corrupt after 5.7 s, but RSS peaked at +591 MB (Should Fix 3) |
| rhwp escaping probe (mine): adm19 with markup and quotes injected into hp:t text and into the content.hpf media-type and href | No injected markup reaches the page SVG. Text is escaped glyph by glyph, and the image MIME comes from the bytes, not the manifest |
| Manual screenshots in Chromium: empty, loaded law10, guidance, after print, viewer-first law17, error .txt; at desktop 1280, Pixel 7, dark desktop and dark Pixel 7 | Horizontal overflow 0 everywhere; 0 CSP violations; print stub called once; title restored after afterprint. The copy is clean 합니다체 and matches the brief |

## Focus checklist
- **Routing and caps:** limits.ts matches brief §3.4 exactly.
  - Hard limits: 150 / 25 MB, checked before any read (controller.ts:373).
  - Caps (viewer-only): 80 / 10 MB, 300 / 60 p, 1 GiB / 256 MiB, 60 / 8 MB. Caps are checked first, then the guard (pages ≥ 100, equations ≥ 1, textboxes ≥ 3).
  - A password is rejected in the scan, before the engine loads (features.ts:98).
  - The 5 M record cap and the 512 MB inflate cap are in place, and the inflate is streamed.
  - The 90 s watchdog is kicked on every send and on every non-page message, and stops when no page is pending.
  - The hwp-inflight notice shows once.
  - Rule 2 is accepted per F1: the 19 guard keys plus the cap-routed kr01 and adm16.
- **Security:**
  - No innerHTML in the tool; all copy goes through textContent.
  - Page SVGs go through DOMParser, then sanitize, then importNode.
  - The CFB and ZIP readers are bounds-checked, cycle-guarded and depth-capped, and the fuzz found no escape.
  - The only fetch( is the same-origin wasm GET, enforced by network-guard.
  - The sanitizer has a defence-in-depth gap (Should Fix 1).
- **Output:**
  - Printing: one named @page per page size, with the first size as the default; break-after, print-color-adjust, title swap and restore; the after-print note with the 용량 줄이기 link; print notices for viewer-only and not-ready.
  - The UA table is correct for every row in §3.3, including in-app browsers, and the save button stays.
  - The spike fixes are all ported: scopeIds with a real backslash-b word boundary (the source-bytes test guards it), dropCellClips, fitFillImages, addSpaces with the row index, and pick() with the HEAVY duplicate-attribute fix.
  - The F2 image rule: PNG is kept when any alpha < 255, when there are ≤ 64 colours, or when ≥ 85 % of pixels are flat. The JPEG is kept only when it is smaller.
  - The 도장(U+329E) / 아래아 (U+318D, U+119E) / U+2027 fallback is a 1.9 KB OFL subset, limited by unicode-range, at the end of every family chain.
- **Legal and fonts:**
  - The Hancom and trademark lines are byte-identical to brief §3.1. They appear in 도움말 and in the tool footer, in the /licenses/ top section, in README.md, and in the cfb.ts and features.ts headers.
  - The fonts are 4 @fontsource OFL families plus the Noto CJK subset. They are served from our own origin, load on the first page, and none is precached.
- **Merge with Step 4:**
  - tools.ts has 5 live tools, and the sitemap has both pages.
  - The manifest and /licenses/ are deduped and include the rhwp crates, the 4 font packages and the fallback face.
  - check-dist has both budget blocks; Playwright has manual-chromium and E2E_PORT; ui-shared is precached.
  - The id-photo flag-off build is clean.
- **A11y and SEO:**
  - Pages are role=group, labelled "N쪽". The preview region is focusable, the banner has role=status, and an error is an alert with focus moved to it. The axe e2e passes on every state.
  - One H1, a canonical URL and FAQPage JSON-LD. The description is 97 characters and has the three required phrases.

## Must Fix
- None.

## Should Fix
1. **src/lib/hwp/svg-dom.ts:27,38-65** (confidence 8 that the gap exists; about 3 that it can be exploited today).
   - **Problem:** the sanitizer is a denylist of SVG local names. Elements in other namespaces, and style, pass through and are adopted into the HTML document.
   - **What I ran:** the production sanitize() plus importNode, in Chromium, Firefox and WebKit.
   - **What happened:**
     - An XHTML-namespaced meta http-equiv="refresh" navigated the tab in all three engines, with 0 removals. The CSP does not stop a meta refresh.
     - An SVG style and an XHTML style both restyled body (a spoofing primitive).
     - An XHTML form action survived.
   - **Why only Should Fix:** my rhwp probe shows text is escaped, so there is no exploit path today. But the sanitizer exists for the case where rhwp gets this wrong (brief failure row "Malicious SVG content: nothing runs").
   - **Fix:**
     - Remove every element whose namespaceURI is not the SVG namespace, and add style to REMOVE.
     - Optionally strip style attributes whose url() points anywhere other than #.
     - Add jsdom cases for XHTML meta, style, form and link.
     - Rerun the harness and confirm sanitizer removals stay 0. The wasm contains one style-tag literal; confirm that it never appears in page SVG.
2. **src/tools/hwp-to-pdf/controller.ts:308 and 320-361** (confidence 7).
   - **Problem:** the viewer-first state clears hwp-inflight (setInflight(null) at 308), and a forced fullRender never sets it again.
   - **Why it matters:** "그래도 PDF로 저장" on a heavy routed file (adm19 is the brief's real-device tab-kill case) is the likeliest place for a phone tab kill, and the reload then shows no notice.
   - **Fix:** call setInflight(file?.size ?? 0) at the start of a forced fullRender. It is already cleared at 358 and on cancel, reset and error. Cover it in e2e or a unit test.
3. **src/lib/hwp/inflate.ts:173-190 and features.ts:130-139** (confidence 6).
   - **Problem:** the 512 MB cap meets the spec, but the scan buffers the whole inflated output before counting. A 622 KB HWPX drove RSS to +591 MB before it was rejected.
   - **Why it matters:** on a phone the worker is more likely to be killed than to return corrupt. The inflight notice covers that, so the failure is not silent.
   - **Recommendation:** either count the records and regex matches over streamed chunks (with a small overlap), or use a device-dependent cap. Otherwise log it as a Known Gap. See Escalate.
4. **src/tools/hwp-to-pdf/controller.ts:147,351-359** (confidence 6).
   - **Problem:** hwp-printable turns on as soon as the state is convert. The save button stays disabled until the fonts settle and downscaling ends, but Ctrl/Cmd+P in that window prints pages with fallback fonts and full-size images. This is the brief's "fonts not loaded at print" row reached by another route.
   - **Fix:** keep hwp-not-ready on (or hwp-printable off) until line 359 enables the button.
5. **src/pages/hwp-to-pdf/index.astro:52** (confidence 6; verify intent).
   - **Problem:** "그래도 PDF로 저장" uses btn primary. Brief §3.2 calls it "the secondary button", and primary styling invites the click the warning is meant to slow down.
   - **Fix:** use secondary or ghost styling, or record the deviation as intentional.
6. **src/tools/hwp-to-pdf/print.ts:211-222** (confidence 5; verify).
   - **Problem:** if afterprint never fires (some mobile engines), the listener stays and the title stays swapped. The next save then records the swapped title as "previous".
   - **Fix:** keep the original title in module state and drop any pending listener before adding a new one.

## Escalate to Architect
- Inflate cap for phones (Should Fix 3): keep 512 MB on every device, or set a lower cap for phones? This is a limits-table decision, not a code decision.

## Appendix (low confidence)
- **controller.ts:361:** the forced path calls window.print() after long awaits, when the click's user activation has expired. Desktop engines allow this. iOS Safari may prompt or refuse; add it to the real-device checklist.
- **scripts/regress/hwp.mjs:** with --fixtures-only the report still says "Guard parity with the 19 spike keys: exact match". The parity check covers only the fixture subset, so the wording overstates it.
- **Focus ring:** the ring on #hw-file-name after load (programmatic focus) is visually heavy. Cosmetic.

## Cleared
I reviewed the full ee507ab..step5 diff: the HWP module, the tool and its page, the build and licence scripts, and the merge points with Step 4. I ran every gate listed above. Behaviour, limits, legal texts, budgets and the flag-off build all match the brief and Arch's F1-F4 decisions.

Step 5 is clear.
