# Review Feedback — RESIGN1027 Step B (/resignation-letter/)
Date: 2026-10-27
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- scripts/check-dist.mjs:1063 (confidence: 9/10) — `{ slug: 'resignation-letter', prefix: 'rs', initialKb: 13.2, lazyKb: 9.4 }` is looser than the 12.8 / 8.4 that POA and loan-note use for the same generic code (measured rs 11.0 / 7.8; loan 11.0 / 7.9, POA 11.0 / 7.6, BUILD-LOG 4539-4540). Measured + 20 % (C14) was written for new code. This is the same shared engine, so a looser rs limit only lets the rs entry grow without anyone noticing. Decision: use the shared 12.8 / 8.4 (both pass today). Update the comment and the BUILD-LOG line to match.
- src/content/tool-notes/resignation-letter.md:62 (confidence: 6/10) — 「다목 고용노동부령으로 「정하는 정당한 …」」: the source reads 「다. 그 밖에 고용노동부령 으로 정하는 …」 (goyongboheom.txt:6). The words inside the quote are verbatim and pass. The paraphrase outside it drops 「그 밖에」, and that word marks 다목 as a catch-all. Optional: write 「다목 그 밖에 고용노동부령으로 「정하는 …」」. Do it only if check:quotes stays 7/7. It does not block.

## Escalate to Architect
None.

## Cleared
- Law quotes: all 7 note quotes are verbatim substrings of handoff/sources/resign1027/goyongboheom.txt:6 and moel-1350.txt:5, both dated 2026-10-27. The 58조 lead leaves out 「제40조 에도 불구하고」, which is fine. The heading, 2호, 가·나·다 and 「국번없이 1350(유료) (이용시간 : 평일 09:00 ~ 18:00)」 all match.
- 「조문의 말 그대로, 각 호에 해당하는지는 직업안정기관의 장이 인정합니다.」 restates the lead accurately (「…해당한다고 직업안정기관의 장이 인정하는 경우」). It reads as what the law says, not as advice, so it can stay.
- No 실업급여 claim, no date or amount computed, and no advice on which reason to give. The note says so outright (「이 페이지는 어떤 이유를 쓰라고 권하지 않습니다」). check-dist bans the claim strings on the page. The FAQ 권고사직 answer is the preset plus the R8 pointer, as R6 asks.
- FAQ 「PDF는 휴대폰과 PC 어디서나 열 수 있습니다」: R7 explicitly allows "PDF opens anywhere" and makes no claim about Word. Keep it.
- Plain language and brand: 0 hits for 업로드/서버/브라우저/네트워크/EXIF/dpi/독딱/안올림/Docttak in the page, the note, src/tools/resignation-letter or the tools.ts entry. 문서딱 is in the title.
- Title 「사직서 만들기 — 사직서 양식 무료, HWP·PDF 저장 | 문서딱」: this is the R4 shape, cut for meta length, which is allowed.
- Registration matches loan-note: tools.ts, og.json, HOME_DESC_ORDER, tool-facts (reason 3 / 100 come from the spec), next-steps FLOW, usage TOOLS / DOWNLOAD_SETTING / label / FormToolId / sanitizer, bgcloud LOCAL_SCOPE_RE, lighthouserc, qa:visual and COPY.md. COPY.md chips match the spec.
- Runtime cache: /resignation-letter/ is in both gen-sw NOT_PRECACHED and sw.ts RUNTIME_PAGES. Precache is 393.1 / 450 KB.
- Reverse links: the loan-note, POA and stamp-maker pages changed only in their RelatedTools `only` arrays.
- FormTool aria-describedby: it applies only to text fields with a hint. The one other hint, loan-note `rate`, is kind number, so POA and loan HTML are unaffected.
- The e2e chip-before-load test is valid. The route is installed before goto and the controller chunk is held. The test checks data-state empty, exactly one extra input event, focus and caret at the end. The PDF built after release carries the fill.
