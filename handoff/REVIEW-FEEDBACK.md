# Review Feedback — Step T4 (/pdf-password/) + T3 carry-overs
Date: 2026-10-06
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- scripts/gen-sw.mjs:48 + src/sw/sw.ts:30 (confidence: 8/10) — Dropping `/hwp-viewer/` from the precache is a regression for returning users, not just a budget trim. `RHWP_WASM_URL = /vendor/rhwp/${RHWP_VERSION}/rhwp_bg.wasm` (src/lib/hwp/wasm-browser.ts:11) is under `/vendor/`, which the SW caches cache-first on first use (sw.ts:16, 24). So before this change, someone who had opened the viewer once could open a HWP offline. Now the page is neither precached nor in `RUNTIME_PAGES = ['/licenses/', '/terms/', '/privacy/']`, so offline it falls to /offline/. The comment "cannot open a file offline on a first visit anyway" holds only for a first visit. Fix: add '/hwp-viewer/' to RUNTIME_PAGES (no precache cost; the page is stored on a successful visit, and its /_astro/ controller and /vendor/rhwp wasm are already runtime-cached). Arch may want to do the same for /pdf-password/, /pdf-to-jpg/ and /jpg-to-pdf/ (qpdf/pdf.js live under /vendor/ too). Correct the gen-sw comment and extend the postbuild/sw unit test.
- src/lib/pdf/password.ts:18-25 / password.worker.ts:44 — Password normalization (Bob's open question; my ruling). Hangul typed through an IME is NFC on Windows, macOS, iOS and Android alike, and ISO 32000-2 R6 says a reader SASLprep's the password (NFKC, which leaves NFC Hangul unchanged). Neither qpdf nor pdf.js normalizes, so the one real risk is pasted NFD text (e.g. copied from a macOS file name): a lock password stored as NFD bytes cannot be typed back later on any keyboard, and Acrobat (SASLprep) would not open it. Recommendation: apply `.normalize('NFC')` to the lock password and its confirmation, and pass the same normalized string to the worker and to the pdf.js verification in check(). Also normalize the unlock password to NFC, so our own NFC-locked files always open and spec-conforming lockers (which store NFKC) match. This is one attempt, not a second guess. Not blocking; under 5 minutes plus one unit test (NFD input locks and unlocks via NFC).
- src/tools/pdf-password/controller.ts:190 (confidence: 6/10, verify this) — `kind = ... (await opened.doc.getPermissions()) ? 'owner' : 'none'`. pdf.js returns a non-null flag list for ANY encrypted file with /P, including one that allows everything. Such a file in 암호 걸기 is told "만든 곳에서 건 사용 제한이 있어" when it has none. The behaviour is safe (it stops); only the reason is wrong. Recommendation: reuse `restrictionNote`-style logic (guards.ts:32) to tell "encrypted, everything allowed" apart from "restricted", or reword the stop message to cover both. If this costs more than a few minutes, log it to BUILD-LOG.
- tests/unit/pdf-password.test.ts:32-44 (confidence: 7/10) — No test pushes a hostile password through the real vendored qpdf. Argument handling itself is sound: one argv element `--user-password=${pw}` with no shell, qpdf splits at the first `=`, and `@file` expansion applies only to whole arguments. But the brief's focus is exactly this, so add a round trip with passwords like `-x --decrypt`, `a b "c"`, `=--owner-password=1` and `@in.pdf`: lock, then pdf.js opens with the same string and refuses without it.
- src/tools/pdf-password/controller.ts:310-315 (confidence: 5/10) — If `o.doc.getPermissions()` throws, `o` is never closed (the same pattern applies to withPw at 304-307). Wrap in try/finally. Minor leak only.

## Escalate to Architect
- Unlocking a file that has BOTH an open password AND use limits removes the limits. `unlockArgs` = `['--decrypt', '--password=…']`. qpdf does not enforce permissions when it decrypts with the user password, and controller.ts:315 even requires `perms` to be null afterwards. So a 정부24/bank PDF with an open password plus no-print/no-copy comes out unrestricted. Decision 13 forbids a "restriction removal feature" and stops owner-only files. Bob's own lock-side reasoning ("re-encrypting would replace its permissions, which is restriction removal") points the other way here. Removing encryption necessarily drops /P, so the choices are: (a) accept it (the person knows the open password; most tools behave this way), (b) after the open check, read `getPermissions()` with the typed password and show a one-line notice like T3's RESTRICTED_NOTE in the result, or (c) stop such files. This is product policy, not code.
- Which tool loses its precache slot (/hwp-viewer/ vs. trimming elsewhere) is a product trade-off. Bob's choice is defensible once the RUNTIME_PAGES fix above is in. Arch should confirm it.

## Cleared
Reviewed password.ts, password.worker.ts, the pdf-password controller/flow/limits/page, usage enums, gen-sw, and T3 guards/controller/output.

- Passwords: never in usage events, status/alert text, logs, URLs or the posted response. qpdf logs are captured and reduced to a code. Inputs have no `name`. The worker is terminated after one answer. Fields are cleared on done/pagehide.
- Owner password: 16 bytes from crypto.getRandomValues as 32 hex characters, a fresh one per run.
- qpdf arguments: named `=` form, no shell, so a password cannot become a flag.
- Lock gate: pdf.js must refuse to open without the password and open with it at the same page count before any Blob URL exists. A failed check offers no file.
- Unlock: only for files that need an open password, with the typed password, one attempt per press. Owner-only files are never rewritten. Stopping 암호 걸기 for owner-restricted files is endorsed.
- Signature warning: computed on the plain side and shown before download.
- T3 SF1–SF5: SF1 closes any previous document and the `unlocking` guard stops a double submit; SF2 TaskSlot.release frees only its own task; SF3 builds the ZIP from Blob parts; SF4 corrupt-name mapping; SF5 JFIF density = round(scale × 72).
- pdf-lib in the worker: accepted (brief says reuse hasSignature; loaded on press; budgeted).
- Home "등 10가지 도구" form: accepted (rule-based).

---

# Review Feedback — Step T4 round 2
Date: 2026-10-06
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/tools/pdf-password/controller.ts:330-338 (confidence: 6/10) — `const orig = await openPdf(input, password).catch(() => null)` skips the note when the open fails, as Bob intends. But `isRestricted(await orig.doc.getPermissions())` sits in a try/finally with no catch. If getPermissions throws, the error reaches the outer catch and becomes `failed(act, 'engine')`, so an unlock that was already verified offers no file. This contradicts Bob's own note ("if that open fails the note is skipped"). Fix: `await orig.doc.getPermissions().catch(() => null)`, or wrap the read in its own try/catch. Rare, so it does not block.

## Escalate to Architect
None.

## Cleared
All six round-2 items match the T4 deploy-gate decisions and my Should Fix list.

1. **Unlock notice.** The original's permissions are read with the typed password and the shared `isRestricted` rule. The password stays only in the check() closure, never in the DOM, events or messages. The notice is a result note; nothing is refused.
2. **RUNTIME_PAGES.** It now includes /jpg-to-pdf/, /pdf-to-jpg/, /pdf-password/ and /hwp-viewer/. /remove-background/ is excluded. NOT_PRECACHED is unchanged, so the precache does not grow (424.2 / 430.3 / 426.4 KB).
3. **NFC.** Applied to both lock fields before validation, and that string goes to the worker and the pdf.js check. Also applied to unlock before the empty check. The unit test shows a raw NFD lock would not open with the NFC spelling, which proves the need.
4. **Encrypted-but-unrestricted files.** The new `encrypted` kind gets its own stop message in 암호 걸기. 암호 풀기 still says no password is needed.
5. **Hostile passwords.** Eight cases run through the real vendored qpdf (leading dashes, quotes, `=`, `@in.pdf`, spaces, `--`, a backslash).
6. **try/finally.** Every pdf.js document opened in check() is now closed.
