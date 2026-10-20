# Review Feedback — FORM1020 위임장 만들기 + 양식 채우기 엔진 (F0–F4)
Date: 2026-10-20
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/content/guides/power-of-attorney.md:79 (confidence: 6) — 「마지막 칸의 서명이나 도장은 맡기는 사람이 직접 해야 해요.」 states a requirement no saved source quotes. — Make it descriptive or advisory, e.g. 「마지막 칸에는 맡기는 사람이 서명하거나 도장을 찍어요. 받는 곳이 정한 방법이 있으면 그것을 따르세요.」
- src/content/guides/power-of-attorney.md body (confidence: 5, verify this) — the 2,552 figure is non-space characters of the raw markdown, so it counts URLs, link syntax and table pipes. Rendered prose without spaces comes out at roughly 2,350; with spaces the body is about 3,100. — Write the AdSense P1 metric (rendered text, with or without spaces) into BUILD-LOG once, so later guides are measured the same way. If it is "without spaces, rendered", add about 200 characters of real content (for example one more 맡기는 일 example section line or a 안 될 때 item).
- handoff/BUILD-LOG.md Known Gaps line (FORM1020) (confidence: 8) — the line names the rhwp char-format bug but not what it costs. — Add the user-visible part: 「위 사람에게 …」 is body 10 pt (brief 11 pt) and 「… 귀중」 is plain 10 pt (brief bold 12 pt) until rhwp is fixed. The orchestrator accepted this deviation.
- scripts/forms/hancom-open.ps1:8 (confidence: 6) — `Get-Process Hwp | Sort-Object StartTime -Descending | Select-Object -First 1` records the newest Hwp process. On a timeout, hancom-check.mjs:48 kills that PID. If the owner opens a 한글 window during the run, the script can kill the owner's process. — Record the PIDs before `New-Object` and take the one that is new after it, or skip the kill when more than one new process appeared. Local tool only, so not blocking.

## Escalate to Architect
- None. Bob's open questions 1, 2 and 4 are answered by the orchestrator. Q3 (UI labels changed for the glyph gate, document labels kept) is within the brief: the brief's own example labels lacked core glyphs, and D5's document wording is unchanged.

## D12 — what the person at the PC must see before Deploy A (not part of this verdict)
`npm run forms:hancom`, with 「접근 허용」 clicked once per file:
- 4 lines `PASS power-of-attorney <blank|sample|all-max|all-max-lines-25>: open=true 한글 pages=1 rhwp pages=1 bytes=…` with no `missing:` part.
- `한글 version <x.x.x.x>` and the final `forms:hancom PASS`.
- Spot-check 한글's own PDFs written next to the files: blank (date line 「     년     월     일」, no 귀중 line) and sample (every value left-aligned, 「생년월일(주민등록번호)」 on one line, 「종로구 행정복지센터 귀중」 last).
- Log the result and version in BUILD-LOG. Any FAIL means FORM_HWP=false (PDF only) per D12.

## Cleared
I reviewed the following and they pass:
- **Legal safety:** no statutory form is recreated. 「인감」 appears on the tool page only inside #pa-caution, and check-dist enforces it.
- **Guide sources:** all 7 guide quotes match handoff/sources/form1020 and the BUILD-LOG 금감원 fetch word for word, dated 2026-10-20.
- **Typed text stays on the device (D7):** inputs have no names and the form has no action. There are no storage or history calls in the page chunk or the controller closure (check-dist). Filenames are fixed. Usage carries only build and format, and an e2e asserts no typed value in any beacon. The worker looks the spec up by its own key and normalizes again.
- **Engine and controller:** the engine's ok:false/throw path goes to HwpError. The worker frees the previous document. Stale, reset and the separate HWP and PDF failures are handled.
- **Plain language and brand:** copy is plain and uses 문서딱 only.
- **Budgets and caching:** the new budgets are new entries at measured +20 %. No existing budget was raised (hwp.worker stays 90 KB). Precache is 431.1 and 442.4 of 450 KB. The page is in NOT_PRECACHED and RUNTIME_PAGES.
- **CSP and accessibility:** the tool page has no AdSense tag and no off-site script (CSP stays 'self'). axe was run on the form, the result and both error states.
