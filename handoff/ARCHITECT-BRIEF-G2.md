# Architect Brief — G2: Korean guide cluster (Sprint A), English HWP niche (Sprint B, gated), Phase-0 revenue notes

Staged 2026-10-01 by Arch on `cloud-handoff` (= origin/main d7e319a). Decisions are logged in BUILD-LOG "G2 decisions (Arch, 2026-10-01)".
Inputs: `C:\dev\AGI_AGENT\reports\문서딱 트래픽 현실성 검증.md` (traffic), `...\문서딱 다국어 확장 검토.md` (i18n), `...\문서딱 경쟁사 매출 분석.md` (revenue).
Order is by expected traffic per unit of effort. Sprint A ships in three deploys (A1, A2, A3). Sprint B does not start until A1 is live.
Standing rules apply unchanged: CLAUDE.md owner rules, the guide fact contract (Growth G), plain language (docs/COPY.md), the 문서딱 brand, no tracking, and never lowering a threshold to pass.

## Why this order
The traffic model's two biggest levers are cluster D (ID/exam photo specs, x4.5 if it reaches the Google top 3; no AI Overview; a 7-month-old site already ranks 7th) and Naver UGC bridging (x4.3, not code: 사이티드). Guide count is the third lever (long-tail multiplier 2.5 to 4, x1.6). Titles are done. Backlinks are outreach, not code. English is a positioning bet: the report expects about 5k visits a month at 12 months, and its own risk 6 says the same effort may earn more traffic in Korean. So Korean comes first, and English is narrow and gated.

---

# Sprint A — Korean guides 11 → 30+, hubs, topics

## Goal
At least 30 indexable guide URLs under /guide/, each with fetched official quotes. They are grouped by topic and linked from two hub pages. New id-photo presets ship only where an official page states a file-level spec. Seasonal pages go live 6–8 weeks before their season.

## Flow
```
Step 0 (per page, before any copy is written)
  curl official URL --200 + quote text in static HTML--> source {url,title,quote,retrieved}
        | shell / iframe / script-only
        v
  chrome-cdp (PC session only; owner's Chrome; read-only; no login, no captcha, no form submit)
        --rendered text contains the quote--> source {..., via: browser}
        | still nothing
        v
  draft: true + tried[] (verbatim result) --> never rendered, listed, or sent to IndexNow

build:  guides/*.md --zod (+topic, +spec, +via)--> fact check (title..faq..body..spec rows) --fail--> build error
          +-> /guide/<slug>/      +-> /guide/ (grouped by topic, jump links)
          +-> /guide/photo-sizes/ and /guide/upload-limits/  (hub tables built from spec rows + presets)
ops:    source-watch (weekly) --via:browser quotes--> "수동 확인" list (not "unreachable", not "changed")
```

## Pages and sources (build order = priority)
"Preset?" means: add an id-photo preset only if the fetched page states pixels, KB, or the file format plus a print size. Otherwise the guide links the closest existing preset and labels it the way qnet-photo does ("문서딱은 …로 맞춰요. ○○이 정한 크기는 아니에요"). `publishBy` dates are hard.

### A1 — seasonal, unblocked drafts, structure (target deploy 2026-10-20)
| # | slug | query | sources to fetch | preset? | publishBy |
|---|---|---|---|---|---|
| 1 | hwp-to-pdf (draft→pub) | 한글파일 pdf 변환 | hancom.com HWP format / viewer pages (curl 200, 200 KB from this PC, 2026-10-01; the cloud proxy blocked it before) | – | 2026-10-20 |
| 2 | hwp-viewer (draft→pub) | hwp 뷰어, 한글 없이 열기 | hancom.com official viewer download page | – | 2026-10-20 |
| 3 | admission-photo (draft→pub) | 정시 원서 사진 | jinhakapply.com, uwayapply.com photo guides (curl = shells → chrome-cdp) | if px/KB stated (`jinhak`, `uway`) | 2026-11-10 |
| 4 | univ-docs-upload (new) | 대학 원서 서류 업로드 용량 | same two sites, 서류제출 guides | – | 2026-11-10 |
| 5 | kosaf-docs (new) | 국가장학금 서류 제출 | kosaf.go.kr 서류 제출 FAQ/notice (format, size) | – | 2026-11-10 |
| H1 | photo-sizes (hub) | 증명사진 규격 모음 | none of its own: table only from presets + guide spec rows | – | with A1 |
| H2 | upload-limits (hub) | 서류 제출 용량 모음 | same rule | – | with A1 |
Also in A1: `topic` + grouped /guide/ index, `spec` rows, `via: browser` in source-watch, guide AdSlot placeholders (Phase-0 §2), home "자주 찾는 안내" (swap in admission-photo once live), `NEXT_GUIDES` (tool → new guides).

### A2 — spec cluster D, exam and ID photos (target deploy 2026-11-05)
| # | slug | query | sources to fetch | preset? |
|---|---|---|---|---|
| 6 | id-card-photo | 주민등록증 사진 규격 | mois.go.kr / gov.kr / easylaw.go.kr 발급 사진 요건 | only if a file spec exists (정부24 online) |
| 7 | toeic-photo | 토익 사진 규격 | exam.toeic.co.kr application photo guide (curl 200, 69 KB) | likely (`toeic`; Step 4 dropped it as 확인 필요, retry) |
| 8 | history-exam-photo | 한국사능력검정시험 사진 | historyexam.go.kr application guide | likely (`history`) |
| 9 | korcham-photo | 컴활 사진, 상공회의소 자격 사진 | license.korcham.net application guide | likely (`korcham`) |
| 10 | teps-photo | 텝스 사진 규격 | teps.or.kr application guide | if stated |
| 11 | local-gosi-photo | 지방직 공무원 원서 사진 | local.gosi.go.kr (지방자치단체 인터넷원서접수센터) | if stated (Step 4 dropped it; retry) |
| 12 | kuksiwon-photo | 국가시험 응시 사진 (간호사 등) | kuksiwon.or.kr 응시원서 photo guide | if stated |
| 13 | police-exam-photo | 경찰 채용 원서 사진 | 경찰청 recruitment site application guide | if stated |
| 14 | mma-photo | 병무청 모집병 지원 사진 | mma.go.kr application guide | if stated |
| 15 | teacher-exam-photo | 임용시험 원서 사진 | KICE or the shared 교육청 application site | only with one national source; else draft |

### A3 — file-limit cluster, remaining drafts (target deploy 2026-11-25)
| # | slug | query | sources to fetch |
|---|---|---|---|
| 16 | yearend-tax-pdf (draft→pub) | 연말정산 간소화 pdf | nts.go.kr / hometax.go.kr help on the 간소화 PDF (chrome-cdp). publishBy 2026-11-30 |
| 17 | gov24-upload-limit | 정부24 첨부파일 용량 | gov.kr help/FAQ |
| 18 | hometax-upload-limit | 홈택스 첨부 용량 | hometax.go.kr help |
| 19 | work24-resume-upload | 고용24 이력서 첨부 | work24.go.kr help |
| 20 | ecfs-pdf-limit | 전자소송 pdf 용량 | ecfs.scourt.go.kr help |
| 21 | epeople-upload-limit | 국민신문고 첨부 용량 | epeople.go.kr help |
| 22 | kakao-photo (draft→pub) | 카톡 사진 용량 | cs.kakao.com via chrome-cdp |

Count: 11 live + 22 candidates + 2 hubs = 35. **Ship rule: ≥ 30 indexable /guide/ URLs (hubs count) after A3.** If source gating leaves fewer, ship what is sourced and log the shortfall with every `tried[]`. Never pad; never a template page.

## Build order
1. **Step 0 before any code.** For every row: fetch sources (curl first, then chrome-cdp); log URL, status, bytes and the verbatim quote in BUILD-LOG "G2 Step 0". No copy for a page without a quote.
   - Flag: chrome-cdp attaches to the owner's Chrome only (skill `chrome-cdp`): public pages, read-only; no login, captcha, form submit or cookie copy. Such sources get `via: browser`.
   - Flag: never take a number from a search snippet, blog or 대행 site. The quote must be on the official page.
2. **Schema** (`src/data/guide-schema.ts`):
   - `topic`: required enum `TOPICS = ['여권·신분증','시험·자격증','취업·이력서','입시·장학','세금·민원','PDF·메일','한글파일']`; existing guides get one each. `category` stays (tool mapping).
   - `spec`: optional rows `{ label, kind: 'photo'|'upload', px?, kb?, mb?, mm?, format? }`; every number goes through the existing fact check (must appear in this page's quotes, presets or toolFacts).
   - urlSource: optional `via: 'browser'`. Draft schema unchanged.
3. **Fact check** (`guide-facts.ts`): extend to spec rows and hub pages. A hub number must equal its backing preset/guide spec value.
4. **Hubs**: `src/pages/guide/photo-sizes/index.astro`, `src/pages/guide/upload-limits/index.astro`.
   - Intro + FAQ in `src/content/hubs/<slug>.md` (gen-ui-font does not scan .md), rendered in the system-font class.
   - Table built at build time: one row per spec row (agency, values, guide link, 맞추기 deep link). JSON-LD Article + BreadcrumbList + FAQPage. In sitemap, RSS, llms.txt.
5. **/guide/ index**: group by `topic` (TOPICS order) with a jump-link list on top; each guide exactly once; existing system-font rule for lists.
6. **Internal links**: `related` 2–4 (existing); every guide with a spec row is linked from its hub; `NEXT_GUIDES` gains the new tool → guide links (max 3 per tool); /id-photo/ QuickLinks shows ≤ 8 presets in this order: passport, id-card, toeic, history, gosi, qnet, korcham, admission (skip any that did not ship).
7. **Presets** (`src/data/id-photo-presets.ts`), only per the "Preset?" rule: `sourceUrls`, verbatim `quote` containing the stated numbers, `retrieved`, `status: 'official'`, `note` for any value we chose. Cap: 8 new. Short labels reusing existing syllables (UI font).
8. **source-watch** (`scripts/ops/source-watch.mjs`, `lib/guides.mjs`): read `via`; browser quotes go to a "수동 확인 (브라우저 출처)" table with URL + quote, never counted as changed or unreachable.
9. **Guide ad placeholders**: two `<AdSlot>` calls in `Guide.astro` (`guide-mid` after the second H2, `guide-end` before the sources), existing component; they render nothing while `ADS_ENABLED=false`.
10. **Copy per guide**: 해요체 + plain-language list; the one-sentence answer first; at least 3 agency-specific FAQs; the agency's own rejection list or conditions when published; no exam dates or fees unless quoted; `season.refresh` set on seasonal pages.
11. **A3 tail (ops)**: `scripts/ops/growth.mjs` gains a "batch intent" query bucket (Phase-0 §3).
- Flag: a print-size-only source (e.g. 3.5×4.5 cm "여권용") means **no new preset**; the guide links the passport preset only when the source itself says 여권용 (driver-license-photo precedent).
- Flag: if two pages would say the same thing (e.g. 대입 vs 대학원), write one. The duplicate test decides.

## Out of scope (→ BUILD-LOG Known Gaps if it surfaces)
- Naver blog bridging / AI 브리핑 posts: 사이티드, outside code. Guides only provide stable canonical URLs to link to.
- Backlink outreach. GSC/Naver dashboard work beyond the post-deploy list.
- Foreign visa specs for Koreans (US, Schengen…): red ocean, per-country source maintenance.
- Any new tool capability (e.g. images → PDF). Guides describe only what the tools do today.
- UX-AUDIT-2 leftovers. /hwp-to-pdf/ LCP (Sprint B step B0).

## Failure modes
| New path | Realistic failure | Handling | User sees |
|---|---|---|---|
| chrome-cdp source | Rendered content varies (session, A/B) | `via: browser`; weekly manual list in source-watch; quote archived in BUILD-LOG | Official link + 확인일 visible |
| Agency changes a spec after publish | KB/px edited | curl sources: `ops:source-changed` issue (A-3); browser sources: manual list | Stale value until fixed; mitigated by visible 확인일 + official link |
| New preset, KB vs KiB | "200KB 이하" read as KiB | Existing `limitRule` (×1000, safe both ways) + unit test | Correct file both ways |
| Hub table drifts | Row differs from guide | Built from the same rows + unit test | Cannot drift |
| Thin / near-duplicate pages | Scaled-content risk | Duplicate test fails the build | — |
| `?preset=` typo for a new preset | Unknown id | Existing deeplink validation: ignored → defaults | Passport default, no error |
| UI font over budget | New labels | check-dist fails → move strings to md/system font | — |
| Draft linked by mistake | Slug in related/NEXT_GUIDES/hub | Existing "link targets must be published" rule fails the build | — |
No untested-and-silent path remains.

## Test map
| Branch / flow | Status | Test |
|---|---|---|
| `topic` required + index groups non-empty | [GAP] | guides-schema.test, postbuild |
| `spec` rows fact-checked | [GAP] | guides-schema.test + dist fact check |
| `via: browser` → manual table, exit 0, no issue | [GAP] | ops.test |
| Hub numbers = preset/guide values; hub passes fact check | [GAP] | new unit + dist test |
| Link graph: hub links every spec guide; no orphan (index + at least 1 other guide/hub) | [GAP] | postbuild |
| Duplicate content: 5-char shingles of the rendered article (FAQ incl.), every pair Jaccard < 0.45; report the max pair | [GAP] | postbuild. Fixed threshold: rewrite, never raise |
| New presets: quote contains its numbers; sourceUrls/retrieved present | [GAP] | extend the preset contract unit test |
| `?preset=<new>` applied; output px/bytes match | [GAP] | id-photo.spec per new preset (chromium, mobile-chrome) |
| Guide AdSlots render nothing while off | [GAP] | postbuild: no `ad-slot` in dist HTML |
| growth.mjs batch-intent bucket | [GAP] | ops.test |
| Sitemap/RSS/llms/IndexNow include new pages, exclude drafts | [TESTED] | growth tests (extend lists) |
| Plain language, brand, no-upload, axe on all guides | [TESTED] | existing suites iterate guides; confirm hubs are included |
| Existing 11 guides: body unchanged | regression | before/after rendered article text equality for the 11 |

## Budgets
- **UI fonts** (flag-on, 184.5 / 190 KB now): Sprint A total growth **≤ 2.0 KB (≤ 186.5 KB)**; Bob reports per-face before/after. Over → move strings to md + system font. The budget does not move.
- Guide/hub HTML ≤ 30 KB gzip; guide initial JS ≤ 4 KB; OG PNG ≤ 80 KB raw (existing).
- Precache ≤ 450 KB, unchanged (`NOT_PRECACHED` already covers /guide/*, hubs included).
- dist files about +50, guard 15,000.
- Lighthouse: add `/guide/photo-sizes/` and one A2 guide; thresholds unchanged (perf ≥ 0.95, LCP ≤ 2,000 ms, CLS ≤ 0.01).

## Deploy gate (each of A1, A2, A3)
1. All gates per CLOUD-HANDOFF §3 (check, unit, both builds + check-dist, licenses, e2e 5 projects + no-upload, axe, Lighthouse, qa:visual, regress `--fixtures-only`).
2. Richard "clear" in REVIEW-FEEDBACK; he re-checks 3 quotes per deploy against the live official page.
3. Local commit; push only on the orchestrator's go-ahead.
4. Post-deploy: live smoke; A-2 IndexNow (automatic); Naver 수집 요청 per new URL (PC, chrome-cdp); Kakao share-cache refresh for new URLs; GSC URL inspection for both hubs.
5. BUILD-LOG: guide count, UI-font delta, shortfall list.

## Acceptance
- ≥ 30 indexable /guide/ URLs after A3, or a logged shortfall with `tried[]` per draft. admission-photo, univ-docs-upload, kosaf-docs live by 2026-11-10; yearend-tax-pdf by 2026-11-30.
- Every number on every guide and hub traces to a quote, preset or tool fact (build-enforced).
- All gates green; UI fonts ≤ 186.5 KB.

---

# Sprint B — English, narrow and gated

## Goal
English speakers handling Korean documents get /en/hwp-to-pdf/ and 2–5 English guides built on official sources, with correct hreflang, a separate English sitemap and per-locale OG. Korean output is byte-identical through the refactor (test-enforced); after it, the only Korean diffs are allowlisted.

## Gate 0 (orchestrator, before B2; Bob never guesses volumes)
- The orchestrator measures Keyword Planner volumes (global, English) via the owner's browser: HWP set ("hwp to pdf", "hwp file", "open hwp file", "hwp viewer", "hwpx") and Korea-specific set ("korea visa photo size", "arc photo korea", "topik photo", "hikorea upload"). Result goes in BUILD-LOG "G2 Gate 0 result".
- **K0 pass** (HWP set ≥ 5,000/month **or** Korea-specific set ≥ 2,000/month) → **full EN set**.
- **K0 fail, or not measured** (no BUILD-LOG entry when B2 starts) → **minimal EN set**; the other EN guides stay drafts. Expansion waits for GSC: K1 (3 months after indexing: /en/ index rate ≥ 50%), K2 (6 months: EN clicks ≥ 1,000/month). No second language before K2 passes.

| Page | Minimal | Full | Sources to fetch (official only) |
|---|---|---|---|
| /en/ (what this is, the tool, the guides) | yes | yes | – |
| /en/hwp-to-pdf/ (paired with /hwp-to-pdf/) | yes | yes | tool facts only |
| /en/guide/open-hwp-file/ (open HWP without Hancom) | yes | yes | hancom.com format/viewer pages (English page if one exists) |
| /en/guide/hwp-to-pdf-mac-phone/ | yes | yes | hancom.com viewer availability; our tool facts |
| /en/guide/korea-visa-arc-photo/ | draft | yes | hikorea.go.kr / visa.go.kr / immigration.go.kr (shells → chrome-cdp) |
| /en/guide/topik-photo/ | draft | yes | topik.go.kr (shell → chrome-cdp) |
| /en/guide/hikorea-upload-limits/ | draft | yes | hikorea.go.kr e-application help |
| /en/privacy/ (paired with /privacy/) | yes | yes | our policy; states "the Korean version prevails" |
A Korean-language quote is a valid source: it stays Korean in frontmatter (never rendered, as today) and the page states the English meaning.

## Flow
```
B0  /hwp-to-pdf/ LCP fix -------------------------------------- Lighthouse LCP <= 2,000 ms (threshold unchanged)
B1  snapshot:ko baseline (before any edit) --> extract strings --> rebuild --> snapshot:ko == baseline   (gate)
B2  add /en/* + intentional ko diffs --> snapshot diff == ALLOWLIST (exact) --> baseline update in its own commit
Head (Base.astro; alternates[] from src/data/i18n-groups.ts):
  paired page   : <html lang>, canonical(self), hreflang ko + en + x-default(= the /en/ URL), og:locale + og:locale:alternate
  unpaired page : <html lang>, canonical(self), no hreflang
Sitemaps: /sitemap.xml (ko; URL list unchanged) + /sitemap-en.xml (new); robots.txt lists both
Ops: health / growth / indexnow-diff read every Sitemap: line in robots.txt
```

## Build order
- **B0 — /hwp-to-pdf/ LCP** (Known Gap: 2,190 ms). The EN page shares the component, so this comes first. Try in order: inline that page's own stylesheet (hwp.css, 1.2 KB) for that page only; then defer the controller's `ui-shared` import past first paint. Median LCP ≤ 2,000 ms; the threshold does not move.
- **B1 — i18n foundation (refactor only, zero output change)**
  1. Before any edit: add `scripts/qa/snapshot-ko.mjs` and commit a baseline from the current build. Contents: for every non-/en/ dist HTML, sha256 of normalised HTML (build-id meta removed; `/_astro/<name>.<hash>.<ext>` → `<name>.*.<ext>`; SW revision hashes removed); the sorted set of Hangul-containing string literals across `_astro/*.js`; the gen-ui-font codepoint list; sitemap.xml, robots.txt, llms.txt, rss.xml verbatim.
  2. `src/i18n/ko.ts` (source of truth, typed) and `src/i18n/en.ts` (`satisfies` the ko key type; a missing key is a type error). `src/i18n/locale.ts`: htmlLang, ogLocale, date format. `josa.ts` stays ko-only.
  3. **Extract only what /en/ pages render:** Base.astro (head, header, menu, footer, skip link), Guide.astro, Share, QuickLinks, EngineError, the HWP page and its controller's visible strings. The other four tools keep inline Korean (smallest diff).
  4. **No Astro `i18n` config.** Plain `src/pages/en/...` folders and our own helpers: explicit, no routing side effects on ko pages.
  5. Gate: snapshot equals baseline exactly; UI-font codepoint set identical; full e2e green.
- **B2 — English pages** (after B1 is committed and reviewed)
  - Collection `guidesEn` (`src/content/guides-en/*.md`): same contract as the Korean guides, with locale lengths (title 10–65, description 70–160, answer ≤ 200 chars). EN fact check covers px/pixels, KB, MB, cm, mm, months.
  - `reviewed: { by, date }` is required to index; Richard's EN review (back-translation pass) counts. Without it: `noindex` and out of the sitemap.
  - Brand: EN copy names the site **문서딱** (Hangul); `docttak.com` only as the domain; no invented romanised name. Title pattern: "HWP to PDF — open Korean HWP files free | 문서딱".
  - `src/data/i18n-groups.ts` pairs exactly: /hwp-to-pdf/ ↔ /en/hwp-to-pdf/, /privacy/ ↔ /en/privacy/. Nothing else is paired.
  - Ko footer: one ASCII link "English" → /en/.
  - OG: gen-brand renders the EN og.title/line (Latin glyph check); `og:locale` en_US on /en/.
  - `/sitemap-en.xml` (indexable /en/ URLs only); robots.txt adds a second `Sitemap:` line; llms.txt gains an "English" section; `/sitemap.xml` keeps today's URL list exactly.
  - Ops: health, growth and indexnow-diff read all sitemaps from robots.txt.
  - SW: precache /en/hwp-to-pdf/ HTML only; extend `NOT_PRECACHED` with `/en/guide/`.
  - **Allowlisted ko diffs (exact, nothing else):** /hwp-to-pdf/ and /privacy/ heads gain hreflang ko/en/x-default + og:locale:alternate; every ko page gains the footer "English" link; robots.txt gains the second Sitemap line; llms.txt gains the English section. The Hangul JS literal set and UI-font codepoints stay identical.
- Flag — EN plain-language list (docs/COPY.md, enforced on /en/ visible text): banned rasterize, render engine, EXIF, DPI/dpi, WebAssembly/WASM, client-side, server-side, lossy, MIME, metadata, payload, cache. "upload" is allowed (it is the searched word: "nothing is uploaded"). Sentences ≤ 25 words.
- Flag — Hangul in /en/ visible text only from an allowlist: 문서딱, 한글, 한컴, 하이코리아, and Korean names in parentheses after their English form.

## Out of scope
- vi, zh-Hans, ja (gated on K2/K3). The other four tools in English. A `navigator.language` banner. Auto-redirects (Google: avoid).
- EN presets for Korea visa/ARC/TOPIK: the guide links /id-photo/ only if the official px/KB spec equals an existing preset; otherwise text-only and the preset goes to Known Gaps.
- Naver registration of /en/. CMP/consent (needed only when ads go on).

## Failure modes
| New path | Realistic failure | Handling | User sees |
|---|---|---|---|
| String extraction | A moved string changes whitespace or josa output on a ko page | snapshot-ko exact gate + full e2e | — (blocked before merge) |
| hreflang | One-way link, bad code, x-default to a non-200 URL | Dist test: reciprocity, self-reference, codes ∈ {ko, en, x-default}, target exists with self-canonical | — |
| Leftover Korean on an EN page | Untranslated key | ko/en key-type check + dist Hangul scan with allowlist | — |
| EN HWP error path | Korean error text on /en/ | Error keys mapped through the dictionary; e2e forces the engine error on /en/ | English error + retry |
| Two sitemaps | Ops reads only /sitemap.xml, misses /en/ | Ops reads robots.txt Sitemap lines; unit test | — |
| Unreviewed EN guide indexed | Missing review | Schema: no `reviewed` → noindex + not in sitemap; dist test | — |
| Gate 0 never measured | Full set built on guesses | No BUILD-LOG entry → minimal set by rule | — |
| Script-rendered gov source | Quote changes silently | `via: browser` → source-watch manual list | Visible 확인일 + official link |

## Test map
| Branch / flow | Status | Test |
|---|---|---|
| ko output byte-identical after B1 | [GAP] | snapshot-ko (baseline committed before edits) |
| ko diffs after B2 = allowlist exactly | [GAP] | snapshot-ko allowlist mode |
| en dictionary complete | [GAP] | tsc `satisfies` + unit: key sets equal |
| hreflang validity | [GAP] | postbuild dist scan |
| html lang / og:locale per path | [GAP] | postbuild |
| No Hangul outside allowlist; EN banned words; sentence length | [GAP] | postbuild on /en/ |
| EN fact check | [GAP] | guides-en schema test + dist |
| EN glyphs ⊂ UI subset (no fallback font fetch) | [GAP] | postbuild: every char of /en/ visible text is in the subset |
| /en/hwp-to-pdf/ convert + download, no-upload, 0 console errors | [GAP] | hwp-to-pdf.spec parametrised over both paths, 5 projects |
| EN engine-error path | [GAP] | e2e (existing forced-error fixture on /en/) |
| sitemap-en / robots / llms | [GAP] | growth/postbuild |
| Ops reads all sitemaps | [GAP] | ops.test |
| Existing ko HWP flows | [TESTED] | existing e2e, unchanged and green |

## Budgets
- UI fonts **+0.0 KB** (EN is ASCII, already in the subset; codepoint set must not change).
- /en/hwp-to-pdf/ initial JS within ±0.5 KB of /hwp-to-pdf/; export chunk ≤ 360 KB (unchanged).
- Precache ≤ 450 KB (about +5 KB). EN HTML ≤ 30 KB gzip. OG ≤ 80 KB.
- Lighthouse: add /en/hwp-to-pdf/ and /en/guide/open-hwp-file/; thresholds unchanged.

## Deploy gate
- **B0 + B1 deploy together**: no visible change except faster HWP LCP. All §3 gates + snapshot-ko exact.
- **B2**: all gates; Richard clear including the EN back-translation review recorded in `reviewed`; local commit; push on the orchestrator's go-ahead.
- Post-deploy (PC session): submit /sitemap-en.xml in GSC; URL inspection for /en/hwp-to-pdf/; IndexNow via A-2; log the K1 date (index + 3 months) and K2 date (+ 6 months) in BUILD-LOG.

## Acceptance
- snapshot-ko exact after B1, allowlist-exact after B2.
- Minimal or full set (per Gate 0) live, reviewed, indexable, valid hreflang. All gates green.

---

# Phase-0 revenue prep — design notes only (no ads, no beacon, no payment)

## §1 Principles
- No ads until REVENUE-MODEL R1 triggers (15+ indexed pages, GSC clicks ≥ 100/week for about 4 weeks, privacy policy v2 with the contact). check-dist already fails ads without `PUBLIC_CONTACT_EMAIL`.
- Ads never sit inside a tool's pick → progress → download flow. The existing tool `*-result` AdSlots may render only inside the done panel, after the download button; audit that at M1 (ads switch-on), not now.
- **Paid tiers never remove free behaviour that exists today.** photo-compress multi-file and pdf-merge stay free. Paid "batch" means more (ZIP of many outputs, batch pdf-compress and HWP, large-file mode), never less.
- When ads go on, the privacy line "쿠키와 방문 분석 도구도 쓰지 않아요." is rewritten honestly in the same deploy (e.g. "파일은 밖으로 나가지 않아요. 안내 페이지에는 광고가 있어요."). Whether non-personalised ads avoid cookies is unverified; check it then.

## §2 Guide-page ad layout (placeholders land in Sprint A step 9; zero output while off)
```
/guide/<slug>/  H1 → answer box → [spec table] → H2 #1 → H2 #2 ─[guide-mid, rect]─ … → FAQ ─[guide-end, leaderboard]─ sources → related
/guide/ hubs    no ad inside or above the table; guide-end only
tools           done panel: [download] … [*-result, rect]      page footer: [*-footer, leaderboard]
```
- Never above the answer box: it is the LCP element and the text AI answers quote.
- At switch-on every slot reserves a fixed min-height (CLS ≤ 0.01); CSP opens only for the ad origin, only then.

## §3 No-cookie usage signal ("batch attempts") — **deferred**
- Counting a client-side action needs a request whose only job is to report it. That is a beacon even when same-origin and cookie-free, and it contradicts the live promise "방문 분석 도구도 쓰지 않아요". Rejected.
- Rejected proxy: counting fetches of a lazy "batch" chunk in Cloudflare analytics. The SW and HTTP cache undercount it, it turns a functional fetch into a measuring device, and per-path request counts on the Free plan are unverified (no doc line or probe in hand).
- Used instead (zero tracking): GSC queries. The A-5 weekly report gains a "batch intent" bucket per tool (queries containing 여러 장 / 한꺼번에 / 일괄 / 여러 개 / 한번에). Sprint A step 11. Demand is read from search, not from users.
- Revisit only together with the ads decision (when the privacy text changes anyway), and then only as aggregate counts with no identifier.
