# Review Request — Step TOOLS4 T2 (/jpg-to-pdf/ 사진 PDF 변환)
Date: 2026-10-06
Ready for Review: YES. Status **DONE**. Not committed. Notes, decisions, sizes, gates: BUILD-LOG "TOOLS4 T2 build notes".

## Files Changed
- src/tools/jpg-to-pdf/limits.ts:1-70 — device limits (brief numbers) and pure `planAdd` with numbered messages and usage codes.
- src/tools/jpg-to-pdf/layout.ts:1-51 — pure page size + draw rect (A4 자동/세로, 0/10 mm margin, 사진 크기에 맞춤).
- src/tools/jpg-to-pdf/embed.ts:1-15 — `canEmbedRaw` (JPEG, not CMYK, orientation 1/absent, no rotation, 원본 그대로).
- src/lib/pdf/images.worker.ts:1-118 — pdf-lib worker: raw JPEG (metadata stripped) or re-draw (orientation, rotation, cap; PNG only with alpha), layout, verify, producer/creator 문서딱.
- src/tools/jpg-to-pdf/controller.ts:1-598 — list/thumbnails/reorder/rotate/remove, options, run/cancel/result, usage events, unsupported-browser notice.
- src/tools/jpg-to-pdf/entry.ts:1-48 — startUsage; lazy controller on first interaction.
- src/pages/jpg-to-pdf/index.astro:1-139 — the page (privacy line beside the picker only; related tools pdf-merge/pdf-compress/photo-compress).
- src/data/tools.ts:3-27,~170-228 — `JPG_PDF_FAQ` read from limits.ts; the tool entry (brief title/description, 6 FAQ).
- src/data/og.json:8,21; src/data/guides.ts:48-56; src/data/tool-facts.ts:11,41-46 — share image/line, next-step guides, tool facts.
- src/lib/ui/usage.ts:13,20-21; scripts/lib/usage.mjs:37,48-51,224-227,248-249 — jpg-to-pdf tool, `page` setting, Korean admin labels.
- scripts/check-dist.mjs:119-134,207-217 — worker/controller budgets, lazy + no-pdf-lib-in-initial assertions; bg controller budget 14 → 14.5.
- scripts/gen-sw.mjs:39-42 — /jpg-to-pdf/ not precached (466.9 KB with it).
- scripts/lib/bgcloud.mjs:62 — jpg-to-pdf in LOCAL_SCOPE_RE (its picker line is about a tool that sends nothing).
- src/data/site.ts:26-31 — third home-description tier "{names}. 무료." (the bg-on build was 121 characters).
- src/lib/image/raster.ts:36-51; src/tools/photo-compress/controller.ts:6,137 — `canDrawOffscreen` moved from the photo-compress controller (now shared).
- lighthouserc.json:11, scripts/qa/visual.mjs:32, CLAUDE.md:3, docs/COPY.md (description tiers) — registration.
- tests/unit/jpg-to-pdf.test.ts (new), tests/e2e/jpg-to-pdf.spec.ts (new), tests/unit/usage.test.ts:92,566-593, tests/unit/postbuild.test.ts:343,675, tests/unit/bgcloud.test.ts:423, tests/e2e/site.spec.ts (page lists, related, sitemap, 8 cards), tests/e2e/polish.spec.ts:16,125,258, tests/e2e/usage.spec.ts:78-97, tests/e2e/photo-compress.spec.ts:26 — lists and new tests.

## Open Questions
- E-T2-a home description: the third tier keeps every name within 120 now, but T3/T4 names cannot fit; Arch should decide the form before T3.
- E-T2-b remove-background controller budget 14 → 14.5 KB: 14.0 before T2, 14.1 after sniff/decode became shared chunks. OK, or another fix?
- Raw JPEG path: please check the strip-then-embed fallback and the alpha decision (PNG only when a pixel is transparent) in images.worker.ts.
- Privacy text unchanged ("고른 설정 … 정해진 값" covers 용지) — the brief asks Richard to confirm.

## Out of Scope (logged in BUILD-LOG)
- postbuild "usage statistics … fail check-dist" times out (60 s) on the auto-frame dist only (8 check-dist spawns, ~7.7 s each before T2); passes on the default dist.
- Sticky-actions scroll padding in app.css names #merge-tool only.
- Lighthouse / qa:visual not run locally.
