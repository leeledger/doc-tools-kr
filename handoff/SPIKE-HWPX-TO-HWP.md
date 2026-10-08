# SPIKE — HWPX → HWP export with rhwp (TOOLS5 U4, report only)
Date: 2026-10-08 · Bob · Status: DONE_WITH_CONCERNS (the owner's 한글 check is still open; nothing ships)

## Verdict
**Technically feasible; ship decision waits on the owner's 한컴오피스 한글 check (O4).** On all 4 HWPX samples in
the repo, rhwp 0.8.6 `exportHwpWithReport()` produced a valid HWP 5.0 CFB file in Node and in Chromium (desktop and
phone emulation), byte-identical across both runtimes. rhwp's own verify, its content-loss report, a reload with rhwp
and an rhwp-independent record walk (Python + olefile) all agree: 0 losses, same page count, 100 % text recall,
same table / picture / equation / header / footer counts. Export is fast (2–56 ms after open; whole flow < 1 s for
128 pages) and light (wasm heap ≤ 14 MiB). What no automated check here can prove is that **한글 opens the files
without a repair dialog and with the same formatting** — that is the gating risk.

Recommendation: if the owner's check on the 3 files is "열림" with no repair dialog → build `/hwpx-to-hwp/`
(estimate below). If any file shows "복구" or broken layout → do not build; report upstream to rhwp with the file.

## Inputs
- tests/corpus/hwp/adm02, adm14, adm19, adm28 (law.go.kr 행정규칙 첨부, sources in tests/corpus/hwp/SOURCES.md).
- **5 extra public HWPX: not run.** Downloading them was blocked by the session's permission policy. Candidates found
  via the law.go.kr DRF API (현행, 2025+), for a later run (`node scripts/spike/hwpx-to-hwp.mjs <files>`):
  - https://www.law.go.kr/flDownload.do?flSeq=168918269 (요양급여비용 심사청구서·명세서서식 및 작성요령)
  - https://www.law.go.kr/flDownload.do?flSeq=166663079 (국립과학수사연구원 감정서 서식 규정)
  - https://www.law.go.kr/flDownload.do?flSeq=163656921 (사회보장급여 관련 공통서식에 관한 고시)
  - https://www.law.go.kr/flDownload.do?flSeq=149775781 (고위공직자범죄수사처 사건사무의 서식에 관한 지침)
  - https://www.law.go.kr/flDownload.do?flSeq=167536133 (자료보호요청서의 작성방법 … 규정)

Sample features (counted from the HWPX section XML):

| key | pages (rhwp / official) | sections | tables | pictures | equations | header/footer | other |
|---|---|---|---|---|---|---|---|
| adm02 | 9 / 8 | 1 | 19 | 0 | 0 | 0 / 0 | |
| adm14 | 11 / 5 (2-up) | 1 | 8 | 0 | 0 | 1 / 1 | 3 rect, page number |
| adm19 | 29 / 29 | 2 | 29 | 5 (+1 master page) | 214 | 1 / 1 | 3 fields, 11 column defs, 7 BinData incl. EMF/BMP |
| adm28 | 128 / 128 | 2 | 68 | 20 | 1 | 0 / 10 | 10 rect (text boxes), 10 auto numbers |

## Results (verbatim, Node 1 run; scripts/spike/hwpx-to-hwp.mjs)
```
adm02 verify {"bytesLen":31232,"pageCountBefore":9,"pageCountAfter":9,"recovered":true}  contentLoss {"schemaVersion":1,"outputFormat":"hwp","count":0,"losses":[]}
adm14 verify {"bytesLen":50176,"pageCountBefore":11,"pageCountAfter":11,"recovered":true} contentLoss {...,"count":0,"losses":[]}
adm19 verify {"bytesLen":342016,"pageCountBefore":29,"pageCountAfter":29,"recovered":true} contentLoss {...,"count":0,"losses":[]}
adm28 verify {"bytesLen":134656,"pageCountBefore":128,"pageCountAfter":128,"recovered":true} contentLoss {...,"count":0,"losses":[]}
FileHeader (all 4): sig "HWP Document File" ver 5.1.0.0 flags 1 (compressed)
```

| key | in bytes | out bytes | out/in | pages in→out | SVG text recall out vs in (all pages / p1 / last) | pages with identical text | recall vs official PDF text (in / out) |
|---|---|---|---|---|---|---|---|
| adm02 | 51,790 | 31,232 | 0.60 | 9→9 | 1 / 1 / 1 | 9/9 | 1 / 1 |
| adm14 | 62,148 | 50,176 | 0.81 | 11→11 | 1 / 1 / 1 | 11/11 | 1 / 1 |
| adm19 | 588,332 | 342,016 | 0.58 | 29→29 | 1 / 1 / 1 | 29/29 | 1 / 1 |
| adm28 | 238,366 | 134,656 | 0.56 | 128→128 | 1 / 1 / 1 | 128/128 | 0.9999 / 0.9999 |

rhwp-independent check (scripts/spike/hwp-records.py: walks every DocInfo/BodyText record from the CFB, extracts
PARA_TEXT, compares with the HWPX `<hp:t>` text; object counts [HWPX, HWP]):
```
adm02 structureProblems [] srcChars 3835  hwpChars 3835  recall 1.0 precision 1.0 tables [19,19]
adm14 structureProblems [] srcChars 1862  hwpChars 1862  recall 1.0 precision 1.0 tables [8,8] headers [1,1] footers [1,1]
adm19 structureProblems [] srcChars 16372 hwpChars 16372 recall 1.0 precision 1.0 tables [29,29] pictures [5,6]* equations [214,214] headers [1,1] footers [1,1]
adm28 structureProblems [] srcChars 52390 hwpChars 52390 recall 1.0 precision 1.0 tables [68,68] pictures [20,20] equations [1,1] footers [10,10]
* the 6th picture is the master-page image (Contents/masterpage0.xml), which the section-XML count does not include.
```

Time and memory:

| key | Node: open / verify / export / reload+render (ms) | Node RSS peak* | Chromium desktop: total (ms) | phone emulation total (ms) | wasm heap |
|---|---|---|---|---|---|
| adm02 | 142 / 134 / 8 / 215 | 153 MB | 469 | 506 | 5 MiB |
| adm14 | 17 / 38 / 2 / 67 | 164 MB | 390 | 429 | 4 MiB |
| adm19 | 72 / 194 / 46 / 379 | 335 MB | 674 | 715 | 14 MiB |
| adm28 | 124 / 195 / 17 / 764 | 188 MB | 808 | 835 | 13 MiB |

\* Node RSS includes rendering every page to SVG twice for the text comparison; a tool would not render.
Chromium total = worker start + wasm compile (~155 ms) + open + verify + export + reload. Phone emulation = Pixel 7
viewport + 4× CPU throttle, but the CDP throttle did not reach the dedicated worker (numbers ≈ desktop), so a real
mid-range phone is an estimate: ×3–5 → ≤ 4 s for 128 pages. All far inside hwp limits (mobile capWasmBytes 256 MiB).
Node and browser outputs are **byte-identical** (SHA-256 match on all 4) — the export is deterministic.

## Failure modes (verbatim; scripts/spike/hwpx-to-hwp-failures.mjs)
```
truncatedHalf: FAIL at open: 유효하지 않은 파일: 지원하지 않는 포맷입니다: 알 수 없는 파일 형식. 오류코드: UNSUPPORTED_FILE_FORMAT. …
missingSection0: FAIL at open: 유효하지 않은 파일: HWPX 오류: 필수 파일 누락: Contents/section0.xml: specified file not found in archive
randomBytes: FAIL at open: … UNSUPPORTED_FILE_FORMAT …
hwpSource_law05: ok pagesIn=1 pagesOut=1 bytes=14336 verify={…"recovered":true} loss={…"count":0,…}
empty: ok pagesIn=1 pagesOut=1 bytes=3584 verify={…"recovered":true} loss={…"count":0,…}
```
Every bad input failed at open with a classified message (the existing classifyParseError path covers it); nothing
failed inside export. An HWP input round-trips (adapter no-op), so a tool must reject or redirect .hwp input itself.

## Bundle, licence
- **Wasm: +0 bytes.** Same vendored `/vendor/rhwp/0.8.6/rhwp_bg.wasm` (9,936,164 B, already precached by the HWP
  tools' SW cache). New JS would be a page controller (~5–8 KB, like the hwp-to-pdf controller) and a new worker
  message (`export-hwp`) in src/lib/hwp/hwp.worker.ts. No font loading needed (no rendering).
- **Licence: MIT confirmed** (node_modules/@rhwp/core/LICENSE: "MIT License, Copyright (c) 2025-2026 Edward Kim"),
  already listed by gen-licenses. A page that writes HWP must also carry the Hancom open-spec notice ("본 제품은 한컴의
  HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다"), which the HWP tools already show.

## Risks
1. **한글 acceptance (gating).** Not automatable. Output contains a non-Hancom stream `RhwpHwpxOrigin` (1 byte) and
   writes ver 5.1.0.0; 한글 normally ignores unknown streams, unverified. A repair dialog on ordinary forms = no build.
2. **Formatting fidelity unmeasured.** The checks cover text, object counts, record structure and rhwp's own layout;
   not char/para shape attributes, table borders, object positions, field behaviour — only the owner check sees those.
3. **Self-consistency is partly circular.** verify / reload / SVG text use rhwp to read rhwp's output; the Python walk
   is independent but shallow. The content-loss report was 0 on every file, so its sensitivity is untested.
4. **Small sample.** 4 HWPX, all from one source type (law.go.kr 행정규칙). Untested: password HWPX, charts, OLE,
   video, form controls (checkbox/누름틀 forms), track changes, memo. The 5 public files above should be run first.
5. **Preview text.** `PrvText` holds mostly `<>` cell markers (e.g. adm19), so Explorer / 한글 file preview text
   would be near-empty. Cosmetic.
6. **rhwp page count ≠ Hancom page count** (adm02 +1, adm14 11 vs 10 on paper). Irrelevant to the HWP bytes
   (한글 re-lays out), but `pageCountBefore/After` cannot be shown to users as "한글 쪽 수".

## Effort for a real `/hwpx-to-hwp/` tool (if O4 = go)
S–M, **2–3 days**: worker message `export-hwp` (exportHwpWithReport + verify gate: refuse download if
`recovered` false or loss count > 0, with a plain-language message) + unit test with the fake rhwp; page + controller
reusing hwp-shared (boot, lazy, session, download, watchdog, messages, limits; no viewer/fonts needed); .hwp input
redirect to the viewer; tools.ts entry, copy, OG, FAQ, Hancom notice; e2e on the 4 fixtures (byte-hash stable,
reload page count) on three engines; regression line in regress:hwp. Arch's S-M pre-estimate holds.

## Spike files (not shipped, not imported by src/)
- scripts/spike/hwpx-to-hwp.mjs — Node export + verify + report + reload + text recall + olefile header check.
- scripts/spike/hwpx-to-hwp-browser.mjs — Playwright Chromium (desktop + phone emulation), module Worker, SHA vs Node.
- scripts/spike/hwpx-to-hwp-failures.mjs — failure-mode probes.
- scripts/spike/hwp-records.py — rhwp-independent record walk, text and object counts.
- Owner files: scratchpad `hwpx-spike/` (1_adm14, 2_adm19, 3_adm28: `_변환.hwp` + `_원본.hwpx`, README.txt).

## Owner 한글 results (to fill in)
| file | 한글 | 한컴독스 | note |
|---|---|---|---|
| 1_adm14_공적심사규정_변환.hwp | | | |
| 2_adm19_내진설계일반_변환.hwp | | | |
| 3_adm28_소하천설계기준_변환.hwp | | | |
