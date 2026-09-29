# Architect Brief — Step 4: 여권사진 규격 맞추기 `/id-photo/`

Author: Arch. Date: 2026-09-29.
Status: **staged**. The orchestrator promotes it after Step 3 ships. Step 4 does not start before Step 3 is deployed and logged.
These apply unchanged: ARCHITECT-BRIEF.md §0 non-negotiables, §3 quality gates, §4 legal texts, §5 SEO and §6 handoff. The one exception is the §0 license exception in "Licenses" below.
When `docs/UX-AUDIT-1.md` exists at build time, its cross-cutting rules apply to this page too. Where it conflicts with this brief, raise a **Flag** and do not guess.

Evidence (local, git-ignored):
- `spikes/photo/SPIKE-PHOTO.md` §1, §3–§6
- `spikes/photo/specs/photo-specs.json`
- `spikes/photo/web/lib/passport.js` and `web/passport-demo.html`
- `spikes/photo/results/{gt-manual,measure,crops}.json`
- `spikes/photo/tools/analyze_crown.py`

Demand (Naver, per month):

| Keyword | Searches |
|---|---|
| 여권사진 | 86,000 |
| 여권사진 규격 | 56,600 |
| 증명사진 사이즈 | 3,670 |
| 여권사진 사이즈 | 3,320 |
| 증명사진 용량 줄이기 | 2,640 |

## Goal
`/id-photo/` turns one photo into a file with the exact pixel size and KB limit of a verified preset. The tool proposes a frame automatically, and the user adjusts it on a guide overlay and confirms it. It only crops, straightens, resizes and re-encodes. It never retouches anything or edits the background.

## Presets (re-verified 2026-09-29; this table is the data contract)
Re-fetched today by Arch. "Quote" is the text returned from the official page.

| id | Label (UI) | Output px | Byte limit | Physical / head rule | dpi (JFIF) | Status | Source (retrieved 2026-09-29) |
|---|---|---|---|---|---|---|---|
| `passport_online` | 여권 (온라인 신청·정부24) | **413×531**. Allowed range 395–431 × 507–550, verified. | ≤ 500 KB → **500,000 B** | 35×45 mm. Head **32–36 mm**, measured from the top of the skull (hair excluded) to the chin. **Official band.** | 300 | **공식, ship** | https://www.passport.go.kr/home/kor/contents.do?menuPos=12 (quote: "가로 413 픽셀(pixel), 세로 531 픽셀 사이즈 권장(가로 395~431 픽셀, 세로 507~550 픽셀 이내만 업로드 가능)", "파일 크기 500KB 이하", "파일 형식 JPG/JPEG", "해상도는 300dpi 권장"). Also https://www.passport.go.kr/home/kor/contents.do?menuPos=32 (head rule, editing ban) and https://www.gov.kr/portal/service/serviceInfo/126200000030 (px range) |
| `gosi` | 국가공무원 시험 (공무원 채용시스템) | **137×177** | "350KB 미만" → **349,999 B** | 35×45 mm. Head band is **reference only** (passport ratio). | 99, from round(137 × 25.4 / 35) | **공식, ship** | https://gongmuwon.gosi.kr/oprut/AppApAplfSbmsnAplfRcptGd.do (quote: "3.5cm x 4.5cm(137 x 177 pixel) 기준", "JPG, PNG", "350KB 미만") |
| `qnet` | Q-Net 자격시험 원서 | **413×531**. This is our choice: Q-Net publishes no pixel size. | ≤ 200 KB → **200,000 B** | Reference band. Physical size: see Flag Q1. | 300 | **공식 (KB and format only), ship** | https://www.q-net.or.kr/qnet/html/guideQnet/guide_02.html (quote: "*.JPG 또는 *.JPEG", "200KB 이하") |
| `saramin` | 사람인 이력서 | **100×140** (recommended size) | 10 MB → 10,000,000 B | No physical size. Reference band as a % of height. | 96 | **공식, ship** | https://www.saramin.co.kr/zf_user/help/help-word/view?idx=524 (quote: "10MB", ".jpg .gif", "권장 크기 100 x 140 픽셀") |
| `jobkorea` | 잡코리아 이력서 | **150×210** (the maximum) | 5 MB → 5,000,000 B | No physical size. Reference band as a %. | 96 | **공식 FAQ, re-verified, ship**. The older 1 MB Q&A is superseded by the FAQ. | https://www.jobkorea.co.kr/help/faq/user?tab=2 (quote: "150px * 210px 초과하는 경우", "5MB 이내", "gif, jpg, jpeg, png") |
| `half_card` | 반명함판 3×4 cm (일반 크기, 기관 규격 아님) | **354×472** | none | 30×40 mm. Reference band. | 300 | **계산값, ship with the label.** Source shown as "3 cm × 300 dpi ÷ 2.54 = 354 px (계산값)". No agency claim. | – |
| `custom` | 직접 입력 | w 50–2,000 × h 50–2,000 px | optional, 10–10,000 KB (× 1000) | No physical size. Reference band as a %. | 96 | ship | – |
| `resident_id` | 주민등록증 (정부24) | Official: width 336 only, "세로 자동값". The KB limit is secondary. | ? | – | – | **확인 필요 → dropped** | https://www.gov.kr/mw/EgovPageLink.do?link=popup%2Fhow_to_editPic (the raw EUC-KR text is garbled in fetch) |
| `driver_license` | 운전면허증 | 350×450 comes from a 2016 KOROAD notice. The current safedriving page gives only "3.5cm*4.5cm, 여권용", with no px or KB. | ? | – | – | **확인 필요 → dropped** | https://www.safedriving.or.kr/guide/larGuide011.do?menuCode=MN-PO-1211 |
| `toeic`, `work24`, `local_gosi` | – | secondary or blog only | – | – | – | **dropped** (Known Gap) | spike json |

Rules:
- **A dropped preset ships only if Bob, in build step 0, gets the value from the official page itself.**
  - Record the verbatim quote plus the URL and the date in the data file.
  - Log it in BUILD-LOG.
  - A search summary or a blog is not enough.
  - Otherwise it stays dropped. FAQ 4 says why it is missing.
- **Every shipped preset carries:** `sourceUrls[]` (https), `quote`, `retrieved` (ISO date) and `status: 'official' | 'arithmetic' | 'user'`.
  - `secondary` is not a valid status in shipped data.
- **The UI shows under the preset select:** "기준일 2026-09-29 · 출처: {기관 링크}".
  - Page-wide text: "기관 안내가 바뀌었을 수 있습니다. 제출 전에 제출처 안내를 꼭 확인하세요."
- **Byte limits:**
  - "이하" becomes KB × 1000.
  - "미만" becomes KB × 1000 − 1.
  - The same convention as Step 3, so the file is safe under both 1000 and 1024.
- **Head band.**
  - Only `passport_online` labels the band "규격 32–36 mm".
  - Every other preset uses the same ratio (32/45 to 36/45 of the height, i.e. 71.1–80.0 %), labelled "참고 범위(여권 규격 비율)".
  - It is shown in mm when a physical size exists, otherwise in %.
- **Default framing**, for every preset: head = 34/45 of the output height, and the crown line at 4.5/45 of the height from the top.
  - These are spike values, not official rules. The UI never calls them 규격.
- **Output format** is JPG only. Every shipped preset accepts JPG.
- **File names** are ASCII only, so no user file name leaks and upload forms do not reject Korean:
  - `passport_413x531.jpg`, `gosi_137x177.jpg`, `qnet_413x531.jpg`, `saramin_100x140.jpg`, `jobkorea_150x210.jpg`, `halfcard_354x472.jpg`
  - custom: `photo_{w}x{h}.jpg`
- **Default preset:** `passport_online`. It is chosen before or after the photo, and can be changed at any time.

## Flow
```
[empty] preset select (default passport_online) + "사진 선택" (single file)
   │ file ─► limits (header dims, bytes) ─► sniff (Step 3 sniff.ts)
   │    heic ─► try decode (Safari) ─ fail ─► heic guidance │ animated/not-image/corrupt ─► error (Step 3 copy)
   ├──────────────────────────────┬──────────────────────────────────────────────┐
   ▼ decode (main thread)          ▼ face assets (only now; parallel)              │
 createImageBitmap(from-image,     guard: autoframe flag off │ deviceMemory ≤ 2 │  │
   working long edge ≤ 4096)         crash flag in sessionStorage ─► MANUAL        │
   │                               fetch wasm + model with progress (assets.ts)    │
   │                               "건너뛰고 직접 맞추기" ─► MANUAL                 │
   │                               error │ 60 s timeout ─► MANUAL + note           │
   ▼                               ▼ landmarker.detect(≤1024 px copy)              │
 lowres check (whole photo < out px) ─► BLOCKED "해상도 낮음"                      │
   ▼                                                                              │
 AUTO-FRAME  faces=0 ─► MANUAL (centred largest crop, note)                       │
   faces≥1 ─► largest face; crown = eye − ((K·(chin−eye) + C·IPD3D)/2)            │
             s = headTarget px / headPx; centre x = cheek midpoint; crown at 4.5/45 │
             s > 1 ─► BLOCKED "해상도 낮음" (never upscale, never pad)              │
   ▼                                                                              │
[adjust] stage (output aspect) + overlay: crown line, head band, eye line (참고),  │
   centre line, face oval, hatched out-of-photo area                              │
   drag / pinch / buttons / keys ─► pan · zoom (s ≤ 1 clamp) · rotate ±5° (0.5°)  │
   every change ─► corners-inside check ─ outside ─► download blocked + message    │
                ─► checklist recompute ─► confirmation checkbox cleared           │
   checklist: warnings (never block) + blocks (outside, lowres, invalid custom)   │
   [ ] 규격 확인은 제출처 기준을 따릅니다 … (required)                            │
   ▼ [규격에 맞춰 저장] (enabled: no block && checkbox)                            │
 render (main): prescale bitmap (resizeQuality high) ─► transform draw → out px   │
 encode worker: MozJPEG baseline, finalSearch q∈[50,95] ≤ limit ─► setJfifDpi     │
   ─► verify (decode dims == out, bytes ≤ limit, SOF0, JFIF dpi, no APP1)         │
   fail ─► error, no file │ MozJPEG init fails ─► canvas q search + verify + note │
   ▼                                                                              │
[done] 100 % preview, "413×531 px · 87.4 KB · 300 dpi", 내려받기,                 │
   "다른 규격으로 다시 만들기" (keeps photo, landmarks cached) │ "처음부터" ◄──────┘
```

## Build Order

### 0. Pre-build checks (write the results in BUILD-LOG before any code)
1. **Presets.** Re-fetch each shipped source and put the verbatim quotes in `src/data/id-photo-presets.ts`. Use raw HTML where possible (`curl`, then decode EUC-KR if needed).
   - Any value that differs from the table above is a **Flag**.
   - Try the dropped presets once, following the Rules above.
2. **Licenses of the MediaPipe path.** Arch has already verified:
   - `@mediapipe/tasks-vision@1.0.1` has the package.json license `Apache-2.0`, but **there is no LICENSE file in the package**.
   - The three model cards all say "LICENSED UNDER Apache License, Version 2.0":
     - https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf
     - https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf
     - https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf
   - Out of scope per the cards: "identity recognition / surveillance" and "human life-critical decisions". Our use is geometric framing only.
   - A string probe of `vision_wasm_internal.wasm` finds **Eigen** ("EigenForTFLite", 36× "Eigen"), OpenCV, XNNPACK, protobuf and abseil compiled in.

   Bob:
   1. Commit the Apache-2.0 text from the google-ai-edge/mediapipe repo at the tag that matches 1.0.1 under `licenses/third-party/mediapipe/`, with the source explained in SOURCES.md, as was done for qpdf-wasm.
   2. Inventory every third-party library in the wasm. Use the WORKSPACE / third_party files of MediaPipe at that tag, plus a string probe, and record each library license.
   3. Confirm that the TensorFlow Eigen build defines `EIGEN_MPL2_ONLY`. Quote the BUILD line at the pinned commit.
   4. Record the model file SHA-256 values.
   - **Flag** if any component is GPL, LGPL or AGPL, if MPL is found outside Eigen, or if `EIGEN_MPL2_ONLY` cannot be shown.
   - A Flag means the build ships with `PUBLIC_ID_PHOTO_AUTOFRAME=0` (see Licenses).
3. **Real iPhone check.** Confirm that the Step 3 result (JPEG hand-off or HEIC decode) is recorded in BUILD-LOG. HEIC copy and FAQ 6 follow it.

### 1. Dependencies and assets (exact pins; log each in BUILD-LOG first)
- **`@mediapipe/tasks-vision@1.0.1`** (Apache-2.0), runtime.
  - `vision_bundle.mjs` is imported dynamically by `src/lib/face/landmarker.ts`, so Vite code-splits it.
  - `scripts/copy-vendor.mjs` copies `wasm/vision_wasm_internal.{js,wasm}` and `wasm/vision_wasm_nosimd_internal.{js,wasm}` to `public/vendor/mediapipe/1.0.1/`. The `module_internal` variant is not shipped.
  - `FilesetResolver.forVisionTasks('/vendor/mediapipe/1.0.1')` picks SIMD or no-SIMD.
- **Model.**
  - Commit `vendor-assets/mediapipe/face_landmarker.task`, the float16 v1 file identical to `spikes/photo/models/face_landmarker.task` (3,758,596 B).
  - Pin its SHA-256 in `vendor-assets/mediapipe/SHA256SUMS`.
  - copy-vendor verifies the hash, then copies it to `public/vendor/mediapipe/models/face_landmarker-{sha8}.task`.
  - It is never fetched at build time.
- **No `blaze_face_short_range.tflite`**: the landmarker bundle already contains the detector.
- **Licenses.** `licenses.manifest.json` adds:
  - tasks-vision (with the committed LICENSE)
  - the model (the Apache-2.0 notice plus the model-card URLs)
  - every inventoried wasm component
- **Build flag.** `PUBLIC_ID_PHOTO_AUTOFRAME` defaults to `1`.
  - With `0`, the landmarker import is dead code and copy-vendor skips MediaPipe. `check-dist --no-mediapipe` then asserts that no `mediapipe` path is in `dist/`.
  - The page works manual-only in that case.

### 2. Shared modules (framework-free; pure parts run in Node)

| File | Content |
|---|---|
| `src/lib/image/jfif.ts` | `setJfifDpi(bytes, dpi)` patches APP0 JFIF (units 1, X = Y = dpi), or inserts a 16-byte JFIF APP0 right after SOI when none exists. It is idempotent and throws on non-JPEG. `readJfif(bytes)` returns `{units, x, y}`. Pure. |
| `src/data/id-photo-presets.ts` | `IdPreset {id, label, outW, outH, pxRange?, limitBytes?, limitRule: le / lt / null, mm?:{w,h}, headBand:{kind: official / reference, minFrac, maxFrac}, dpi, fileTag, status, sourceUrls[], quote?, retrieved}`. Also `PRESETS`, `validatePreset()` and `customPreset(w,h,kb?)`. |
| `src/lib/idphoto/crop.ts` | Pure geometry. State `{cx, cy, s, rotDeg}`, where s = output px per source px. `toSource(u,v)` and `toOutput(x,y)` use rotation about the output centre. `corners()` maps the 4 output corners to the source. `inside(W,H, tol 0.5 px)`. `clampZoom` keeps s ≤ 1 and s ≥ sMin. `pan(dxOut, dyOut)`, `zoomAt(factor, anchorOut)`, `rotate(deltaDeg)` clamped to ±5 and snapped to 0.5. `pinch(p0,p1 → q0,q1)`. `headMm(crownY, chinY, state, preset)`. |
| `src/lib/idphoto/frame.ts` | Pure. `autoFrame(face, preset, W, H)` returns `{state, blocked: lowres or null, outside}` using the Flow formula. `manualFrame(W, H, preset)` gives the largest centred crop of the output aspect, with s = min(1, …); if even that needs s > 1, the result is lowres. The constants come from `calibration.ts`. |
| `src/lib/idphoto/calibration.ts` | `K = 0.88` and `C = 1.68` (provisional, spike LOO), plus `{dataset, n, date}`. Changed only by the calibration task (Tests). |
| `src/lib/idphoto/warnings.ts` | Pure. `checklist(face or null, state, preset, bg)` returns `{blocks[], warns[], oks[]}`. Thresholds: abs(yaw) > 10°, abs(pitch) > 12°, abs(faceRoll − rotDeg) > 5° (residual roll), smile (mean mouthSmile > 0.5), jawOpen > 0.2, eyeBlink > 0.5, faces > 1 (a warning; the largest face is used), headMm outside the band (a warning, labelled 추정), background (below). |
| `src/lib/idphoto/background.ts` | Pure, over the output ImageData. It samples the top 12 % strip and the side strips (outer 6 %) above 70 % of the height. It warns when the mean L\* < 88, or the mean chroma > 10, or the std of L\* > 12. It never edits anything. |
| `src/lib/face/assets.ts` | **The only new `fetch(` file** (added to the network-guard allowlist with a comment). `loadFaceAssets(onProgress, signal)` fetches the model (kept as bytes, passed as `modelAssetBuffer`) and the chosen wasm (to warm the HTTP cache). Progress is received bytes over the **build-time raw sizes** (Content-Length is unreliable under brotli). Same-origin versioned URLs only. |
| `src/lib/face/landmarker.ts` | Main thread. This is the spike path: MediaPipe loads its glue with a `<script>` element, which does not work in a module worker. `createLandmarker(buf)` uses CPU delegate, IMAGE mode, numFaces 3, blendshapes and matrices. `measure(bitmap)` returns `FaceMeasure` (spike `measureFace`, landmarker branch only) in source px, or `{faces:0}`. |
| `src/lib/face/guard.ts` | Pure, with injected storage and navigator. `shouldTryAutoFrame({flag, deviceMemory, storage})` is false when the flag is 0, when deviceMemory ≤ 2 (where the API exists), or when the sessionStorage key `idphoto-mp-attempt` is present (the last attempt crashed the tab). `markAttempt()` runs before init and `clearAttempt()` after the first successful detect. No photo data is ever stored. |
| `src/lib/idphoto/render.ts` | Main thread. `renderOutput(bitmap, state, preset)`: if s < 0.5, first `createImageBitmap(bitmap, {resizeWidth/Height: ceil(W·2s)…, resizeQuality: high})`. Then an OffscreenCanvas out W × H with the sRGB 2d context, `imageSmoothingQuality` high, and `setTransform` (translate, rotate, scale) plus drawImage. Returns ImageData. Temporary bitmaps are closed and canvases zeroed. |
| `src/lib/idphoto/encode.worker.ts` | Module worker. Reuses `src/lib/codecs/wasm-browser.ts` (MozJPEG) and `fit.ts finalSearch` (integer q 50–95, the largest that fits; **no downscale ever**). Then `setJfifDpi` and verify: re-sniff dims == out, bytes ≤ limit, SOF0, no APP1, JFIF dpi. **Fallback:** if MozJPEG init fails, it runs a canvas `convertToBlob` q search over 0.50–0.95 with the same verify, and the report has `fallback: true`. |

Reused from Step 3 as is: `sniff.ts`, `decode.ts` (orientation, sRGB, cap; valid on the main thread too), `raster.ts`, `messages.ts` (heic, corrupt, animated, not-image), `fit.ts`, `jpeg-strip.ts` (not needed on the output) and the codec loaders. **Do not fork them.** If one needs a change, that is a **Flag**.

The Step 3 compare viewer is **not** reused. The done state shows one 100 % preview instead (Arch decision).

### 3. Tool page `/id-photo/`
Files:
- `src/pages/id-photo/index.astro`
- `src/tools/id-photo/controller.ts` (state machine)
- `stage.ts` (pointer, pinch and keyboard)
- `overlay.ts` (draws the guide)
- `limits.ts`

#### 3.1 Server-rendered content (합니다체, docs/COPY.md)
- **H1:** "여권사진 규격 맞추기".
- **Title:** "여권사진 규격 맞추기 — 업로드 없이 브라우저에서 무료로 | 안올림".
- **Description** (108 characters, checked): "여권사진 규격(413×531 픽셀, 500KB 이하)과 공무원 시험·Q-Net·이력서 증명사진 사이즈에 맞춰 사진을 자르고 용량을 맞춥니다. 업로드 없이 브라우저에서 처리하며 보정하지 않습니다."
- **Lead:** "여권사진과 증명사진 사이즈를 제출처 규격에 맞춥니다. 얼굴 위치를 자동으로 잡아 드리고, 안내선을 보며 직접 맞춘 뒤 정확한 픽셀 크기와 용량의 JPG로 저장합니다."
- **Near the picker:**
  - "사진은 이 기기 밖으로 전송되지 않습니다." with a /privacy/ link.
  - "얼굴 위치 자동 맞춤을 위해 처음 한 번 약 6 MB의 프로그램 파일을 내려받습니다. 사진은 보내지 않습니다." Hidden when the flag is 0.
- **사용 방법:**
  1. 제출처와 사진 고르기
  2. 안내선에 맞춰 위치 확인
  3. 규격 확인 후 저장
- **안전한 이유:** the no-upload line, EXIF removal ("사진 정보(EXIF)와 위치 정보는 결과 파일에 남지 않습니다."), and no sign-up.
- **Fixed notice block** (`role="note"`, directly above the save button). The text is **verbatim**:
  1. "이 도구는 자르기·기울기 조정·크기 조정·재압축만 합니다. 얼굴·피부·배경을 수정하지 않습니다."
     - This is the §4 sentence with 기울기 조정 added, because rotation now exists.
  2. "외교부 안내: 「사진 편집 프로그램, 사진 필터 기능 등을 사용하여 임의로 보정된 사진(AI를 활용한 편집·가공·합성·창조 제작물 포함)은 허용 불가함」"
     - Links to passport.go.kr menuPos=32, with "(2026-09-29 기준)".
  3. "배경을 흰색으로 바꾸거나 지우지 않습니다. 배경이 흰색이 아니면 흰 배경에서 다시 찍어 주세요."
  4. "머리 길이는 추정값입니다. 머리카락에 가려진 정수리 위치는 사진으로 정확히 알 수 없으니 안내선을 보고 직접 확인하세요."
  5. "최종 적합 여부는 접수 기관 심사로 결정되며, 이 도구는 통과를 보장하지 않습니다."
  6. "여권 사진은 제출 전에 외교부 「온라인 여권 사진 검증」에서 한 번 더 확인할 수 있습니다. (외교부 사이트로 이동하며, 그곳에서는 사진을 외교부 서버에 올립니다.)"
     - Link: `https://www.passport.go.kr/home/kor/onlinePhotoVerify/index.do?menuPos=33`, with `rel="noopener noreferrer"` and target `_blank`, plus visible "(새 창)".
     - That page itself says "해당 프로그램은 참고용일 뿐이며 실제 심사결과와 다를 수 있습니다". Do not claim more than that.
- **Rotation help** (under the slider): "사진 전체가 기울어졌을 때만 쓰세요. 고개가 기울어졌다면 다시 찍는 것이 좋습니다."
- **Requirements the tool cannot check** (static list, from passport.go.kr menuPos=32):
  - 흰색 배경
  - 6개월 이내 촬영
  - 모자 없음
  - 정면
  - 입을 다문 무표정(치아 노출 불가)
  - 안경 빛 반사 없음
  - 머리카락이 눈을 가리지 않음
- **FAQ** (6 questions, 2–4 sentences each; numbers and 기준일 from the preset data):
  1. **여권사진 규격이 어떻게 되나요?**
     - 3.5×4.5 cm. Online: 413×531 px, uploads accepted from 395–431 × 507–550, JPG, 500 KB 이하, 300 dpi 권장.
     - Head 3.2–3.6 cm, from the top of the skull (hair excluded) to the chin. White background, taken within 6 months.
     - The source link and the date.
  2. **이 도구로 만들면 여권사진 심사를 통과하나요?**
     - Not guaranteed. The agency decides.
     - The auto frame is an estimate, which is why the user confirms it.
     - Mention the 외교부 검증 link.
  3. **사진 보정이나 배경을 흰색으로 바꿀 수 있나요?**
     - No, with the policy quote.
     - Re-shoot on a white background.
  4. **증명사진 사이즈는 제출처마다 다른가요?**
     - List the presets with their px and KB.
     - Mention 직접 입력.
     - "주민등록증·운전면허증은 공식 파일 규격을 확인하지 못해 아직 넣지 않았습니다. 제출처 안내의 픽셀·용량을 직접 입력으로 맞추세요."
  5. **증명사진 용량만 줄이고 싶어요.**
     - Link to `/photo-compress/`, the KB-only tool.
     - Use this tool when pixel dimensions are also required.
  6. **아이폰 사진(HEIC)도 되나요?**
     - The Step 3 FAQ 4 text, with the same condition on the iPhone check.
- **Also on the page:** RelatedTools, AdSlots (empty; never between the picker and the save button), and JSON-LD per §5.

#### 3.2 States
empty → loading → adjust → exporting → done. There are also the blocked and error states.
- One `aria-live="polite"` region announces:
  - loading start and end
  - "자동 맞춤을 쓰지 못해 직접 맞추기로 바꿨습니다"
  - the checklist summary on change, debounced 600 ms
  - export done
- **empty**
  - Preset `select` labelled "제출처". Custom inputs appear when 직접 입력 is chosen and are validated inline.
  - The source line.
  - File input "사진 선택": single, accept `image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp`, plus drop.
- **loading**
  - `progress` with "얼굴 위치를 찾는 준비 중입니다 (2.1 / 5.6 MB)".
  - Button **"건너뛰고 직접 맞추기"**.
  - The second visit shows the progress briefly; the files come from the cache.
- **adjust**
  - **Stage.** A fixed aspect box (output aspect; CSS width min(100 %, 360 px)), so there is no CLS.
    - The photo canvas sits under the overlay canvas, drawn at devicePixelRatio.
    - `tabindex=0`, `role="group"`, aria-label "사진 위치 조정. 화살표 키로 이동, +와 −로 확대·축소, [와 ]로 기울기 조정".
  - **Overlay** (colour plus labels, never colour alone):
    - crown line "정수리(머리카락 제외)"
    - head band "턱 끝 위치" (official or 참고 label)
    - eye line "눈 높이(참고)" at 0.468 of the head below the crown (from K)
    - vertical centre line
    - face oval
    - hatched grey where the frame is outside the photo
  - **Controls:**
    - zoom range "확대·축소"
    - rotation range "기울기" (−5 to 5, step 0.5, value shown in °)
    - 4 nudge buttons "위로/아래로/왼쪽으로/오른쪽으로 이동" (≥ 44 px)
    - "자동 맞춤으로 되돌리기" (or "처음 위치로" in manual mode)
  - **Keyboard** on the stage:
    - arrows move 1 output px; Shift moves 10
    - `+`/`=` and `−` zoom ×1.01; Shift ×1.05
    - `[` and `]` rotate 0.5°
    - Home resets
  - **Pointer:** 1-finger or mouse drag pans. 2-finger pinch zooms about its midpoint. `touch-action: none` on the stage only.
  - **Readout** (not live; only the debounced summary is announced): "추정 머리 길이 33.8 mm (규격 32–36 mm)", or "… 사진 높이의 75 % (참고 71–80 %)".
    - In manual mode: "직접 맞추기: 안내선에 정수리와 턱을 맞추세요".
  - **Checklist** (`ul`). Each item has an icon and text: ✓ 통과, ! 확인 필요, ✕ 저장 불가.
    - Warnings copy (two sentences each):
      - yaw: "얼굴이 옆으로 약 {n}° 돌아가 있습니다. 정면을 보고 다시 찍는 것이 좋습니다."
      - pitch: "고개가 위나 아래로 기울어져 있습니다. 정면을 보고 다시 찍는 것이 좋습니다."
      - roll: "머리가 약 {n}° 기울어져 있습니다. 사진 전체가 기울었다면 기울기를 조정하고, 아니면 다시 찍는 것이 좋습니다."
      - expression: "입을 다문 무표정이어야 합니다. 치아가 보이거나 웃는 사진은 반려될 수 있습니다."
      - eyes: "눈을 감은 것으로 보입니다. 눈을 자연스럽게 뜬 사진을 쓰세요."
      - multi: "얼굴이 여러 개 보입니다. 가장 큰 얼굴에 맞췄으니 본인만 나온 사진인지 확인하세요."
      - head: "추정 머리 길이가 {n} mm로 규격(32–36 mm) 밖입니다. 확대·축소로 턱 끝을 초록 띠 안에 맞추세요."
      - background: "배경이 흰색이 아닌 것 같습니다. 이 도구는 배경을 바꾸지 않으니 흰 배경에서 다시 찍어 주세요."
      - noface / manual: "얼굴을 찾지 못해 직접 맞추기로 바꿨습니다. 안내선에 정수리와 턱을 맞추세요."
    - Blocks:
      - outside: "사진 바깥 부분이 들어갑니다. 빈 곳을 채우지 않으니 확대하거나 위치를 옮기고, 안 되면 머리 위와 어깨가 넉넉한 사진을 쓰세요."
      - lowres: "사진 해상도가 낮아 {w}×{h} px로 만들 수 없습니다. 흐려지지 않게 키우지 않으니 더 큰 원본 사진을 선택해 주세요."
  - **Confirmation** (required, a native checkbox): "규격 확인은 제출처 기준을 따릅니다. 정수리(머리카락 제외)와 턱 위치를 안내선에서 직접 확인했습니다."
    - It is **cleared** on any pan, zoom, rotate or preset change.
  - **Save button** "규격에 맞춰 저장". It is disabled while any block exists or the box is unchecked; a visible reason text sits next to it (aria-describedby).
- **done**
  - An `img` of the result at 1:1 CSS px, and at 2× on a toggle.
  - "413×531 px · 87.4 KB · 300 dpi · 여권 (온라인 신청·정부24)".
  - **내려받기** (`a download`, a blob URL).
  - "다른 규격으로 다시 만들기" and "처음부터".
  - The fallback note, if any: "빠른 방식으로 저장했습니다. 규격과 용량은 같습니다."
  - Revoke blob URLs on reset and on pagehide. Close the bitmap on reset.
- **Errors:** the Step 3 messages for heic, animated, not-image, corrupt and too-large, worded for one photo.
  - export verify failure: "규격에 맞는 파일을 만들지 못했습니다. 다시 저장해 보고, 계속되면 다른 사진을 써 주세요."
  - custom limit unreachable: "{N} KB로는 {w}×{h} px 사진을 만들 수 없습니다. 용량 한도를 조금 높여 주세요."

#### 3.3 Performance and loading
- **Initial JS** (controller, stage, overlay, crop maths, presets, sniff) must be **≤ 30 KB gzip**.
- **Nothing MediaPipe-related is requested before a photo is chosen.** That covers the bundle chunk, the loader JS, the wasm and the model. The encode worker and MozJPEG load on the save click.
- **Inference** runs once per photo on a copy with long edge ≤ 1024 px. Landmarks are cached; a preset change reuses them.
- **Main-thread work** (MediaPipe init and detect) happens behind the loading state. Report the longest long task in REVIEW-REQUEST, and raise a **Flag** if it is over 1 s on the desktop projects.
- **CSP is unchanged.**
  - The existing `script-src 'self' 'wasm-unsafe-eval'` and `connect-src 'self'` suffice. Arch grep of vision_wasm_internal.js and vision_bundle.mjs found no `eval(` and no `new Function`.
  - E2E records `securitypolicyviolation` events and requires zero.
  - Any need to relax the CSP is a **Flag**.
- **Cloudflare 25 MiB:** the largest file is vision_wasm_internal.wasm at 11.76 MB. The check-dist 24 MiB guard stays.

#### 3.4 Limits (`src/tools/id-photo/limits.ts`)

| | Desktop | Mobile |
|---|---|---|
| Photos | 1 | 1 |
| Bytes (hard) | > 50 MB | > 30 MB |
| Megapixels (hard) | > 150 MP | > 64 MP |
| Long side (hard) | > 32,767 px | > 16,384 px |
| Working long edge (automatic, silent) | 4,096 | 4,096 |
| Face assets | the flag and the guard | also skipped when deviceMemory ≤ 2 |

Low resolution is judged on the working bitmap. The cap never causes lowres: 4,096 px is ≥ 5× every output height.

#### 3.5 Site wiring
- **`src/data/tools.ts`:** `id-photo` goes live, with name "여권·증명사진 규격 맞추기", the h1/title/description above, the FAQ, and keywords 여권사진 규격, 여권사진, 증명사진 사이즈, 여권사진 사이즈, 증명사진 용량 줄이기. The sitemap, the home card and RelatedTools follow from the status.
- **`/photo-compress/` FAQ 3** now links: "픽셀 크기까지 정해져 있다면 여권사진 규격 맞추기를 쓰세요." This lifts the Step 3 "do not mention until live" rule.
- **`docs/COPY.md`:** add dpi usage for photos ("300 dpi"), "정수리(머리카락 제외)", and 장 for photos (already there).
- Regenerate the UI font subset and check for fallback glyphs, including ×, °, ✓ and ✕. Glyphs outside the subset use inline SVG icons, not font characters.

### 4. Bundle budget (`scripts/check-dist.mjs`, gzip -9)

| Asset | Budget |
|---|---|
| `/id-photo/` initial JS | ≤ 30 KB |
| MediaPipe bundle chunk (vision_bundle) | ≤ 50 KB |
| `encode.worker*.js` (without the wasm) | ≤ 25 KB |
| `vision_wasm_internal.js` / `_nosimd_internal.js` | ≤ 90 KB each |
| `vision_wasm_internal.wasm` | ≤ 12.2 MB raw, ≤ 3.6 MB gzip |
| `vision_wasm_nosimd_internal.wasm` | ≤ 11.4 MB raw |
| `face_landmarker-*.task` | SHA-256 equals the pin (the size follows) |
| Lazy total on the SIMD path (chunk + loader + wasm + model), gzip | ≤ 7.2 MB. Spike: about 5.6 MB br / 6.9 MB gzip. |
| Step 2 / 3 assets | unchanged, with exactly one `mozjpeg_enc*.wasm` |

Paste the table into REVIEW-REQUEST.

## Licenses — §0 exception (Arch decision, logged)
- **Eigen (MPL-2.0) is permitted only as unmodified upstream code compiled into the `@mediapipe/tasks-vision` wasm.**
  - MPL-2.0 is file-level copyleft. It places no obligation on our code.
  - MPL 3.2(a) is met by a /licenses/ entry: the Eigen notice, the MPL-2.0 text, and a link to the Eigen source (https://gitlab.com/libeigen/eigen, at the version pinned by the TensorFlow commit Bob identifies).
  - Every other MPL/GPL rule in §0 is unchanged.
- **`check-licenses.mjs`** gets an explicit `exceptions` list: `{component, license, scope: vendor/mediapipe wasm, decided: 2026-09-29}`.
  - Any other match for `/GPL|MPL/` still fails.
  - A unit test proves that an unlisted MPL entry fails.
- **Kill switch.** The owner can veto this by building with `PUBLIC_ID_PHOTO_AUTOFRAME=0`. The tool then ships manual-only, with no MediaPipe byte in `dist/`, and no code change is needed.

## Failure modes

| Path | Realistic failure | Handling (test) | User sees |
|---|---|---|---|
| Presets | An agency changes its spec after launch | Date and source line on every preset, the page-wide "제출 전 확인" line, and a check-dist **warning** (not a failure) when `retrieved` is > 180 days old | The source link and date |
| Presets | A secondary value ships | `validatePreset` rejects status `secondary` and a missing quote or URL (unit) | – (build fails) |
| Assets | The wasm or model 404s, the MIME type is wrong, or the network drops | try/catch → MANUAL + announcement (e2e: route 404 for the wasm and for the model) | The manual guide, still exportable |
| Assets | A slow mobile connection | Progress text, the skip button, and a 60 s timeout → MANUAL (e2e: delayed route + skip) | Progress, then manual |
| Assets | The wasm is downloaded twice (the cache warm fails) | Chromium CDP e2e: the second wasm request is served from cache → otherwise **Flag** | Nothing (bandwidth only) |
| Model | The tab crashes on a low-memory phone | The sessionStorage attempt flag sends the next load to MANUAL. deviceMemory ≤ 2 skips (unit: guard; e2e: addInitScript sets the flag / deviceMemory 1) | Manual after reload |
| Model | No face found (a mask, a dark or odd photo) | faces 0 → MANUAL with the note (e2e: a scene image) | The manual guide |
| Model | Two faces (a poster behind) | Largest face used, plus the multi warning (e2e: composite) | Warning |
| Model | The crown is misestimated (thick hair, pitch) | Mandatory overlay confirmation; the head readout is labelled 추정; the pose warning (regress: every out-of-band case must carry a warning) | Overlay and warning |
| Crop | The frame extends past the photo | Corner check → block; never pads (unit: rotated corners; e2e: zoom out) | Block message |
| Crop | The photo is too small | s > 1 → lowres block; zoom clamp s ≤ 1 (unit; e2e: 300×375 generated) | Block message |
| Crop | Aliasing at a big downscale (4000 px → 137 px) | Pre-scale to 2s with resizeQuality high (regress: PSNR of the transform path vs a lanczos3 reference ≥ 38 dB at rot 0) | Clean output |
| Rotation | Used to "fix" a tilted head | Limited to ±5°, the help text, and the residual roll warning (unit) | Help and warning |
| Confirm | The user confirms, then drags | The checkbox clears on any change (unit on the controller reducer; e2e) | Must re-check |
| Export | MozJPEG fails to load | Canvas q search with the same verify, plus a note (unit: throwing dep; e2e: route 404 on mozjpeg wasm) | Result + note |
| Export | The encoder output is off-spec (dims, bytes, progressive, APP1) | Verify → discard → error (unit: lying encoders) | Error, never a bad file |
| Export | Cannot fit at q 50 (only possible with custom 10 KB at 2,000 px) | Error: the custom limit-unreachable copy (unit) | Error |
| Output | EXIF/GPS carried over | Re-encode writes no APP1 (e2e byte scan on exif6_gps.jpg) | Clean file |
| Privacy | MediaPipe telemetry or a CDN fetch | CSP connect-src 'self', and no-upload on every test, including the MediaPipe load | – |
| iOS | HEIC arrives in a non-Safari browser | Step 3 sniff/decode → guidance (e2e fake.heic) | Guidance |
| Kill switch | A flag-0 build still ships MediaPipe | `check-dist --no-mediapipe` in CI on a flag-0 build | – |

There is no row with no test, no handling and a silent result.

## Test map
Every item starts as [GAP]. Bob marks each one [TESTED].
- **jfif:** patch, insert, idempotent, non-JPEG throws, dims unchanged. [GAP]
- **presets:**
  - schema
  - no `secondary` status
  - https URLs
  - ISO dates
  - `lt` → −1 byte
  - out px inside pxRange
  - aspect vs mm within 1.5 %
  - ASCII fileTag
  - custom bounds (49/2001 px, 9/10,001 KB rejected)
  - dpi values (300, 99, 96)
  [GAP]
- **crop:**
  - round-trip of toSource/toOutput at rot 0 and ±5
  - corners inside or outside at each edge, with rotation
  - s ≤ 1 clamp
  - zoomAt keeps the anchor fixed
  - pan in output px
  - rotate clamp and snap
  - pinch
  - headMm
  [GAP]
- **frame:**
  - synthetic landmarks → headMm = 34.0 ± 0.05, with the crown at 4.5 mm
  - lowres when s > 1
  - manualFrame largest crop
  - the gosi and saramin aspects
  [GAP]
- **warnings:** each threshold at ±ε, residual roll with rotDeg, faces > 1, head band per preset kind. [GAP]
- **background:** white, light grey (pass), mid grey, blue and a busy texture (warn). [GAP]
- **guard:** flag 0, deviceMemory 1/2/4/undefined, the crash flag set, clear after success. [GAP]
- **controller reducer** (pure): the confirmation clears on pan, zoom, rotate and preset change; save is enabled only with no block and the box checked. [GAP]
- **encode worker (Node, real MozJPEG):**
  - every shipped preset from portrait_pd gives exact dims, ≤ limit, JFIF dpi and SOF0
  - the lying-encoder discard
  - the canvas-fallback path with a fake encoder
  - custom limit unreachable
  [GAP]
- **check-licenses exception:** a listed Eigen entry passes; an unlisted MPL entry fails. [GAP]
- **network guard:** the allowlist is exactly the two codec files plus `src/lib/face/assets.ts`. [GAP]
- **E2E:** every flow below. [GAP]
- **Existing behaviour at risk:**
  - Step 3 shared modules, used unchanged (Step 3 unit, e2e and regress:photo stay green)
  - codec loaders (regress:compress identical)
  - sitemap list
  - home cards
  - RelatedTools on all 4 tool pages
  - photo-compress FAQ 3 link
  - the CSP e2e in `site.spec.ts`

## Tests

### Corpus and fixtures
- **`tests/fixtures/`** keeps its 3 MB cap. It is 2.3 MB before Step 3 finishes, so Step 4 adds **no** files there. It reuses `portrait_pd.jpg`, `exif6_gps.jpg`, `anim.gif` and the Step 3 test-time generators.
- **New committed `tests/corpus/id-photo/`** (Arch decision: a separate cap of ≤ 2.5 MB, each file ≤ 220 KB, long edge ≤ 1,200 px, q 88):
  - **Allowed sources:**
    - US federal-government works (public domain): House/Senate official portraits, NASA, and US military official portraits
    - Wikimedia Commons files tagged **CC0** or **PD-self**
  - **Not allowed:**
    - CC BY / BY-SA (spike p13, p14)
    - NC datasets (FFHQ, CelebA)
    - stock or scraped images
    - AI-generated faces
  - `SOURCES.md` lists each file with its page URL, license, author and transform.
  - The files are test inputs only. check-dist asserts that nothing from `tests/` is in `dist/`.
  - **Start set:** spike p01–p12, downscaled. Add ≥ 6 neutral, closed-mouth, frontal portraits (see Calibration).
  - `truth.json` holds, per file and in source px of the committed file:
    - `eye`, `chin`, `skull` or null, `conf`
    - `expr`: neutral / smile / open
    - `pose`: frontal / yaw / pitch
    - `expectWarn[]`
  - Port the values of spike gt-manual.json, scaled.
- **Generated at test time:**
  - `lowres_300x375.jpg` (from portrait_pd)
  - `two_faces.jpg` (two corpus faces side by side)
  - `scene_noface.jpg` (from scene_cc0)
  - `fake.heic`

### Unit (`tests/unit/idphoto-*.test.ts`, Node)
Everything in the Test map rows above.

### E2E (`tests/e2e/id-photo.spec.ts`)
All 5 projects unless noted. Every test uses the no-upload helper and records zero `securitypolicyviolation` events.
1. **Lazy load:**
   - no request under `/vendor/mediapipe/` and no MediaPipe chunk before the file is chosen
   - requested after
   - the progress element shows and completes
   - no encode-worker or MozJPEG request before the save click
2. **Happy path, passport_online, portrait_pd.jpg:**
   - the overlay is visible and the readout is in 32–36
   - save is disabled until the box is checked
   - download `passport_413x531.jpg`, then parse in Node:
     - exactly 413×531
     - ≤ 500,000 B
     - SOF0
     - JFIF units 1 and 300/300
     - no APP1, "Exif" or "GPS"
     - nothing after EOI
3. **Every shipped preset** (desktop 3 projects; mobile passport + gosi only): exact px, ≤ limit, the dpi as in the table, and the right fileTag.
   - Custom 200×250 / 50 KB.
   - Custom invalid input (49 px, "abc") disables save and shows the message.
4. **Adjust:**
   - the arrow keys, `+`/`−`, `[`/`]` and Home change the readout and the rotation value
   - the nudge buttons work
   - a mouse drag pans
   - the checkbox is cleared after each change
   - pinch: unit-tested; e2e skipped on mobile with the stated reason (Playwright has no multi-touch)
5. **Outside:** zoom out to the minimum and pan to an edge. The outside block shows and save is disabled.
6. **Lowres:** `lowres_300x375.jpg` + passport gives the lowres block, and no download.
7. **Fallbacks:**
   - route the wasm to 404 → manual note, and export still works
   - route the model to 404 → the same
   - `addInitScript` deviceMemory = 1 → manual, and **no** MediaPipe request
   - the sessionStorage crash flag preset → manual
   - the skip button during a delayed load → manual
   - MozJPEG wasm 404 → export with the fallback note
8. **Warnings** (chromium, firefox, webkit):
   - the corpus yaw image → the yaw warning
   - an open-smile image → the expression warning
   - `two_faces.jpg` → the multi warning
   - `scene_noface.jpg` → the manual note
   - a non-white-background corpus image → the background warning
9. **Bad inputs:** fake.heic → guidance; anim.gif → animated; truncated → corrupt; not_image → not-image.
10. **Orientation:** exif6_gps.jpg yields an upright frame (the stage aspect is right), and the output has no GPS bytes.
11. **Notices:**
    - the 6 notice texts match verbatim
    - the 외교부 checker link href is exact, with rel noopener noreferrer
    - the confirmation label is exact
12. **Kill switch** (chromium; a separate `PUBLIC_ID_PHOTO_AUTOFRAME=0` build served on a second port): no MediaPipe request, the 6 MB line is hidden, and the manual export works.
13. **Keyboard-only** full run on the desktop projects: select the preset, pick the file (setInputFiles), adjust, check the box, save, download.
14. **axe:** empty, adjust (with the overlay and checklist), done; also `/`, `/pdf-merge/`, `/pdf-compress/` and `/photo-compress/` again.
15. **Mobile:** at 360 px there is no horizontal scroll, and the tap targets are ≥ 44 px (stage buttons, sliders, checkbox label).
16. **SEO:**
    - the sitemap lists exactly `/`, `/pdf-merge/`, `/pdf-compress/`, `/photo-compress/`, `/id-photo/`, `/privacy/` and `/licenses/`
    - one H1, the canonical, and parseable JSON-LD
    - the home card links to the tool
    - RelatedTools is present
    - the photo-compress FAQ link is present

### Regression harness — `npm run regress:idphoto`
- **Runner:** `scripts/regress/idphoto.mjs`, a Vite dev server (the same pattern as regress:photo) with the **production modules**:
  - landmarker
  - frame
  - render
  - encode worker
  - warnings
- It uses Chromium by default; an optional flag selects firefox or webkit.
- **Inputs:** `tests/corpus/id-photo/` plus `truth.json`, and optionally the full-resolution `CORPUS_DIR` (default `spikes/photo/corpus`, PD files only).
- **Checks** (all must pass; never lower a threshold; report misses under Blocked):
  1. **Detection:** 1 face on every portrait; 0 on the scene; ≥ 2 on two_faces.
  2. **Landmarks:**
     - abs(eye error) ≤ 1.0 mm and abs(chin error) ≤ 1.0 mm (at the 34 mm head scale) for every truth head
     - the spike reached ≤ 0.53 mm and −0.99 to +0.70 mm
  3. **Head length on the calibration set** (the heads with `skull` set and conf high or med):
     - true head mm = (chin − skull) × s × 45 / 531 for the auto frame
     - **≥ 5 of 6** in 32–36 on the spike set; on the full set, ≥ 80 % in band
     - mean abs error ≤ 1.2 mm
     - **every out-of-band head carries a pose or expression warning**, otherwise fail (spike p10: pitch 16°)
  4. **Exact output:** every preset × every portrait that is not lowres gives exact px, ≤ limit, SOF0, the JFIF dpi and no APP1. 100 %.
  5. **Warnings:** every `expectWarn` entry fires. Report false positives, which are not a failure.
  6. **Resampling:** at rot 0, the render.ts output vs a lanczos3 (@jsquash/resize) crop-scale reference has PSNR ≥ 38 dB. The spike measured 38–41.
  7. **Lowres:** a 380-px-wide portrait (downscaled PD) at passport gives lowres, never an upscaled file.
  8. **Timing:** report the median init ms and detect ms. A value over 2 × the spike (0.7 s / 89 ms) is flagged, not failed.
- **Output:** `regress-out/idphoto.md`. Paste it into REVIEW-REQUEST.

### Calibration note (K, C)
- **Why.** K = 0.88 and C = 1.68 were fitted leave-one-out on 6 heads, and **every one of them was smiling**.
  - Passports require a closed mouth, and an open mouth moves the chin down, which biases K low.
  - The fitted per-person spread (K 0.80–0.97) is about ±7 %, the same size as the ±2 mm tolerance.
  - So the overlay confirmation stays mandatory whatever the fit.
- **Re-calibrate on neutral, closed-mouth, frontal heads with the skull top observable** (bald, shaved or ≤ 1 cm hair):
  - ≥ 8 heads, from the allowed sources above only.
  - Also allowed: consented photos of the owner or the team, with written consent, kept in `CORPUS_DIR` only and never committed.
  - Not allowed: CC BY/BY-SA, NC datasets, stock, scraped or AI-generated faces.
- **Procedure:**
  1. Annotate eye, chin and skull on the labelled grid sheets (port spike `run-measure.cjs` and `analyze_crown.py` into `scripts/regress/`).
  2. Fit K and C by least squares, then evaluate leave-one-out.
  3. **Adopt new constants only if** the LOO in-band count on neutral heads is ≥ the count for the current constants **and** the mean abs error is not worse. Otherwise keep 0.88 / 1.68.
  4. Write the dataset hash, n and date into `calibration.ts`, and the table into REVIEW-REQUEST.
- **Bias note.** Skull-visible heads skew male and older. Report the composition, and check the non-bald heads visually in the contact sheet.
- **If fewer than 8 neutral heads are found,** keep the provisional constants, log a Known Gap, and continue. This does not block launch, because confirmation is mandatory.

## Flags (do not guess; write under "Blocked")
- **Q1:** the Q-Net physical size wording. The spike raw HTML said 3.5×4.5; the fetch summary today said "증명사진(2.5X3.5) 또는 여권사진(3X4)". Quote the raw HTML.
  - Output stays 413×531 either way (JPG ≤ 200 KB is the only published hard rule).
  - Arch adjusts the label copy only.
- Any preset value that differs from the table, or a dropped preset newly verified.
- License inventory: any GPL/LGPL/AGPL, MPL outside Eigen, or `EIGEN_MPL2_ONLY` not shown. Build step 0.2.
- Any CSP change needed. MediaPipe failing in Firefox or WebKit (stack and browser). A long task over 1 s.
- The wasm downloaded twice (the cache warm is ineffective).
- Any change needed in a Step 3 shared module.
- Any regress threshold missed.
- `docs/UX-AUDIT-1.md` conflicting with this brief.
- New behaviour beyond this brief:
  - background edit
  - retouch
  - automatic rotation
  - camera capture
  - print sheets
  - PNG output
  - batch
  - storing photos

## Out of Scope (→ BUILD-LOG Known Gaps)
- Background removal or whitening, and any retouch or beautify filter (policy; never).
- Automatic rotation or straightening. Rotation is manual only, ±5°.
- Camera capture in the page (Permissions-Policy camera=() stays).
- Print layout sheets (for example 4×6 with several copies).
- Presets for 주민등록증, 운전면허증, TOEIC, 고용24, 지방공무원 and KPC, until they are verified from official pages. KPC is verified already but deferred to keep the scope small.
- PNG output (gosi also accepts JPG).
- Moving MediaPipe into a classic worker.
- Batch processing.
- HEIC decoding (locked).
- A background-colour *fix*. The warning only.

## Acceptance
- Every §3 quality gate is green, including:
  - Lighthouse on `/id-photo/` before a file is picked: Perf ≥ 95, A11y 100, BP ≥ 95, SEO 100, LCP ≤ 2.0 s, CLS ≤ 0.01
  - the section 4 budgets
- Unit, e2e (5 projects, no-upload and zero CSP violations on every test) and regress:idphoto meet the thresholds above.
- regress:photo, regress:compress and regress:merge are unchanged.
- **Licenses:**
  - check:licenses is green, with exactly one exception (Eigen).
  - `/licenses/` lists MediaPipe tasks-vision, the models (Apache-2.0 plus the model-card links), every inventoried wasm component, and Eigen with the MPL-2.0 text and a source link.
- `dist/` has `/id-photo/`. The sitemap, the home card, RelatedTools and the photo-compress FAQ link point to it.
- The flag-0 build passes `check-dist --no-mediapipe` and e2e 12.
- **Gate 11 (Richard):** real Chrome, Firefox and Edge plus one phone. For each:
  - a real selfie-style phone photo → passport → open the file in Windows Properties: 413×531, 300 dpi, ≤ 500 KB
  - one manual-mode run, with the network throttled and skip pressed
- **Real iPhone (owner or orchestrator):** Safari, pick from the photo library, then passport export. Record the result in BUILD-LOG.

## Deploy gate (Step 4), identical to Step 2
1. Richard writes "Step 4 is clear".
2. Arch commits locally ("[Step 4] 여권사진 규격 맞추기 …") and updates BUILD-LOG and the checkpoint.
3. A push to `main` publishes to Cloudflare Pages. The orchestrator pushes under the standing instruction of the owner, then runs the live smoke test on https://doc-tools-kr.pages.dev:
   - `/id-photo/` returns 200 with the CSP header, `/sitemap.xml` lists it, and the home card links to it.
   - Under `/vendor/mediapipe/1.0.1/`:
     - both `.wasm` files are served as `application/wasm`
     - the loader `.js` files are served as JavaScript
     - the `.task` model returns 200 with the immutable Cache-Control
   - In real Chrome, portrait_pd.jpg → passport gives exactly 413×531, ≤ 500,000 B, JFIF 300 dpi and no APP1.
     - The progress bar showed.
     - There is no non-GET or cross-origin request, and no CSP violation.
   - With the model URL blocked in DevTools, the page falls back to manual and still exports.
   - `/photo-compress/` still compresses portrait_pd.jpg to ≤ 200 KB (shared codecs).
4. If the smoke test fails, the orchestrator reverts the Step 4 commit and pushes, logs it, and reopens the step.
