# rhwp 0.8.6: third-party notices for rhwp_bg.wasm

Extracted from https://github.com/edwardkim/rhwp/blob/v0.8.6/THIRD_PARTY_LICENSES.md (the full upstream file is kept
in this repository as licenses/third-party/rhwp/THIRD_PARTY_LICENSES.md). Only the parts that concern the shipped
WebAssembly engine are listed; the upstream repository and remarks columns are left out.

## Rust crates (direct dependencies of rhwp 0.8.6)

Left out: resvg, skia-safe and subsecond (optional native features) and wasm-bindgen-test (tests), which the
WebAssembly build does not contain.

| Crate | Version | License |
| --- | --- | --- |
| aes | 0.9.2 | MIT OR Apache-2.0 |
| base64 | 0.23.1 | MIT OR Apache-2.0 |
| blake3 | 1.8.6 | CC0-1.0 OR Apache-2.0 OR Apache-2.0 WITH LLVM-exception |
| byteorder | 1.5.0 | Unlicense OR MIT |
| cbc | 0.2.1 | MIT OR Apache-2.0 |
| cfb | 0.14.0 | MIT |
| cipher | 0.5.2 | MIT OR Apache-2.0 |
| codepage | 0.1.2 | Apache-2.0 OR MIT |
| console_error_panic_hook | 0.1.7 | Apache-2.0/MIT |
| crc32fast | 1.5.0 | MIT OR Apache-2.0 |
| des | 0.9.0 | MIT OR Apache-2.0 |
| ed25519-dalek | 2.2.0 | BSD-3-Clause |
| embedded-io | 0.7.1 | MIT OR Apache-2.0 |
| encoding_rs | 0.8.35 | (Apache-2.0 OR MIT) AND BSD-3-Clause |
| flate2 | 1.1.9 | MIT OR Apache-2.0 |
| getrandom | 0.4.3 | MIT OR Apache-2.0 |
| hmac | 0.13.0 | MIT OR Apache-2.0 |
| image | 0.25.10 | MIT OR Apache-2.0 |
| js-sys | 0.3.102 | MIT OR Apache-2.0 |
| paste | 1.0.15 | MIT OR Apache-2.0 |
| pbkdf2 | 0.13.0 | MIT OR Apache-2.0 |
| pcx | 0.2.5 | MIT OR Apache-2.0 OR WTFPL |
| pdf-writer | 0.12.1 | MIT OR Apache-2.0 |
| quick-xml | 0.41.0 | MIT |
| roxmltree | 0.21.1 | MIT OR Apache-2.0 |
| serde | 1.0.229 | MIT OR Apache-2.0 |
| serde_json | 1.0.151 | MIT OR Apache-2.0 |
| sha1 | 0.11.0 | MIT OR Apache-2.0 |
| sha2 | 0.11.0 | MIT OR Apache-2.0 |
| snafu | 0.9.2 | MIT OR Apache-2.0 |
| strum | 0.28.0 | MIT |
| subsetter | 0.2.6 | MIT OR Apache-2.0 |
| svg2pdf | 0.13.0 | MIT OR Apache-2.0 |
| svgtypes | 0.16.1 | Apache-2.0 OR MIT |
| ttf-parser | 0.25.1 | MIT OR Apache-2.0 |
| unicode-properties | 0.1.4 | MIT OR Apache-2.0 |
| unicode-segmentation | 1.13.3 | MIT OR Apache-2.0 |
| unicode-width | 0.2.2 | MIT OR Apache-2.0 |
| usvg | 0.45.1 | Apache-2.0 OR MIT |
| wasm-bindgen | 0.2.125 | MIT OR Apache-2.0 |
| web-sys | 0.3.102 | MIT OR Apache-2.0 |
| zip | 8.6.0 | MIT |

## All Rust dependencies

`cargo metadata --locked` lists 247 packages, 243 of them external crates. Their licenses are MIT, Apache-2.0
(including dual MIT / Apache-2.0), BSD-2-Clause, BSD-3-Clause, Zlib, Unlicense, 0BSD, ISC, Unicode-DFS-2016,
CC0-1.0 or Apache-2.0 WITH LLVM-exception (blake3), and WTFPL offered next to MIT / Apache-2.0 (pcx). Every crate
is under a permissive license or offers a permissive option. The Apache-2.0 text is in APACHE-2.0.txt.

## Ported algorithm: Volexity hwp-extract (BSD-3-Clause)

Source: https://github.com/volexity/hwp-extract, commit e5f8b5e1590dee973630666e687e919fa70da2e2
(src/hwp_extract/encrypt.py), ported in rhwp src/parser/crypto.rs.

Modified BSD License

_Copyright © `2024`, `Volexity, Inc`_

_All rights reserved._

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.
3. Neither the name of the `Volexity, Inc` nor the
   names of its contributors may be used to endorse or promote products
   derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS “AS IS” AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL `Volexity, Inc` BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## Specification references (Apache-2.0, no code copied)

- hancom-io/hwpx-owpml-model, Apache-2.0, (c) 2022 Hancom Inc.
- hancom-io/dvc, Apache-2.0, (c) 2022 Hancom Inc.
