# Architect Brief — Sprint C: C1 전자서명·도장 이미지 (ink key, no model), C2 배경 지우기 (BiRefNet_lite 512)

Staged 2026-10-02 by Arch on `g2-a2` (brief file only). Inputs: `C:\dev\AGI_AGENT\reports\문서딱 누끼 품질 검증.md` (spike + "결정 (Arch, 2026-10-02)"), spike artefacts `C:\dev\doc-tools-kr\spikes\bg-remove\` (local only: `tools/pp.py` `ink_key`/`fg_blur`, `tools/compose_gt.py`, `tools/export_birefnet.py`, `tools/fix_wide_ops.py`, `results/`, `web/bench.html`).
Standing rules apply unchanged: CLAUDE.md owner rules, CLOUD-HANDOFF §3 deploy gate, guide fact contract (Growth G + G2: every number/legal statement = fetched official quote, `check:quotes` verbatim), docs/COPY.md plain language, brand 문서딱, CSP `connect-src 'self'`, no-upload e2e on every test, permissive licences only, never loosen a threshold to pass.

## Order and dates (A guides' hard dates win every conflict)
| Item | Start | Target deploy | Constraint |
|---|---|---|---|
| A2 (running) | now | 2026-11-05 | untouched by C |
| C1-core (`src/lib/ink/*`, worker, unit tests, fixtures, `regress:ink`) | now, own branch `c1` off main | — | touches no file A2 touches; may run in parallel |
| C1 integration (page, `tools.ts`, guides, lighthouserc, e2e, check-dist) | after A2 is on main | **2026-11-15** | slip C1, never A3 (11-25) or the 11-10 / 11-30 guide dates |
| C2.0 export + runtime probe (owner PC, local, no deploy) | after C1-core; may overlap C1 integration | — | results logged in BUILD-LOG before C2 build |
| C2 build | after C1 is live | **2026-12-10** | release blocked on owner real-device check (C2 build order 9) |

Expected merge conflicts (keep both sides): `src/data/tools.ts`, `src/data/guides.ts` (NEXT_GUIDES), `guide-schema.ts` TOPICS, `scripts/check-dist.mjs`, `licenses.manifest.json`, `lighthouserc.json`, `handoff/BUILD-LOG.md`.

---

# C1 — 전자서명·도장 이미지 만들기

## Goal
A phone photo or scan of a 도장 impression or a paper signature becomes a clean, cropped, transparent PNG in the browser, with no model download and nothing leaving the device; plus a draw-your-signature pad for the 전자서명만들기 intent.

## Slug, title, SEO
- Slug `/stamp-signature/`. name `전자서명·도장 이미지`. H1 `전자서명·도장 이미지 만들기`.
- title `전자서명·도장 이미지 만들기 — 배경 없는 PNG 무료 | 문서딱` (keyword-led, same shape as the live tool titles, `| 문서딱` suffix).
- description 80–120자, contains `도장 이미지 만들기` and `전자서명`, plus the plain no-send line (COPY.md).
- keywords (copy reference only): 전자서명만들기 5,960 / 온라인도장만들기 4,460 / 도장이미지만들기 2,700 / 전자도장 1,580 / 도장배경제거 720 / 싸인누끼 260 / 도장누끼 220 (Naver PC+mobile, measured 2026-10-02).
- **Intent decision (Arch, log it):** 전자서명만들기 mostly means "make a signature online", so C1 ships two tabs: `사진으로 만들기` (core, ink key) and `직접 그리기` (signature pad, same PNG export). A text-to-도장 generator (온라인도장만들기 intent) is **out of scope**: it needs a seal-style font licence and a misuse policy. Goes to BUILD-LOG Known Gaps as an owner decision.
- FAQ answers say only what the tool does. No legal claims in the FAQ (legal text lives in guide C1-G2 with quotes, or nowhere).

## Flow
```
pick photo -> sniff + checkDims (reuse the photo-compress / id-photo limits pattern) --fail--> plain error
   | decode -> ImageBitmap -> work copy, long edge <= 2400 px desktop / 1600 px mobile
   v
ink.worker:  paper estimate -> alpha ramp -> mode filter -> despeckle -> ink colour (unmix | normalise)
   |             area check: ink < 0.05% -> "도장이나 서명을 찾지 못했어요"
   |                         ink > 60%   -> "종이 전체가 잡혔어요. 종이만 나오게 다시 찍어 주세요"
   v
preview on checkerboard + on white  <-- controls: 모드 / 진하기 / 색 / 크기 (re-run worker, debounce 150 ms)
   v
auto-crop + padding -> resize to chosen size -> PNG (alpha) -> download 도장.png / 서명.png
draw tab: pointer strokes on canvas (DPR-aware) -> same crop / colour / size / PNG export
```

## Ink-key algorithm (`src/lib/ink/key.ts`, pure functions on typed-array planes; port of spike `pp.ink_key`)
1. Planes: `mn = min(R,G,B)`, `lum = 0.299R + 0.587G + 0.114B`, redness `red = R - max(G,B)` (all 0..1).
2. **Background (paper) estimate:** `k = max(31, round(longEdge/8)) | 1`. `paper = gauss(maxFilter(mn, k), sigma = k/3)`. Max filter = separable van Herk/Gil-Werman, O(n). Gaussian = 3 box-blur passes. Same for per-channel paper colour `P_rgb`. This one step removes shadows, uneven light and paper tone, because ink is measured relative to the local paper level.
3. **Darkness:** `d = clamp((paper - x) / max(paper, 1e-3), 0, 1)` with `x = mn` (auto and red modes) or `x = lum` (signature mode, so a red ruled line or a paper tint does not key).
4. **Alpha ramp:** `a = clamp((d - lo) / (hi - lo), 0, 1)`, defaults `lo 0.10, hi 0.60` (spike). The `진하기` control (5 steps, default middle) shifts both by +-0.03 per step. The acceptance metrics test the defaults.
5. **Modes** (radio group, default `자동`):
   - `자동`: step 3 on `mn`. Colour guess = red if sum(a*red)/sum(a) > 0.15, else black.
   - `빨간 도장`: `a *= clamp((red - 0.08) / 0.12, 0, 1)`. Printed black text under the stamp is dropped (honest limit: overlap pixels become gaps).
   - `검정·파란 서명`: `x = lum`, and `a *= 1 - clamp((red - 0.15) / 0.15, 0, 1)`. A red stamp on the same page is dropped.
6. **Anti-aliasing:** alpha stays continuous (the ramp is the AA). Then a 3x3 Gaussian (sigma 0.6) on `a` at edge pixels only (any neighbour with 0 < a < 1). No binarisation anywhere.
7. **Despeckle:** connected components of `a > 0.25` smaller than `max(12, 0.00002*W*H)` px get `a = 0` (paper grain, JPEG dots). Area is the only rule; the gt15 ink-gap metric proves stamp fragments survive.
8. **Ink colour:** `원래 색` = un-mix `F = (I - (1-a)*P) / max(a, 0.05)`, clamped (spike). `색 맞추기` (default ON) = fixed colour, alpha kept: 도장 빨강 `#C8102E`, 서명 검정 `#111111`, 서명 파랑 `#1F3A93`. These are our design choices, not standards; copy never calls them "공식 색".
9. **Auto-crop:** bbox of `a > 0.1`; padding = `max(8 px, 4% of the bbox long edge)`. `여백 없음` toggle sets 2 px.
10. **Output size** (radio): `원본 크기` (cropped work res) / `긴 변 1000 px` / `긴 변 600 px` / `긴 변 300 px`. Downscale only (options bigger than the crop are disabled). Resample in premultiplied alpha so edges get no dark fringe. File name `도장.png` (red) or `서명.png`.
- Worker `src/lib/ink/ink.worker.ts`, transferable buffers. Target: a 12 MP photo at work res in <= 600 ms on the dev PC (log the number). check-dist budget for the worker = measured gzip + 20% (record in BUILD-LOG).
- Draw tab `src/tools/stamp-signature/pad.ts`: Pointer Events, quadratic smoothing, the 3 pen colours above, `지우기` / `되돌리기`; export through steps 9-10. The pad is pointer-only by nature; its helper text points keyboard users to the photo tab.
- Flag: no other parameters, no auto-straighten or perspective fix. Out of scope.

## Honest limits (on the page in plain words, and in the FAQ)
- 질감 있는 종이나 색지 위의 흐린 도장은 얼룩지거나 끊겨 보일 수 있어요 (spike l02).
- 도장이 글자 위에 찍혀 있으면 겹친 부분이 비어 보일 수 있어요.
- 반짝이는 종이의 빛 반사, 아주 어두운 사진은 잘 안 될 수 있어요.
- 이 도구는 이미지를 만들 뿐, 법적 효력을 정하거나 본인 확인을 하지 않아요. 본인 도장과 서명만 쓰세요.

## Guides (official sources only; add topic `서명·도장` to `TOPICS`)
- **C1-G1 `stamp-image`** "도장·서명 이미지 만들기 (배경 없는 PNG)": the steps describe our page only (Growth G page-6 rule). An optional section "한글·워드 문서에 넣기" ships only with fetched quotes from official Hancom or Microsoft help pages on inserting a picture; otherwise the section is omitted. CTA to `/stamp-signature/`.
- **C1-G2 `e-signature-law`** "전자서명·전자도장, 문서에 써도 되나요?": ships **only** with verbatim quotes from 전자서명법 on law.go.kr (the definition article and the effect article), passing `check:quotes`. The page quotes and links. It does **not** say that a stamp or signature image is a 전자서명 under the law, does not compare with 인감, and ends with "받는 곳(회사·기관)이 정한 방식이 있으면 그 방식을 따르세요." If the law text cannot be fetched verbatim, the draft stays a draft, logged with `tried[]`.
- NEXT_GUIDES: `/stamp-signature/` -> both. Both count toward the guide total.

## C1 Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| decode | HEIC on desktop Chrome, corrupt file | existing sniff + decode error | clear error |
| dims | 50 MP scan on a phone | checkDims pattern, mobile limit | clear error with the limit |
| key | dark photo, whole page keyed | area > 60% check | clear message, no download |
| key | blank paper, no ink | area < 0.05% check | clear message, no download |
| key | worker OOM or crash | worker `error` -> engine-error UI | clear error + 다시 시도 |
| export | `toBlob` returns null (Safari memory) | retry once at the next smaller size, then error | clear error |
| pad | empty canvas | download disabled until >= 1 stroke | disabled button + reason |

No silent path.

## C1 Test map
| Branch / flow | Test |
|---|---|
| paper estimate, ramp, 3 modes, AA, despeckle, crop, sizes, colours | unit `ink-key.test.ts` on tiny synthetic planes, exact expectations [GAP -> new] |
| quality on GT fixtures (below) | `regress:ink -- --fixtures-only`, in the CI gate [GAP -> new] |
| area < 0.05% / > 60% messages | unit + e2e [GAP -> new] |
| photo tab: pick -> preview -> each mode -> each size -> PNG has alpha, dims <= choice | e2e `stamp-signature.spec.ts`, 5 projects, no-upload [GAP -> new] |
| draw tab: stroke -> PNG, clear, undo, disabled when empty | e2e [GAP -> new] |
| a11y | axe in each state [GAP -> new] |
| regressions: precache <= 450 KB, initial JS <= 30 KB, UI fonts, sitemap / llms / OG / hub listing | existing check-dist / postbuild / site tests [TESTED], extended with the new slug |

## C1 Acceptance (thresholds fixed now; never lowered)
- Fixtures: `tests/fixtures/build-ink.py` (Python + numpy + Pillow, dev only, seeded, outputs committed, listed in SOURCES.md) ports spike `compose_gt.py` gt14 (blue signature), gt15 (red 도장 with ink gaps), gt16 (logo). **Font:** an OFL font already in the repo (`public/fonts/pretendard` or `scripts/fonts/fb-cjk-*`). The HANBatangB font used by the spike (Hancom) must not be used. If glyphs are missing, use other Hangul syllables the font has.
- Hard variants (same seed and GT alpha): `-shadow` (elliptical shadow, -40% light over a third of the frame), `-yellow` (paper tone #E9DDB5), `-jpeg` (q70), `-stampOnText` (gt15 over black printed text lines; GT = stamp only; scored in `빨간 도장` mode).
- Gates (defaults, `자동` unless stated): IoU@0.5 >= **0.90** on gt14 and gt15 (spike 0.912 / 0.902), >= 0.98 on gt16; every hard variant >= **0.85**; composite error of gt15 on white <= 0.046 (spike). Baseline `scripts/regress/ink-baseline.json`; any metric worse than baseline by > 0.01 fails.
- **Real photos with uneven light:** 6 photos (desk lamp or window light, visible shadow; a scribble signature and a stamp of a made-up name such as 홍길동; on white, ruled and yellow paper). Bob has no camera, so these are an **owner-only item**, requested now, needed by 2026-11-10. Add spike l01/l04 only if their Commons licence allows redistribution (attribution in SOURCES.md), else local-only. Each photo gets a JSON with hand-marked `paperRects` and `inkRect`. Gates: residue (alpha > 0.1 inside paperRects) <= **0.2%** of the rect area; ink found (alpha > 0.5 inside inkRect) >= 0.5% of inkRect; crop bbox inside inkRect padded by 6%. Contact sheet to `regress-out/` for Richard. If the photos are late, C1 waits (the synthetic hard variants alone do not clear it).
- Owner (non-blocking, before the Naver crawl request): 3 phone photos of a real 도장 under room light, visual OK.

## C1 Deploy gate
CLOUD-HANDOFF §3 in full, plus `regress:ink -- --fixtures-only`, `check:quotes` (guides), Lighthouse URLs `/stamp-signature/` and `/guide/stamp-image/` (median of 5, LCP <= 2,000 ms, perf >= 0.95, CLS <= 0.01). UI fonts: report the delta; C1 + C2 together may add at most 2.0 KB over the post-A3 figure. Over that, Bob rewrites copy onto existing glyphs; only Arch moves a budget. Then Richard "clear" -> local commit -> push on go-ahead -> live smoke (§6) -> IndexNow, Naver 수집 요청, Kakao cache, GSC inspection for the new URLs.

---

# C2 — 배경 지우기 (누끼)

## Goal
The subject of a photo is cut out on the device by BiRefNet_lite 512 fp16 from our own ONNX export, downloaded only after a photo is picked, and saved as a transparent PNG or on a solid white or blue background, with honest failure messages.

## Slug, title, SEO
- Slug `/remove-background/`. name `배경 지우기`. H1 `사진 배경 지우기 (누끼)`.
- title `사진 배경 지우기·누끼 따기 무료 — 투명 PNG | 문서딱`. Keywords 배경 지우기, 누끼 따기, 사진 배경 제거, 배경 투명하게 (the orchestrator measures volumes in a PC chrome-cdp session; not a blocker).
- Copy rules: **never** "remove.bg급" or any competitor name. Say it up front, above the picker, not only in the FAQ: "증명사진·상품·반려동물·자동차 사진에 잘 맞아요. 유리나 투명한 물건, 여러 사람이 함께 나온 사진, 복잡한 배경은 잘 안 될 수 있어요." Plus "처음 한 번 약 100 MB를 받아요."
- Signature and stamp photos: link to `/stamp-signature/` ("서명·도장은 여기서 더 깔끔해요").

## Flow
```
page load: zero model/runtime requests (e2e-enforced)
pick photo -> checkDims + work copy (long edge <= 4096 desktop / 2048 mobile)
   v
cached? (Cache Storage 'docttak-model-birefnet-<exportId>' has every part + runtime)
   |-- yes -------------------------------------------------------------+
   +-- no -> consent panel "약 100 MB를 한 번 받아요 (와이파이 권장)" [받고 시작] [취소]
             v                                                          |
        fetch manifest.json -> parts in order, progress bytes/total, AbortController 취소
        each part: SHA-256 == manifest? no -> delete entry, error "받은 파일이 손상됐어요. 다시 시도해 주세요"
             v put in Cache Storage (skip + note if storage.estimate quota < 300 MB)
   +--------------------------------------------------------------------+
   v
runtime: WebGPU adapter? yes -> ort native WebGPU EP (asyncify wasm from 2 parts -> env.wasm.wasmBinary)
                         no / create fails -> ort plain WASM build (threads when crossOriginIsolated)
   v  InferenceSession.create(concat(parts)) -> drop the buffer
infer: resize to 512x512 (no aspect keep, ImageNet mean/std) -> mask 512x512 (sigmoid inside the graph)
   v
area(a > 0.5) < 1% -> "사진에서 피사체를 찾지 못했어요. 피사체가 크게, 배경이 단순하게 나온 사진으로 해 보세요." (no download)
   v
bilinear upsample to work res -> blur-fusion x2 (r1 = 45*s, r2 = 4*s, s = workLongEdge/1600) in a worker
   v
preview (checkerboard / 흰색 / 파란색 / 원본 비교) -> download
   transparent -> PNG 누끼.png ; solid colour -> JPEG q0.92 누끼-흰배경.jpg (PNG option kept)
```

## C2.0 — export + runtime probe (local, owner PC, before any page code; log every result in BUILD-LOG)
Scripts live in the repo under `scripts/model/birefnet/` (`export.py`, `parity.py`, `tiny.py`, `requirements.lock`, `README.md`). Outputs are not committed except the final parts + manifest.
1. **Source:** `ZhengPeng7/BiRefNet_lite` at a **pinned HF revision commit SHA** (recorded in the manifest and on /licenses/). Licence MIT (model card `license: mit`; code LICENSE "Copyright (c) 2024 ZhengPeng").
2. **Env (start pin; the lock records what worked):** Python 3.10, `torch==2.1.2+cpu`, `torchvision==0.16.2`, `onnx`, `onnxruntime==1.20.x` CPU, `onnxconverter-common`, `deform_conv2d_onnx_exporter`, plus the timm / kornia / einops / transformers versions the remote code imports at that revision. Ladder if export fails: torch 2.0.1, then 2.4.1. The spike used torch 2.14 and failed with an exporter shape-inference error; do not retry it. Unverified: which pin works (report says "2.0~2.4 [추정]").
3. **Wrapper:** returns `sigmoid(net(x)[-1])`. Input `input_image` 1x3x512x512 fp32, output `output_image` 1x1x512x512. Opset 17 (16 if the exporter requires it). `dynamo=False`, constant folding on.
4. **Deform-conv workaround:** (a) `deform_conv2d_onnx_exporter.register_deform_conv2d_onnx_op()`. If (a) fails on every pin, (b) monkeypatch `torchvision.ops.deform_conv2d` with a pure-torch bilinear-sampling version (`F.grid_sample`, align_corners=False) before export, and first prove (b) equals torchvision in torch (max abs <= 1e-4). Log which path shipped.
5. **Graph fixes:** port spike `fix_wide_ops.py` (Split/Concat trees of <= 6) into `scripts/model/birefnet/`. Numerically identical; the parity step proves it.
6. **fp16:** `onnxconverter-common` float16 with `keep_io_types=True` (fp32 I/O), default op block list.
7. **Parts:** byte-split into parts <= 24 MiB (`model.part0..N`). Manifest `{exportId, hfRevision, torch, opset, deformPath, bytes, parts:[{name, bytes, sha256}], sha256Total}`.
8. **Parity (`parity.py`, exits 1 on any miss):** on the 16 GT + 50 real spike images. Ours fp32 (ORT CPU) vs torch reference: mean abs <= 1e-4, max <= 1e-3 per image. Ours fp16 vs ours fp32: mean <= 1e-4. GT metrics: MAE <= 0.0050, IoU >= 0.940 (spike 0.0048 / 0.942). Empty masks on the 50 real: <= 3. Versus the spike community 512 fp16 masks: mean <= 0.003 (diagnostic only; torch is the truth).
9. **Runtime probe** (spike `web/bench.html` pattern, served with the production `_headers` + the new COEP line): onnxruntime-web **1.30.x pinned exact**. (i) Native WebGPU EP (`ort.webgpu.min.mjs`) with the asyncify wasm passed as `env.wasm.wasmBinary` from 2 parts. (ii) Plain WASM build with and without `crossOriginIsolated`. Record times and Chrome private-memory peak. Browser vs Python mean diff <= 0.002 on both. JSEP (`ort.all` / `ort.min` webgpu) is banned (spike: 0.64 error).
- **Flag / escalation:** if (i) cannot take `wasmBinary`, C2 v1 is WASM-only and Arch re-plans. A CDN is not an option (CSP). Unverified now: `wasmBinary` support in the asyncify build.

## C2 Build order
1. `scripts/copy-vendor.mjs`: copy ORT 1.30.x to `public/vendor/onnxruntime-web/<ver>/`; split the 25.5 MiB asyncify wasm into 2 parts at build; ship only the native-WebGPU mjs + asyncify parts + the plain WASM build and its mjs. Model parts go in `public/vendor/birefnet-lite-512/<exportId>/`, committed to git (binary in `.gitattributes`; one version only, a new export deletes the old dir). Decision logged: git over a build-time HF download (no build-time network dependency; provenance = our commit).
2. `scripts/check-dist.mjs`: every file < 25 MiB (existing) plus explicit rows: each model part <= 24 MiB raw, model total <= 101 MB raw, each ORT wasm part <= 24 MiB, plain wasm <= 15 MiB, ORT mjs = measured + 10%, no `ort.all*` / JSEP files in dist, manifest SHA-256s match the files.
3. `scripts/gen-sw.mjs`: `/vendor/` is already never precached; add a unit test naming `birefnet-lite-512` and `onnxruntime-web`. The SW fetch handler passes `/vendor/birefnet-lite-512/*` and `/vendor/onnxruntime-web/*` straight to the network (the tool's own Cache Storage owns them; no double copy). The model is NOT precached. Precache stays <= 450 KB with the new page.
4. `scripts/gen-headers.mjs` -> `_headers`: `/remove-background/*` gets `Cross-Origin-Embedder-Policy: require-corp` (COOP is already `same-origin`), so WASM threads work. Every resource on that page is same-origin. e2e asserts `crossOriginIsolated === true` there and other pages unchanged. `/vendor/*` immutable caching already exists.
5. `src/lib/bgremove/`: `assets.ts` (manifest, consent, part fetch, SHA-256, Cache Storage `docttak-model-birefnet-<exportId>`, delete other `docttak-model-birefnet-*` caches, quota check, progress `{loaded,total}`; follow `src/lib/face/assets.ts`), `session.ts` (EP choice + fallback), `infer.ts` (pre/post), `fusion.ts` + `fusion.worker.ts` (blur-fusion with running-sum box filters; <= 1.5 s at 4 MP on the dev PC, else WebGL; log), `guard.ts` (pattern of `src/lib/face/guard.ts`: sessionStorage attempt marker set before session create, cleared after the first result; a stale marker on reload shows "이 기기에서는 메모리가 부족해 창이 닫혔을 수 있어요. 더 작은 사진으로 해 보세요." and halves the default work res).
6. Memory guards: input `checkDims` (desktop 150 MP / mobile 64 MP, as id-photo); work res cap 4096 / 2048 long edge (output = work res, stated in the FAQ); `navigator.deviceMemory < 4` adds a warning line to the consent panel (may proceed); the model buffer is released after session create; one session per page, reused; `session.release()` on pagehide.
7. Page `src/pages/remove-background/` + `src/tools/remove-background/` (controller, limits, reducer like id-photo `model.ts`). States: `empty -> consent -> downloading -> loading-engine -> working -> done | nosubject | error`.
8. Output: transparent PNG; background radio `투명 / 흰색 #FFFFFF / 파란색` (blue = the blue the id-photo code already uses if one exists under `src/lib/idphoto/`; else `#3D6FD6`, logged as a design choice). Solid-colour composite uses the blur-fusion foreground. Reuse id-photo encode helpers only where they fit as-is. No cross-page file hand-off (Known Gap); the done panel links `/id-photo/` with "저장한 사진을 열어 주세요".
9. **Owner-only before release:** iPhone (Safari, A15 or newer) and a mid-range Android (4-6 GB RAM, Chrome): first download, time per photo, tab not killed on a 12 MP photo, second visit uses the cache. Until then, build flag `PUBLIC_BG_REMOVE=0` (default): page, sitemap, nav, hub card, llms.txt entry and OG are all absent (postbuild test covers both states). Flip to 1 only after the owner OK is logged.
10. Licences: `licenses.manifest.json` + /licenses/: BiRefNet (MIT, copyright line, HF revision); onnxruntime-web (MIT; open the LICENSE file in the package, pass `check:licenses`); blur-fusion = our own implementation of Forte & Pitie, "Approximate Fast Foreground Colour Estimation" (ICIP 2021), no code copied. **Residual risk (BUILD-LOG, not user-facing):** the BiRefNet README lists training sets including P3M-10k, some research-only. The weights licence (MIT) is separate. Accepted by Arch 2026-10-02; revisit if the upstream licence changes or a takedown arrives.

## C2 Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| consent | user on mobile data | explicit 100 MB consent before any byte | clear choice |
| download | network drop mid-part | per-part retry x2, then error; finished parts stay cached (resume) | clear error + 다시 시도 |
| download | corrupt or partial part | SHA-256 mismatch -> delete, error | clear error |
| storage | quota too small, private mode | skip caching, still run | note "다음에 또 받아야 해요" |
| runtime | no WebGPU, adapter lost, kernel error | fall back to WASM once | slower progress text, result still correct |
| runtime | wasm parts fail to load | error | clear error |
| memory | tab killed on a phone | guard marker -> message on reload, smaller work res | clear message on next load |
| model | empty mask (< 1%) | `nosubject` state | clear message, no download |
| model | wrong subject (group, clutter) | not detectable | honest limit text above the picker (accepted) |
| fusion | worker OOM | fall back to plain mask with original colours | result shown; accepted degrade, logged |
| export | `toBlob` null | retry once at half size, then error | clear error |

## C2 Test map
| Branch / flow | Test |
|---|---|
| zero runtime/model requests before pick | e2e request log [GAP -> new] |
| consent, cancel, progress, resume, SHA mismatch, quota skip | unit `bgremove-assets.test.ts`, mocked fetch + CacheStorage [GAP -> new] |
| EP choice + WebGPU -> WASM fallback | unit with mocked `ort` [GAP -> new] |
| pre/post: resize, normalise, sigmoid range, area check, upsample | unit `bgremove-infer.test.ts` [GAP -> new] |
| blur-fusion vs spike `fg_blur` reference on 2 fixtures (mean diff <= 0.002) | unit [GAP -> new] |
| guard marker flow | unit, face-guard test pattern [GAP -> new] |
| page flow, 5 projects | e2e `remove-background.spec.ts`: Playwright `page.route` serves a KB-size stand-in ONNX (`tiny.py`, committed) + matching manifest; no test hooks in prod code [GAP -> new] |
| real model, chromium only, WASM, 1 fixture | e2e tag `@model`, crossOriginIsolated, IoU vs stored Python mask >= 0.99 [GAP -> new] |
| quality: GT synthetic (CC0/PD subset committed) + local 50 real | `regress:bgremove -- --fixtures-only` in CI; full set on owner PC; gates = C2.0 step 8 numbers [GAP -> new] |
| COEP only on this path; other headers unchanged | postbuild headers test [TESTED -> extend] |
| precache <= 450 KB, no vendor/model in precache, files < 25 MiB | check-dist + gen-sw unit [TESTED -> extend] |
| flag off -> no trace in dist | postbuild [GAP -> new] |
| a11y: radio groups, progress with aria-valuenow + text, live region (`announce.ts`), focus to result headline, before/after has a text alternative | axe in each state [GAP -> new] |

## C2 Lighthouse / LCP plan
The page must hit LCP <= 2,000 ms (median of 5, CI runner) like every tool. LCP element = H1/intro text (no hero image). Initial tool JS <= 30 KB. The controller imports `src/lib/bgremove/*` only after a pick. ORT and the model are never `<link rel=preload>`ed. Add `/remove-background/` to `lighthouserc.json` (flag-on build in CI): perf >= 0.95, CLS <= 0.01 (consent and progress panels reserve their height).

## C2 Deploy gate
1. C2.0 results logged (parity numbers, torch pin, deform path, probe times and memory).
2. CLOUD-HANDOFF §3 gates on both flag states, plus `regress:bgremove -- --fixtures-only`, the `@model` e2e, and the full regress on the owner PC.
3. Richard "clear" (he re-runs `parity.py` on the committed parts and checks SHA-256 and the licence rows).
4. Owner real-device OK logged (build order 9) -> set `PUBLIC_BG_REMOVE=1` in Cloudflare env + `.env.example` -> local commit -> push on go-ahead -> live smoke with the real model (Chrome WebGPU + WASM, Pixel/iPhone emulation, 0 off-site requests, cache hit on the second run) -> IndexNow, Naver 수집, Kakao cache, GSC.

## Out of scope (-> BUILD-LOG Known Gaps)
Text-to-도장 generator; perspective/straightening; batch (many photos); brush erase/restore (report §8-5; next step after C2 if usage justifies); 1024/768 고화질 mode (held: >= 6 GB GPU memory); guided filter; cross-page hand-off to /id-photo/; WebGL fusion unless the 1.5 s budget fails.

## Revenue notes (Phase 0)
- No ads on any tool UI, no beacon, no payment (G2 Phase-0 §1). A future ad slot lives only in the done panel after the download button, never in pick -> consent -> progress.
- Cost to us is about 0: static bandwidth on Pages is free; the 100 MB first-time C2 download costs only the user data, hence the consent panel.
- C2 is the likeliest future paid "more" (batch, 고화질). Paid never removes today's free single-photo flow. Demand is read from GSC queries (여러 장 / 한꺼번에 / 일괄), never from usage tracking.
