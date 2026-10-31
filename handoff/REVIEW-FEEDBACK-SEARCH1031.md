# Review Feedback — SEARCH1031 (사이트 찾기, 유사어 허용)
Date: 2026-10-31
Ready for Builder: NO

Reviewed commit 4f5441f on main 54a080e. I rebuilt it in place (default env): check-dist OK, precache 408.8 KB / 450, index 22.0 KB raw and 6.1 KB gzip, module 5.3 KB gzip, site script 1.8 KB gzip. The default dist names no remove-background in search-index.json or in the ui-* chunks. /search/ is noindex. search-match and network-guard pass 72/72, and search.spec on chromium (E2E_PORT=4373) passes 19/19. I ran about 140 loose, synonym, typo and 초성 queries through `search(INDEX, q, ALL_ON)`; the table is at the end of this file.

## Must Fix
- src/lib/search/ui.ts:168-172 together with match.ts:181-183 and hangul.ts:94-95 (confidence: 9). **Mid-word Korean typing shows 「찾지 못했어요」 and the 많이 찾는 도구 list.**
  - The handler is `input.addEventListener('input', () => { syncHash(); ensure(); render(); });`. It renders on every IME composition step. The last word is only half-typed at that point, and fuzzy matching is off below 6 jamo (`return n < 6 ? 0 : …`).
  - Measured in Chromium with CDP `Input.imeSetComposition` on the home box. Typing 사진 gives 사 → `샂` → `사지` → 사진. At 샂 and 사지 the none line is visible (`none=true`), the live region announces 「「샂」에 맞는 도구를 찾지 못했어요…」, and the first option jumps to PDF 합치기.
  - The matcher alone fails the same way on 사ㅈ, 사지, 증며, 증명ㅅ, 압ㅊ, 압추, 한그, 배겨, 누ㄲ, 큐아, 도자, 서며 and 싸이. Nearly every two-syllable word passes through such a state. The owner's first try on a phone will flash a failure message, the opposite of 「엄격하게 하지말고」. The e2e misses it because `fill()` never composes.
  - Fix, in the matcher: let the **last** token also match when its jamo string is a **prefix** of a term's jamo (name words, keywords, concept terms; at least 2 jamo; for example score it at SCORE.fuzzy). This covers 샂/사지 → 사진…, 증명ㅅ → 증명사진, and 압추 → 압축 (the 압추 typo case you raised). The final 사진 is still not a prefix of 사직서 (ㅅㅏㅈㅣㄴ vs ㅅㅏㅈㅣㄱ), so the negative holds. Add golden cases for the intermediate states, including 「사지 → photo-compress in top 3」 and 「압추 → pdf-compress, photo-compress」.
  - Belt and braces in ui.ts: while `e.isComposing` / between compositionstart and compositionend, do not show the none line or update the live region with a miss. Keep the previous list until the composition ends or a result exists.

## Should Fix
- src/lib/search/match.ts:212 + :235 (confidence: 9). **A typo of a tool's own name loses to the popular tie-break.**
  - `증멍사진` (typo of 증명사진) puts photo-compress first and id-photo second. Both get `best = wide = SCORE.fuzzy` (id-photo through the idphoto concept, photo-compress through its keyword), so breadth ties and the POPULAR order decides (photo-compress index 2 < id-photo index 3).
  - Fix: when the fuzzy hit comes from a concept term or a name word, rank it above a keyword-only fuzzy hit. Either score concept/name fuzzy above keyword fuzzy (e.g. 30 vs 20), or tie-break by smaller jamo distance. Add 증멍사진 → id-photo top-1 to the golden table.
- src/lib/search/ui.ts:185-190 (confidence: 8). **Enter on a miss or an empty box navigates.**
  - The code is `go(options[active] ?? options[0])`. On a miss or an empty query, options holds only the 많이 찾는 도구 group, so 「엑셀」 + Enter (or Enter in an empty /search/ box) lands on PDF 합치기 without the user choosing it.
  - Fix: with no active option, take options[0] only when the result has tools or guides. Otherwise do nothing (the list stays open). One e2e line.
- Choseong on Latin names (confidence: 6, verify the wanted behaviour). `ㅍㄷㅍ` returns none, because the PDF/JPG/QR names are Latin and their alias variants (피디에프) are not in `cho`. Cheap fix: add `choseong(variant)` for each alias whose key appears in the name/keywords. 피디에프 → ㅍㄷㅇㅍ, so ㅍㄷㅍ would still miss. Low value; log it if you skip it.
- synonyms.ts:161 (confidence: 6). `돈 빌려` / `돈 빌려준` returns none. Add 빌려, 빌린, 빌려준 and 돈거래 to the loan concept. The cost is trivial.

## D8 tie-breaks (focus 2)
Acceptable. The order is coverage → score → breadth → 많이 찾는 도구 order → name, and only after coverage and score as D8 requires. Breadth is the more-fields-hit signal, and POPULAR only splits exact ties. 「pdf」 and 「hwpx」 now read right. The one bad case is the fuzzy tie above (증멍사진), which the Should Fix covers.

## Checked and fine
- **Relevance:** the following are top-1 and correct: 피디에프 합치기, 병합, 붙이기, pdf 병합, 한글pdf / 한글 pdf (→ hwp-to-pdf), 큐알, 큐알코드 만들기, 증명사진, 여권샤진, 사진 줄이기, 사진 크기, 이미지 줄이기, 용량 (pdf-compress, photo-compress), 합치가, pdf합치가, pdf 용량 줄이가, ㅎㅊㄱ, ㄷㅈ, 퇴사, 한글 낮은 버전, 바이트, 주민등록증 사본. 「사진」 keeps resignation-letter out of the top 6. 디자인 does not fold 사인.
- **Flags:** in the default build, neither search-index.json nor the ui chunks contain remove-background, and the bg concept has an empty tool list. check-dist asserts the index and the module for both flag states.
- **Privacy:** the input has no name. The one fetch is the fixed `/search-index.json` with `credentials: 'same-origin'`. The network-guard pin test is correct. The query lives only in `#q=`, set by replaceState. check-dist bans beacon, storage and gtag in the module closure, and the cloud spec covers GA and usage.
- **Lazy:** the boot listens only to focusin and pointerdown. A page with no interaction requests neither the module nor the index (e2e line 36). The module is not precached.
- **Combobox:** role=combobox, aria-controls, aria-activedescendant and grouped options all match ARIA 1.2. The first Esc closes the list and the second closes the panel, returning focus to the button (defaultPrevented hand-off). Focusout and outside-click close it, and axe is clean in light and dark. `div role=search` in the header is the right call given check-dist's no-form rule on /qr-code/ and /business-card/.
- **Copy and brand:** plain Korean, 문서딱. /search/ has no ads and no sponsored links, and it is absent from sitemap, llms.txt and RSS (check-dist).
- **QR1031 (#44) overlap:** `git merge-tree 4f5441f qr1031` conflicts only in handoff/BUILD-LOG.md. scripts/check-dist.mjs auto-merges.

## Escalate to Architect
- **Home placement at 360 px (focus 7).** D1(b) locks the box after `.lead`. At 360 px, .lead (the full live-tools sentence) pushes the box to the bottom of the first screen, so results open below the fold and under the keyboard. The smallest change is to move `<SiteSearch id="home" variant="page" />` from after `.lead` to right after the `<h1>`, in src/pages/index.astro:45. It is static markup, so there is no CLS and no ad or affiliate impact. The other option is to shorten .lead. Moving the box changes a locked decision and the hero's first-screen copy order, so it is Arch's call, not mine.

## Cleared
Not cleared yet. The engine, privacy, lazy-loading, flag handling, budgets and a11y are sound. One Must Fix remains: the 「찾지 못했어요」 flash during Korean IME composition.

## Appendix — probe results (tools, top 6)
- 한글 / hwp → hwp-viewer, hwp-to-pdf, hwpx-to-hwp, resignation-letter, english-name, power-of-attorney. The tail comes from keyword hits on 한글 양식; tolerable.
- ㅍㄷㅍ, 압추, 엑셀, word → none + popular.
- 여권 → id-photo, english-name, id-photo-camera, remove-background.
