# Review Feedback — QUOTE1112 A1–A3 + B1/B2 (/quotation/, Deploy A scope)
Date: 2026-11-12
Ready for Builder: NO (one Must Fix, copy + one e2e line)

Commits reviewed: 0d0810d, 9797bfd, 4b492d8, f798e6b, 02937a7, 239f6d2, c322ba5 (diff 052cd49..c322ba5).
Targeted unit run here: form-ledger, quotation-page, usage, affiliate — 242/242 pass.

## Must Fix
- src/tools/quotation/copy.ts:31 (confidence: 10) — 「100억 원 넘는 금액은 만들 수 없어요.」 contradicts the code.
  src/lib/form/ledger.ts:18,78,88 `LIMIT = 10n ** 10n` with `line >= LIMIT || s + t >= LIMIT` / `total >= LIMIT`, and
  tests/unit/form-ledger.test.ts:188 (50억 + 50억 = exactly 100억 → tooBig) pin that exactly 100억 is refused. A user
  with a 100억 total is told the limit is "over 100억" and is refused anyway. The tool note (quotation.md:60, 「100억 원
  이상이면」) and the brief's failure table (「total 100억 or more」) already agree with the code.
  Fix: keep the code, change the line to 「100억 원 이상인 금액은 만들 수 없어요.」 and update
  tests/e2e/quotation.spec.ts:217 to the same text. Do NOT widen the limit to allow exactly 100억: that is an 11-digit
  total, which re-opens the A1 column-width / 1-page work for no user gain. Check the new characters (이·상·인) are
  already in the core glyph set (they are common; confirm with the Q12 uiCharSets diff = 0 new).

## Should Fix
- src/content/tool-notes/quotation.md:15-32 (confidence: 7) — the note states 「100억 원 이상」 (line 60) but no toolFact
  backs that number; brief Q16 asks for a toolFact for every stated limit "(ITEM_ROWS, lengths, 100억)".
  `quotation.totalDigits` exists in tool-facts.ts but is not referenced by the note and is a digit count, not 100억.
  Add a fact derived from LEDGER_MAX_DIGITS (e.g. `quotation.limitEok: 10 ** (LEDGER_MAX_DIGITS - 8)` = 100) and list it
  under the note's toolFacts so the note fails the build if the limit ever moves.
- src/content/tool-notes/quotation.md:64 (confidence: 6, verify) — 「세금계산서는 … 국세청 홈택스에서 발급할 수
  있습니다.」 is a claim about issuing rules; brief Q1 says 「link only, no claim about 전자 발급 rules」 and it has no
  source in the note. Reword to point, not assert (e.g. 「세금계산서는 따로 발급해야 합니다. 국세청 홈택스를 참고하세요.」)
  or drop the clause.
- Usage (Open Q3) (confidence: 6) — a filled quotation build now sends `start o=doc` instead of `build=filled`, so any
  admin/report row that counts form-tool filled builds by `build=filled` reads 0 filled for quotation. Accept the
  design (one o/v per start event), but add one line in OPS-RUNBOOK (usage section) that for quotation
  filled = the `doc` rows, and confirm the /admin/ settings table shows the `doc` rows (SETTING_LABELS has it).

## Nits
- src/lib/ui/sign-handoff.ts:90-103 + src/tools/quotation/seal.ts:115 — /quotation/ takes whatever PNG waits under the
  shared keys (a stamp-signature PNG stored for /pdf-sign/ but never read would arrive as a seal), and a 「견적서에 찍기」
  PNG left unread is taken by /pdf-sign/. Brief Q9 chose the same keys and the read-once remove makes this rare; log as a
  Known Gap, no change now.
- scripts/check-dist.mjs:1101-1103 — the storage exception allows any sessionStorage use in a /quotation/ chunk that
  also contains the key string. Fine today; tighten later if another storage use appears.
- Shared form controller headroom is 75 B (loan-note 8,526 / 8,601.6 B GA-on). Already logged; the next engine change
  shrinks first. Agreed.

## Open Questions — verdicts
1. FLOW quotation = [pdf-sign, pdf-edit, pdf-compress] instead of pdf-merge: APPROVED. pdf-merge takes no hand-off; the
   other form tools use the same row; logged in BUILD-LOG.
2. Shared-chunk trims: APPROVED. Read the diff: fieldProblem keeps old behaviour for amount (zeros → zero; digits past
   12 → tooBig; else number) and for number (always number, `most = Infinity`); `numeric(raw, '')` now guards the empty
   unit (the old `slice(0, -0)` would have emptied the string — the guard is needed, not a behaviour change for '원'/'%').
   POA/loan/resign have no radios, so the defaultChecked reset and the radio read path never run for them; file names
   per build equal the single spec's fileBase for them. Hooks are absent → `hooks = {}`, every call optional. No budget
   was raised. Dist HTML diff logged (menu entry only).
3. doc enum on `start`: APPROVED, with the OPS-RUNBOOK line above (Should Fix).
4. In-tool 100억 line: YES, change it — Must Fix above (「100억 원 이상인」; keep the code).
5. Law sentences vs handoff/sources/quote1112/vat-law.txt: all three VERBATIM — 제30조 「부가가치세의 세율은 10퍼센트로
   한다.」 (note:5,56 and tools.ts FAQ 「10%(부가가치세법 제30조)」), 제29조③ substring 「재화 또는 용역을 공급받는 자로부터
   받는 금전적 가치 있는 모든 것을 포함하되, 부가가치세는 포함하지 아니한다.」 (note:9,57), 제32조① lead (note:13,64),
   each with retrieved 2026-11-12. Our rounding is stated as our method, not as law. Only the 홈택스 clause (Should Fix)
   goes beyond the source.

## Escalate to Architect
- None blocking. Brief Q5 and its failure table disagree with each other (「over 10 digits」/「넘는」 vs 「100억 or more」);
  the code follows the stricter one, and the Must Fix makes the copy match. Arch may want to correct the brief wording
  in the archive.

## Cleared
VAT math (별도 floor(supply/10), 포함 tax floor(line/11) + supply = line − tax, 없음 0 with empty tax cells, BigInt
floor of q×p/100, row compaction, pair problem, totals = sums), quantity/amount/choice normalizers, the seal path
(sniffed PNG/JPG, 2 MB cap, canvas re-encode to ≤600 px PNG, transferred to the worker and re-checked there, never sent
off the device or stored; hand-off read once and removed), affiliate groups on the result screen only, /quotation/
runtime-cached with precache 411.9 / 422.3 KB of 450, own budgets for qt with POA/loan/resign unchanged, and the
radio/stale/reset wiring were reviewed and pass apart from the one copy line above.
