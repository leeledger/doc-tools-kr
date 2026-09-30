# Review Request — Polish Q (UX-AUDIT-2 P1 fixes, plain language, brand 문서딱, share previews)
Date: 2026-09-30
Ready for Review: YES
Tree: main at 3358fd7 plus uncommitted work (nothing committed or pushed). Status: DONE.
Note: the orchestrator pushed hotfix 76de652 (a plain sed 안올림 → 문서딱 plus a tagline change) to origin/main from another worktree. The orchestrator merges it into this work and resolves conflicts in favour of Polish Q copy.
Previous REVIEW-REQUEST (Step 5 round 3) is in git history.

Decisions and their reasons are in handoff/BUILD-LOG.md, "Polish Q build notes" and "Polish Q, added mid-build".

## Files Changed
- src/data/site.ts — SITE is 문서딱 with the owner's tagline. TITLE_SUFFIX is "파일을 보내지 않고 무료로 | 문서딱". Plain defaultDescription. OPERATOR, PRIVACY_OFFICER and ogDescription are removed. contactLine returns null when unset; new footerContact(). New sharePreview(), which reads og.json; the home entry's {tools} expands to the live tools.
- src/data/og.json (new) — share-preview copy: 7 images (title and line), and a per-path description of 80 characters or fewer, with "*" as the fallback.
- src/layouts/Base.astro — brand from SITE. The footer has no operator or contact line unless one is set. It carries the full og and twitter tag set, per-page image, description and alt.
- scripts/gen-brand.mjs — og-<image>.png for each og.json image: 1200×630, centred safe area 300–900 px, domain from PUBLIC_SITE_URL (docttak.com fallback). The build fails on overflow. Stale og*.png files are removed. The single og.png is gone.
- scripts/check-dist.mjs — og-*.png budget: at least 7 images, each 300 KB or less. Guard comment updated (the guard itself is unchanged).
- src/lib/ui/josa.ts (new) — particle choice (은/는, 이/가, 을/를, 과/와, 으로/로) for Hangul, numbers and Latin letters.
- src/tools/photo-compress/headline.ts (new) — the done summary counts 줄임 / 그대로 / 늘어남 / 못 줄임 / 대기 separately.
- src/tools/photo-compress/controller.ts:
  - Kept rows now offer "원본 내려받기" with the target-mode or no-gain note.
  - The ZIP includes the kept originals.
  - The headline comes from headline.ts.
  - Josa on row removal, the "빈 파일" message, and `li > span[role=note]`.
- src/tools/photo-compress/queue.ts — summary() removed.
- src/lib/image/messages.ts — keptSmall and keptNoGain replace kept. New `empty` message. Plain HEIC, OOM and EXIF copy. The scaled line uses josa (…1518로).
- src/tools/id-photo/controller.ts:
  - The done state scrolls #idp-done under the header, then focuses the headline with preventScroll.
  - New headline "규격에 맞췄습니다 · N KB", chips in 픽셀.
  - Own GIF copy, empty-file copy, josa.
- src/styles/app.css:273 — #idp-headline gets scroll-margin-top.
- Pages:
  - src/pages/{index,pdf-merge,pdf-compress,photo-compress,id-photo}/…astro — the §7.2 rewrites. The developer-tools line becomes the airplane-mode check. id-photo H1 = the menu name. Home no longer says "준비하고 있습니다".
  - privacy — short plain 해요체 statement.
  - terms — no contact clause, no operator name.
  - 404, offline, licenses — brand from SITE.
- src/data/tools.ts — titles, descriptions and FAQs in plain words; id-photo h1. The HWP entry changes only in its title brand.
- Limit copy moves to josa and plain words (no 메모리 or 브라우저):
  - src/tools/{pdf-merge,pdf-compress,photo-compress,id-photo}/limits.ts
  - src/tools/photo-compress/options.ts
  - src/lib/idphoto/warnings.ts
  - src/lib/ui/pdf-pick.ts
  - the pdf-merge and pdf-compress controllers (oom)
- src/data/id-photo-presets.ts — the 반명함판 note uses 해상도 and 픽셀.
- src/lib/pdf/mergePlus.ts — PRODUCER is 문서딱. src/lib/face/landmarker.ts — the internal error string.
- scripts/qa/visual.mjs — idpDoneInView() checks both edges and focus. There is a new 360/768/200 % pass. The weight probe text is updated.
- docs/COPY.md — brand rule, tone exception, jargon → plain table, josa rule, title and description formats.
- Tests:
  - tests/unit/josa.test.ts (new)
  - photo-tool: the headline tests
  - polish: brand and titles, og.json, sharePreview, footerContact
  - postbuild: plain-language dist scan, brand (안올림, 독딱, bare docttak), share-preview tags on every page, the gen-brand og set
  - e2e: copy expectations; the new id-photo done-viewport test on all 5 projects; the merge bar at scrollY 0; og-*.png served as image/png; footer, privacy and terms without contact details

## Gates
| Gate | Result |
|---|---|
| check | 1 error, pre-existing at 3358fd7 (tests/e2e/hwp-to-pdf.spec.ts:183, HWP branch). My own 2 errors are fixed. |
| unit | 523/523 |
| build + budgets | dist-noauto (flag off) and dist (flag on) both pass check-dist. UI fonts 185.8/190 KB. og-*.png 29–42 KB each. |
| licences | OK, 31 packages (flag off) |
| e2e, full, 5 projects + manual-chromium | 785 passed, 16 flaky (the Firefox/WebKit goto race; all passed on retry), 172 skipped. The 5 failures were one test (home og:description must name every live tool). I fixed it, rebuilt, and re-ran polish.spec + site.spec on all 5 projects (379 passed, 0 failed) and id-photo.spec on chromium, mobile-chrome and manual-chromium (78 passed). The no-upload fixture runs on every test. |
| Lighthouse (7 URLs × 3) | 99/100/100/100 everywhere. All assertions pass (/id-photo/ CLS 0.0018). |
| qa:visual (local preview) | 215 PNGs, 0 hard failures. The id-photo done state is below the header and in view at 390, 360, 768, 200 % and 1280. |
| regress | merge 5/5, compress 122/122, photo 85/85 + 24/24, idphoto 10/11 (the known p07 landmark miss, unchanged) |

## Open Questions
- Tone mix: the body stays 합니다체. The owner's lines are 해요체: the home hero, privacy, the kept-photo note and the tagline. Is the mix acceptable, or should one style win?
- Titles drop "업로드 없이" (the owner's rule), against the audit's SEO advice to keep it.
- The home H1 is now the tagline. The privacy promise moved to the badge and lead.
- The plain-language test exempts /hwp-to-pdf/ and any string found in the HWP sources. Remove that exemption once hwp-direct merges.
- JSON-LD `operatingSystem: "웹 브라우저"` sits in a script and is not scanned. Keep it?
- Internal identifiers (`anolim-*` cache prefix and font files) are kept on purpose so the SW update path is not broken.

## Out of Scope (logged in BUILD-LOG)
- A full privacy policy with a contact and a privacy officer is needed before ads or the beacon go on.
- /hwp-to-pdf/ copy.
- The pre-existing check error in hwp-to-pdf.spec.
- The "×" rendering in the id-photo "저장될 이름" line (calt off does not stop it; the file name itself is ASCII).
- UX-AUDIT-2 P1-3, P1-4, P1-7, P1-8, P1-9 and P2 items other than P2-1.
