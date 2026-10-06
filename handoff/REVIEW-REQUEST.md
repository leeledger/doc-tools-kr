# Review Request — TOOLS4 T4 (/pdf-password/ PDF 암호 해제·설정) + T3 carry-overs
Date: 2026-10-06
Ready for Review: YES. Status **DONE**. Not committed. Notes, decisions, sizes, gates: BUILD-LOG "TOOLS4 T4 build notes".

## Probe first (brief Unverified a, b, c), passed
The vendored qpdf-wasm 12.2.0 (Node, the same wasm copy-vendor ships) with `--encrypt --user-password=문서딱암호12 --owner-password=<32 hex> --bits=256 --`: exit 0, output `/V 5 /R 6 AESV3`; pdf.js: no password -> PasswordException code 1, wrong -> code 2, right -> 7 pages; two locks differ; `--decrypt --password=…` -> opens without a password (getPermissions null); wrong -> exit 2 "invalid password". No fallback library used. Kept as unit tests (tests/unit/pdf-password.test.ts "vendored qpdf-wasm round trip").

## Files Changed — T3 carry-overs (/pdf-to-jpg/)
- src/tools/pdf-to-jpg/guards.ts (new) — `runErrorCode` (pdf.js InvalidPDFException / UnknownErrorException / FormatError / MissingPDFException -> corrupt; SF4), `restrictionNote` (one-line copy/print notice when PRINT, MODIFY or COPY is missing; orchestrator decision), `TaskSlot` (release only its own task; SF2), `CanvasError` moved here.
- src/tools/pdf-to-jpg/controller.ts:103-107 — TaskSlot, `unlocking` guard, `restricted` state.
- src/tools/pdf-to-jpg/controller.ts:248-256 — close any previous document before `opened = o` (SF1); read `getPermissions()` and show the notice (kept beside the multi-file note).
- src/tools/pdf-to-jpg/controller.ts:286-300 — `unlock()` ignores a second submit while an attempt runs (SF1).
- src/tools/pdf-to-jpg/controller.ts:328-390 — notice kept through runs; stale-run check after `getPage`; finally releases only its own task (SF2); JFIF density = round(scale × 72) via the existing `setJfifDpi` (SF5; clamped pages get their real ppi); single-page Blob from the stamped bytes; `runErrorCode`.
- src/tools/pdf-to-jpg/output.ts:14-36 — each ZIP chunk becomes its own Blob at once; the final Blob is made of Blobs (SF3).
- tests/fixtures/build.mjs:113-115 — new runtime fixture `owner_no_copy` (owner password only; print/modify/extract denied).
- tests/unit/pdf-to-jpg.test.ts — JpegZip Blob-parts spy test; runErrorCode, restrictionNote, TaskSlot tests.
- tests/e2e/pdf-to-jpg.spec.ts — JFIF density 150/300 asserted; double requestSubmit opens once; owner_no_copy notice / owner_restricted none; cancel-run-cancel; per-worker fixture path (fixes a beforeAll race that showed up as a flaky "손상" on chromium).
- tests/e2e/usage.spec.ts:98-123 — the wrong password is submitted twice at once; still exactly one fail(wrong-password).

## Files Changed — T4 /pdf-password/
- src/lib/pdf/password.ts (new) — `randomOwnerPassword` (16 bytes crypto.getRandomValues -> 32 hex), `lockArgs` (named AES-256 form), `unlockArgs`, `qpdfDone`, `passwordFailure` (code only; log text never leaves).
- src/lib/pdf/password.worker.ts (new) — one qpdf run + `hasSignature` (pdf-lib) on the plain side (input for lock, output for unlock); posts bytes + `signed` or a code; never posts or logs the password.
- src/tools/pdf-password/limits.ts (new) — PC 200 MB / phone 50 MB; lock password 4–64 code points, typed twice; messages.
- src/tools/pdf-password/flow.ts (new) — `decide(action, kind)` (decision 13 matrix), stop messages, signature/keep notes, `outputName` (`_암호.pdf` / `_암호해제.pdf`, like 합침/압축).
- src/tools/pdf-password/controller.ts (new) — states empty/opening/ask/stop/working/done; kind from pdf.js (open returns null = user, getPermissions non-null = owner, else none); one press = one attempt (state leaves 'ask' at once); worker + cancel (terminate); lock output verified with pdf.js (no password -> must ask; with it -> same page count); unlock output must open without a password and carry no encryption; failure -> engine panel, no file; passwords cleared on done/pagehide.
- src/tools/pdf-password/entry.ts (new) — first-interaction loader (pdf-to-jpg pattern), startUsage.
- src/pages/pdf-password/index.astro (new) — 할 일 chips (암호 풀기 default), the always-visible line "열 때 쓰는 비밀번호를 아는 파일만 풀 수 있습니다.", password inputs without `name`, related tools pdf-merge/pdf-compress/pdf-to-jpg.
- src/data/tools.ts:31-37, 298-345 — entry (brief title/description; 6 FAQ with numbers from limits.ts; decision 13 sentence verbatim).
- src/data/site.ts:16-19 — comment only. tests/unit/polish.test.ts:450-455 — HOME_DESC_ORDER test now expects every id to be a tool.
- scripts/lib/usage.mjs, src/lib/ui/usage.ts — TOOLS += pdf-password; SETTINGS.action = lock|unlock; labels 할 일 / 암호 걸기 / 암호 풀기.
- src/data/og.json, src/data/tool-facts.ts (4 facts), src/data/guides.ts (NEXT_GUIDES), src/content/guides/pdf-password.md (new how-to; qpdf manual quote, check:quotes OK), src/content/guides/yearend-tax-pdf.md (related += pdf-password, for the orphan rule).
- scripts/gen-sw.mjs:41-50 — NOT_PRECACHED += /pdf-password/ and /hwp-viewer/ (see Open Questions).
- scripts/check-dist.mjs:150-166 — password.worker budget 289 KB (240.7 measured + 20 %), controller 6 KB (5.0 + 20 %), no pdf.js/qpdf/worker in the initial JS.
- scripts/lib/bgcloud.mjs, lighthouserc.json, scripts/qa/visual.mjs, CLAUDE.md line 3 — registration.
- tests: tests/unit/pdf-password.test.ts (new), usage.test.ts (+3), postbuild.test.ts (OG list, precache), bgcloud.test.ts; tests/e2e/pdf-password.spec.ts (new, 9 tests), usage.spec.ts (+1), site.spec.ts / polish.spec.ts lists, 10 cards, home description in the "등 10가지 도구" form.

## Open Questions
- **Precache (please check the reasoning).** Even with /pdf-password/ excluded, the cloud build measured 452.1 KB (default 446.2). Measured savings per page (cloud): / 19.3, /hwp-viewer/ 22.4, /stamp-signature/ 24.5, /pdf-merge/ 33.1, /hwp-to-pdf/ 35.2, /pdf-compress/ 39.8, /photo-compress/ 46.2, /id-photo/ 63.9 KB. I dropped **/hwp-viewer/**: the smallest change that fits with home kept, and it cannot open a file offline on a first visit anyway because its 9.7 MB rhwp wasm is never precached. Applied to all builds (one list): now 424.1 default / 429.7 cloud / 426.1 auto-frame. The 450 KB budget is unchanged.
- An owner-limited PDF in 암호 걸기 stops with "이 파일에는 만든 곳에서 건 사용 제한이 있어 새 비밀번호를 걸 수 없습니다." (re-encrypting would replace its permissions, which is restriction removal). Not in the brief; my call.
- The T3 notice triggers when PRINT, MODIFY_CONTENTS or COPY is missing (the copy says 복사·인쇄 제한). A file with only annotation/form limits gets no notice.
- The default build's home description moved from the short form to the 등 form (10 tools, by rule). The polish e2e test now accepts it.
- The signature check runs pdf-lib in the worker (brief: reuse `hasSignature`), so the worker is 240.7 KB gzip. A pdf.js-based check would be lighter but would be a new detector.

## Out of Scope (logged in BUILD-LOG)
- No Unicode normalization (NFC/SASLprep) of passwords; a Mac NFD password typed elsewhere could differ.
- Lighthouse, qa:visual, firefox/webkit/mobile-safari not run locally.
