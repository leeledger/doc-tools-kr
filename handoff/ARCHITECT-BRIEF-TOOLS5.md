# Architect Brief — Step TOOLS5: 사진 JPG 변환 + PDF 나누기·쪽 편집 + PDF 서명 넣기 (+ HWPX→HWP spike)

Author: Arch. Date: 2026-10-08. Worktree C:/dev/doc-tools/c2 (branch c2-cloud = origin/main 7e26a5b).
Basis: `C:/dev/doc-tools-kr/reports/문서딱 기능 시장성 조사.md` (ranks 5-8), `research_notes/문서딱 기능 시장성 조사/`
`feasibility.md`, `search_demand.md`. Every TOOLS4 rule (ARCHITECT-BRIEF-TOOLS4.md decisions 1, 2, 8-12, 16) applies
unless overridden here. BUILD-LOG not touched by Arch: Bob copies "Log notes" (end) into BUILD-LOG when U0 starts.

## Goal
Four sub-steps, each its own Bob → Richard → deploy gate: (U1) new /image-to-jpg/ converts HEIC·PNG·WEBP·JPG·AVIF·GIF·BMP
to JPG / PNG / WebP in batch; (U2) new /pdf-split/ splits, extracts, deletes, rotates and reorders PDF pages with
thumbnails; (U3) new /pdf-sign/ places a signature or stamp image on PDF pages; (U4) a written HWPX→HWP feasibility
report, no build. **Zero new npm dependencies, no new wasm.**

## Order (N+1 starts only after N is deployed and logged)
- **U0** refactor, no behaviour change (one commit, all gates green, existing budgets within 1 %).
- **U1** 사진 JPG 변환 `/image-to-jpg/` (rank 5, ~2만/월).
- **U2** PDF 나누기·쪽 편집 `/pdf-split/` (rank 7, ~7.5천).
- **U3** PDF 서명·도장 넣기 `/pdf-sign/` (rank 8; linked from /stamp-signature/).
- **U4** HWPX→HWP spike (rank 6). May run during U1-U3 review waits: it touches no shipped file.

## Locked decisions
1. **One tool per job, no per-format landing pages.** Search splits across "jpg 변환" 12,520 / "png jpg 변환" 10,260 /
   "heic 파일 jpg 변환" 7,930 / "webp jpg 변환" 890, but a page per pair would be the same tool with a swapped word
   (scaled-content policy, report §광고). One page carries all pairs in title / description / FAQ; depth comes from
   **guides with different facts** (U1: `heic-to-jpg` 아이폰 HEIC 설정·공유 시 변환; optional `png-to-jpg` 투명 배경과 용량),
   each only with a Step 0 source (Apple KR support page quote via check:quotes; no quote → no guide). Same for U2: one
   page for 분할/삭제/회전/추출/순서 (군집 7.5천 total; separate pages would be thin).
2. **Names, slugs, SEO** (Bob may tune wording; name = h1; description 80-120 chars; tests enforce):

   | slug | name = h1 | title |
   |---|---|---|
   | `image-to-jpg` | 사진 JPG 변환 | HEIC·PNG JPG 변환 — 아이폰 사진·PNG·WebP를 JPG로, 여러 장 한 번에 무료 &#124; 문서딱 |
   | `pdf-split` | PDF 나누기·쪽 편집 | PDF 분할·쪽 삭제·회전 — 나누기, 빼기, 돌리기, 순서 바꾸기 무료 &#124; 문서딱 |
   | `pdf-sign` | PDF 서명·도장 넣기 | PDF 서명 넣기 — 서명·도장 그림을 원하는 쪽에 무료로 &#124; 문서딱 |

   Description drafts: image-to-jpg 「아이폰 HEIC 사진, PNG, WebP를 JPG로 바꿉니다. 여러 장을 한 번에 바꿔 ZIP으로 받고,
   PNG·WebP로도 저장합니다. 촬영 위치 같은 정보는 지웁니다. 가입 없이 무료.」 / pdf-split 「PDF를 원하는 쪽으로 나누고,
   필요 없는 쪽은 빼고, 옆으로 누운 쪽은 돌리고, 순서도 바꿉니다. 쪽 그림을 보며 고르고 가입 없이 무료로 씁니다.」 /
   pdf-sign 「PDF 서명 넣기를 무료로. 서명이나 도장 그림을 원하는 쪽, 원하는 자리에 크기를 맞춰 넣습니다. 전자서명·도장
   이미지 만들기에서 만든 그림을 바로 씁니다.」 "밖으로 보내지 않습니다" only beside the picker / FAQ / privacy (TOOLS4
   decision 8). Slugs are ASCII and keyword-shaped like jpg-to-pdf / pdf-to-jpg; Korean keywords live in title/h1.
3. **HOME_DESC_ORDER (market rank):** id-photo, pdf-merge, photo-compress, pdf-compress, jpg-to-pdf, pdf-to-jpg,
   **image-to-jpg**, hwp-to-pdf, hwp-viewer, pdf-password, **pdf-split**, stamp-signature, **pdf-sign**,
   remove-background. Home cards and menu follow whatever rule they follow today (Bob mirrors; do not invent an order).
   Pinned-test rule from T3 applies (each sub-step adds its own id).
4. **No flags, live at deploy, NOT_PRECACHED + RUNTIME_PAGES from the start** for all three pages (cloud precache was
   429.7/450 KB after T4 r2; home/menu grow with each tool). Bob logs precache KB for all builds per sub-step. 450 KB is
   never raised.
5. **LCP / UI font (LCP brief round 2 rules):** page copy (src/pages/**, src/data/tools.ts FAQ, og/legal) is **core**;
   controller copy under src/tools/** and src/lib/** is **late**. Tripwire 94,884 B (core 400 + 800) is fixed; margins
   were ~2.1 KB (AUTOFRAME build), roughly 12-15 new Hangul syllables for all of TOOLS5. Rules: (a) write first-screen and
   FAQ copy with syllables already in core where a plain synonym exists; (b) gen-ui-font logs new core characters — Bob
   lists them per sub-step in BUILD-LOG with the remaining margin; (c) on breach: rephrase. Never raise the tripwire,
   never add a preload, never reintroduce weight 700. If copy cannot fit without hurting meaning, stop and escalate to
   Arch with the character list (options: shorter FAQ, or a late-face FAQ block below the fold).
6. **Engines (reuse only):** U1 = native decode (`decode.ts`, createImageBitmap) + canvas encode on the main thread
   (HTMLCanvasElement; works where OffscreenCanvas does not: WebKit Windows, older iOS), one image at a time with a yield;
   WebP = `canvas.toBlob("image/webp")`, and **if the returned blob type is not image/webp** (Safari) fall back to the
   existing lazy `@jsquash/webp` path from photo-compress; JPEG/PNG = toBlob. U2 = existing `merge.worker` / `mergePlus`
   (already takes `pages[]`, `rotate[]`, `password` per input): one input per run; split = one run per part,
   sequentially. U3 = pdf.js (preview via `inspect.ts`) + pdf-lib in a worker (new `sign.worker.ts`, or a `sign` message
   on merge.worker if that avoids a second pdf-lib copy; Bob picks the smaller and logs the gzip). qpdf not needed.
7. **HEIC (owner E2 stands):** native decode only; no libheif / heic2any. `.heic,.heif` in `accept` (as jpg-to-pdf).
   Undecodable HEIC → existing `ERRORS.heic` copy per row, other images continue. **Usage:** `fail c=heic p=parse`,
   distinct from `not-image` / `corrupt`, **once per picked batch** that has at least one undecodable HEIC (MAX_EVENTS 40
   per page; `br` already carries browser + major version, which is exactly what the E2 revisit needs). Bob checks
   (does not change) whether jpg-to-pdf already follows the same rule and logs it.
8. **U1 behaviour:** inputs jpeg / png / webp / heic / avif / gif / bmp (sniff, not extension); TIFF and unknown → row
   message (not-image). Output [JPG (default) | PNG | WebP]; quality chips for JPG/WebP [높음 (default) 0.92 | 보통 0.82 |
   작게 0.70]; no resize (result links /photo-compress/: "용량도 줄이려면"). Transparency: to JPG → white underneath, and
   if any pixel is transparent (`bandsHaveTransparency`) the row says "투명한 부분은 흰색으로 바뀝니다."; to PNG/WebP alpha
   kept. Animated GIF/WebP → first frame + row note. **Metadata:** every output is re-encoded from pixels (EXIF incl. GPS,
   XMP, comments gone; orientation applied on decode), except JPEG→JPEG at 높음 with orientation 1/absent, not CMYK, not
   truncated → lossless `stripJpegMetadata` (same rule shape as `canEmbedRaw`). Copy: "촬영 날짜·위치 같은 정보는 지우고
   저장합니다." Colour: decode converts to sRGB (default); logged as known behaviour. Canvas caps: phone area 16,000,000 px
   / edge 8,192; PC area 50,000,000 / edge 16,384; over → scaled to fit with row note "W×H픽셀로 줄여 저장했습니다." (never
   silent). Limits: phone 50 images / 50 MB each / 150 MB total; PC 200 / 100 MB / 500 MB (jpg-to-pdf numbers; reuse or
   mirror `planAdd`). Output: 1 file → `{base}.{ext}`; more → ZIP `{first base}_{jpg|png|webp}.zip`, unique names (U0
   helper); each row also downloadable.
9. **U2 behaviour:** one PDF. Thumbnail list (pdf.js, ≤ 160 px long edge, rendered lazily when visible, max 2 renders
   in flight); per page: 선택 checkbox, 돌리기 (90° steps), 빼기, ↑↓ + drag (`reorder.ts`); bulk: 모두 선택 / 고른 쪽
   돌리기 / 고른 쪽 빼기. Over 500 pages (phone 200): no thumbnails, page numbers only (operations still work). Save modes
   [편집한 PDF 하나로 (default) | 고른 쪽만 새 PDF로 (추출) | 범위대로 나누기 | N쪽씩 나누기 | 한 쪽씩 나누기]. Range-split
   syntax: one part per line **or** parts separated by ";" with `parseRange` per part — Bob picks one, shows an example
   under the field, unit-tests it, logs the choice. Names: `{base}_편집.pdf`, `{base}_추출.pdf`; split ZIP
   `{base}_나누기.zip` with `{base}_{first}-{last}.pdf`. Removing every page → button disabled, "쪽을 하나 이상 남겨
   주세요." Encrypted input: mirror pdf-merge exactly (open-password prompt; owner-only restrictions → its existing note).
   `hasSignature` → the T4 signature warning before download. Limits = pdf-merge LIMITS for one file; split parts cap
   phone 100 / PC 500 files per ZIP, else message with numbers.
10. **U3 behaviour:** pick PDF → pick image [PNG / JPG / WebP / HEIC (native)] or **arrive from /stamp-signature/**: its
    result gains "PDF에 넣기", which stores the PNG as a data URL in `sessionStorage` key `docttak:sign-png` (read once
    and removed on /pdf-sign/; QuotaExceeded → "PNG를 내려받은 뒤 PDF 서명·도장 넣기에서 골라 주세요." and still links).
    Placement on a pdf.js preview of the current page: drag to move, corner handle + slider to resize (aspect kept),
    arrow keys move 1 pt (Shift 10) for a11y; several placements; "같은 자리에 모든 쪽" / range via `parseRange`.
    Coordinates: placements stored in viewport space, converted with pdf.js `viewport.convertToPdfPoint` on both corners
    (handles /Rotate and CropBox origin); pdf-lib `drawImage` with `rotate: degrees(page rotation)` so the image is upright
    as seen. Pure `toPdfRect(viewRect, pageInfo)`. Output `{base}_서명.pdf`; producer 문서딱. Encrypted input: mirror
    pdf-merge; output has no password; note "암호 없이 저장했습니다. 다시 걸려면 PDF 암호 해제·설정을 쓰세요." + link.
    `hasSignature` → T4 warning. **Honest copy** (알아 두면 좋아요 + FAQ, near the top): "서명 그림을 문서 위에 얹는
    기능입니다. 인증서로 하는 전자서명과는 다르니, 받는 곳이 그림 서명을 받아 주는지 먼저 확인하세요." No legal claims
    beyond that; no 전자서명법 citation unless Step 0 quotes it. JPG signatures keep their white box (FAQ points to a
    transparent PNG from /stamp-signature/).
11. **Usage** (single source scripts/lib/usage.mjs; TOOLS += each slug in its own sub-step; `TOOL_LABELS` = names):
    - image-to-jpg: `SETTINGS.to = ["jpg","png","webp"]` (label 저장 형식; JPG / PNG / WebP).
    - pdf-split: `SETTINGS.save = ["edit","extract","ranges","every","each"]` (저장 방식; 편집한 PDF 하나 / 고른 쪽만 /
      범위대로 나누기 / N쪽씩 나누기 / 한 쪽씩 나누기).
    - pdf-sign: `SETTINGS.place = ["one","range","all"]` (넣을 쪽; 고른 쪽 / 범위 / 모든 쪽). The stamp-signature
      handoff adds no field.
    - Fail codes: heic, not-image, not-pdf, corrupt, too-many, too-big, wrong-password, canvas, encoder, oom, engine,
      unknown, no-pages (U2), no-image (U3). Never: file names, sizes, page/image counts, ranges, coordinates.
12. **Registration per tool** = TOOLS4 decision 9 list (tools.ts + FAQ numbers from limits.ts, page, og.json, gen-brand
    OG, JSON-LD, sitemap / llms.txt via existing generators, tool-facts, guides.ts NEXT_GUIDES (3 existing guides that fit,
    listed in the log), lighthouserc, qa:visual, site/polish/growth e2e lists, postbuild OG list, CLAUDE.md line 3,
    COPY.md if a new term, bgcloud LOCAL_SCOPE_RE, `updated`). Related tools: image-to-jpg → photo-compress, jpg-to-pdf,
    id-photo; pdf-split → pdf-merge, pdf-compress, pdf-to-jpg; pdf-sign → stamp-signature, pdf-merge, pdf-password;
    stamp-signature gains pdf-sign; pdf-merge gains pdf-split.
13. **Budgets:** each new lazy controller/worker = measured gzip + 20 %; initial JS per page < 30 KB; pdf.js / pdf-lib /
    jsquash load on first use only (check-dist assertion as for T2-T4).

## Flow diagrams
```
U1 /image-to-jpg/
pick (multi) -> planAdd limits -> sniff each --unknown/tiff--> row not-image
   v
row list (thumb 128 px, decoded one at a time); HEIC native fail -> row heic (+1 usage fail per batch)
options: 형식 [JPG|PNG|WebP]  화질 [높음|보통|작게] (JPG/WebP only)
   v  "N장 변환" -> per image (yield):
   strip only? (jpeg->jpg, 높음, orient 1, not CMYK) --yes--> stripJpegMetadata
        \--no--> decode (orientation, sRGB) -> caps clamp -> canvas (white fill if JPG) -> toBlob(type, q)
                 -> blob.type == requested? --no (webp on Safari)--> jsquash webp --fail--> row encoder
   v
1 ok -> download file | >1 ok -> ZIP (stored, unique names); rows: done / note / error; cancel = stop after current
```
```
U2 /pdf-split/
pick PDF -> inspect (encrypted? -> password as in merge) -> N pages
   v  thumbnails lazily (IntersectionObserver, 2 in flight); N > cap -> numbers only
edit state: order[], rotate[], removed{}, selected{}
   v  save mode
edit/extract -> merge.worker {pages, rotate} -> verify page count -> signature? warn -> download
split (ranges | every N | each) -> parts[] -> per part: merge.worker -> ZIP entry -> ZIP download
```
```
U3 /pdf-sign/
[stamp-signature "PDF에 넣기"] -> sessionStorage PNG -> /pdf-sign/ reads once, removes
pick PDF (password as in merge) -> pick image (or the stored PNG)
   v  preview page k (pdf.js) + overlay box: move / resize / keys; add more; copy to all / range
   v  "서명 넣어 저장" -> placements -> toPdfRect (convertToPdfPoint) -> worker: embed image once, drawImage per page
      -> verify page count -> signature? warn -> download {base}_서명.pdf
```

## Build Order
### U0 — refactor only (one commit, no visible change)
- `src/lib/zip/`: streaming stored ZIP from `src/tools/pdf-to-jpg/output.ts` (`JpegZip` → generic `StoredZip`) + the
  unique-name rule from `src/tools/photo-compress/zip.ts`. pdf-to-jpg imports it; photo-compress keeps `zipSync` unless
  switching is a pure move (Bob decides, logs; no behaviour change either way).
- Canvas caps: the clamp in `pdf-to-jpg/scale.ts` becomes pure `fitWithinCaps(w, h, caps)` in `src/lib/image/caps.ts`;
  `pageScale` calls it.
- Page thumbnails: pdf-merge first-page thumbnail render becomes `renderPageThumb(doc, index, maxPx)` in `src/lib/pdf/`
  (merge calls it with index 0).
- Gate: every existing budget within 1 %; astro.config manualChunks unchanged (do not move raster/reorder into ui-shared
  — LCP log 2026-10-07).

### U1 — /image-to-jpg/
- `src/tools/image-to-jpg/{limits,plan,convert,controller,entry}.ts`; `convert.ts` = pure decisions (`canStripOnly`,
  output type/quality, names) + thin canvas runner with injectable encoders (Node tests with @napi-rs/canvas as today).
- Page `src/pages/image-to-jpg/index.astro` (mirror /jpg-to-pdf/: hero, picker, 3-step 사용 방법, one 알아 두면 좋아요,
  FAQ 4-6 from: HEIC가 안 열려요 / PNG를 JPG로 바꾸면 투명한 곳은 / 촬영 위치 정보는 / 화질이 떨어지나요 / 몇 장까지 /
  WebP는 어디에 쓰나요).
- Step 0 (guide only): Apple Korea support page for 카메라 포맷 (높은 효율성 / 높은 호환성) and 사진 전송 "자동";
  quote via check:quotes. No quote → no `heic-to-jpg` guide (the page uses the already-shipped ERRORS.heic wording).

### U2 — /pdf-split/
- `src/tools/pdf-split/{limits,plan,controller,entry}.ts`; `plan.ts` pure: edit state → merge inputs; split syntax over
  `parseRange`; every-N / each partitions; names. Unit tests are the bulk of this sub-step.
- Thumbnails via U0 `renderPageThumb`; reorder via `startRowDrag` (list layout so the helper is reused as is; ↑↓
  always present for keyboard/touch).
- Flag: rotation = mergePlus `rotate` (extra clockwise degrees); preview may use a CSS transform.

### U3 — /pdf-sign/
- `src/tools/pdf-sign/{limits,place,controller,entry}.ts`, worker per decision 6; `place.ts` pure (`toPdfRect`,
  copy-to-pages, clamp the box inside the page).
- /stamp-signature/ change: "PDF에 넣기" on its result + related link; its e2e extended (stores and navigates; quota
  failure via a stubbed setItem).
- Image input reuses `sniff` / `decode` (HEIC native only).

### U4 — HWPX→HWP spike (report only)
- Facts in hand (`node_modules/@rhwp/core/rhwp.d.ts`, @rhwp/core 0.8.6, **MIT**, vendored wasm 9.9 MB < 25 MiB):
  `HwpDocument.exportHwp()` serializes to HWP 5.0 CFB, and "HWPX 출처 문서는 … HWPX→HWP IR 매핑 어댑터를 자동 적용";
  `exportHwpVerify()` returns `{bytesLen, pageCountBefore, pageCountAfter, recovered}`; `exportHwpWithReport()` returns a
  content-loss report (#4430). The engine claims the feature; fidelity is unverified.
- Spike tasks (Node + existing hwp worker; nothing shipped): on the HWPX fixtures in the repo plus 5 real public HWPX
  files (정부 서식 with 표·그림·머리말; URLs logged): exportHwpVerify + exportHwpWithReport; reload output with rhwp;
  compare page count and page-1 / last-page SVG text; log bytes, time, peak memory (desktop + phone emulation), loss
  report verbatim. **Owner check (not automatable):** open 3 outputs in 한컴오피스 한글 (and 한컴독스 if available):
  열림 / 깨짐 / 복구 안내 per file.
- Also report: HWPX gaps the viewer / hwp-to-pdf show on those files (`src/lib/hwp/features.ts`), worker memory vs
  `hwp-shared/limits.ts`, effort of a `/hwpx-to-hwp/` page reusing hwp-shared (session, boot, download, watchdog). Arch
  pre-estimate: page S-M (2-4 days) if the owner check passes; blocked if 한글 shows a repair dialog on ordinary forms.
- Output: BUILD-LOG "TOOLS5 U4 spike" + recommendation; no tools.ts entry, no page. A build gets its own brief (O4).

## Unverified claims (Bob probes and logs verbatim; none assumed)
- (a) `canvas.toBlob("image/webp")` returns image/png on WebKit (Playwright webkit + mobile-safari). Fallback tested
  either way.
- (b) The iOS Safari picker hands HEIC as-is when `accept` lists `.heic` (vs auto-converting to JPEG). Owner device
  check; either outcome works; log it.
- (c) `createImageBitmap` on animated GIF/WebP gives the first frame in all 3 engines (e2e fixture).
- (d) `convertToPdfPoint` + pdf-lib `drawImage({rotate})` gives an upright stamp on /Rotate 90 and 270 pages and on a
  CropBox with non-zero origin (e2e: render output with pdf.js, sample pixels).
- (e) mergePlus with one input and a page subset handles outlines/links sanely (existing report fields, no crash).
- (f) rhwp exportHwp output opens in 한글 (U4, owner).

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| U1 HEIC | Chrome/Windows cannot decode | row `heic` + guidance, others continue; 1 usage fail per batch | clear |
| U1 WebP on Safari | toBlob returns PNG silently | type check → jsquash fallback → else row `encoder` | correct file or clear error; never a mislabelled .webp |
| U1 big photo | 48 MP HEIC on iPhone over the canvas area | caps clamp + row note | clear note |
| U1 memory | 50 photos in one tab | one at a time, bitmaps/canvas released, limits | limit message before start |
| U1 transparency | PNG logo → JPG with black background | white fill + note; unit + e2e pixel check | clear note |
| U1 metadata | GPS survives the strip-only path | stripJpegMetadata; e2e asserts no EXIF/GPS in every output kind | - |
| U1 ZIP names | two IMG_0001.HEIC from different folders | unique-name helper | - |
| U2 range typo | "3-1", "9" on 5 pages | parser message with the example; button disabled | clear |
| U2 all removed | empty output | button disabled + message | clear |
| U2 thumbnails | 800-page PDF on a phone | cap → numbers only; lazy, 2 in flight | works, no thumbnails |
| U2 split | 500 one-page files | parts cap + streaming ZIP | message with numbers |
| U2/U3 signed PDF | editing breaks the 전자서명 | T4 warning before download | clear |
| U2/U3 encrypted | open password | merge prompt/retry; U3 output unencrypted + note | clear |
| U3 rotated page | stamp sideways or off-page | convertToPdfPoint mapping; unit + pixel e2e on rotated fixture | - |
| U3 handoff | sessionStorage quota / private mode | QuotaExceeded caught → message + plain link | clear |
| U3 trust | user thinks it is a certificate e-signature | honest copy + FAQ | clear |
| All | precache / budgets / font tripwire | build fails loudly (check-dist, gen-sw) | - |
| U4 | output opens with a repair dialog in 한글 | spike only; nothing ships without the owner check | - |

No critical gaps: every new path has handling plus a test, or fails the build.

## Test map ([GAP → new] unless marked)
Unit (vitest):
- U0: StoredZip entries + unique names; `fitWithinCaps` edges; pageScale suite [TESTED, regression]; photo-compress zip
  tests [TESTED, regression].
- U1: acceptance per sniff format; `canStripOnly` matrix (orientation, CMYK, quality, target type); names and ZIP names;
  quality mapping; caps note; planAdd limits; once-per-batch heic rule.
- U2: plan from edit state (order, rotate, removed); extract; split syntax (valid, overlapping, reversed, out of range,
  junk, empty part); every-N / each incl. short last part; names; parts cap.
- U3: `toPdfRect` rotation 0/90/180/270 × CropBox origin (0,0) and (36,36); clamp inside page; copy to all / range.
- usage.mjs: new tools / settings / values accepted, unknown rejected, admin labels Korean [TESTED → extend].
- postbuild / check-dist: sitemap, llms.txt, OG list; heavy engines not in initial JS; budgets; plain language; font
  coverage + tripwire [TESTED → extend].
E2E (all 5 projects, no-upload guard on every test):
- `image-to-jpg.spec.ts`: PNG with alpha → JPG (corner pixel white, JPEG SOI), → PNG (alpha kept), → WebP (RIFF/WEBP bytes
  on every engine; covers Unverified a); orientation-6 JPEG → upright; GPS-tagged JPEG → no EXIF/GPS on both paths;
  3 files → ZIP with 3 unique names; HEIC fixture → `heic` row on chromium/firefox; animated GIF → first-frame note;
  TIFF → not-image row; cancel mid-batch; controller not loaded with the page.
- `pdf-split.spec.ts`: 5-page fixture: delete 2, rotate 3, move 5 first → pdf-lib parse (4 pages, order by marker, /Rotate
  on the right page); extract "2-3"; range split into 2 PDFs (2 and 3 pages); each → 5 entries; encrypted → prompt →
  works; signed → warning; typo message.
- `pdf-sign.spec.ts`: PNG on page 1 → pdf.js render of output: stamp colour in the expected box ± 2 px; all-pages copy;
  rotated-90 and CropBox-offset fixtures (Unverified d); encrypted → note; signed → warning; arrival from
  /stamp-signature/; quota failure message.
- `stamp-signature.spec.ts` existing flows [TESTED, regression] + new button; `pdf-merge.spec.ts` thumbnails after U0
  [TESTED, regression].
- `usage.spec.ts` (cloud projects): each happy path with its setting; HEIC batch → exactly one `fail c=heic`; no body
  holds a file name, count, range or coordinate.
- site / polish / growth: page lists, related links, axe, no-late-face checks [TESTED → extend].
- Lighthouse: 3 new URLs, thresholds unchanged (LCP ≤ 2,000 ms); qa:visual light/dark.
CI: no new build variants; gates per sub-step = CLOUD-HANDOFF §3. TOOLS4 ran firefox/webkit only in CI and went red:
this time Bob runs each new spec on webkit + firefox + mobile-safari locally before review.

## Out of Scope (BUILD-LOG Known Gaps if they surface)
- AVIF output (needs a 3.3 MB encoder), resize in U1 (photo-compress does it), TIFF input, libheif (E2).
- Per-format landing pages; deep-link params for the new tools (except the U3 sessionStorage handoff).
- U2: several files (pdf-merge), inserting pages from another PDF, crop, page numbers, OCR.
- U3: drawing pad on /pdf-sign/ (O3), text fields, form filling, certificate signatures (PKI), date stamps.
- U4: any shipped change; HWPX editing.
- HEIC usage changes in photo-compress / id-photo (logged only if decision 7 finds a gap).

## Owner decisions (build proceeds on the defaults)
- **O1 names/slugs** (decision 2). Default as tabled. Renaming after ship needs a public/_redirects entry.
- **O2 HEIC** native only (E2, 2026-10-06). Default unchanged; revisit when /admin/ shows `fail c=heic` volume by browser.
- **O3 drawing pad on /pdf-sign/.** Default no: link to /stamp-signature/ + "PDF에 넣기" handoff (one signature UI to
  maintain, fewer new glyphs). Option: embed `stamp-signature/pad.ts` as a second tab (+1-2 days).
- **O4 HWPX→HWP tool.** Decided after the U4 report and the owner 한글 test on 3 files. Default: no build until then.
- **O5 push.** Default: TOOLS4 standing go-ahead (push each sub-step when Richard is clear and CI is green); owner
  confirms once at U0.

## Acceptance (per sub-step)
- U0: no visible change; gates green; budgets within 1 %; existing tests unchanged + new pure tests.
- U1-U3: page live (nav, home, sitemap, llms.txt, OG, JSON-LD, related); new e2e green on all 5 projects with the
  no-upload guard; usage verified (U1: one heic fail per batch); NOT_PRECACHED + RUNTIME_PAGES; precache ≤ 450 KB in all
  builds; font tripwire passes, new core characters listed; Lighthouse LCP ≤ 2,000 ms on the new URL; COPY.md; Richard
  "clear"; live smoke with real output checks (U1 type/bytes/no GPS; U2 order/rotation; U3 stamp position on a rotated
  page).
- U4: BUILD-LOG spike section with verbatim probe output, owner 한글 results, effort, recommendation.

## Log notes (copy into BUILD-LOG "TOOLS5 — brief" when U0 starts)
- 2026-10-08 Arch: TOOLS5 brief (owner task: 시장 조사 5-8위). Order U0, U1 /image-to-jpg/, U2 /pdf-split/, U3
  /pdf-sign/; U4 HWPX→HWP spike (report only).
- Locked: one page per job, no per-format landing pages (scaled content); depth via sourced guides; no new deps / wasm;
  HEIC native only with a distinct once-per-batch `fail c=heic`; U1 main-thread canvas with WebP type check + jsquash
  fallback; U2 reuses mergePlus pages/rotate; U3 convertToPdfPoint mapping + pdf-lib drawImage, honest "그림 서명" copy,
  signature warning; all three NOT_PRECACHED + RUNTIME_PAGES; font tripwire fixed, rephrase on breach.
- rhwp 0.8.6 (MIT) exposes exportHwp with a HWPX→HWP adapter, exportHwpVerify and a loss report; U4 checks fidelity.
- Open: O1-O5.
