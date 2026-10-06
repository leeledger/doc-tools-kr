# Review Feedback — Step TOOLS4 T2 (/jpg-to-pdf/)
Date: 2026-10-06
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- tests/unit/postbuild.test.ts:485 (confidence: 8/10) — "usage statistics … fail check-dist" spawns check-dist 8 times under the global 60 s `testTimeout` (vitest.config.ts:10). **CI is not at risk now:** the `checks` job (.github/workflows/ci.yml:32-39) runs `npm test` against a `PUBLIC_BG_REMOVE=1` build with auto-frame at its default "0" (astro.config.mjs:23, CLOUD-HANDOFF §flags), so the slow auto-frame dist is never under test in CI. Measured on this PC: check-dist on dist-noauto 4.3 s, dist-bgcloud 4.7 s, dist (auto-frame) 5.5 s. 8 × ~4.7 s ≈ 38 s, so there is headroom but it is shrinking with every tool (T3/T4 add pages). Fix: give this one test its own timeout (`it(name, { timeout: 120_000 }, …)`, as the P.19 describe at :1056 already does), so a local unit run after the auto-frame build stops failing. 2-minute change; do it inline.
- tests/e2e/jpg-to-pdf.spec.ts (confidence: 7/10) — no test for 취소 (controller.ts:491-498): cancel terminates the worker, the list stays, a late worker message is ignored (`id !== runId` guard, :450). Add one e2e: start a run with several photos, press 취소, assert the list and 「PDF 만들기」 are back and no result panel appears. Untested guard clause.
- src/lib/pdf/images.worker.ts:86-88 (confidence: 6/10, verify) — the raw path keeps the JPEG's ICC profile (jpeg-strip.ts:2 keeps APP2 ICC) but pdf-lib writes the image as DeviceRGB, and PDF readers ignore the ICC profile inside a DCT stream. A Display-P3 JPEG (iPhone exports) embedded raw will look slightly duller than the same photo re-drawn (the re-draw path converts to sRGB on the canvas). No data or privacy issue. Recommendation: log to BUILD-LOG as a known gap; a later fix is to re-draw when the sniff reports a non-sRGB ICC profile, or to embed the profile as an ICCBased colour space.
- src/lib/pdf/images.worker.ts:59 (confidence: 5/10) — `hasTransparency(canvasPixels(c))` reads the whole canvas in one `getImageData`: at the desktop cap of 8,192 px a square PNG is a 268 MB copy next to the 268 MB canvas. Mobile (4,096 cap) is 67 MB, which is within what the brief accepts. Recommendation: scan in row strips (e.g. 256 rows per `getImageData`) and stop at the first non-opaque pixel. Log it if it is not done now.
- scripts/check-dist.mjs:205-207 — the comment still says the bg controller was "11.4 KB gzip measured", while the new line says 14.0 before T2. Correct the comment so the next reader knows which number is real.

## Escalate to Architect
- **E-T2-a home description once T3/T4 ship.** Names are 110 characters with 9 live tools; "PDF JPG 변환" and "PDF 암호 해제·설정" push the full list past 120 whatever the suffix is, so the current three-tier fallback (src/data/site.ts:26-31) runs out at T3. Proposed rule: (1) Arch keeps an explicit ordered list `HOME_DESC_ORDER` in site.ts (search demand first: 사진 용량 줄이기, PDF 합치기, 증명사진, PDF 용량 줄이기, 사진 PDF 변환, …). (2) `defaultDescription` takes live tools in that order and adds names while `${names} 등 ${N}가지 도구. 가입 없이 무료.` (N = number of live tools) stays within 120; if every name fits, the existing long/short tiers apply as today. (3) Unit tests: 80-120 characters, deterministic, every listed name is live, and each tool left out still appears on the home cards and in llms.txt (so nothing is lost for search). This keeps "가입 없이 무료" in the text and makes adding tools a no-op for the description. Product choice of the order is yours.
- **E-T2-b remove-background controller budget 14 → 14.5 KB.** I accept the cause: the 0.1 KB is chunk-import overhead from sniff.ts/decode.ts becoming shared chunks, not new remove-background code, and 14.5 is still well under "measured + 20 %" (C1 rule, 14.1 × 1.2 = 16.9). I recommend approving it. The alternative (forcing those modules back into one chunk with manualChunks) would cost the /jpg-to-pdf/ controller more than it saves here. Arch rules, since budgets are an Arch decision.

## Cleared
I reviewed the image → PDF worker, embed/layout/limits, controller (run/cancel/reset/usage), page copy and FAQ, usage whitelist, gen-sw NOT_PRECACHED and the check-dist budgets against the TOOLS4 T2 brief. They pass. Details:
- EXIF orientation: raw only when orientation is 1/absent, with no rotation, 원본 size and not CMYK/truncated. Otherwise decoded by decodeImage, which applies orientation.
- Metadata: the strip runs before the raw embed. Re-drawn photos carry nothing. Producer/creator is 문서딱 and no title is set.
- Transparency: PNG only when a pixel is transparent. Otherwise the photo is put on white and saved as JPEG.
- Usage events: tool, phase and code only. No file name, size or content.
- Copy: the privacy line is identical to the sibling pages. The "정해진 값" wording on /privacy/ covers 용지.
- NOT_PRECACHED for /jpg-to-pdf/ follows brief decision 10 (466.9 KB over the 450 KB limit). The limit was not raised.
