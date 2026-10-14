# Review Request — REQ1014-C (콘텐츠·딥링크·프리셋·이어서 하기·제휴 위치)
Date: 2026-10-14
Ready for Review: YES
Status: DONE_WITH_CONCERNS (two brief deviations forced by existing gates, see Open Questions 1-2)
Branch: req-1014-c off origin/main ee4950c. Brief: handoff/ARCHITECT-BRIEF-REQ1014-C.md. Log: BUILD-LOG "REQ1014-C — build".

## Files Changed
- src/data/id-photo-presets.ts:7-8 — header line for the REQ1014-C presets.
- src/data/id-photo-presets.ts:68-69 — `R1014_RETRIEVED = '2026-10-14'`.
- src/data/id-photo-presets.ts:272-326 — presets police (printPx 30×40, no limit, 300 dpi, computed-pixels note), hanja (230×310, 100 KB le), jlpt (413×531, 1,000 KB le, ratio-only note), after kuksiwon.
- src/data/id-photo-presets.ts:419-422 — police + hanja in REFERENCE_ASPECT_EXEMPT, comment extended.
- src/data/preset-ids.ts:4 — PRESET_IDS gains police, hanja, jlpt (same order).
- scripts/lib/usage.mjs:53 — PRESETS line; :415-417 — the preset LABEL map (a unit test holds it equal to the preset labels; brief "any preset label map").
- src/content/guides/police-exam-photo.md, hanja-exam-photo.md, jlpt-photo.md — CTA/body → own preset, `- preset:` source, 반명함판/직접 입력 text rewritten, updated 2026-10-14.
- src/content/guides/kakao-photo.md:12, 96-98 — CTA + body → `/photo-compress/?target=2500`, 계산값 explained as 300MB ÷ 120장 (no unit-bound computed number; Open Question 1).
- src/content/guides/baby-passport-photo.md (new), passport-reissue-photo.md (new) — 11 / 12 quotes from passport.go.kr menuPos 32/12/4/10 and 7/12/10, FAQ 5, related 3.
- src/content/guides/passport-photo-error.md:47-66, 79-80, 94-108, 122-123 — menuPos 12/10 sources, 「정부24에 올릴 수 있는 사진 파일」 section, FAQ 707, link to the reissue guide, related.
- src/content/guides/passport-photo.md:13 — related: gosi-photo → baby-passport-photo (cap 4; updated unchanged).
- src/content/guides/hwp-to-pdf.md, yearend-tax-pdf.md, ecfs-pdf-limit.md, pdf-merge.md, hwp-on-phone.md — D9: new quote each (retrieved 2026-10-14), 「이럴 때는」, ≥ 4 internal links, updated 2026-10-14; ecfs + yearend no longer say 문서딱 cannot make PDFs from photos (false since /jpg-to-pdf/).
- src/content/guides/open-hwp-without-hangul.md:8, 17-22, 36, 56 — gate fix: 한컴 changed the viewer page (Windows 11 이상); quotes re-read, body follows.
- src/data/tools.ts:216, 242-256 — pdf-compress updated + 2 FAQ with guide links and `?target=20` (no institution numbers in the answers).
- src/data/tools.ts:514-527 — image-to-jpg summary names AVIF, updated, FAQ 「AVIF 사진도 JPG로 바꿀 수 있나요?」 (wording follows decode.ts:20 → controller.ts:429-430 'corrupt').
- src/pages/pdf-compress/index.astro:194 — renders FAQ links (same line as image-to-jpg); without it the new FAQ links were invisible.
- public/_headers:21-22 — `/guide/rss.xml` → `X-Robots-Tag: noindex`.
- scripts/lib/guide-titles.mjs — regenerated (gen-guide-titles).
- tests/unit/idphoto-core.test.ts, deeplink.test.ts:53-58, usage.test.ts:110-114, ops.test.ts:249, guides-schema.test.ts:459-511, postbuild.test.ts:1283-1285 — test map items (presets, round-trips, usage accept/reject, guide CTAs/sources/inbound links, D9 bodies, AVIF/pdf-compress FAQ, RSS header block).
- tests/e2e/growth.spec.ts:21-34 — ?preset=police/hanja/jlpt selected in 시험·원서 with their source line; ?target=2500 → custom 2,500.
- tests/e2e/id-photo.spec.ts:229-230, 251 — police/hanja/jlpt save their exact file (px, ≤ limit, dpi, tag); 시험·원서 option order.

## Gates
- astro check 0 errors · vitest 73 files / 1,509 passed · check:licenses OK · check:quotes --exact 240 quotes verbatim (exit 0; brief said 214 before).
- check-dist OK: default (PUBLIC_SITE_URL) precache 407.3 → 410.5 KB (+3.2); autoframe off 411.1; autoframe on 413.3; bg on 414.4; cloud flag-on (BG_CLOUD+USAGE+GA+AFF) 419.2 (EN1 recorded 415.4) / 450. DUP max pair unchanged 0.231 / 0.45.
- e2e (no-upload fixture, axe in-spec; E2E_PORT=4473/4481): id-photo, photo-compress, growth, site, polish × chromium, firefox, webkit, mobile-chrome, mobile-safari + manual-chromium/manual-firefox (id-photo): 1,003 passed, 0 failed, 12 flaky (passed on retry: 11 firefox, page.goto 20 s timeouts / one share-field read while 3 other worktrees ran e2e on the same PC; 1 manual-chromium custom-size), 134 skipped (project filters), 22.9 min.
- Lighthouse, median of 5 per URL, lighthouserc thresholds unchanged (perf ≥ 0.95, a11y/SEO 1, BP ≥ 0.95, CLS ≤ 0.01, LCP ≤ 2,000 ms, script ≤ 30 KB): all 8 pass. /id-photo/ 0.96 · LCP 1,835 · JS 16.3 KB; /photo-compress/ 0.99 · 1,980 · 28.4 KB; /image-to-jpg/ 1.00 · 1,668 · 12.3 KB; /pdf-compress/ 0.99 · 1,824 · 23.8 KB; /guide/passport-photo/, /guide/kakao-photo/, /guide/baby-passport-photo/, /guide/passport-reissue-photo/ 1.00 · 1,667-1,673 · 2.3 KB; CLS ≤ 0.0003 everywhere; a11y/BP/SEO 1 everywhere. lhci autorun aborted twice on the Windows NO_NAVSTART / EBUSY temp-dir crash (CPU at 100 % from other worktrees), so the numbers come from the lighthouse CLI × 5 per URL on :4474 (dist, autoframe on), runs with a runtimeError retried, per-metric median (same method as the earlier shared-machine log entry).
- qa:visual --only static (all pages incl. the 2 new guides, 3 browsers + chrome/edge, light/dark): 430 PNGs, 0 hard failures.
- regress:idphoto --fixtures-only: exact output 163/163 files (every preset incl. police, hanja, jlpt); 10/11 checks — the known p07 chin -1.11 mm landmark miss (pre-existing since Step 4).
- Re-run on the committed tree: astro check 0 errors; vitest 73 files / 1,509 passed.

## Open Questions
1. kakao-photo: the brief's CTA label (31 chars, schema max 30) and any "2,500 KB"/"2.5 MB" on the page fail the build's unsourced-number check (a computed value has no quote/tool fact/preset behind it). I did not loosen the check: the page explains the preselected target as 계산값 = 300MB ÷ 120장 without printing it with a unit; CTA 「카톡 120장 묶음에 맞게 사진 줄이기」. Showing the number needs a derived-fact rule (Arch call).
2. pdf-compress FAQ: gov24-upload-limit and hometax-upload-limit are drafts, so they cannot be linked; I linked the published sourced guides ecfs-pdf-limit, email-attachment-limit, yearend-tax-pdf and `?target=20` (ecfs, sourced). Please confirm.
3. ecfs-pdf-limit's new quotes come from law.go.kr lsInfoR.do (the statute text frame; the ecfs portal is a script shell). URL carries `efYd=20260801` (the rule version in force); source-watch will flag it when the rule is amended — intended.
4. The AVIF FAQ quotes the shared 'corrupt' row message. If -B rewrites that message, the FAQ wording must follow.

## Out of Scope (logged in BUILD-LOG)
- D5 chain (trigger from -A data), D6 print-block position (after rev6 + 28 days), rev6 GUIDE_GROUP_OF mapping for the 2 new slugs, live smoke + GSC/Naver requests after deploy (Arch/owner).
