# Third-party license texts — sources

These packages ship code whose license text is not in the npm package. The texts are committed here
and embedded into `/licenses/` by `scripts/gen-licenses.mjs` (`localFiles` in `licenses.manifest.json`).

`@neslinesli93/qpdf-wasm@0.3.0` is built by its repository's `Dockerfile` at tag `0.3.0`
(https://github.com/neslinesli93/qpdf-wasm/blob/0.3.0/Dockerfile), which pins these commits:

| File | Source |
|---|---|
| `qpdf-12.2.0/LICENSE.txt` | https://raw.githubusercontent.com/qpdf/qpdf/856d32c610334855d30e96d25eb5f9636fb62f08/LICENSE.txt (commit of tag `v12.2.0`) |
| `qpdf-12.2.0/NOTICE.md` | https://raw.githubusercontent.com/qpdf/qpdf/856d32c610334855d30e96d25eb5f9636fb62f08/NOTICE.md |
| `libjpeg-turbo/LICENSE.md` | https://raw.githubusercontent.com/ImageMagick/jpeg-turbo/7aa2a898c564041a24b09d0a6e780aaa632d08d3/LICENSE.md (the libjpeg-turbo fork pinned by the qpdf-wasm build) |
| `libjpeg-turbo/README.ijg` | https://raw.githubusercontent.com/ImageMagick/jpeg-turbo/7aa2a898c564041a24b09d0a6e780aaa632d08d3/README.ijg (holds the IJG license that LICENSE.md refers to) |
| `zlib/LICENSE` | Lines 1–23 of https://raw.githubusercontent.com/madler/zlib/21767c654d31d2dccdde4330529775c6c5fd5389/zlib.h (zlib 1.2.12; this commit has no separate LICENSE file, the notice lives in `zlib.h` and `README`) |
| `qpdf-wasm/LICENSE` | The wrapper repository has no LICENSE file; its `package.json` declares `"license": "ISC"` and has no `author`. Standard ISC text (https://opensource.org/license/isc-license-txt). The copyright line "Copyright (c) 2022 neslinesli93" is taken from the repository owner handle (neslinesli93) and the repository creation year (created 2022-12-21), because there is no licence file to copy it from (Arch decision, 2026-09-29). |

## HWP PDF 변환 (Step 5)

| File | Source |
|---|---|
| `rhwp/THIRD_PARTY_LICENSES.md` | https://raw.githubusercontent.com/edwardkim/rhwp/v0.8.6/THIRD_PARTY_LICENSES.md (tag `v0.8.6`, the release of `@rhwp/core@0.8.6`; downloaded 2026-09-30, verbatim). The Rust crates compiled into `rhwp_bg.wasm` are MIT, Apache-2.0, BSD-3-Clause, Zlib, ISC or Unicode-DFS (dual-licensed crates offer MIT or Apache-2.0). |
| `rhwp/CRATES.md` | The parts of `rhwp/THIRD_PARTY_LICENSES.md` that concern the shipped wasm (crate, version and licence columns of the crate table without the optional native and test-only crates, the dependency licence summary in English, the Volexity BSD-3-Clause notice verbatim, the Hancom spec references). This is the file `/licenses/` embeds. |
| `rhwp/APACHE-2.0.txt` | https://www.apache.org/licenses/LICENSE-2.0.txt (the Apache-2.0 text the crate notices refer to) |
| `noto-sans-cjk/LICENSE` | https://github.com/notofonts/noto-cjk/raw/main/Sans/LICENSE (SIL OFL 1.1; declares no Reserved Font Name) |

`scripts/fonts/anolim-hwp-fallback.woff2` ("Anolim HWP Fallback", 1.9 KiB) is a subset of Noto Sans CJK KR Regular 2.004,
https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf (SHA-256
6bcb2a0703aa137e874fc2dffa85f6c21ba9a67fa329e81b8c801663af7e992a, downloaded 2026-09-30), cut by
`scripts/gen-hwp-fallback.mjs` to U+119E, U+2027, U+318D and U+329E with GSUB kept. Its name table is unchanged
(no name record carries a Reserved Font Name); the family is renamed in CSS only.

Dev-only (never shipped): Noto Sans Symbols 2 2.008 (OFL) was probed as a fallback candidate and covers none of the four code points.

## HWP PDF 내려받기 (HWP direct)

| File | Source |
|---|---|
| `noto-fonts/OFL.txt` | The SIL OFL 1.1 text of `noto-sans-cjk/LICENSE`, headed by the copyright lines of the three Noto fonts below as their name tables state them (name ID 0). Their licence URL (name ID 14) is https://scripts.sil.org/OFL; none declares a Reserved Font Name. |
| `dfa/LICENSE` | `dfa@1.2.0` (a dependency of `@cantoo/fontkit`) ships no licence file; its `package.json` declares `"license": "MIT"` and `"author": "Devon Govett <devongovett@gmail.com>"`. Standard MIT text (as in `restructure`, same author). |

The extended "Anolim HWP Fallback" faces (`scripts/fonts/fb-*.woff2|woff`, `scripts/gen-hwp-fallback.mjs`) are subsets of
(downloaded 2026-09-30; SHA-256 of the source):

| Source | SHA-256 | Faces |
|---|---|---|
| Noto Sans CJK KR Regular 2.004, https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf | 6bcb2a0703aa137e874fc2dffa85f6c21ba9a67fa329e81b8c801663af7e992a | fb-cjk-1..3 (punctuation, arrows, math, technical, enclosed, box drawing, geometric, misc symbols, dingbats, CJK symbols, enclosed CJK, half/full-width) |
| Noto Sans Math Regular 3.000, https://notofonts.github.io | d51afd5739c7ba6c44fcab35a88160e25dfb69a2d4ad0bd99533f8d894af1f96 | fb-math-1..2 |
| Noto Sans Symbols 2 Regular 2.008, https://notofonts.github.io | c4a0a80f0041ce4be81e2478faad22776d23edb98ae3f0d19bd37044820ecf9d | fb-sym2 |
| Noto Sans Regular 2.015, https://notofonts.github.io | 478c558ea716033cd60c03438f628dfa75694dcf6b5f6d505a2f05fd2b4f3823 | fb-sans |

Name tables are unchanged; the family is renamed in CSS and in the PDF face list only. The PDF embeds a subset of
these faces (only the glyphs the document uses), which OFL 1.1 permits.

## Dev-only tools (never shipped)

| Tool | Licence | Use |
|---|---|---|
| Pillow 12.2.0 (Python) | HPND (MIT-CMU) | `tests/fixtures/build-cmyk.py` writes the CMYK JPEG test fixture. Not an npm dependency and not in `dist/`. |

## @mediapipe/tasks-vision 1.0.1 (brief Step 4)

The npm package ships no license file and its version has no upstream tag (tags stop at v1.0.0; the wasm names
an internal release branch). The pinned reference is google-ai-edge/mediapipe master
**bdddcbd09ea1588825d35fe7b715d1a14789a85a** (2026-07-31T02:23Z, the last commit before the 1.0.1 publish at
21:03Z). Component list: that commit's WORKSPACE plus a string probe of both shipped wasm files (BUILD-LOG
Step 4, 0.2). Retrieved 2026-09-30.

| File | Source |
|---|---|
| `mediapipe/LICENSE` | https://raw.githubusercontent.com/google-ai-edge/mediapipe/bdddcbd09ea1588825d35fe7b715d1a14789a85a/LICENSE (Apache-2.0; also the text for TFLite, OpenCV 4.x, abseil, ruy, gemmlowp, FlatBuffers, TCMalloc, ML Drift and the model) |
| `eigen/COPYING.MPL2`, `COPYING.BSD`, `COPYING.README` | https://gitlab.com/libeigen/eigen/-/archive/dcbaf2d608f306450f1e74949eb87e9a22a7ef4b/ (TF/XLA `eigen_archive`, SHA-256 a71517b3…, matches the pin); MediaPipe's own `eigen` repo is ea13a98decd497a8c5588fb5de71b57bcf10d864 (SHA-256 35c6126e…, same license files) |
| `xnnpack/LICENSE` | https://raw.githubusercontent.com/google/XNNPACK/53a1797ba4360cbde068f2a984652be0f0b7b6fe/LICENSE |
| `protobuf/LICENSE` | https://raw.githubusercontent.com/protocolbuffers/protobuf/v31.1/LICENSE |
| `pthreadpool/LICENSE` | https://raw.githubusercontent.com/google/pthreadpool/02460584c6092e527c8b89f7df4de143d70e801f/LICENSE |
| `fp16/LICENSE`, `fxdiv/LICENSE` | https://raw.githubusercontent.com/Maratyszcza/FP16/master/LICENSE, https://raw.githubusercontent.com/Maratyszcza/FXdiv/master/LICENSE (XNNPACK build dependencies, listed conservatively) |
| `fft2d/LICENSE` | https://raw.githubusercontent.com/tensorflow/tensorflow/a481b10260dfdf833a1b16007eead49c1d7febf3/third_party/fft2d/LICENSE (OouraFFT v1.0; Flag for Arch: not an allowlisted license) |
| `emscripten/LICENSE`, `llvm-libcxx/LICENSE.TXT`, `musl/COPYRIGHT` | https://raw.githubusercontent.com/emscripten-core/emscripten/4.0.0/ (`LICENSE`, `system/lib/libcxx/LICENSE.TXT`, `system/lib/libc/musl/COPYRIGHT`); the wasm names only "emscripten/stable", so 4.0.0 stands for the release line |

Model cards (Apache-2.0): Face Mesh V2, Blendshape V2, BlazeFace (Short Range) under
https://storage.googleapis.com/mediapipe-assets/ (linked from /licenses/).
