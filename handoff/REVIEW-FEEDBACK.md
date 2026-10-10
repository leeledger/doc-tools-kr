# Review Feedback — TOOL-GUIDES Part A + B
Date: 2026-10-10
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/content/guides/jpg-to-pdf.md:87-88 (confidence: 6/10) — Steps 2-3 say 「인쇄」를 눌러요 and 프린터 자리에서 「PDF로 저장」. Neither step has a stored quote. The stored quotes stop at 「공유를 탭합니다」 and jump to 「PDF로 저장을 탭합니다」. I fetched the Google page myself and it does say 「인쇄 를 탭합니다」 and 「상단에서 프린터를 선택합니다」, so the steps are true. They are just not covered by check:quotes, and bar 1 says "each step backed by a quoted official source". Fix: add one sources[] entry with the verbatim 인쇄/프린터 sentence (check it passes --exact), or drop "프린터 자리에서". Not blocking because the source does support the text.
- src/content/guides/remove-background.md:63 (confidence: 5/10) — 「테두리가 나타나면」 is not in a stored quote. The Apple page does say 「대상체 주위에 테두리가 나타날 경우」 (fetched). Same fix if you want full coverage. Optional.

## Escalate to Architect
- Link-graph rule vs Part B (Bob's deviation 1). Before: every guide needed an in-link from another guide or a hub. Now `requires` guides are exempt from that rule and must instead be linked from their tool page (postbuild.test.ts:1186-1189). The brief forbids any always-shown guide from linking remove-background, so the old rule could not be met without a conditional hub/guide link. I recommend accepting the change. It is narrow: it only applies to guides with `requires`, and it still asserts a real in-link. Arch to confirm, because it changes an existing G2 A1 rule.
- jpg-to-pdf.related has a 4th slug, pdf-to-jpg (Bob's deviation 2). It stays within the max of 4, the topic is relevant, and it keeps pdf-to-jpg from having no guide linking to it. I recommend accepting.

## Cleared
I reviewed the six guides, the eight reverse related edits, the what-is-hwpx sentence, the pins, and the Part B gating code and tests. Everything passed:
- check:quotes ran clean: 178 quotes verbatim.
- Every 안 될 때 message matches the real copy of its tool, word for word, including templated messages. HWP sizes use MB_DEC consistently with toolFacts.
- Every UI label and behaviour the guides mention exists in the source. Checked: ZIP only for 2+ pages, 오른쪽 90°, 화살표 키, 누끼.png, 원본과 비교.
- No guide FAQ repeats or paraphrases its tool FAQ in tools.ts.
- The Hancom save-as steps and the 97-format warning match the fetched help page. The 파일 형식 label is on that page too.
- The passport line reflects its quote without overstating it.
- The BG guide makes no claim about where photos are processed. Its 안 될 때 lines hold in both cloud and device mode.
- isVisibleGuide gates every consumer: getCollection('guides') is only called in guides.ts. guideProblems blocks remove-background in tools, cta and related unless the guide has `requires`.
- LOCAL_SCOPE_RE now leaves only guide/remove-background/ unmatched. Other guides and a look-alike slug still match.
- Meta lengths: descriptions are 69-76 characters, titles 20-28 before the suffix.
- Copy is 해요체 and follows the COPY.md words (쪽 그림, 빼기, 돌리기, 그림).
- guides-schema, bgcloud and meta-length tests pass (97/97).
