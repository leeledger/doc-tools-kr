# Review Request — ROMANIZE1016 R4 (guide 「여권 영문 이름 정하는 법」, deploy B)
Date: 2026-10-16
Ready for Review: YES
Status: DONE
Branch: romanize-1016 (worktree wt/romanize-1016), on top of deploy A (f3e423b). Not pushed.

## Files Changed
- src/content/guides/passport-english-name.md (new): the guide.
  - Frontmatter: 16 sources, 5 FAQ, cta /english-name/.
  - Body sections follow D10. The surname table holds 20 rows and is generated from mofa.ts.
- src/data/tool-guide-order.ts:23-24: the english-name page pins this guide first in its 관련 안내.
- src/data/guides.ts:79: NEXT_GUIDES for english-name starts with passport-english-name.
- src/data/tools.ts:722-727: english-name FAQ 4 links to the guide, then to 외교부 menuPos=39.
- src/pages/english-name/index.astro:29: the 「여권을 만든다면」 list starts with the guide.
- src/content/guides/intl-driving-license.md, passport-reissue-photo.md: one inbound sentence each (required by the orphan check).
- scripts/check-dist.mjs (block after the english-name block): every N% in the guide is either a 비율 from mofa.ts or a figure in the guide's own source quote. The block also bans two phrases.
- scripts/lib/guide-titles.mjs: regenerated.
- lighthouserc.json: guide URL added.
- tests:
  - unit/english-name-data.test.ts: table equals SURNAMES.
  - unit/guides-schema.test.ts: english-name added to the partial list with OWN_COUNT 1.
  - e2e/english-name.spec.ts: guide test (h1, 20 rows, both link directions).

## Gates
| Gate | Result |
|---|---|
| astro check | 0 / 0 |
| vitest | 1,897 passed |
| check:quotes --exact | 281 verbatim |
| check-dist (default) | OK |
| Similarity max | 0.231 (unchanged) |
| New core glyphs | 0 |
| Chromium e2e (english-name, growth, site, hubs, polish) | 194 passed / 1 skipped |
| LHCI guide LCP median | 1,679 ms (limit 2,000) |
| LHCI scores | performance 0.96-1; a11y, best practices, SEO 1 |

## Open Questions
1. The guide lists all 11 reasons from 시행령 제3조의2 제2항 in plain words.
   - Reasons 9-10 are backed by the law.go.kr quote.
   - Reasons 1-8 and the A/I/O/U example are backed by menuPos=39 quotes.
   - Is this coverage enough, or should each reason carry its own quote?
2. The N% check allows a percentage that appears in one of the guide's own quotes (50% from the 고시 rule) besides mofa.ts. Is that acceptable?
3. category is 서류 (not 사진). Please confirm the topic placement 여권·신분증.

## Out of Scope
- Post-deploy: Naver collection request and IndexNow for /guide/passport-english-name/.
