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

## Dev-only tools (never shipped)

| Tool | Licence | Use |
|---|---|---|
| Pillow 12.2.0 (Python) | HPND (MIT-CMU) | `tests/fixtures/build-cmyk.py` writes the CMYK JPEG test fixture. Not an npm dependency and not in `dist/`. |
