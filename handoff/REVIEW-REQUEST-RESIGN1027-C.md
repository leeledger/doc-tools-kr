# Review Request — RESIGN1027 Step C (/guide/resignation-letter/ 사직서 쓰는 법)
Date: 2026-10-27
Ready for Review: YES
Status: DONE

## Files Changed
- src/content/guides/resignation-letter.md (new) — the guide 「사직서 쓰는 법: 들어갈 내용, 날짜, 퇴직 사유」, topic 취업·이력서, rendered body 3,330 (guide-length). H2s per R15: 사직서가 하는 일 (660 heading + ①, R8 line, 1350 paraphrased, 고용24 link) · 사직서에 적는 내용 (our form's parts, "법이 꼭 이렇게 쓰라고 정한 목록이 아니라") · 퇴사 날짜 정하기 (근로계약서·취업규칙 first; 660 ② with its heading; 661) · 퇴직 사유 쓰기 (7 presets, 권고사직, 58조 heading + lead + 2호 가·나·다, "직업안정기관의 장이 인정") · 퇴사 뒤 정산 (근로기준법 36 + 단서) · 내는 방법 (/pdf-sign/, /stamp-maker/) · 빈 양식으로 손으로 쓰기. 13 sources (12 law.go.kr verbatim, 1350 audit trail only), FAQ ×4 (not from tools.ts), toolFacts reason 3 / 100.
- public/img/guide/resignation-letter/1-form-shot.webp (new, 720×560, 12.9 KB) — guide-shots: 「일한 기간과 이유」 with the e2e sample, fixed dates, the 이직 chip pressed.
- public/img/guide/resignation-letter/2-letter-parts.svg (new, 640×560) — the 사직서's parts labelled (제목 · 인적 사항 · 재직 사항 · 사직 사유 · 날짜 · 서명 · 받는 사람, plus the 사직 sentence); no numbers, no timeline.
- scripts/guide-shots.mjs:80-93 — the new shot (other shots re-run byte-identical).
- scripts/check-dist.mjs:1108-1119 — guide block: R8 line, 1350 + 고용24 pointers, no 실업급여/법적 효력/공식·법정 서식 claim.
- src/data/tool-guide-order.ts:29-30 — TOOL_GUIDE_PINS resignation-letter → its guide.
- src/data/guides.ts:64,85 — NEXT_GUIDES resignation-letter: pdf-sign, stamp-image, e-signature-law (tool page 관련 안내 = own guide + these 3).
- src/content/guides/loan-note.md:154, power-of-attorney.md:133 — one inbound sentence each (updated → 2026-10-27); src/content/tool-notes/resignation-letter.md:46 — note → guide.
- scripts/lib/guide-titles.mjs (regenerated), lighthouserc.json:51.
- tests/unit/resignation-letter.test.ts:244-293 — each source quote is in its saved excerpt (handoff/sources/resign1027) and, for law.go.kr, in the body as 「…」; 1350 quote not rendered; 660 ② paragraph names the heading; no day/month count outside quotes; pins + 3 inbound links.
- tests/unit/guide-check.test.ts:108, guides-schema.test.ts:418-420 — the new webp size; resignation-letter OWN_COUNT 1.

## Open Questions
- Please check each law sentence against the excerpts (R8), especially: 「「전항의 경우」는 위에 옮긴 제1항, 곧 고용기간의 약정이 없는 때를 말해요.」, the 제3항 pointer (「같은 조에는 제3항이 이어지니 조문 전체를 함께 읽어 보세요」 — ③ is not quoted, as R8 lists only ①②), and 「고용기간을 정해 두고 일하는 경우를 다루는 조문으로는 민법 제661조가 있어요」.
- 1350 is paraphrased (「국번 없이 1350번 … 평일 09:00부터 18:00까지 받는 유료 전화」): postbuild Growth T9 forbids rendering a non-statute quote verbatim on a guide (only law.go.kr is exempt).
- Topic 취업·이력서 (loan-note/POA use 세금·민원); say if 사직서 belongs elsewhere.
- NEXT_GUIDES choice (pdf-sign, stamp-image, e-signature-law) is mine (signing what you hand in).

## Gates
- npm run check 0 errors / 0 warnings
- vitest full: 2320 passed, 2 failed under full-suite load → postbuild Growth T9 (fixed: 1350 paraphrase) and postbuild 「usage statistics」 (120 s timeout; alone at the default timeout it passes, 111 s — host speed, untouched code); after the fix postbuild 77/77, resignation-letter 23/23, guides-schema + guide-check + visits green
- build (PUBLIC_SITE_URL=https://docttak.com): check-dist OK; guide length 49 guides+hubs ≥ 2,500 (this one 3,330), tools ≥ 2,000; preload 92.1 / 92.66 KB, late-800 7.9 / 8 KB, core 615 / late 82 glyphs (unchanged); precache 385.4 / 450 KB (unchanged); guide HTML 9.3 / 30 KB gz
- check:quotes --exact: all 13 quotes of this guide verbatim; the run's 18 problems are pre-existing and elsewhere (17 × jlpt.or.kr unreachable, 1 × Apple pdf-split NOT VERBATIM)
- e2e chromium, 1 worker: growth + hubs + site + resignation-letter 152/152
- Not run: production-flag build, other 4 browsers, LHCI (CI / Deploy B)

## Out of Scope (logged in BUILD-LOG)
- jlpt.or.kr unreachable and the Apple pdf-split quote no longer verbatim (source-watch).
- Merge order: CARD1026 D (/guide/qr-code/) is not in this base; guides-schema partial/OWN_COUNT, guide-titles, guide-check, lighthouserc and tool-guide-order will need a trivial union on merge.
