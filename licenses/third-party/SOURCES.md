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
