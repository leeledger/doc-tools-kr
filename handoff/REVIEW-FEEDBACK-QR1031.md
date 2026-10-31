# Review Feedback — QR1031 (QR코드 색 바꾸기 + 로고·사진 넣기)
Date: 2026-10-31
Ready for Builder: NO

## Must Fix
- src/pages/qr-code/index.astro:310,316 (confidence: 8/10) — The two new error slots are plain
  `<p class="field-error" id="qr-color-error"></p>` / `<p class="field-error" id="qr-logo-error"></p>`, with no
  live region. The logo error comes in asynchronously after the file dialog closes (`logoError.textContent = ... err.message`
  in controller.ts onPick). A screen-reader user picks a non-image or a HEIC on Chrome and hears nothing: focus stays on
  the file input, and aria-describedby is read only when focus arrives. The color line has the same problem when it
  appears on `change`. The 받기 path is fine, because focus moves to #qr-fg, but `fgInput.focus()` on an input that already
  has focus is not read again. The page already uses this pattern for its other async error:
  `<p class="field-error" id="qr-over" role="alert">`. — Fix: add `role="alert"` to `#qr-logo-error` and to
  `#qr-color-error` (the text only changes when the problem changes, so dragging the picker will not repeat it). Extend
  e2e d or c to assert the role. Re-run axe in f.

## Should Fix
- src/content/guides/qr-code.md:180 (confidence: 7/10) — 「문서딱은 그중 M으로 만들어서 M 단계의 binary 칸만 옮겼어요」 is now
  only true without a logo. The new section at :199 explains H, so this is not wrong, but it reads as absolute. — Add 「(로고를
  넣지 않을 때)」 or a pointer to the new section. 2 minutes.
- src/lib/qr/style.ts:177-178 comment (confidence: 5/10) — "gives an even 8×8 block the threshold 'half its lightest
  value'": jsQR's low-dynamic-range branch is `min / 2` (the darkest value). In a uniform block min≈max, so the measured
  conclusion holds. Please correct the wording so the next reader does not chase it.

## Escalate to Architect
- None. Bob's three open questions are judged below and need no product decision.

## Judgments on the open questions
- D3 (second rule, luma ≤ 0.45 × background): sound. It makes the brief's rule stricter, which the brief allows ("if 3:1
  fails jsQR, RAISE it and log"). It is a cheaper raise than ~4.9:1, which would block red on white. MIN_CONTRAST stays 3
  and is sourced (W3C SC 1.4.11, handoff/sources/qr1031). 0.45 is commented and logged as a measurement (3,000 pairs,
  BUILD-LOG), and no page copy states 0.45, 3:1 or any ratio. Guide, FAQ and tool notes only say 「충분히 어두울 때만」.
  Messages 「QR 색이 배경 색보다 어두워야 잘 찍혀요.」 / 「두 색의 차이가 작아 … 더 어둡게 골라 주세요.」 are plain Korean.
  scanLuma uses jsQR's own weights on raw sRGB. Unit tests cover the boundary pairs (4/8/41 px, with and without a logo) and 60
  random allowed pairs. Accepted.
- D5/D9: accepted. Default path: `styled()` false → `st` null → `encodeQr(payload)` + `qrSvg` + `qrPng`, the exact main
  calls. colorSvg/colorRgba also return the plain output for black on white. The identity sha256 test (6 payloads) passes.
  Styled but chunk missing: `colorsOk = !problem && (!!st || !styled())` is false. 받기 opens the panel and focuses QR 색. The
  chunk loads on panel toggle anyway, so in practice a user can only reach this offline, and then sees the retry line. Not
  confusing. render.ts qrPng refactor is byte-neutral.
- D7: 0.22² = 4.84 % is the true bound (v6: 9² / 41² = 4.82 %). The brief's 4.4 % was endpoint arithmetic. No copy states
  4.4 %, 4.8 % or 30 % (grepped guide, tool notes, tools.ts, COPY.md).
- Logo path: sniff → decodeImage(≤512) → canvas → PNG data URL. `PNG_DATA_URL` regex gates the `<image href>`. HEX gates
  every fill. Nothing reaches innerHTML except matrix paths, validated hex and that data URL. No fetch/XHR/beacon/storage, and
  check-dist asserts this on the logo chunk's own closure. H + minVersion 5 + the v5–v40 checker sweep and v40-H full all
  decode.
- 「배경 색」 is used consistently (page, controller, FAQ, guide, notes, COPY.md).

## Verification run by Richard
- vitest tests/unit/qr*: 6 files, 54/54 green.
- ga.test + postbuild alone (under load): 104/106. 「plain language (Polish Q)」 timed out at 60 s (it took 86 s) and passes
  with --testTimeout=400000. 「usage statistics」 has its own fixed 120 s timeout and took 205 s for its 8 check-dist runs.
  I timed one check-dist run on the same dist: branch script 23 s, main 54a080e script 26 s. The branch does not make
  check-dist slower, so these are machine-load timeouts, not regressions. Not a blocker. Before merge, confirm green in CI
  or on an idle machine.

## Cleared
Engine, styled renderers, logo reader, controller glue, check-dist block, copy and sources were reviewed. Everything passes
except the missing live region on the two new error lines.
