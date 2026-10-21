# Review Feedback — CONTENT1021 Step C
Date: 2026-10-21
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/content/tool-notes/image-to-jpg.md (「휴대폰과 PC에서 바꾸는 순서」 step 4) (confidence: 8): the step says 「JPG 사진이 준비되었습니다」 and that several photos come as a ZIP with 「_jpg」 added. Step 2 of the same list lets the person pick PNG or WebP, and the code names both after the chosen format: `headlineOne: (label) => \`${label} 사진이 준비되었습니다\``, `headlineMany: … \`${label} 사진 ${count}장이 ZIP 파일로 준비되었습니다\`` (src/tools/image-to-jpg/messages.ko.ts:85-86) and `zipName = … \`_${to}.zip\`` (src/tools/image-to-jpg/convert.ts:38). A PNG user sees 「PNG 사진이 준비되었습니다」 and gets `_png.zip`. Fix: say 「(고른 형식) 사진이 준비되었습니다」 and 「_jpg」·「_png」처럼 고른 형식이 붙은 ZIP.
- Tool limits stated without toolFacts (D7: "Tool limits come from TOOL_FACTS via toolFacts") (confidence: 7). Each matches the code today, but nothing catches drift, because 개, 바이트 and unitless numbers are not checker units:
  - pdf-edit.md 「합쳐 200개까지 넣을 수 있습니다」 ↔ `export const MAX_ITEMS = 200;` (src/tools/pdf-edit/limits.ts:6)
  - char-count.md 「1부터 100,000까지의 숫자」 ↔ `GOAL_MIN = 1`, `GOAL_MAX = 100_000` (src/tools/char-count/count.ts:23-24)
  - pdf-compress.md 「1,000,000바이트로 세어 맞춥니다」 ↔ `TARGET_MB_BYTES = 1_000_000` (src/lib/pdf/compress/levels.ts:53)
  Fix: add these three to src/data/tool-facts.ts, list them in each note's `toolFacts` (as Bob did for 6줄 and 4–64자, which are also not checker units), and add one unit assertion in tests/unit/tool-notes.test.ts that each listed fact's value, formatted, appears in its note body. If that is more than 5 minutes, log it for Step D. (「바이트」 is also not plain language; 「100만 바이트」 or dropping the sentence is fine too.)
- tests/unit (sw RUNTIME_PAGES) (confidence: 7): the tests now assert /stamp-signature/ is NOT_PRECACHED (bgremove.test.ts:842, pdf-password.test.ts:190, postbuild.test.ts:925). None asserts it is in `RUNTIME_PAGES` (src/sw/sw.ts:36). If that entry is removed, the page stops working offline after a visit and no test fails. tests/unit/power-of-attorney.test.ts:45-47 and hwpx-to-hwp.test.ts:50-52 already do this for their pages. Fix: add `expect(RUNTIME_PAGES).toContain('/stamp-signature/')` next to the pdf-password.test.ts assertion.

## Escalate to Architect
- D8 asked for 「아이폰·갤럭시·PC에서」 notes covering where to find the file and where the result is saved. Bob wrote device-neutral 「휴대폰과 PC에서 … 순서」 steps and linked the guides for the per-device detail. That avoids unsourced OS-menu claims, the main finding class in B1. I consider it a sound reading of D6/D7. Arch, please confirm it was intended.
- Out of scope, already on main (not introduced by Step C): /power-of-attorney/ has a duplicate id. `<fieldset class="pa-group" id={\`pa-${g.id}\`}>` and `<textarea id={\`pa-${f.id}\`}>` both produce `id="pa-task"` (src/pages/power-of-attorney/index.astro:51,57). As a result, `<label for="pa-task">부탁할 일</label>` points at the fieldset, and the textarea has no label. Arch should schedule a fix, for example `pa-group-${g.id}`. Check that CSS, JS or e2e selectors do not use `#pa-task` as the group.
- Gates: Bob's local Playwright run stopped at 163/550 (host memory), and LHCI did not run. Do not deploy until full CI (e2e on every project plus axe, and LHCI) is green on the commit.

## Cleared
I checked all 385 distinct 「…」 strings in the 22 notes against the tool markup and controllers with a script. 343 matched verbatim. I read the other 42 by hand: all are either filled-in templates that match the code (`PDF ${n}개 합치기`, `_외${n-1}건_합침`, `고른 ${쪽} 저장`, `${n}번째 줄:`, `원래 ${n}쪽`, `이 ${글자} 빼기`, `HWP로 옮기지 못한 내용이 ${n}곳`, `찾은 주소 ${n}개`, `${n}자 남았어요/넘었어요`, `_p001`, `_1-3`, the detail.ts B1F/B3-ho rules) or examples of user input. I checked about 30 behaviour claims against the code:
- merge: bookmarks on by default and source outlines copied
- AES-256 accepts a Korean password
- one PDF per run, with the 「첫 번째 파일만」 notice
- 1,000,000-byte MB, 0.5–100 MB, 10–20,000 KB
- photo target never exceeded (an unreachable target is an error, not a bigger file)
- rotation is clockwise
- jpg-to-pdf names the file after the top photo
- id-copy: 제출용 / 다른 용도 사용 금지 and the `신분증_사본_<date>` name
- hwp-viewer search ignores spaces, and text can be copied
- stamp-maker: 12 styles and 4 colours
- stamp-signature: no upscaling, 도장.png / 서명.png
- pdf-sign starts the picture at bottom-right
- english-name 외교부 shares come from mofa.ts
- remove-background file names

No unsourced institution or vendor rule is stated as fact. The 외교부 lines repeat the tool's own sourced copy. No banned word, no "files never leave" lead, no other brand name. The remove-background and english-address notes avoid the processing-mode wording, and a unit test enforces this. Notes do not copy guide paragraphs: only one quoted error message overlaps a guide. D5.5 covers repeats across notes. ToolNotes.astro sits between why and faq on every page, and the heading order is h1 → h2 with no skipped level. The section is labelled by its first H2, uses the system-font rule, and loads no script. The en-check exclusion cuts only `section class="tool-notes"`. The /stamp-signature/ move matches D10, and RUNTIME_PAGES and NOT_PRECACHED agree. The test edits only flip the precache expectation and tighten LENGTH_PENDING to empty. No threshold was lowered.
