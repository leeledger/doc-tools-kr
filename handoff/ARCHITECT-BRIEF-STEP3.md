# Architect Brief — Step 3: 사진 용량 줄이기 `/photo-compress/`

Author: Arch. Date: 2026-09-29.
Status: **staged**. The orchestrator promotes this into ARCHITECT-BRIEF.md after Step 2 ships.
Program plan and the §0 non-negotiables, §3 quality gates, §4 legal texts, §5 SEO rules and §6 handoff protocol: ARCHITECT-BRIEF.md (Step 2 version). They all apply unchanged.
Evidence (local, git-ignored):
- `spikes/photo/SPIKE-PHOTO.md` §2
- `spikes/photo/results/compress.json`
- `spikes/photo/web/lib/{imaging,metrics}.js`

## Goal
`/photo-compress/` shrinks one or many photos in the browser.
- **Modes:** to a target KB (guaranteed ≤ target), to a percent, or at a fixed quality.
- **Output:** EXIF orientation honoured, sRGB, baseline JPG by default, EXIF/GPS stripped.
- **Review and download:** a before/after zoom compare, then download per file or as one ZIP.

## Slug decision: keep `/photo-compress/`
- It is already in `src/data/tools.ts`, in the program plan and on the home card. Changing it adds churn for no gain.
- A Korean slug (`/사진-용량-줄이기/`) is percent-encoded in KakaoTalk and mail shares, in the sitemap and in logs. Naver and Google weigh the title, H1 and body far more than URL words.
- "photo" matches the head term 사진 용량 줄이기 (29,000/mo), not 이미지 (4,390). It is also consistent with `/pdf-compress/`.
- Secondary terms go in the copy:
  - 이미지 용량 줄이기: lead and FAQ
  - 증명사진 용량 줄이기: FAQ
  - 사진 KB 줄이기: lead

## Flow
```
files picked / dropped (main)             limits: count, bytes (3.4) ── hard ─► row error
  │ per file: header bytes (+ tail via blob.slice) ─► sniff.ts (pure)
  │   heic ─────────────► still try decode (Safari can) ── fail ─► row "heic" guidance
  │   tiff / unknown ───► row "unsupported" / "not-image"
  │   animated gif/webp/apng ─► row "animated"
  │   jpeg: no EOI after SOS │ png: no IEND ─► row "corrupt" (truncated)
  │   header dims ─► megapixel and side limits (soft: confirm │ hard: row error)
  ▼ [사진 용량 줄이기]
worker (one per run, items sequential, run token)
  per item:
   1 decode   createImageBitmap(blob,{imageOrientation:'from-image'}) (+resizeWidth/Height if capped)
              throws ─► heic (if sniffed) │ corrupt
              cap ignored (bitmap still too big) ─► OffscreenCanvas downscale, close original
   2 kept?    target mode, in ≤ target, jpeg, orientation∈{absent,1}, !cmyk ─► jpeg-strip ─► done(stripped)
   3 raster   OffscreenCanvas 2d {colorSpace:'srgb'}; max long edge; JPG + real transparency ─► white fill
   4 size     target|percent: fitToTarget (canvas-JPEG probe, q 0.92 → floor 0.50, else scale ×
              min(0.9, √(t/s)·0.97)); long edge ≤ 64 and still over ─► q 0.05–0.50 ─► none: target-unreachable
              quality: no search
   5 final    fast mode ─► canvas blob
              JPG: lanczos3 (@jsquash/resize) to (w,h) ─► MozJPEG baseline, integer q in
                   [max(50,qc−5), min(95,qc+20)]; none fits ─► canvas blob; MozJPEG init fails ─► canvas + note
              WebP: jsquash webp q in [50,95] at (w,h); none ─► scale ×0.9, ≤ 5 rounds ─► target-unreachable
   6 verify   target|percent: bytes ≤ target, else discard ─► unknown
              createImageBitmap(out) dims == (w,h), else ─► verify
              quality|percent: out ≥ 0.99·in ─► kept rule
   7 post     item-done {bytes, thumb, report} (transfer); bitmap.close(); canvases width=0
  worker crash (onerror/OOM) ─► current row "oom"; fresh worker continues with the next item
  cancel ─► terminate; done rows stay; running + pending rows ─► 대기
  ▼
done list: before→after, −N %, dims, notes, 내려받기 │ 모두 내려받기 (ZIP, fflate store)
compare viewer (selected row): 원본 | 결과, slider + zoom 1×/2×/4× + pan
```

## Build Order

### 0. Preparatory refactors (behaviour-neutral; all Step 1–2 tests stay green before anything new)
1. **Shared codec loader.** Move the jsquash loading out of `src/lib/pdf/compress/wasm-browser.ts` into `src/lib/codecs/wasm-browser.ts`.
   - Granular loaders: `loadMozjpegEncoder()`, `loadMozjpegDecoder()`, `loadResize()`, and later `loadWebpEncoder()`.
   - Each compiles its module once per worker, keeping `compileStreaming` with the ArrayBuffer fallback.
   - The PDF file keeps the qpdf loader and composes `loadCodecs()` from the new loaders.
   - The network-guard allowlist names exactly these two files, each with a comment.
   - **Proof:**
     - Step 2 unit and e2e tests are green.
     - `regress:compress` output is identical before and after. Paste both tables.
     - `check-dist.mjs` asserts that `dist/` holds exactly one `mozjpeg_enc*.wasm`, shared by both workers.
2. **Step 2 carry-overs.** Arch lists any non-blocking Step 2 review items here at promotion. If there are none, write "none".

### 1. Dependencies (exact pins; log each in BUILD-LOG with its license before use)
- `@jsquash/webp@1.5.0` (Apache-2.0; libwebp BSD-3 in `codec/LICENSE.codec.md`).
  - Its dependency `wasm-feature-detect` is pinned exactly at the version npm resolves (spike: 1.9.0, Apache-2.0).
  - Encoder only. Both `webp_enc.wasm` and `webp_enc_simd.wasm` ship.
  - SIMD is detected with `simd()`. The chosen URL is compiled in `src/lib/codecs/wasm-browser.ts`, so every fetch stays in the allowlisted file.
- `fflate@0.8.3` (MIT) becomes a **direct** dependency.
  - Use the exact version already in the lockfile, where it is a transitive dependency of `@cantoo/pdf-lib`. No second copy.
  - Import only `zipSync`, dynamically, on the ZIP click.
- **Not added:**
  - `@jsquash/avif`: 3.49 MB wasm, 2–5× slower, and not accepted by 기관 uploads
  - `exifr`: sniff.ts reads the few tags we need
  - any HEIC decoder: LGPL, locked decision
- `licenses.manifest.json` adds:
  - `@jsquash/webp`: `LICENSE` and `codec/LICENSE.codec.md`
  - `wasm-feature-detect`
  - `fflate`, if not already listed

  `check:licenses` stays green.
- **Dev only:** Pillow, for one CMYK fixture (see Tests). Record its license (HPND) in SOURCES.md. It is never shipped.

### 2. Shared image module — `src/lib/image/` (framework-free; the pure parts run in Node; Step 4 reuses it)

| File | Content |
|---|---|
| `sniff.ts` | `sniffImage(bytes): Sniff`, pure. **format** `jpeg / png / webp / gif / bmp / avif / heic / tiff / unknown`, from magic bytes only (never the extension or MIME). HEIC brands `heic heix hevc hevx mif1 msf1`; `avif avis` = avif. **width/height** from the header: JPEG SOFn, PNG IHDR, GIF LSD, WebP VP8/VP8L/VP8X, BMP, ISOBMFF `ispe`; `undefined` if absent. **orientation** 1–8 from EXIF IFD0 (II and MM). **hasGps** (tag 0x8825), **hasExif**, **hasXmp**. **cmyk** (JPEG SOF with 4 components). **progressive** (SOF2). **animated**: GIF with more than 1 image descriptor; WebP VP8X animation flag or `ANIM` chunk; PNG `acTL` before `IDAT`. **alphaPossible**: PNG colour type 4/6 or `tRNS`; WebP alpha flag; VP8L. **truncated**: JPEG without EOI after the first SOS; PNG without IEND. Bounds-checked, never throws: malformed input gives `unknown` or `truncated`. |
| `decode.ts` | Worker-side `decodeImage(blob, sniff, {maxLongEdge?})` returns an ImageBitmap. It calls createImageBitmap with imageOrientation `from-image`, colorSpaceConversion `default` and premultiplyAlpha `default`, plus resizeWidth / resizeHeight and resizeQuality `high` when a cap applies. For orientation 5–8, swap the stored dims before computing the resize. If the bitmap is still over the cap (option ignored), downscale it via an OffscreenCanvas and close the original. Errors map to `heic` when sniff said heic, otherwise to `corrupt`. |
| `raster.ts` | `toCanvas(bitmap, w, h, {flatten})`: an OffscreenCanvas 2d with colorSpace `srgb` and imageSmoothingQuality `high`, white-filled first when `flatten`. `hasTransparency(imageData)`: a full scan for alpha < 255. `releaseCanvas(c)`: sets width and height to 0. |
| `fit.ts` | Pure, with injected encoders. `fitToTarget(src, target, {probe, qMax 0.92, qFloor 0.5, minLongEdge 64, allowDownscale true})` ports spike `fitToTarget` + `searchQuality`: step 0.01; accept hi first, then lo, then binary. Downscale factor `min(0.9, √(target/lowSize)·0.97)`. At the minimum edge it searches `[0.05, qFloor]`. Returns `{bytes, q, w, h, scale, rounds, tries}` or `null`. `allowDownscale false` returns `null` instead of scaling (Step 4 prep, unit-tested now). `finalSearch(pixels, target, {encode, lo, hi})` binary-searches integer q and returns the largest fitting q, or `null`. |
| `jpeg-strip.ts` | `stripJpegMetadata(bytes)`, lossless and pure. **Keeps** SOI, APP0 JFIF, APP2 **ICC_PROFILE** only, APP14 Adobe, DQT, DHT, DRI, SOF, SOS and the scan data through the first EOI after SOS. **Drops** APP1 (Exif, XMP), any other APP2 (e.g. MPF), APP3–APP13, APP15, COM, and **every byte after EOI** (MPF secondary images and vendor trailers can carry GPS). The output must re-sniff as JPEG with the same dims. |
| `engine.ts` | `compressPhoto(input, options, deps)` returns `{bytes, mime, report}`, implementing Flow steps 2–6. `deps = {decode, toCanvas, canvasJpeg(canvas, q), mozjpeg?, resize?, webp?}`, so Node tests can inject real or fake encoders. |
| `report.ts` | `PhotoReport`: inBytes, outBytes, inW, inH, outW, outH, format, q, encoder (`mozjpeg / canvas / webp / stripped`), scaled, flattened, cmykConverted, mobileCapped, mozjpegFallback, gpsRemoved, exifRemoved, and ms for decode, search and final. No file names. |
| `messages.ts` | The error and note copy of 3.2, as constants. Step 4 reuses the heic, corrupt and animated copy. |
| `photo.worker.ts` | Module worker. **In:** `run {items [{id, file}], options, device}` (File objects are structured-cloned, no byte copy). **Out:** `item-phase {id, phase}` with phase `decode / search / final`; `item-done {id, bytes, mime, thumb, sourcePreview?, report}` with transfers; `item-error {id, code}`; `run-done`. `thumb` is a canvas JPEG at q 0.8 with long edge 160. `sourcePreview` is a canvas JPEG at q 0.92 of the working bitmap, sent only when the mobile cap was applied. |

**MozJPEG options (all paths).** Use the jSquash defaults, as the spike did, except progressive = false (baseline). Baseline is a precaution for 기관 validators (spike §2.3).
- Baseline may cost 2–4 % in size compared with the spike.
- The regress tolerances should absorb that. If they do not, raise a Flag.

**Encoder rules**
- **Target mode:** target = KB × 1000 bytes, and 1 MB = 1,000,000 bytes.
  - The result then fits the limit under both the 1000 and the 1024 convention.
  - Displayed sizes use 1024 and are rounded **up** to 0.1 KB, so the UI never shows a smaller number than Windows Explorer does.
- **Percent mode:** target = floor(inBytes × p / 100), with p from 10 to 90.
- **Quality mode:**
  - one encode at q (MozJPEG integer q, or canvas q/100 in fast mode)
  - at the max-long-edge size
  - no size guarantee
- **Max long edge:** applied first in every mode. It never upscales.
- **Kept rule:** it applies when the input already fits (target mode), or when the output is ≥ 0.99 × the input (percent and quality modes). Then:
  - A JPEG input with orientation absent or 1 that is not CMYK returns the stripped original.
  - Otherwise, target mode runs the pipeline normally.
  - Otherwise, the other modes mark the row `kept`, with no download.
- **Output format:** JPG by default for every input: JPEG, opaque PNG, WebP, GIF, BMP and AVIF.
  - **Transparent PNG or WebP with JPG output:** flatten onto white and show the flattened note.
    - Flatten only when `alphaPossible` **and** `hasTransparency` are both true.
    - An opaque RGBA PNG gets no note.
  - **WebP output (opt-in):**
    - Keeps alpha and never flattens.
    - Fast mode does not apply. Canvas WebP encoding is missing in Safari, so WebP always uses jSquash.
  - **PNG output** is never produced. Lossless PNG optimisation is a Known Gap.
- **Colour:** output is sRGB. A CMYK JPEG is decoded by the browser, converted, and noted.

### 3. Tool page `/photo-compress/`
Files:
- `src/pages/photo-compress/index.astro`
- `src/tools/photo-compress/controller.ts`
- `src/tools/photo-compress/limits.ts`
- `src/tools/photo-compress/queue.ts`: pure. Item states, next item, crash handling, cancel reset. Unit-tested.
- `src/tools/photo-compress/options.ts`: pure. Parses and validates the mode and options, and computes the target.
- `src/tools/photo-compress/zip.ts`: pure. `buildZip(entries)` dedupes names (`_2`, `_3`) and calls zipSync with level 0.
- `src/tools/photo-compress/compare.ts`: the compare viewer.

#### 3.1 Server-rendered content (합니다체, docs/COPY.md)
- **H1:** "사진 용량 줄이기".
- **Title** (§5 pattern): "사진 용량 줄이기 — 업로드 없이 브라우저에서 무료로 | 안올림".
- **Description** (102 characters, checked): "파일 업로드 없이 브라우저에서 사진 용량 줄이기. 100KB·200KB·500KB 등 원하는 용량에 맞춰 화질은 최대한 지키고, 위치 정보(EXIF)는 지웁니다. 회원가입 없이 무료."
- **Lead:** "사진과 이미지 용량을 원하는 KB 이하로 줄입니다. 화질은 최대한 지키고 위치 정보(EXIF)는 지우며, 사진은 서버로 전송되지 않습니다."
- **사용 방법:**
  1. 사진 선택 (여러 장 가능)
  2. 목표 용량 고르기
  3. 한 장씩 또는 ZIP으로 내려받기
- **안전한 이유:**
  - "사진은 이 기기 안에서만 처리되고 어디에도 전송되지 않습니다."
  - "촬영 위치(GPS) 같은 사진 정보(EXIF)는 결과 파일에서 지워집니다."
  - "회원가입이 필요 없습니다."
- **FAQ**, 6 questions, 2–4 sentences each:
  1. **원하는 KB 이하로 정확히 맞출 수 있나요?**
     - Yes: the result is always at or below the target.
     - 1 KB counts as 1,000 bytes, so the file stays under the limit on any site.
     - When the target is very small, the tool reduces the pixel size rather than dropping the quality too far.
  2. **화질이 많이 떨어지나요?**
     - Quality is never pushed below a set level, because 깍두기처럼 깨지는 현상 starts there. The pixel size is reduced instead.
     - The encoder used stays sharper at the same size.
     - 빠른 모드 gives up a little quality for speed.
  3. **증명사진 용량 줄이기에도 쓸 수 있나요?**
     - Yes, for KB limits such as 200 KB or 500 KB.
     - If the site also requires exact pixel dimensions, check its rules first.
     - Do not mention the Step 4 tool until it is live.
  4. **아이폰 사진(HEIC)도 되나요?**
     - Some browsers cannot open HEIC. Give the guidance: change the iPhone camera setting, or export as JPG.
     - The sentence saying the photo library usually hands over a JPG ships **only after** the manual iPhone check (see Acceptance). Until then, omit it.
  5. **PNG나 투명 배경 이미지도 되나요?**
     - PNG is saved as JPG, and transparent areas become white.
     - To keep transparency, choose WebP, after checking that the destination accepts WebP.
  6. **여러 장을 한 번에, 휴대폰에서도 줄일 수 있나요?**
     - Up to 50 photos on PC and 20 on a phone, with the numbers from 3.4.
     - On a phone, a photo whose long edge is over 4,096 px is processed at 4,096 px.
     - Name no browsers.
- **Also on the page:** RelatedTools after the FAQ, AdSlots (empty), and JSON-LD per §5.

#### 3.2 States
The states are empty → ready → working → done. In done, the list can hold mixed row states.
- One aria-live polite region announces the run start, a cancel, and the final summary: "12장 중 11장을 줄였습니다. 1장은 줄이지 못했습니다."
- Per-row status is visible but not announced.

**empty**
- File input labelled "사진 선택", `multiple`. Accept: `image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif`.
  - HEIC is deliberately left out, so iOS converts to JPEG. This is unverified; see Acceptance.
- Drop area: "또는 여기에 사진을 끌어다 놓으세요".
- "사진은 이 기기 밖으로 전송되지 않습니다." with a /privacy/ link.

**ready**
- A list of rows. Each row has:
  - an icon (thumbnails come later, from the worker)
  - the name, the size and the header dims
  - a "위치 정보 있음" badge when `hasGps`
  - the row error, if any
  - 삭제
- "사진 추가" appends to the list.
- Fieldset **"줄이는 방법"**, with three radios:
  - **목표 용량** (default)
    - Chips as a radio group: 100 KB, 200 KB, 300 KB, **500 KB (default)**, 1 MB, 직접 입력.
    - 직접 입력 is a KB number input, 10–20,000, validated inline.
    - Help: "결과 파일이 이 용량보다 크지 않게 맞춥니다."
  - **비율**
    - Options: 70 %, **50 %** (default), 30 %, 직접 입력 (10–90).
    - Help: "원래 용량의 몇 %로 줄일지 고릅니다."
  - **화질**
    - A range input, 10–95, **default 80**, with the value shown.
    - Help: "숫자가 클수록 선명하고 용량이 큽니다. 용량은 사진마다 다릅니다."
- Select **"최대 크기 (긴 변)"**:
  - Options: **원본 크기 유지** (default), 3840, 2560, 1920, 1280, 800 px, 직접 입력 (64–16,384).
  - Help: "사진이 이보다 크면 비율을 유지하며 줄입니다. 키우지는 않습니다."
- A details element **"저장 형식: JPG"** with radios **JPG (기본)** and WebP.
  - WebP help: "투명한 배경을 유지합니다. 제출하는 곳이 WebP를 받는지 먼저 확인하세요."
- Checkbox **빠른 모드**: "처리 시간이 짧은 대신 같은 용량에서 화질이 조금 낮습니다. 오래된 휴대폰에 알맞습니다."
  - When WebP is chosen, it is disabled and the reason is shown.
- Button **"사진 용량 줄이기"**. It is disabled when no row is valid or when an input is invalid.
- Soft-limit confirm panel with "계속 줄이기" and "취소", as in Step 2.

**working**
- A progress element (max = N) and the text "사진 줄이는 중… (3/12)".
- Row status is one of 대기, 불러오는 중, 용량 맞추는 중, 마무리 중, 완료 or 오류.
- **취소** terminates the worker and bumps the run token.
  - Finished rows keep their results. Every other row returns to 대기.
  - The state becomes done if at least one row finished, otherwise ready.

**done**
- Each row shows:
  - the thumbnail (the worker's `thumb`) and the name
  - "3.2 MB → 487.3 KB" and "85 % 줄었습니다". The percent is floor(100 × (1 − out/in)), clamped to 0–100.
  - dims "4032×3024 → 1920×1440" when the photo was scaled
  - notes
  - **내려받기**: an `a download` link to a blob URL
- Above the list:
  - "모두 내려받기 (ZIP)", shown when at least 2 rows succeeded
  - "이 설정으로 다시 줄이기": re-runs every valid row and discards the old results
  - "처음부터": resets the tool
- File names:
  - each photo: `{base}_압축.jpg` or `.webp`, using the shared sanitizer, ≤ 80 characters
  - the ZIP: `사진_압축_{N}장.zip`, with names inside deduped
- Revoke every blob URL on reset, on a re-run, on row delete and on pagehide.

**Compare viewer**
- It shows the selected row: by default the first successful row. Each row has a "비교" button.
- A `figure` with a fixed-aspect box taken from the output aspect ratio, so there is no CLS.
- Two stacked `img` elements: 원본 below, 결과 on top, clipped with clip-path inset from the left by X %. Corner labels read "원본" and "결과".
- A range input labelled "비교 위치", 0–100, default 50.
- A zoom radio group **"확대"**: 1×, 2×, 4×.
  - Both images get the same transform.
  - Pan by pointer drag, or with the arrow keys when the figure is focused (tabindex 0, labelled "비교 화면, 화살표 키로 이동").
  - The result is always shown at the original's CSS size, so any downscale is visible at 4×.
- The 원본 source is an object URL of the original file.
  - On mobile with the cap applied, use `sourcePreview` instead, captioned "원본(휴대폰에서 줄여 불러온 사진)".
- No transitions under prefers-reduced-motion.

**Notes** (per row, role note)
- scaled: "목표 용량에 맞추려고 크기를 {w}×{h}으로 줄였습니다."
- flattened: "투명한 부분은 흰색으로 채웠습니다. 투명 배경이 필요하면 저장 형식에서 WebP를 고르세요."
- cmyk: "인쇄용 색상(CMYK) 사진을 화면용 색상으로 바꿨습니다. 색이 조금 달라 보일 수 있습니다."
- stripped: "이미 목표보다 작아 화질은 그대로 두고 사진 정보(EXIF)만 지웠습니다."
- mobileCapped: "휴대폰에서는 긴 변 4,096 px까지 줄여서 처리합니다."
- mozjpegFallback: "빠른 방식으로 처리했습니다. 같은 용량에서 화질이 조금 낮을 수 있습니다."
- gpsRemoved: the badge "위치 정보 지움".
- kept: "더 줄일 수 없는 사진입니다. 원본을 그대로 쓰세요." No download.

**Row errors** (two sentences each)
- heic: "아이폰 사진 형식(HEIC)은 이 브라우저에서 열 수 없습니다. 아이폰 설정 > 카메라 > 포맷에서 「높은 호환성」을 고르거나 사진을 JPG로 내보낸 뒤 다시 선택해 주세요."
- animated: "움직이는 이미지(GIF·WebP·PNG)는 아직 줄일 수 없습니다. 움직이지 않는 사진 파일을 선택해 주세요."
- not-image: "사진 파일이 아닙니다. JPG·PNG·WebP 파일을 선택해 주세요."
- unsupported: "이 형식(TIFF)은 아직 지원하지 않습니다. JPG·PNG·WebP로 바꾼 뒤 다시 선택해 주세요." The format name is filled in.
- corrupt: "사진 파일을 열 수 없습니다. 파일이 손상되었을 수 있으니 원본을 다시 저장해 선택해 주세요."
  - When truncated, start with "파일이 중간에 끊겨 있습니다."
- target-unreachable: "{N} KB로는 이 사진을 줄일 수 없습니다. 목표 용량을 조금 높여 주세요."
- too-large: state the number and the reason. For example: "휴대폰에서는 6,400만 화소(64 MP)까지 줄일 수 있습니다. 기기 메모리가 부족해 브라우저가 멈출 수 있기 때문입니다."
- oom, unknown and verify: reuse the Step 2 copy, worded for 사진.
- ZIP failure (a banner): "ZIP 파일을 만들지 못했습니다. 한 장씩 내려받아 주세요."

#### 3.3 Performance
- **Initial page JS** is the controller only, ≤ 30 KB gzip.
  - `sniff.ts` is included; it is small and pure.
  - Sniffing reads the header bytes and a tail slice (for the truncation check) through blob.slice. It never reads whole files on the main thread.
- **Lazy loading:**
  - The worker, the jsquash glue and the wasm load only on "사진 용량 줄이기".
  - The WebP glue and wasm load only when WebP is chosen.
  - fflate loads only on the ZIP click.
- **Memory:** one worker, items processed in sequence. After each item, close the bitmap and zero the canvases.

#### 3.4 Limits
The constants live in `src/tools/photo-compress/limits.ts`. Mobile is defined as in §3, gate 6.

| | Desktop | Mobile |
|---|---|---|
| Photos per run (hard; extra files are not added, with a message) | 50 | 20 |
| Bytes per file (hard, row error) | > 100 MB | > 50 MB |
| Total bytes (soft, confirm) | > 500 MB | > 150 MB |
| Megapixels (soft, confirm) | > 50 MP | – |
| Megapixels (hard, row error) | > 150 MP | > 64 MP |
| Long side (hard, row error; the canvas maximum) | > 32,767 px | > 16,384 px |
| Working long edge (automatic, noted) | none | 4,096 px |

- Dimensions come from the header. When the header has none (some AVIF files), the tool checks the decoded bitmap instead and closes it if the check fails.
- Every message states the number and the reason.

#### 3.5 Site wiring
- `src/data/tools.ts`: set `photo-compress` to status live and fill in the description, FAQ and keywords: 사진 용량 줄이기, 이미지 용량 줄이기, 증명사진 용량 줄이기, 사진 kb 줄이기, jpg 용량 줄이기.
  - The sitemap, home card and RelatedTools follow from the status. Verify each one.
- In the `/pdf-compress/` done state, add "사진 파일이라면 사진 용량 줄이기에서 KB에 맞춰 줄일 수 있습니다." linking to `/photo-compress/`.
- `docs/COPY.md`:
  - Allowed terms: KB, MB, px, WebP, ZIP, and EXIF.
  - EXIF is written "사진 정보(EXIF)" on first use.
  - 화소 or MP always comes with a number.
- Regenerate the UI font subset. Confirm there are no fallback glyphs in a screenshot.

### 4. Bundle budget
Enforced in `scripts/check-dist.mjs`, measured as gzip -9 sizes.

| Asset | Budget |
|---|---|
| `/photo-compress/` initial JS | ≤ 30 KB |
| `photo.worker*.js` (engine, mozjpeg and resize glue) | ≤ 60 KB |
| WebP glue chunk | ≤ 20 KB |
| `webp_enc*.wasm` (each file) | ≤ 130 KB |
| fflate chunk | ≤ 12 KB |
| MozJPEG enc + dec, resize, qpdf, compress worker | Step 2 budgets unchanged; exactly one `mozjpeg_enc*.wasm` |

Paste the table into REVIEW-REQUEST.

## Failure modes

| Path | Realistic failure | Handling (test) | User sees |
|---|---|---|---|
| Input | HEIC from a Windows or Android share | sniff → decode attempt → `heic` (unit: sniff brands; e2e: fake ftyp) | Guidance row |
| Input | HEIC on Safari, which can decode it | Decode succeeds → normal JPG (manual iPhone check) | Normal result |
| Input | CMYK JPEG (from a print shop) | Browser decode, plus a note and a colour sanity check (e2e, 5 projects) | Result + note |
| Input | 20,000×1,000 panorama | Header dims → side limit (unit: limits; e2e: desktop succeeds, mobile row error) | Result, or a message with numbers |
| Input | 48 MP phone photo on mobile | Resize on decode to 4,096; canvas fallback (unit: cap maths; e2e: 5000×3750 on mobile) | Result + mobileCapped note |
| Input | Animated GIF, WebP or APNG | sniff → `animated` (unit: all 3; e2e: GIF) | Row error |
| Input | Truncated JPEG (it would decode half grey) | EOI check → `corrupt` (unit; e2e) | Row error |
| Input | Garbage or a 0-byte file | sniff `unknown` → `not-image` (unit; e2e) | Row error |
| Decode | A browser ignores imageOrientation | e2e marker check for EXIF 6 and 3 on all 5 projects → **Flag**, no silent fallback | Caught before shipping |
| Decode | A browser does not convert P3 | e2e patch colour check → **Flag**, or a skip with a stated reason | Caught before shipping |
| Search | The target is impossible (10 KB at the 64 px floor) | `null` → `target-unreachable` (unit, fake encoder) | Row error |
| Search | An encoder bug produces an over-target file | Post-check bytes ≤ target, else discard → `unknown` (unit, lying encoder) | Row error, never a bad file |
| Final | MozJPEG wasm 404 or wrong MIME type | Canvas result + mozjpegFallback note (unit: throwing dep; live smoke MIME check) | Result + note |
| Final | MozJPEG cannot fit at q ≥ the lower bound | Canvas blob (unit) | Result |
| Final | WebP wasm fails | Row `unknown` (unit) | Row error |
| Output | EXIF/GPS leaks (APP1, MPF trailer) | Canvas and MozJPEG write no APP1; the strip cuts after EOI (unit: crafted trailer; e2e byte scan of every output) | "위치 정보 지움" |
| Output | A transparent PNG turns black | White fill before drawing (e2e pixel check) | Result + flattened note |
| Output | The result is not smaller (quality or percent mode) | Kept rule (unit) | Kept note, or the stripped original |
| Memory | Worker OOM in the middle of a batch | `oom` on that row, then a fresh worker for the rest (unit: queue; e2e: routed worker that crashes on item 2) | Row error; the batch continues |
| Cancel | A late item-done arrives after cancel | Run token + terminate (e2e) | Finished rows kept |
| ZIP | Korean names garbled in Windows Explorer | UTF-8 flag (unit: bit 11 in each local header); **Flag** if fflate does not set it | Correct names |
| ZIP | Duplicate names (a.jpg and a.png) | Dedupe with `_2` (unit) | Both files |
| ZIP | Out of memory on a large batch | Total-bytes limits; try/catch → banner (unit: builder throw path) | Banner; single downloads still work |

No row is "no test + no handling + silent".

## Test map
Every new item below starts as [GAP]. Bob marks each one [TESTED].
- **sniff** [GAP]:
  - each format and its dims
  - orientation, in II and MM byte order
  - GPS, CMYK and progressive detection
  - animated, all 3 kinds
  - alpha
  - truncated, both kinds
  - HEIC brands
  - malformed input never throws
- **fit** [GAP]:
  - the result always fits the target
  - the q floor holds, unless the image is at 64 px
  - the downscale factor
  - the minimum-edge fallback
  - `allowDownscale false` returns null
  - `finalSearch` picks the largest q that fits
- **jpeg-strip** [GAP]:
  - APP1, COM, APP13 and MPF are removed
  - ICC and Adobe are kept
  - the trailer is dropped
  - dims are unchanged and the scan bytes are identical
- **engine** [GAP]:
  - the kept rule in all 3 modes
  - the flatten decision
  - quality mode
  - the percent target maths
  - the MozJPEG fallback
  - the over-target discard
- **options, limits, queue, zip** [GAP]:
  - every row of 3.4
  - KB × 1000 targets, and the display rounding up
  - queue crash and cancel
  - zip dedupe and the UTF-8 flag
- **Worker, controller and compare viewer** (e2e) [GAP].
- **Existing behaviour at risk:**
  - Step 2 codec loading, changed by the step 0 refactor: covered by the Step 2 unit and e2e tests plus an identical `regress:compress` [TESTED]
  - the sitemap's exact list: update the expectation
  - RelatedTools on all three tool pages

## Tests

### Fixtures
They live in `tests/fixtures/photo/`. The whole of `tests/fixtures/` stays ≤ 3 MB. It is 1.54 MB today, so the photo fixtures get ≤ 1.2 MB.

**Committed.** Built at dev time by `tests/fixtures/build-photo.mjs`, using `@napi-rs/canvas` and our Node MozJPEG deps. Every file is listed in SOURCES.md with its source, license and transformation.

| File | Source | Limit |
|---|---|---|
| `portrait_pd.jpg` | Spike p03 (Public domain, US House; the Wikimedia URL is in `corpus/SOURCES.json`), 1400×1750, q88 | ≤ 350 KB |
| `scene_cc0.jpg` | Spike g04 (CC0), 1600 wide, q88 | ≤ 300 KB |
| `exif6_gps.jpg` | Synthetic, 1200×900 stored, gradient + seeded noise. A red block in the stored top-left and a blue block in the top-right. The script writes an EXIF APP1 with Orientation 6 and a GPS IFD (lat/long). After EOI it appends an MPF-like trailer containing the ASCII "GPS-TRAILER". | ≤ 200 KB |
| `p3_patches.jpg` | Synthetic, 600×400 colour patches. Embeds an ICC v2 matrix/TRC Display-P3 profile **generated by the script** from the P3 primaries and D65: our own bytes, no third-party profile. The script computes the expected sRGB values and records them in SOURCES.md. | ≤ 60 KB |
| `alpha.png` | Synthetic, 800×600 RGBA. The left half is fully transparent. | ≤ 150 KB |
| `opaque_rgba.png` | Synthetic, 750×1334 flat UI, colour type 6, all alpha 255 | ≤ 80 KB |
| `cmyk.jpg` | `tests/fixtures/build-cmyk.py` (Pillow, dev only): 400×300 CMYK patches with known values | ≤ 40 KB |
| `anim.gif` | Written by hand by the build script: 16×16, 2 frames | ≤ 1 KB |

- The committed outputs are the fixtures.
- The build script needs `CORPUS_DIR` only to regenerate the two photo files.
- Export the EXIF, ICC and GIF writers as functions (`tests/helpers/`) so Step 4 can reuse them.

**Generated at test time, never committed:**
- `truncated.jpg`: the portrait, cut at 60 %
- `not_image.txt`
- `fake.heic`: a valid `ftypheic` box followed by zeros
- `exif3.jpg`: exif6 with the orientation byte patched to 3
- animated WebP and APNG headers (unit tests only)
- `pano_20000x1000.jpg` and `big_5000x3750.jpg`: flat gradients, encoded with Node MozJPEG
- `zero.jpg`: 0 bytes

### Unit tests (`tests/unit/photo-*.test.ts`, Node)
- Everything in the Test map rows for sniff, fit, jpeg-strip, engine, and options/limits/queue/zip.
- **Real-encoder engine test** on `portrait_pd.jpg`:
  - Uses the Step 2 Node helpers: real MozJPEG and resize, with the jSquash decoder for input.
  - The fake `canvasJpeg` is MozJPEG at the same q.
  - At 100 KB and 200 KB targets: output ≤ target, final q ≥ 50, and scaled when needed.
- **Regress metrics module** (`scripts/regress/photo-metrics.mjs`):
  - SSIM of an image with itself = 1
  - a known pair matches a checked-in vector (± 1e-6)
  - PSNR of identical images = 99
  - an 8×8 synthetic checker has higher blockiness than a smooth gradient
- **Network guard:** the allowlist names exactly the two wasm loader files.

### E2E (`tests/e2e/photo-compress.spec.ts`)
Runs in all 5 projects. Every test uses the no-upload helper.
- **Lazy load:**
  - Nothing from the worker or jsquash is requested before the button is pressed.
  - fflate is requested only on the ZIP click.
  - The WebP wasm is requested only after WebP is chosen.
- **Happy path, target 200 KB,** on `portrait_pd.jpg` and `scene_cc0.jpg`. Parse each download in Node:
  - bytes ≤ 200,000
  - baseline SOF0
  - no APP1, no bytes "Exif", "http://ns.adobe.com/xap" or "GPS", and nothing after EOI
  - the dims match the row
  - the compare viewer is visible, the slider moves, and zoom 4× applies
- **Orientation:** `exif6_gps.jpg` and `exif3.jpg`, in quality mode.
  - exif6 gives 900×1200 output; exif3 gives 1200×900.
  - The red marker is in the expected corner. Decode in Node and sample a pixel.
  - The GPS badge shows before, "위치 정보 지움" after, and "GPS-TRAILER" is absent from the bytes.
- **Stripped original:** a 60 KB JPEG (a quality-mode output of the portrait, generated at test time) at target 100 KB.
  - The stripped note appears.
  - Bytes ≤ input, and the scan data is identical.
- **P3:** every patch is within ±8 of its expected sRGB value.
  - A browser that returns the raw values is reported (Flag). Only then use test.skip, with the reason.
- **CMYK:** the file decodes, the mean patch colours are within ±24 of expected, and the note is shown.
- **Transparency:**
  - `alpha.png` → JPG: the flattened note appears, and a left-half pixel is white (≥ 250).
  - Then WebP: the output is RIFF/WEBP, the left-half alpha is 0, and bytes ≤ target.
  - `opaque_rgba.png` shows no flattened note.
- **Modes:**
  - percent 50 %: ≤ floor(in/2)
  - quality 80: a result is shown
  - max long edge 800: output long edge = 800
  - free input 150 KB: ≤ 150,000
  - invalid free input (5, abc): the button stays disabled and the message shows
- **Fast mode:** the result is ≤ target.
- **Batch + ZIP:** 4 files, one of them `not_image.txt`.
  - 3 rows finish, 1 shows a row error, and the summary is announced.
  - Unzip in Node with fflate: exactly 3 entries, with deduped UTF-8 names. Include a Korean name and a duplicate base name.
- **Bad inputs:**
  - `fake.heic` → the HEIC guidance
  - `anim.gif` → animated
  - `truncated.jpg` → corrupt
  - `not_image.txt` and `zero.jpg` → not-image
- **Limits:**
  - `pano_20000x1000.jpg` succeeds on the desktop projects and gives the side-limit row error on mobile.
  - `big_5000x3750.jpg` on mobile: output long edge ≤ 4,096, with the mobileCapped note.
- **Cancel:** delay the photo worker with context.route, as the merge and compress tests do.
  - Cancel in the middle of a batch: finished rows keep their download, and the others show 대기.
  - Re-run to completion.
- **Worker crash:** route the worker script to a stub that crashes on item 2.
  - Row 2 shows oom or unknown.
  - Rows 3–4 complete.
- **Keyboard:** a full run on the desktop projects, including the compare slider and the pan keys.
- **axe:**
  - `/photo-compress/` in the empty state
  - the ready state, with the details open and 직접 입력 selected
  - the done state, with the compare viewer visible
  - `/`, `/pdf-merge/` and `/pdf-compress/` again
- **SEO:**
  - The sitemap lists exactly `/`, `/pdf-merge/`, `/pdf-compress/`, `/photo-compress/`, `/privacy/` and `/licenses/`.
  - One H1, the canonical, and parseable JSON-LD.
  - The home card links to the tool.
  - RelatedTools is on all three tool pages.
  - The pdf-compress done-state link is present.

### Regression harness — `npm run regress:photo`
- **Runner:** `scripts/regress/photo.mjs` starts a Vite dev server programmatically.
  - Setup: createServer, root `scripts/regress/photo-harness/`, fs.allow = the repo root.
  - The harness page runs the **production worker** (`src/lib/image/photo.worker.ts`) and computes the metrics in the page.
  - It uses Playwright Chromium by default. An optional flag selects firefox or webkit; report the browser used.
  - Nothing from the harness enters `dist/`.
- **Inputs:** always the committed photo fixtures, plus every image in `CORPUS_DIR` (default `spikes/photo/corpus`). If the corpus is absent, skip it with a notice.
- **Targets:** exactly the spike byte targets: 512,000, 204,800, 102,400 and 50 %.
  - Skip any target the original already meets, as the spike did.
  - Run each target in both 품질 우선 and 빠른 모드.
  - Also run a **naive** baseline in the page (full resolution, canvas JPEG, q search 0.02–0.98), for the blockiness comparison.
- **Metrics:** a port of spike `metrics.js`.
  - Luma SSIM with an 11×11 Gaussian (σ 1.5), and RGB PSNR.
  - Both images are resized to the same evaluation size (long edge ≤ 2048). The output is upscaled to the evaluation size of the original.
  - **Blockiness** BI = mean abs Δluma across 8-px block boundaries ÷ mean abs Δluma elsewhere. Count horizontal and vertical edges, on the output at its own resolution.
- **Baseline:** `scripts/regress/photo-baseline.json`, generated once from `spikes/photo/results/compress.json`.
  - For each image × target, it holds the SSIM and PSNR of fit-mozjpeg, hybrid-mozjpeg and fit-canvas-jpeg-q40.
  - It stores only numbers and ids.
- **Pass rules:**
  - **Fit:** 100 % of encodes are ≤ target, with 0 overshoots. This includes p02 and p11 at 100 KB, where naive cannot fit. Mean utilisation ≥ 0.93.
  - **Floor:** the final q is ≥ 50 (MozJPEG) or ≥ 0.50 (canvas) whenever the output long edge is over 64.
  - **Per pair, 품질 우선:** SSIM ≥ min(fit-mozjpeg, hybrid-mozjpeg) − 0.010, and PSNR ≥ that row − 0.6 dB.
  - **Per pair, 빠른 모드:** SSIM ≥ fit-canvas-jpeg-q40 − 0.010, and PSNR ≥ that row − 0.6 dB.
  - **Means per target:**

    | Target | 품질 우선 SSIM / PSNR | 빠른 모드 SSIM / PSNR |
    |---|---|---|
    | 500 KB | ≥ 0.945 / ≥ 36.8 dB | ≥ 0.942 / ≥ 35.7 dB |
    | 200 KB | ≥ 0.905 / ≥ 34.9 dB | ≥ 0.906 / ≥ 34.2 dB |
    | 100 KB | ≥ 0.865 / ≥ 31.7 dB | ≥ 0.868 / ≥ 31.4 dB |
    | 50 % | ≥ 0.968 / ≥ 39.3 dB | ≥ 0.966 / ≥ 38.3 dB |

    Spike reference, fit/hybrid-mozjpeg (SSIM / PSNR): 500 KB 0.952 / 37.3; 200 KB 0.909 / 35.35; 100 KB 0.871–0.873 / 31.9–32.2; 50 % 0.971–0.973 / 39.6–40.0.
  - **MozJPEG gain:** mean PSNR(품질 우선) − PSNR(빠른 모드) ≥ +0.5 dB at every target. The spike measured +1.0–1.4 dB.
  - **Blockiness guard (naive vs MozJPEG):**
    - For every pair where naive q < 0.30, BI(품질 우선) must be < BI(naive).
    - This includes p03 at 100 KB, where the spike saw naive q 0.02 posterise visibly.
    - Report the BI distribution. Arch sets an absolute BI cap after the first run (Flag). Until then, the relative rule is the gate.
  - **Orientation and colour:**
    - The s01_exif6 output is portrait.
    - s02_p3 at 50 %: PSNR against g02 ≥ 35.0 dB. The spike measured 37.5 dB with colour management and 33.8 dB without.
  - **HEIC:** h01 gives heic, never corrupt.
- **Timing:** report the median ms per target. Anything over 2 × the spike hybrid-mozjpeg median is flagged, not failed.
- **Output:** `regress-out/photo.md`. Paste it into REVIEW-REQUEST.
- **Do not lower a threshold.** Report any miss with its numbers under Blocked.

## Flags (do not guess; write under "Blocked")
- Any regress threshold is missed, including a baseline-JPEG size penalty beyond the tolerance.
- imageOrientation, P3 conversion, resizeWidth, OffscreenCanvas.convertToBlob or jSquash init fails in a worker on Firefox or WebKit.
  - Report the stack and the browser.
  - Do not fall back to the main thread silently.
- Canvas JPEG output is not baseline (SOF0) in some browser.
- fflate does not set the UTF-8 flag for Korean names.
- Pillow is unavailable for cmyk.jpg.
- tests/fixtures/ would exceed 3 MB.
- The absolute BI cap (Arch sets it).
- Any new behaviour beyond this brief:
  - AVIF or PNG output
  - GIF compression or first-frame export
  - an option to keep EXIF
  - per-file settings
  - parallel workers

## Out of Scope (→ BUILD-LOG Known Gaps)
- AVIF output.
- Lossless PNG optimisation (oxipng), and PNG output with transparency. The WebP opt-in covers transparency.
- Animated GIF/WebP compression, and first-frame export.
- HEIC decoding (locked decision).
- An option to keep EXIF.
- Per-file settings within one batch.
- Parallel workers across cores.
- A MozJPEG-driven scale re-search after the canvas probe has picked the scale.
- Fixed pixel-size output and JFIF dpi (Step 4).
- Presets named after institutions (for example Q-Net 200 KB). These wait for the verified preset data of Step 4.

## Step 4 (여권·증명사진) preparation

**Built in Step 3; Step 4 reuses them as is**
- In `src/lib/image/`:
  - `sniff.ts`
  - `decode.ts`: orientation, sRGB, caps, and the HEIC mapping
  - `raster.ts`
  - `messages.ts`: the heic, corrupt and animated copy
- `fit.ts` with allowDownscale set to false. This finds the highest quality within a KB limit at a fixed pixel size, for example passport_online ≤ 500 KB at 413×531, or qnet ≤ 200 KB.
- `jpeg-strip.ts`.
- `src/lib/codecs/wasm-browser.ts`, with its granular loaders.
- The limits pattern: megapixels plus the mobile working cap.
- The EXIF, ICC and GIF fixture writers in `tests/helpers/`.

**Listed for Step 4, not built now**
- setJfifDpi (spike imaging.js): a 300 dpi JFIF patch, with a test.
- A helper that crops and scales to exact dimensions (spike cropScale), with no padding.
- The preset data file, with source URLs and 기준일. Re-verify the secondary entries first.
- The MediaPipe loader, its model budgets in check-dist, and the §4 Step 4 notice.
- Whether the Step 3 compare viewer suits the Step 4 overlay. The Step 4 brief decides.

## Acceptance
- Every §3 quality gate is green. That includes:
  - Lighthouse on `/photo-compress/`: Perf ≥ 95, A11y 100, BP ≥ 95, SEO 100, LCP ≤ 2.0 s, CLS ≤ 0.01
  - the bundle budgets in section 4
- Unit tests, e2e (5 projects, no-upload on every test) and regress:photo all meet the thresholds above.
- regress:merge and regress:compress are unchanged.
- check:licenses is green. `/licenses/` adds @jsquash/webp (with libwebp), wasm-feature-detect and fflate.
- `dist/` has `/photo-compress/`. The sitemap, the home card, RelatedTools and the pdf-compress link all point to it.
- **Gate 11 (Richard)**, in real Chrome, Firefox and Edge:
  - a real phone photo (12 MP or more, with GPS) compressed to 200 KB
  - a transparent PNG
  - a batch of 5 plus the ZIP, opened in Windows Explorer with the Korean names intact
- **Real iPhone check**, by the owner or the orchestrator. It is also a Step 4 prerequisite.
  - In Safari, pick a photo from the photo library. Confirm that a JPEG arrives, or that the HEIC decodes.
  - Record the result in BUILD-LOG.
  - The auto-conversion sentence in FAQ 4 ships only if this is confirmed.

## Deploy gate (Step 3), identical to Step 2
1. Richard writes "Step 3 is clear".
2. Arch commits locally ("[Step 3] 사진 용량 줄이기 …") and updates BUILD-LOG and the checkpoint.
3. A push to main publishes to Cloudflare Pages. Under the standing instruction from the owner, the orchestrator pushes, then runs the live smoke test on https://doc-tools-kr.pages.dev:
   - `/photo-compress/` returns 200 with the CSP header, `/sitemap.xml` lists it, and the home card links to it.
   - The mozjpeg_enc, squoosh_resize and webp_enc wasm files are served as application/wasm.
   - In real Chrome, portrait_pd.jpg at 200 KB gives at most 200,000 bytes and shows the compare viewer. The download has no APP1, and there is no non-GET or cross-origin request.
   - exif6_gps.jpg comes out upright.
   - `/pdf-compress/` still compresses gen_scan_a6.pdf. This checks the shared codec refactor.
4. If the smoke test fails, the orchestrator reverts the Step 3 commit and pushes, logs it, and reopens the step.
