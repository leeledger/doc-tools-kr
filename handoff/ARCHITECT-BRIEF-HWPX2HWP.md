# Architect Brief — Step HWPX2HWP: /hwpx-to-hwp/ 「HWPX HWP 변환」
Date 2026-10-10 · Arch · Starts only after the CI fix in this worktree is committed (do not mix diffs).
Evidence: handoff/SPIKE-HWPX-TO-HWP.md, scripts/spike/. Owner O4 (2026-10-10): 3 spike outputs "셋 다 잘 열림" in 한컴오피스 한글 → build.
Bob copies "Log notes" (end) into BUILD-LOG when H0 starts.

## Goal
A user picks an .hwpx file and downloads an .hwp made in the page (rhwp 0.8.6, no upload, +0 wasm bytes), only after
the exact bytes re-open with the same page count; engine loss reports are shown, never hidden.

## Locked decisions
1. **Slug / name / SEO.** slug `hwpx-to-hwp`; name = h1 `HWPX HWP 변환`; title draft
   `HWPX HWP 변환 — 한글 없이 hwp로 바꾸기, 무료 | 문서딱` (38 chars; TITLE_MAX 40 incl. suffix); description 40–80
   chars (DESC_MIN/DESC_MAX in src/data/site.ts), draft 「hwpx 파일을 한글 프로그램 없이 hwp로 바꿔요. hwp 파일만 받는 곳에
   낼 때 쓰세요. 가입 없이 무료.」 Bob may tune wording; tests enforce lengths. Keywords: hwpx hwp 변환 (Naver ~1.5만/월),
   hwpx를 hwp로, hwpx 파일 hwp 변환, 한글 hwpx hwp. "밖으로 보내지 않습니다" only beside the picker / FAQ / privacy.
   Never 한컴뷰어/한컴오피스 in name/title; TRADEMARK_NOTICE + HANCOM_NOTICE on the page (existing dist test extended).
   No claims about which 한글 versions open HWPX unless a fetched quote backs it (check:quotes).
2. **One direction only.** HWP→HWPX (rhwp exportHwpxWithReport exists) is OUT: it needs its own owner 한글 check and a
   second page; logged as Known Gap.
3. **No preview, no fonts, no render.** pick → convert → result card. The viewer/fonts/export chunk are not loaded.
   Reuse hwp-shared boot (picker before controller, engine prefetch on press), sniff, limits, messages, watchdog,
   download helper; new light controller. Do NOT route through `startHwpSession` (614 lines, viewer-bound).
4. **Worker:** add one message to the existing `src/lib/hwp/hwp.worker.ts` (same wasm init, same scan):
   `{type:'export-hwp'}` after `open`, answering `{type:'hwp', bytes (transferred), losses, pagesIn}` or
   `{type:'error', code}`. Logic lives in pure `src/lib/hwp/export-hwp.ts` (fake-rhwp + real-rhwp unit tests).
   Sequence in the worker (memory-lean for phones): `exportHwpWithReport()` → `contentLoss()` parsed → `takeBytes()` →
   `export.free()` → `pagesIn = doc.pageCount()` → `doc.free()` → **reload gate** `new HwpDocument(bytes)`:
   pageCount === pagesIn and > 0 and bytes start with CFB magic D0CF11E0A1B11AE1 → free → post bytes. Gate fail →
   code `unverified`. We gate on the shipped bytes, not `exportHwpVerify()` (that serializes a second time; dropped
   as redundant; Bob logs the timing of both on the 4 fixtures so the choice is on record).
5. **Inputs.** Sniff on the main thread before the worker: `cfb` (HWP 5) or `hwp3` → no conversion, message
   「이미 HWP 파일이에요.」 + links /hwp-viewer/ and /hwp-to-pdf/ (usage fail c=already-hwp p=parse); `zip` → worker;
   else existing `not-hwp` / `unsupported`. HWPML (.hml) = existing unsupported copy.
6. **Password / 배포용 HWPX.** Reject, do not decrypt (rhwp has `openWithPassword`; out of scope, same policy as the
   other HWP tools). In `features.ts` hwpx(): if `META-INF/manifest.xml` declares encryption (Bob probes the marker on
   a file made by rhwp `exportHwpxWithPassword`, see Unverified) → `HwpError('password')`. This also improves
   /hwp-viewer/ and /hwp-to-pdf/ (they now say 비밀번호 instead of 손상): intended; regression tests for both.
   A 배포용 HWPX we cannot detect falls to rhwp open failure → `classifyParseError` → corrupt copy (Known Gap).
7. **RhwpHwpxOrigin stream: KEEP.** Facts: rhwp.d.ts has no option for it; the string exists only inside the wasm
   (grep: rhwp_bg.wasm 1, rhwp.js 0); our `src/lib/hwp/cfb.ts` is a reader, so stripping means writing our own CFB
   writer (new failure surface) for a 1-byte stream that 한글 already accepted 3/3. A unit test pins its presence so an
   engine upgrade that changes it is noticed. Known Gap + optional upstream issue.
8. **PrvText near-empty: accept** (cosmetic, Explorer preview only). Known Gap.
9. **Loss report honesty.** losses.length > 0 → still allow download, but the result shows above the button:
   「HWP로 옮기지 못한 내용이 N곳 있어요. 한글에서 꼭 확인한 뒤 내세요.」 + a list of plain labels per loss kind
   (Bob maps the kinds rhwp documents; unknown kind → 「기타」; never raw English). losses == 0 → normal result.
   Malformed loss JSON → treat as unknown (1 「기타」 line), never crash, never silent.
10. **Limits (consistent with HWP tools, read from `src/lib/hwp/limits.ts`):** only `hardBytes` (phone 25 MB, PC
    150 MB) before parse → existing `tooLargeMessage`. No page/image caps (no rendering). RangeError / wasm OOM → `oom`
    copy; watchdog 90 s (`createWatchdog`) → `timeout`. One file at a time; a new pick terminates the worker.
    FAQ numbers come from LIMITS (pattern of HWP_FAQ in tools.ts).
11. **Output name / type.** `{base}.hwp` where base strips a trailing `.hwpx` (case-insensitive); other names → append
    `.hwp`. Blob type `application/x-hwp`; `<a download>` via `triggerDownload` (generalise `pdfName` → `withExt(name, ext)`
    in download.ts, refactor commit H0, no behaviour change). User clicks 「HWP 내려받기」 (no auto-download).
12. **Expectation copy** (page 알아 두면 좋아요 + result): 「줄바꿈이나 표 모양이 조금 다를 수 있어요. 내기 전에 한글에서
    한 번 열어 확인하세요.」 No page count shown as 한글 쪽 수 (rhwp pagination differs from Hancom).
13. **Integration.** RelatedTools: hwpx-to-hwp → [hwp-viewer, hwp-to-pdf]; /hwp-viewer/ and /hwp-to-pdf/ each gain
    hwpx-to-hwp. Viewer 「HWP로 저장」 button: **NO this step** (shared session risk) → Known Gap, revisit with usage
    data. Guide `what-is-hwpx`: `tools` += hwpx-to-hwp, one sentence + link 「HWP 파일로 내야 하면 HWPX HWP 변환에서
    바꿀 수 있어요.」, `updated`. NEXT_GUIDES[hwpx-to-hwp] = [what-is-hwpx, open-hwp-without-hangul, hwp-on-phone].
14. **HOME_DESC_ORDER:** insert `hwpx-to-hwp` right after `hwp-to-pdf` (before `hwp-viewer`; 1.5만 > 3,560). Home
    cards/menu follow today's rule; pinned-order test updated.
15. **Usage** (scripts/lib/usage.mjs single source): TOOLS += hwpx-to-hwp; TOOL_LABELS 「HWPX HWP 변환」; UsageTool
    union; no SETTINGS. Events pick / start (export begins) / success (gate passed) / download / fail. Fail codes:
    not-hwp, already-hwp, unsupported, password, distribution, corrupt, too-large, oom, timeout, engine, unverified,
    export. Never file names, sizes, page counts, loss kinds.
16. **SW / perf:** NOT_PRECACHED (scripts/gen-sw.mjs) + RUNTIME_PAGES (src/sw/sw.ts) += /hwpx-to-hwp/, tests updated;
    precache 450 KB never raised (log KB). Initial JS < 30 KB; rhwp glue / worker not in initial JS (check-dist
    assertion like pdf-sign); lazy controller budget = measured gzip + 20 %. LCP ≤ 2,000 ms (lighthouserc URL added).
    CSP 'self' unchanged (same /vendor/rhwp wasm, same-origin worker).
17. **UI font:** page copy is core, controller copy late. Headroom ~1.5 KB → reuse syllables already in core; Bob lists
    new core characters + remaining margin in BUILD-LOG. Breach → rephrase; never raise the tripwire / add preload /
    weight 700. Cannot fit → stop, escalate with the character list.
18. **Registration** (TOOLS4 decision 9 list): tools.ts (+FAQ 5–6: 한글 없이 되나요 / 모양이 똑같나요 / 휴대폰에서도 /
    문서가 어디로 / 비밀번호·배포용 문서는 / 저장 위치), page, og.json, gen-brand OG og-hwpx-to-hwp, JSON-LD, sitemap +
    llms.txt via generators, tool-facts, lighthouserc, qa:visual, site/polish/growth e2e lists, postbuild OG list,
    bgcloud LOCAL_SCOPE_RE, admin label, CLAUDE.md line 3, COPY.md if a new term, `updated`.

## Flow
```
/hwpx-to-hwp/  (boot.ts: picker live before controller; press → prefetch wasm)
pick ─► size > hardBytes? ──yes──► too-large (fail too-large)
   │no
   ▼ sniff 1 KB
 cfb/hwp3 ─► 「이미 HWP 파일이에요」 + links (fail already-hwp)
 other ────► not-hwp / unsupported
 zip ──► worker.open: scanFeatures (mimetype; manifest encryption → password) ─► engine (wasm) ─► HwpDocument
            │ open error → classifyParseError → corrupt | distribution | oom
            ▼ export-hwp
         exportHwpWithReport → losses, bytes → free src → reload(bytes) → pages equal, > 0, CFB magic?
            │no → unverified       │throw → export, RangeError → oom       watchdog 90 s → timeout
            ▼ yes
 result: name.hwp, size, [losses > 0 → warning + list], expectation note, 「HWP 내려받기」, 「다른 파일 바꾸기」
```
States: empty → checking → engine → converting → done | error; any → empty on 다른 파일 (worker terminated, run token bumped).

## Build Order
- **H0 (refactor only, own commit):** download.ts `withExt` (pdfName calls it); `bootHwpTool` tool union +=
  hwpx-to-hwp. All budgets within 1 %.
- **H1:** `src/lib/hwp/export-hwp.ts` (pure, injectable ctor) + worker message + `HwpErrorCode` += unverified, export,
  already-hwp (ERRORS copy for each, plain Korean). features.ts manifest-encryption check.
- **H2:** `src/tools/hwpx-to-hwp/{controller,copy}.ts`, `src/pages/hwpx-to-hwp/index.astro` (mirror /hwp-to-pdf/: hero,
  picker accept .hwpx, 3-step 사용 방법, 알아 두면 좋아요, FAQ, notices, Share, AdSlots, RelatedTools).
- **H3:** registration list (decision 18), guide edit, related links on the two HWP pages, usage, SW lists.
- Flag: do not touch session.ts / viewer. Do not add a second worker. Do not strip or rewrite CFB streams.
- Optional H1 probe: run `node scripts/spike/hwpx-to-hwp.mjs` on the 5 public law.go.kr HWPX in the spike report if
  downloads are permitted; log results verbatim. Not a gate.

## Unverified claims (probe, log verbatim, then build)
- Encrypted-HWPX marker: make one with `exportHwpxWithPassword` in Node; log manifest.xml lines and what scanFeatures /
  `new HwpDocument` do today. No reliable marker → keep the corrupt path, log Known Gap (do not guess).
- Loss item schema (`contentLoss()` → losses[]): from rhwp.d.ts / package docs; quote the doc line. No doc → render
  count + 「기타」 only.
- `application/x-hwp` download works on WebKit e2e (download event, bytes equal); else `application/octet-stream`.
- Reload-gate timing on adm28 in Chromium (expect whole flow < 1 s desktop).

## Failure modes
| path | realistic failure | handling | user sees |
|---|---|---|---|
| pick | user picks .hwp | sniff → already-hwp | clear message + links |
| scan | password HWPX | manifest check → password | clear (ERRORS.password) |
| open | 배포용 / odd HWPX rhwp can't parse | classifyParseError | clear (corrupt / distribution) |
| engine | wasm 404 / offline / new deploy | withEngineRetry → engine panel | clear retry panel |
| export | rhwp throws mid-export | catch → export | clear 「바꾸지 못했어요」 + viewer/PDF links |
| export | phone OOM on a big file | RangeError → oom | clear |
| export | hangs | watchdog 90 s → terminate → timeout | clear |
| gate | output reopens with other page count / not CFB | unverified, no download | clear; no bad file handed out |
| gate | losses > 0 | download allowed + warning list | clear warning (not silent) |
| report | malformed loss JSON | one 「기타」 line | clear warning |
| download | WebKit blob download quirk | e2e WebKit + type fallback | button works |
| new pick mid-run | stale worker message | terminate worker + run token | no stale result |
No silent path left.

## Test map ([GAP] = new test required)
Unit (vitest):
- export-hwp with **real rhwp in Node** on adm02/14/19/28 [GAP]: losses 0; CFB magic; FileHeader "HWP Document File";
  reload pages == source; reload text == source (glyphText per page); SHA-256 stable across 2 runs; RhwpHwpxOrigin
  stream present (pin, via cfb.ts reader).
- export-hwp with fake rhwp [GAP]: reload page mismatch → unverified; reload throws → unverified; zero bytes →
  unverified; export throws → export; RangeError → oom; losses > 0 passed through; malformed loss JSON → unknown.
- features: encrypted HWPX → password [GAP]; 4 fixtures still scan as before [TESTED features.expected.json].
- download `withExt` (.hwpx, .HWPX, no ext, dotted names) [GAP]; pdfName unchanged [TESTED].
- tools.ts: title ≤ 40, description 40–80, FAQ numbers from LIMITS, HOME_DESC_ORDER position, NOT_PRECACHED /
  RUNTIME_PAGES contain the page [GAP]; usage TOOLS / labels / fail-code whitelist [GAP]; postbuild OG list [GAP].
E2E (all 5 projects):
- hwpx-to-hwp.spec [GAP]: 4 fixtures → download → CFB + header + SHA equal to the Node unit hash; **re-open the
  downloaded .hwp in /hwp-viewer/** and assert page count; .hwp input → already-hwp; random bytes → not-hwp; password
  HWPX → password; over-size (stubbed limit) → too-large; engine 404 → panel; losses > 0 via worker stub → warning list
  visible + download still works; new pick mid-run → no stale result; no-upload guard; axe; SEO/legal (title,
  description, both notices, canonical); 360 px layout; usage events whitelist (usage.spec).
- Regression: /hwp-viewer/ and /hwp-to-pdf/ password HWPX → password copy [GAP]; existing hwp specs unchanged
  [TESTED hwp-viewer.spec, hwp-to-pdf.spec]; site/polish/growth lists include the page [GAP].
- regress:hwp gains one hwpx→hwp line (4 fixtures, losses, gate) [GAP].
- Lighthouse /hwpx-to-hwp/ LCP ≤ 2,000 ms [GAP]; check-dist initial-JS assertion [GAP].

## Out of Scope (→ BUILD-LOG Known Gaps if they surface)
- HWP→HWPX page; 「HWP로 저장」 in /hwp-viewer/; password HWPX decrypt + convert; password HWP output.
- Stripping RhwpHwpxOrigin; filling PrvText; showing 한글 쪽 수.
- Batch / multi-file conversion; 배포용 HWPX detection beyond rhwp open failure.

## Acceptance
- All tests above green on 5 e2e projects; precache ≤ 450 KB, initial JS < 30 KB, controller ≤ gzip + 20 %, UI-font
  tripwire unchanged, LCP ≤ 2,000 ms.
- Every fixture's output re-opens (Node rhwp + /hwp-viewer/ e2e) with equal page count; SHA equal Node vs browser.
- Expectation note on page and result; loss-warning path demonstrated in e2e.
- Richard clear; owner go-ahead before commit; push only on explicit owner word.

## Owner steps
- None required to build (O4 done).
- After deploy: Naver Search Advisor → 웹페이지 수집 요청 for /hwpx-to-hwp/ and the updated /guide/what-is-hwpx/;
  IndexNow (`scripts/indexnow.mjs`) as today. Optional: open one file converted on the live site in 한글.

## Log notes (copy into BUILD-LOG "HWPX2HWP — brief")
- O4 go (2026-10-10, 3/3 opened in 한글). Slug /hwpx-to-hwp/ 「HWPX HWP 변환」. No preview; existing worker + one message;
  reload gate on shipped bytes; losses shown, download allowed; RhwpHwpxOrigin kept (no engine option, no CFB writer);
  password HWPX rejected via manifest check (also viewer / PDF); .hwp input redirected; limits = hardBytes only;
  HOME_DESC_ORDER after hwp-to-pdf; NOT_PRECACHED + RUNTIME_PAGES; viewer 「HWP로 저장」 and HWP→HWPX deferred.
