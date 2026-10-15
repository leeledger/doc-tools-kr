# Review Feedback — STAMP1015 S0–S5 + LCP fix (/stamp-maker/ 도장 만들기)
Date: 2026-10-16
Reviewer: Richard
Branch: stamp-1015 (c1ce68c..709c090 on 7dd9ef6)
Ready for Builder: NO (1 Must Fix). Verdict: NOT CLEAR

Checked: vitest stamp-maker, pdf-sign, usage and stamp-signature (4 files, 263 passed). Diff read in full for sign-handoff,
pdf-sign controller, stamp-signature pad/photo, layout, fonts, render, styles, limits, png, controller, entry, the page,
tools.ts, usage.mjs, affiliate.ts, check-dist block, guides and COPY.md. The unit tests and the test helper were read.

## Must Fix
1. src/tools/stamp-maker/entry.ts:38-49 + src/pages/stamp-maker/index.astro:47-53 (confidence 8). Brief D3 says: "Before the
   user types, the grid paints sample text 「홍길동」 (「문서딱」 for corp styles)". The page lead also says the shapes "한 번에
   보입니다". Since 72402b9 the grid does not paint until the visitor makes a user signal. Until then it is 12 white 88 px
   squares with names, and after the signal it waits for idle, the controller, 31 KB gzip of font CSS and the slices. On a
   slow phone that is several seconds of empty boxes, which look broken in the first impression. Moving the import was the
   right call for LCP, and it should stay. The fix is the one Arch preferred, and I endorse it:
   - Commit 12 static sample images (or one sprite) under public/. Generate them with the same render.ts and layout.ts on
     @napi-rs/canvas, using the slice-aware fonts from tests/helpers/stamp-fonts.ts. Put the generator in scripts/. Commit
     the output so the Pages build does not depend on Skia binaries.
   - Make them 176 px (2x), shown at 88 px, as an indexed PNG or lossless WebP. Each should be about 2-3 KB, 30 KB total or
     less.
   - Markup inside each tile: img with width="88" height="88" alt="" decoding="async" loading="lazy", over the canvas. The
     tile name stays the accessible name. The controller hides the img when it first paints that tile live.
   - Add a staleness guard: store a hash of styles.ts, layout.ts, render.ts and limits.ts next to the images. A unit test
     fails when those sources change and the images are not regenerated. Do not compare bytes, because Skia output varies
     by platform.
   - Keep them out of the precache (gen-sw NOT_PRECACHED or runtime), or count them. Precache is 424.3 / 450 KB.
   - check-dist: the 12 files exist, every tile references one, there is still no /fonts/hwp/ reference in the HTML, and the
     total size is within budget.
   - e2e: before any signal, every tile img has naturalWidth > 0 and there are 0 /fonts/hwp/ requests. After the
     controller paints, the imgs are hidden and the canvases differ from blank.
   - LHCI /stamp-maker/ median of 5: LCP 2,000 ms or less, and no worse than 1,667 ms + 5 %. The images are 88x88, so they
     cannot become the LCP element. Measure anyway.
   I see no better option. Painting the SVG frames without text shows no name. Paths built from font outlines add about
   50 KB to the HTML. Loading the fonts at load + idle brings back the 2.15 s LCP.

## Should Fix
1. src/tools/stamp-maker/controller.ts:379 (confidence 8). The texts list includes the constant 인지印之, which requests 印 and
   之 on every refresh, so Hangul-only visitors also fetch one or two Hanja slices (13-41 KB each). That goes against D5
   ("Only the unicode-range slices that text needs"). Add 印之 only when scriptOf(typed text) is hanja (or when the suffix
   control would produce them), and 인지 otherwise.
2. src/tools/stamp-maker/fonts.ts:56 + controller.ts:383-386 (confidence 6, verify). Two problems:
   - A (face, weight) key whose characters are in no slice gets faces.length === 0, which counts as a font failure. Example:
     a Hanja name whose characters are outside the slices, the Known Gap. The person then sees 「인터넷 연결을 확인해
     주세요」 and fail c=font is sent, even though nothing is wrong with the connection.
   - fail c=font is also sent when the 4 s race is lost but the late load succeeds, which inflates the statistics.
   Fix: count an empty faces list as ok when document.fonts.check(font, chars) is true, and report c=font only when late
   resolves false.
3. src/tools/stamp-maker/layout.ts:230-235 / 222 (confidence 6, verify the convention). In a 사각 인감 with 붙이지 않음 and 3
   characters, distribute() gives 「홍길 | 동」, so the given name is split and its last character is drawn tall. The usual
   2-column seal has the surname alone in the right column (tall) and the given name in the left column: 「홍 | 길동」. For
   the personal square styles with n = 3 and no suffix, put the single cell first (k = 2 gives [1, 2]). Keep the current
   rule for corp-square, where a company name reads straight through. Update the unit test at :213-217.
4. scripts/check-dist.mjs:~307 (confidence 7). The banned-phrase list is 법적 효력이 있습니다 / 인감 대신 / 인감 등록. The
   builder chose correctly: the brief prefix 「법적 효력이 있」 would match FAQ 2 itself. But the list misses the 해요체 and
   adjective forms the site uses. Add 「법적 효력이 있어요」, 「법적 효력이 있는」 and 「인감으로 쓸 수」. The question
   「…있나요?」 still passes.
5. tests/unit/stamp-maker.test.ts:328 (confidence 7). The probe (e) coverage test reads only the -700-normal.woff slices.
   가늘게 paints from the 400 slices, which are not checked. Run the same assertion over 400.

## Escalate to Architect
1. S5 /stamp-signature/ title (ad8dac4). The old title 「전자서명·도장 이미지 만들기 — 배경 없는 PNG 무료」 matches the h1
   and contains the exact query 「도장 이미지 만들기」 (2,460/month), as do the stamp-image guide query and answer. The new
   title 「전자서명 만들기 — 서명 그리기·도장 사진 배경 지우기」 drops that phrase while the h1 still has it. /stamp-maker/
   is not indexed yet, so for 2-4 weeks neither page may rank for 도장 이미지. The photo intent is kept (「도장 사진 배경
   지우기」), but the keyword is not.
   My recommendation: ship S4 in Deploy B and hold S5 until Search Console shows /stamp-maker/ impressions for 도장 만들기
   and 도장 이미지 만들기. Alternatively, ship a title that keeps the h1 phrase: 「전자서명·도장 이미지 만들기 — 서명
   그리기·도장 사진 배경 지우기 | 문서딱」.
   This is an SEO trade-off for Arch or the owner to decide, not a code question. S5 is its own commit and can be reverted
   on its own.

## Answers to the open questions
1. LCP deviation: the trade-off is right. The empty tiles are not acceptable. See Must Fix 1.
2. 「라운드 사각」: acceptable. Stamp shops use 라운드형, and it is clear. 「둥근 사각」 is more natural, so switch back when
   둥 and 근 enter the core set. The placeholder 「이름 또는 회사 이름」 and the sample line 「예시 글자로 보여 드려요. 위에
   글자를 쓰면 바뀌어요.」 are natural.
3. corp-square 자동: the builder rule is better than the literal brief. In effect it fills the grid whenever 인 or 지인 can
   do it (2, 3, 7, 8, 14, 15), and otherwise adds 지인 only when the grid does not grow. The literal reading gives a 4x4
   grid with 6 empty cells. Accepted, and it is logged. Some counts (5, 6, 10-13) still leave uneven columns; that is fine.
4. Probe (e): accepted. Keeping U+F92C and U+F9B8 and sending 隙 to Serif is correct. The test runs over all 4,888 KS X 1001
   characters (700 only; see Should Fix 5).
5. Grid reading: columns x rows, right to left, is correct for the vertical styles. See Should Fix 3 for the 3-character
   no-suffix case.
6. Banned phrase: accepted, with more phrases to add (Should Fix 4).
7. 해요체 for in-tool states and 합니다체 for 사용 방법 and the FAQ is the site pattern. Accepted.

## Notes (no action needed)
- S0 has no regression. Every caller passes from positionally (pad.ts:220, photo.ts:458, controller.ts:499). The tests were
  updated. takeSignPng removes both keys, and missing, unknown or __proto__ values fall back to stamp-signature
  (Object.hasOwn). The stamp-signature wording through arrivedNote and arrivedInfo is byte-identical. Rolling back on a
  throw leaves nothing behind.
- Layout tests are real. The ink is measured from the fontsource slices registered per unicode-range. Inside-region and
  separating-axis no-overlap checks run over 12 styles x n = 1…max x Hangul, Hanja and Latin x weights and lines, the arc
  covers 3-20, and the em-box fallback is tested too.
- Fonts: the controller paints only after fonts.load and check(). The e2e test compares tiles from the web face and the
  system face on 5 projects, so tofu or fallback would show up.
- PNG: transparent corners, a 1 % EDGE margin (the ink is 98 % of the chosen mm), and pHYs right after IHDR with the CRC
  checked. 600 and 1,200 ppi, 354 and 709 px at 15 mm. The file name has no typed text.
- Usage: start is sent with o=style and v=id only. There are no text, length, colour, size, seed or date fields.
  success, download, next (t = stamp-maker) and fail (font, canvas, encoder, unknown, engine) are sent.
- Legal copy is honest. FAQ 2, the 알아 두면 좋아요 block and the late note do not promise any legal effect.
- Budgets: the controller is 11.3 / 13.6 KB (11.3 x 1.2 = 13.56), initial JS 8.9 / 30, precache 424.3 / 450, 0 new core
  glyphs.
- Drift (harmless): CLAUDE.md line 3 also gained 「PDF 글자 넣기·편집」, which was missing before. Fine.
- The pdf-sign hint (「PDF에 찍기」나 「PDF에 넣기」를 누르세요) is correct but a little long. Optional.

## Cleared
S0 hand-off, the layout, font, PNG and usage logic, the copy and the budgets were reviewed and pass. The only item blocking
Deploy A is Must Fix 1 (the empty tiles before any user signal). S5 waits on the Arch decision.
