# Review Feedback — ROMANIZE1016 R0–R3 (영문 이름 변환기 /english-name/, deploy A)
Date: 2026-10-16
Reviewer: Richard
Diff: 30cd5ea..5333516 (cd2e65d R0, 4c83b7d R1, 0601e70 R2, 9577eba R3, 5333516 request)
Ready for Builder: YES — **CLEAR**

## Must Fix
None.

## Should Fix
- tests/unit/usage.test.ts:982 vs :986 (confidence: 9/10) — the comment says 「form never on a start」, the next assertion
  proves the opposite (`validate({ t: 'english-name', e: 'start', o: 'form', v: 'joined' })` is accepted; SETTINGS are not
  tool-scoped, so a char-count start with o=form passes too). Since the admin 「많이 쓴 설정」 query now sums
  `start OR download`, such a row would be counted as a copy. No real client sends it (entry.ts:10 sends start without o/v),
  so this is not a live distortion. Fix: either reject a DOWNLOAD_SETTING key on any event but `download` in
  scripts/lib/usage.mjs validate (one line after :259) and flip the assertion to toBeNull, or correct the comment. Under
  5 minutes; recommended before deploy A.
- src/tools/english-name/controller.ts:122 (confidence: 6/10) — a repeated syllable (똘똘, 영영) gives two fieldsets with
  the same legend 「이름 「똘」 표기」; a screen reader cannot tell them apart. Add the position (e.g. 「이름 두 번째 글자
  「똘」 표기」, late copy) if cheap; otherwise log.
- Informational, not this step: the full `npx vitest run` on this machine failed once in tests/unit/postbuild.test.ts
  「usage statistics … fail check-dist」 (it takes ~100 s alone); it passes alone. Load-dependent timeout, not caused by
  this diff. astro check 0/0 (8 hints), english-name + usage unit files 299/299 re-run by me.

## Arch decisions and Bob's questions (my judgment)
- Q1 usage server change: sound. `ONLY` now lets o/v ride on `download`, but validate (usage.mjs:258-259) refuses any
  download o unless `DOWNLOAD_SETTING[t] === o`, and the only entry is english-name → form. No other tool's download could
  ever carry o before (ONLY refused it), so historical rows have blob5 = '' on every download and the widened settings
  query (usage.mjs:282) adds rows for english-name only; every existing tool's 「많이 쓴 설정」 number is unchanged.
  SETTING_VALUE_LABELS keeps char-count `space` = 공백 포함 (unit-tested side by side). Keep it as a download setting,
  not a start setting: the shape is only known at 복사. See Should Fix 1 for the one loose end.
- Q2 placeholders 「예: 이」/「예: 서연」: agree with the approval; 홍 would load the late face before interaction.
- Q3 ㄼ ㄽ ㄾ ㅀ + ㄹ → ll: agree. Their standalone value is l; writing 「lr」 would put the letter pair l+r where
  [붙임 2] prescribes ll. No name in the 외교부 list uses these finals; zero practical exposure, internally consistent.
- Q4 syllable rows: agree. One radio per distinct spelling, 표기법 first and default with its 비율 when listed; no
  one-option radiogroups. The label shows the standalone 표기법 form (석 SEOK) while the joined row may show liaison
  (SEOGU); that is D3 as written.
- Q5 id-photo related tools in menu order: acceptable.
- Q6 (고시 2024-27): unresolved discrepancy is logged and our copy cites no number; correct handling.

## Verified
- Engine (romanize.ts): arithmetic decomposition, initials/vowels per 제2장 제1항 (ㅢ → ui), 27 standalone finals per
  D2, liaison table for single and double finals (ㅇ never moves, ㅎ → h), ㄹㄹ → ll, and liaison/ㄹㄹ only between two
  neighbouring 표기법 syllables of one part (spellings[i+1] undefined guard, carried reset after a pick). No
  nasalization, insertion, palatalization, aspiration or tensing anywhere. Surname is one joined word.
- Data: mofa.ts spot-checked against mofa-list-2024-10-31.txt (김 GIM 35,451 0.42 %, 영 YOUNG 2,628,441 79.67 %,
  정, 이, 희, 신 SIN negative); the data test proves the full 282-row multiset, totals, ratios ±0.01 and the negative set.
- Warnings: exact match only, NEGATIVE = S4 eleven + S5 GOO/KOOK; SINGLE A I O U on surname or whole given name. Copy
  as briefed.
- FAQ 4 claims checked against 여권법 시행령 제3조의2 ② (2호 유학·취업, 6호 개명, 7호 최초 발급 여권 사용 전) and
  menuPos=36 (재발급 시 동일 표기). intl-driving-license sentence rests on the guide's existing cited quote (line 37).
- Privacy: inputs without name, form without action, submit prevented; no storage/history (check-dist enforces); the
  only network path is the usage tracker (startUsage/track, gated by __USAGE_STATS__), carrying start / download
  o=form v=shape / next v=id-photo only; e2e asserts bodies never carry the name, case or parts. No CSP change, no new
  package.
- Copy: 문서딱 only; no 공식 / 영어 이름 / 띄어 쓰기 in static text (check-dist); every number on the page carries
  「2024년 10월 31일 기준」 and the fetch date; 「보내지 않습니다」 only in FAQ 5 and the line beside the inputs. Owner
  note verbatim as late copy with the three 외교부 links (new tab, noopener, visually hidden 「새 창」).
- SEO: title 36, description and summary as briefed, JSON-LD WebApplication + FAQPage, registration list complete.
- a11y: labelled inputs, role=alert error, aria-invalid, result tabindex -1 focused on submit, native radio groups,
  copy buttons labelled per row, live region throttled to once a second; axe in e2e with result, choices and error.
- Tests: unit covers every 받침 in every position, the brief's sets, 11,172 syllables, 28 oracle rows with logged
  deviations; e2e covers the brief's cases on 5 projects with the no-upload guard; usage.spec cloud test checks bodies.

## Escalate to Architect
None.

## Cleared
ROMANIZE1016 R0–R3 (engine, 외교부 data, page, controller, usage whitelist and admin query, chain block, inbound links,
registration, tests) reviewed against the brief and passes; deploy A may proceed after the optional Should Fix items.
