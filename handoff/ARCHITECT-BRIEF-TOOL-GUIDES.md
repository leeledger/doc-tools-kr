# Architect Brief — TOOL-GUIDES (2026-10-10)

## Goal
Every live tool gets its own on-site how-to guide aimed at a long-tail query the tool page does not already own, so each tool can rank on its own (owner's blog team: tool-name keywords do not surface the site; Naver dominates).

## Coverage (checked: src/content/guides/, 36 files)
Already covered: pdf-merge, pdf-compress, pdf-password, hwp-to-pdf, hwp-viewer (open-hwp-without-hangul, hwp-on-phone), image-to-jpg (heic-to-jpg), photo-compress (photo-kb, kakao-photo), id-photo (many), stamp-signature (stamp-image).
Missing, this step. Guide slug = tool slug (same convention as pdf-merge / pdf-compress / pdf-password / hwp-to-pdf):

| Slug | Primary query (search_demand.md, Naver monthly) | Working title (+ suffix ≤40) | topic | category | Tool head term NOT to reuse |
|---|---|---|---|---|---|
| jpg-to-pdf | 아이폰 사진 pdf 변환 (autocomplete; 사진 pdf 변환 7,210, 62% mobile) | 아이폰·갤럭시 사진 PDF로 만드는 법 | PDF·메일 | PDF | 사진 PDF 변환 |
| pdf-to-jpg | pdf jpg 변환 (20,790, 82% PC); long tail 휴대폰 / 한 쪽만 | PDF를 JPG 사진으로 바꾸는 법 (휴대폰·PC) | PDF·메일 | PDF | PDF JPG 변환 - 쪽마다 |
| pdf-split | pdf 페이지 삭제 (1,910; cluster 분할 3,900 / 회전 1,200 / 추출 480) | PDF 페이지 삭제·추출·회전하는 법 | PDF·메일 | PDF | PDF 분할 (tool title leads with it) |
| pdf-sign | pdf 서명 넣기 (630; 전자서명 만들기 5,370 context) | PDF에 서명·도장 넣는 법 (휴대폰·PC) | 서명·도장 | 서류 | PDF 서명 넣기 |
| hwpx-to-hwp | hwpx hwp 변환 (15,170, 90% PC) | HWPX 파일 HWP로 바꾸는 법 (한글 없이) | 한글파일 | 한글파일 | (what-is-hwpx owns "hwpx 열기") |
| remove-background (Part B) | 누끼따기 사이트 (25,900; 누끼 cluster ~5.5만, ~50/50) | 누끼 따기 쉽게 하는 법 — 사진 배경 지우기 | 사진 보내기 | 사진 | 사진 배경 지우기·누끼 따기 무료 |

Bob may reword titles. Rules: query words in the title; title differs from the tool page title; lengths enforced by schema. Counts are next-t (Naver ad API relay, 2026-10-06), not verified on Naver directly: ordering only, never on the page.

**hwpx-to-hwp decision: publish.** Largest demand in this set after 누끼; what-is-hwpx targets a different query (hwpx 열기). Duplicate guard: its Hancom save-as section must not repeat what-is-hwpx "저장 형식을 바꾸는 법" (Hancom FAQ 2784). Either ONE NEW official Hancom source (help/FAQ page other than faq 2784 and tech.hancom.com/hwpxformat) with a verbatim quote, or that section is one sentence linking /guide/what-is-hwpx/. Add one sentence in what-is-hwpx "저장 형식을 바꾸는 법" linking the new guide; no other change to that guide.

## Content contract (every guide, both parts)
- Repo guide rules unchanged: answer-first (answer = one sentence ending 다/요), 해요체, COPY.md plain words, no invented facts. Every external number/claim = a sources[] entry with a verbatim quote passing npm run check:quotes. Our own limits only via toolFacts refs that exist: jpg-to-pdf.maxImages.*, .maxFileMb.*, .maxTotalMb.*; pdf-to-jpg.maxFileMb.*, .maxPages.*, .maxPagesSharp.mobile; pdf-split.maxFileMb.*, .maxParts.*; pdf-sign.maxFileMb.*. A number with no ref and no quote is deleted, not softened.
- Anti-thin bar (Google scaled-content policy). To publish, a guide needs ALL of:
  1. At least one H2 that is NOT our tool: a device/app built-in method or an official limit, each step backed by a quoted official source (Apple 지원 / iPhone 사용 설명서 ko-kr, Samsung 한국 지원, Google 고객센터, Microsoft 지원 ko-kr, Adobe helpx kr, Hancom FAQ/help, 정부24/홈택스/국민신문고 limits: reuse the exact url+quote already in gov24-upload-limit / hometax-upload-limit / epeople-upload-limit / email-attachment-limit where relevant).
  2. An "안 될 때" H2 built from our tool's REAL error/notice messages (grep the controller/limits wording; describe, do not invent failure cases).
  3. A when-not-to-use ("다른 방법이 나을 때") H2. Examples: pdf-sign: picture signature vs 공동인증서, link /guide/e-signature-law/, do not restate its law quotes. remove-background: 여권사진, reuse the passport.go.kr "제출 불가한 사진파일" source the tool FAQ already links. pdf-to-jpg: text becomes a picture (stated as our product behaviour only).
  4. FAQ 3-6 entries not copied or paraphrased from the tool's own faq in tools.ts.
- Draft-if-unsourced: if a guide cannot meet bar 1 with a fetched verbatim quote, ship it as a draft (draftGuideSchema: blockedBy + tried[] with every URL tried and the verbatim failure). Never publish a thin version. Report which drafted.
- Suggested official sources (UNVERIFIED, Bob fetches; a page without the quote is dropped, never paraphrased): iPhone 파일 앱 "PDF 생성" / 사진 앱 프린트 to PDF; iPhone 마크업 서명; iPhone 사진 피사체 분리; Samsung 갤러리 PDF / 이미지 클리퍼; Chrome/Android "PDF로 저장"; Windows "Microsoft Print to PDF"; Adobe Acrobat Reader "채우기 및 서명"; Hancom 한글 "다른 이름으로 저장" to HWP. Script-shell pages: via: browser.
- cta.href: plain tool path (these tools take no deep-link params; parseHref rejects queries). cta.label ≤30.
- tools: own tool first; pdf-sign also stamp-signature. Add another tool only if the body really uses it (it puts the guide on that tool's 관련 안내).
- related (2-4, published only): jpg-to-pdf [heic-to-jpg, pdf-compress, univ-docs-upload]; pdf-to-jpg [photo-kb, pdf-split, email-attachment-limit]; pdf-split [pdf-merge, pdf-compress, email-attachment-limit]; pdf-sign [e-signature-law, stamp-image, pdf-password]; hwpx-to-hwp [what-is-hwpx, open-hwp-without-hangul, hwp-to-pdf]; remove-background [stamp-image, id-photo-size, photo-kb].
- og: title ≤14, line 4-34. published/updated = KST day written; retrieved = fetch day.

## Placement (decided)
- Tool page 관련 안내: src/data/tool-guide-order.ts TOOL_GUIDE_PINS add jpg-to-pdf, pdf-to-jpg, pdf-split, pdf-sign, hwpx-to-hwp (each pinned to its own guide); Part B adds remove-background. NEXT_GUIDES (src/data/guides.ts) unchanged; own guide dedupes, max 4 holds.
- Reverse links (existing guides' related, stay ≤4): stamp-image +pdf-sign; e-signature-law +pdf-sign; what-is-hwpx +hwpx-to-hwp; hwp-on-phone +hwpx-to-hwp; open-hwp-without-hangul +hwpx-to-hwp; heic-to-jpg +jpg-to-pdf; univ-docs-upload +jpg-to-pdf; email-attachment-limit +pdf-split. NO existing guide lists remove-background (Part B flag rule).
- /guide/ index: automatic via topic. Sitemap, RSS, llms.txt, OG image: automatic via publishedGuides; verify, do not hand-add.
- Home 자주 찾는 안내: unchanged (6 demand-ordered slots; home already links every tool). Known Gap / owner option: swap admission-photo for the remove-background guide after Part B ships (product surface, owner decides).
- Hubs (photo-sizes, upload-limits): unchanged; add a spec row only if a guide tabulates an upload limit (with source).

## Part A: five guides (commit 1)
1. Research + write src/content/guides/{jpg-to-pdf,pdf-to-jpg,pdf-split,pdf-sign,hwpx-to-hwp}.md per contract.
2. TOOL_GUIDE_PINS (5); reverse related edits; what-is-hwpx link sentence.
3. Regenerate anything derived from guide titles/copy (SEO-LENGTH log names guide-titles.mjs; run gen-ui-font / gen-brand as the build requires). check-dist budgets green; report precache and core-font deltas.
4. Update hard-coded guide counts/slug lists in tests if any (grep tests).
- Flag: do not touch tool pages, tools.ts copy, deeplink.ts, home.

## Part B: remove-background guide behind the release flag (commit 2; droppable without blocking A)
Problem: the BG tool exists only with PUBLIC_BG_REMOVE=1 (live: https://docttak.com/remove-background/ returns 200). CI dist / dist-noauto builds and vitest (__BG_REMOVE__ false in vitest.config) are flag-off; guideProblems() checks tools/cta against LIVE_TOOLS, so a plain BG guide breaks every flag-off build, and check-dist forbids any BG file/link/line flag-off. Cloud build: scripts/lib/bgcloud.mjs LOCAL_SCOPE_RE exempts ALL guide/*/index.html from the send-claim scan, which is wrong for this guide.

    guide .md --zod--> requires? --none--> tools/cta within LIVE_TOOLS (unchanged)
                          | bg-remove
                          v
                 tools/cta within LIVE + {remove-background}
                          |
    publishedGuides(): requires == bg-remove AND NOT __BG_REMOVE__  -> excluded
       +- flag off: no page, no sitemap/RSS/llms/OG/index/관련 안내 entry -> check-dist flag-off stays green
       +- flag on : rendered like any guide; cloud build: page IS scanned by the bgcloud claim check

1. guide-schema.ts: optional requires: z.literal("bg-remove") on published (and draft) schema. guideProblems: allowed slugs = LIVE + (requires ? remove-background : nothing), same set for parseHref. New error: a guide WITHOUT requires that names remove-background in tools/cta/related or links /remove-background/ or /guide/remove-background/ in its body -> "needs requires: bg-remove" (body part may live in the unit test).
2. guides.ts: visibility = draft false AND (no requires OR __BG_REMOVE__). Extract a pure isVisible(data, bgOn) for tests. Every consumer (index, [slug] getStaticPaths, sitemap, rss, llms, og, guidesForTool, guidesBySlug) goes through publishedGuides; grep getCollection("guides") and fix any bypass.
3. bgcloud.mjs LOCAL_SCOPE_RE: guide/remove-background/index.html must NOT match (scanned in cloud build). Do NOT add it to EXCEPTION_PAGES (COPY.md line 40: the sending explanation lives only on privacy / terms / tool page). The guide says nothing about where the photo is processed; it links the tool page.
4. Write src/content/guides/remove-background.md with requires: bg-remove, per contract; copy true under BG_CLOUD on and off (no "안 나가요", no sending explanation).
5. TOOL_GUIDE_PINS entry.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| Quotes | Official page changes / blocks fetch | check:quotes non-zero blocks; guide becomes draft with tried[] | nothing (drafts not rendered) |
| Thin content | Guide restates tool page | anti-thin bar; Richard diffs FAQ/sections vs tools.ts | - |
| Cannibalization | Guide and tool page compete on one term | distinct query; title differs from tool title (unit test) | - |
| BG flag off | BG guide breaks build or leaks a link | requires gate; unit tests both flag states; check-dist flag-off | no page, no link |
| BG cloud | Guide implies nothing is sent while cloud sends | LOCAL_SCOPE_RE change + test; neutral copy | tool page / privacy explain |
| related to excluded guide | Silent drop (guidesBySlug only warns) | schema rule: no un-required guide references BG; unit test every related slug is visible flag-off and flag-on | - |
| Number drift | Tool limit constant changes | toolFacts mismatch fails schema | build fails, never wrong copy |
| Budgets | New glyphs grow core font / precache | check-dist on 4 builds | - |

## Test map
- New guides parse publishedGuideSchema (guides-schema.test loop) [TESTED once files exist]
- Title+suffix ≤40, description 40-80, og lengths (schema, meta-length.test, check-dist meta) [TESTED]
- check:quotes exact on new quotes [TESTED by script]
- Each new tool's 관련 안내 starts with its own guide (orderToolGuides with new pins) [GAP: add]
- New guide title differs from its tool's title minus suffix; query differs from tool h1 [GAP: add]
- cta = plain tool path of a live tool (parseHref) [TESTED]
- Part B: requires guide valid with __BG_REMOVE__ false; isVisible(data,false) false, (data,true) true [GAP: add]
- Part B: guide without requires naming remove-background -> error [GAP: add]
- Part B: LOCAL_SCOPE_RE skips guide/remove-background/index.html, still matches other guides [GAP: add, bgcloud unit]
- Part B: flag-off dist has no /guide/remove-background/ nor any line naming it; flag-on dist lists it in sitemap and /guide/ index (check-dist / postbuild test) [GAP: add]
- e2e growth.spec: new guide pages render, CTA reaches the tool, JSON-LD valid, related links resolve [verify the loop covers all guides; GAP if hard-coded]
- Regression: pdf-merge / pdf-compress / id-photo 관련 안내 order unchanged (existing tool-guide-order test) [TESTED]

## Out of Scope
- Tool page copy, home slots, hub tables, new deep-link params, new tools.
- Guides for already-covered tools (image-to-jpg, photo-compress, stamp-signature...).
- Rewording what-is-hwpx beyond one link sentence.
- Off-site/blog content.

## Acceptance
- Part A 5 guides + Part B 1 guide published, or drafted with tried[]; report which.
- npm run check:quotes exit 0 (quote counts before/after); astro check 0 errors; unit all green incl. guides-schema, meta-length, tool-guide-order, bgcloud, postbuild.
- Four CI builds (noauto, dist, bg, bgcloud) check-dist OK; longest title/description ≤40 / ≤80 printed; precache + core-font deltas reported.
- e2e growth + site + hubs (+ remove-background specs on dist-bg for Part B) on chromium + mobile-chrome, retries 0.
- Manual: each new guide opens, CTA lands on the tool, tool page 관련 안내 shows the guide first.
- Two commits (A, B). No push.

## After deploy: owner checklist (Arch hands over at the deploy gate; published guides only)
1. Naver Search Advisor > 요청 > 웹 페이지 수집, one URL at a time: https://docttak.com/guide/jpg-to-pdf/, /guide/pdf-to-jpg/, /guide/pdf-split/, /guide/pdf-sign/, /guide/hwpx-to-hwp/, /guide/remove-background/, /guide/, and the six tool pages (/jpg-to-pdf/, /pdf-to-jpg/, /pdf-split/, /pdf-sign/, /hwpx-to-hwp/, /remove-background/; their 관련 안내 changed).
2. Naver Search Advisor > 요청 > 사이트맵 제출: resubmit https://docttak.com/sitemap.xml; RSS https://docttak.com/guide/rss.xml.
3. npm run ping:indexnow -- (same URLs) (checks the live key file first).
4. Google Search Console > URL 검사 > 색인 생성 요청 for the six guide URLs.
5. Give the blog team the six guide URLs: per-tool posts link the guide (long tail) and the tool (head term).
