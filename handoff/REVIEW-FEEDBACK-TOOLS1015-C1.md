# Review Feedback — TOOLS1015 C1 (/char-count/ 글자수 세기)
Date: 2026-10-15
Reviewed: origin/main..2cee9c8 only
Verdict: CHANGES REQUIRED
Ready for Builder: NO

## Must Fix
- src/tools/char-count/count.ts:46 (confidence: 10/10) — The fast path miscounts every character outside the BMP. `SIMPLE_RE` has the `u` flag, so `\ud800-\udfff` in the class matches only *lone* surrogates; a paired code point such as U+1F600 is one code point outside that range, so the line passes `SIMPLE_RE` and is then counted with `line.length` (UTF-16 units). Verified in Node 22 with the shipped file:
  `"😀"` → 공백 포함 2 (Segmenter 1), `"안녕😀"` → 4 (3), `"👍🏻"` → 4 (1), `"🇰🇷"` → 4 (1), `"𠀀"` (CJK Ext. B) → 2 (1). 공백 제외 is wrong by the same amount. Only a ZWJ sequence takes the segmenter path (ZWJ is excluded), which is why the unit and e2e tests (family emoji only) pass. A single emoji in a 자소서 overstates 공백 포함/제외 and the goal bar.
  Also: a BMP brute force (each code point next to `a`, `가`, `ก`) finds 16 code points where the fast path ≠ Segmenter, all non-`\p{M}` grapheme joiners: Prepend U+0600–0605, 06DD, 070F, 0890–0891, 08E2, 0D4E; SpacingMark Lo U+0E33, 0EB3 (so the review-request claim "Thai spacing marks are \p{M}" is not true for SARA AM); Extend Lm U+FF9E–FF9F (halfwidth katakana sound marks).
  Fix: exclude astral code points and those BMP joiners from the fast path, e.g.
  `/^[^\p{M}‌‍︀-️ᄀ-ᇿꥠ-꥿ힰ-퟿ㅤﾠ؀-؅۝܏࢐࢑࣢ൎำຳﾞﾟ\ud800-\udfff\u{10000}-\u{10ffff}]*$/u`
  (checked: 0 BMP mismatches, single emoji / skin tone / flag / lone surrogate equal to Segmenter, 100k perf fixture 8.7 ms). Fix the doc comment at count.ts:41-44 to match.
- tests/unit/char-count.test.ts (confidence: 9/10) — No test exercises a non-ZWJ astral character with the segmenter, so the bug above is invisible. Add: (a) `count(s, seg).withSpace === [...seg.segment(s)].length` for '😀', '안녕😀', '👍🏻', '🇰🇷', '𠀀', 'กำ', 'ｶﾞ'; (b) a brute-force guard: for every BMP code point cp (minus surrogates, \r, \n) and the strings `'a'+ch`, `ch+'a'`, `'가'+ch`, assert count() equals a pure-segmenter count (runs in well under a second). This pins "fast path ≡ Segmenter" against the runtime ICU.

## Should Fix
- tests/e2e/char-count.spec.ts:51 (confidence: 7/10) — the six-numbers fixture should include one plain emoji (e.g. '😀') so the browser path (Segmenter present in all 5 projects) is checked too, not only Node.
- src/tools/char-count/controller.ts:81 (confidence: 5/10, verify) — the first render() at load (line 158) can announce 「목표보다 …」 if the browser restores both text and goal on back/forward. Harmless; seed `wasOver` from the first render without announcing if you want silence on load.

## Escalate to Architect
- none.

## Builder deviations
1. Copy changed for the zero-new-core-glyph rule (줘, 썼, 탭, 뺍, 던, 바뀝): accepted. Meaning kept, lengths within rules, wording plain; 「목표까지 남은 글자 수도 보여요」 is clearer than the brief's 「남은 양」.
2. work24-resume-upload is a draft: accepted. Chain list and NEXT_GUIDES filter drafts; the inbound body link is owed when that guide is published — keep it in Known Gaps (logged).
3. No tool-facts entry: accepted; the page quotes no limit.
4. char-count last in TOOLS: accepted. It is a new group, so appending is the "no invented order" choice; HOME_DESC_ORDER follows decision 3 (after pdf-sign until id-copy exists, test pinned).

## Cleared
Everything else in the diff passed: CRLF/CR normalize, 2-byte rule per code point and UTF-8 rule (= TextEncoder incl. lone surrogate; byte3 ≥ byte2 always, so the FAQ's 「큰 쪽 숫자」 advice holds), lines/paragraphs per the brief's literal reading ("abc\n" = 2 is fine), code-point fallback; no storage and no network of the text (beforeunload only while non-empty, removed when empty; check-dist guards Web Storage/IndexedDB); copy names no site's byte rule, no UTF-8/EUC-KR, no jargon, 문서딱 only, 「보내지 않습니다」 only beside the textarea and in FAQ; title/description/FAQ consistent with JSON-LD (built from tools.ts); usage sends only pick / start o=basis (whitelisted COUNT_BASES with Korean labels) / next v=id-photo — never text, counts or goal; NOT_PRECACHED + RUNTIME_PAGES, LOCAL_SCOPE_RE, budgets, lighthouserc, qa:visual list; a11y (labels, fieldset/legend, aria-describedby, progress labelled, polite live region on crossing only). CLAUDE.md change is one tool name on line 3 — appropriate and minimal; COPY.md term line is appropriate. vitest char-count + usage: 203 passed.
