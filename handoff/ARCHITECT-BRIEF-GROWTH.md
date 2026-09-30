# Architect Brief — Growth G (search traffic: guides, deep links, sharing, technical SEO, IndexNow)

Staged. Starts **after Polish Q is committed and live**. Promote it to ARCHITECT-BRIEF.md then. Decisions are in BUILD-LOG "Growth G decisions (Arch, 2026-09-30)".
Inputs: `C:\dev\AGI_AGENT\reports\안올림 이름과 트래픽 플랜.md` (2부 §3–§9), `...\부수입 웹툴 주제 선정.md` (부록, Naver volumes 2026-09-29), docs/UX-AUDIT-2.md §5.

## Goal
docttak.com gains 12+ fact-checked guide pages at /guide/, one per real query cluster. It also gains deep-linkable tool presets, a "링크 복사 / 링크 보내기" share path, a complete sitemap/RSS/robots/IndexNow set and a written weekly measurement routine. No user tracking and no third-party script.

## Preconditions
- Polish Q is committed and live. Its plain-language and brand tests pass on main.
- **hwp-direct:** if it has merged, G.1 pages 7–8 and the /hwp-to-pdf/ share button are in scope. If not, they stay `draft: true` and the button goes to Known Gaps. **Do not edit `src/tools/hwp-to-pdf/*` or `src/pages/hwp-to-pdf/*` before the merge.**
- **Brand rule (owner):** every Korean-facing string uses **문서딱**, including guide copy, OG images, the RSS title, share text and JSON-LD names. "docttak" appears only inside URLs and the domain line on OG images. A dist test enforces this (T7).

## Flow
```
build:  src/content/guides/*.md --zod schema--> getCollection('guides') (draft:false only)
          |                                        +-> /guide/[slug]/index.html  (Guide.astro -> Base.astro)
          |                                        +-> /guide/index.html
          |                                        +-> /og/guide/<slug>.png   (endpoint, @napi-rs/canvas, gen-brand helpers)
          |                                        +-> /guide/rss.xml, /sitemap.xml (lastmod), /llms.txt
          +- sources[] / preset refs / toolFacts --> fact check (unit + dist tests; an unsourced number fails the build)
postbuild: check-dist (files <= 15,000, budgets) -> gen-headers -> carry-assets -> gen-sw (guides NOT precached)
deploy (orchestrator): CF Pages --> npm run ping:indexnow -- <changed urls>
          ping: GET https://docttak.com/<key>.txt == key ? POST api.indexnow.org/indexnow : abort (exit 1, message)

runtime (tool page):  ?preset= / ?target= --parse+validate--> valid: apply to form | invalid: ignore silently, defaults
                      option change --> history.replaceState(tool path + whitelisted params)
                      result screen: [링크 보내기] navigator.share({title,text,url})  (only if navigator.share exists)
                                     [링크 복사]  clipboard.writeText(url) --fail--> readonly field with the URL, selected
```

## Build order
Refactor first (no behaviour change), then one commit-sized unit per line. All gates stay green after each.
0. **Refactor:** `src/lib/ui/deeplink.ts` (pure parse/serialize, unit-tested, not wired). `src/data/tool-facts.ts` (ref -> value read from the real constants). Base.astro takes optional `ogImage`, `ogDescription` and `jsonLd[]` props, defaulting to today's og.json behaviour.
1. **G.5 deep links**, then **G.6 quick links**, then **G.7 share** on the four live tools.
2. **G.1 content collection, schema and fact checks**, with 2 pages (passport-photo, pdf-merge) end to end: layout, JSON-LD, OG endpoint.
3. The remaining pages, in the publish order below. Step 0 verification comes first.
4. **G.2 /guide/ index, G.3 technical SEO** (sitemap lastmod, robots, RSS, llms.txt, 404, _redirects, header/footer/home links).
5. **G.4 IndexNow** key and ping script.
6. **G.8 capacity guard + docs/GROWTH-RUNBOOK.md.**
7. Tests T1–T12, e2e, lhci URLs, budgets.

---

## G.1 Guide pages

### Page list
Volume is the measured Naver monthly volume (부록, 2026-09-29). "Unmeasured" means the query came from the 2026-09-30 autocomplete only. Measure it before the first title tweak (runbook).

| # | Slug `/guide/<slug>/` | Target query cluster | Volume | Facts and source (retrieved) | CTA | Season / publish | Gate |
|---|---|---|---|---|---|---|---|
| 1 | `passport-photo` | 여권사진 규격, 여권사진 사이즈, 여권사진 규격 맞추기 (귀·눈썹·옷) | 56,600 · 3,320 (여권사진 86,000) | preset `passport_online`: passport.go.kr menuPos=12 and 32, gov.kr 126200000030 (2026-09-29); 온라인 사진 검증 `PASSPORT_CHECK_URL`. 귀·눈썹·옷 rules only if quoted from menuPos=32 in step 0 | `/id-photo/?preset=passport_online` | Peaks Jan–Feb and Jun–Jul. Wave 1. Refresh 2026-12-01 and 2027-05-20 | ready |
| 2 | `id-photo-size` | 증명사진 사이즈, 증명사진 규격 맞추기, 증명사진 사이즈 변환 | 3,670 | Table of presets `passport_online`, `gosi`, `qnet`, `saramin`, `jobkorea`. 반명함판 3×4 cm is labelled "흔히 쓰는 크기, 기관 규격 아님" (preset note) | `/id-photo/` | Year-round. Wave 1 | ready |
| 3 | `id-photo-kb` | 증명사진 용량 줄이기 (폰·무료·200KB) | 2,640 | Presets `qnet` 200KB 이하, `gosi` 350KB 미만, `passport_online` 500KB 이하. toolFact `KB_BYTES=1000` (why the result fits both counting rules) | `/id-photo/?preset=qnet` and `/photo-compress/?target=200` | Year-round. Wave 1 | ready |
| 4 | `photo-kb` | 사진 용량 줄이기, 이미지 용량 줄이기, 사진 kb 줄이기, 폰 사진 용량 | 29,000 · 4,390 · 30 | toolFacts: `RANGES.targetKb` min/max, `KB_BYTES`, location info removed | `/photo-compress/?target=500` | Year-round. Wave 1 | ready |
| 5 | `pdf-compress` | pdf 용량 줄이기 (모바일·맥북·무료) | 26,210 | toolFacts: `TARGET_MB` min/max, level names. Gmail "제한은 25MB입니다" (support.google.com/mail/answer/6584?hl=ko, 2026-09-30, Arch probe) | `/pdf-compress/?target=10` | Year-round. Wave 1 | ready |
| 6 | `pdf-merge` | pdf 합치기 (아이폰·갤럭시·PC), pdf 합치는 법, pdf 병합 | 53,930 · 18,290 · 11,560 | toolFacts: pdf-merge `MAX_FILES` (50) and device limits. Device sections describe our tool on each device only. OS built-in methods are left out unless quoted from Apple/Samsung help in step 0 | `/pdf-merge/` | Year-round (PC-heavy). Wave 1 | ready |
| 7 | `hwp-to-pdf` | hwp pdf 변환, 한글파일 pdf로 변환, 한글 pdf 변환 안됨·깨짐 | 11,930 · 8,330 · 1,340 | toolFacts from the merged hwp-direct tree (limits, HWP/HWPX support) | `/hwp-to-pdf/` | Year-round. Wave 1 if merged | hwp-direct merged |
| 8 | `hwp-viewer` | hwp 뷰어, hwpx 열기, hwpx 변환 | 3,560 · 130 · 840 | toolFacts (opens HWP/HWPX). What HWPX is: a quote from Hancom official help (step 0) | `/hwp-to-pdf/` | Year-round | hwp-direct + verify |
| 9 | `gosi-photo` | 공무원 시험 사진 규격 | unmeasured | preset `gosi`: gongmuwon.gosi.kr (137×177, 3.5×4.5 cm, 350KB 미만, JPG·PNG; 2026-09-29). "6개월 이내 촬영" only if quoted from 인사혁신처 in step 0 | `/id-photo/?preset=gosi` | 원서 peak Jan–Feb. Wave 1 (6–8 weeks ahead). Refresh 2026-12-15 | ready |
| 10 | `qnet-photo` | 큐넷 사진 등록 (안됨·크기) | unmeasured | preset `qnet`: q-net.or.kr guide_02 (JPG/JPEG, 200KB 이하; 2026-09-29). Say plainly that Q-Net sets no pixel size and 413×531 is 문서딱's choice (preset note). 사진판독 불가 reasons only if quoted | `/id-photo/?preset=qnet` | Year-round. Wave 1 | ready |
| 11 | `resume-photo` | 이력서 사진 규격 (사람인·잡코리아) | unmeasured | presets `saramin` (100×140 권장, 10MB, jpg·gif), `jobkorea` (최대 150×210, 5MB, gif·jpg·jpeg·png) (2026-09-29) | `/id-photo/?preset=saramin` | Peaks Mar and Sep. Wave 1 (ready now). Refresh 2027-01-20 and 2027-07-20 | ready |
| 12 | `email-attachment-limit` | 첨부파일 용량 제한·초과 (지메일·네이버 메일) | unmeasured | Gmail 25MB (verified above). Naver mail: Arch probe failed ("Claude Code is unable to fetch from help.naver.com"). Needs a quote for a second service (Naver, Daum or Outlook) from its official help | `/pdf-compress/?target=10`, `/photo-compress/?target=500` | Year-round | 2nd service verified |
| 13 | `yearend-tax-pdf` | 연말정산 pdf 합치기·용량·제출 | unmeasured | Needs a 국세청/홈택스 quote on the 간소화 자료 PDF download (and its opening date once announced). Tool facts are merge and compress only | `/pdf-merge/` | Peak mid-Jan to Feb. Publish by 2026-11-30. Refresh 2027-01-05 | verify |
| 14 | `admission-photo` | 대입·정시 원서 사진 (규격·올리기) | unmeasured | Needs quotes from both the 진학사 and 유웨이 원서접수 photo guides, with dates | `/id-photo/` (custom) | Peak late Dec. Publish by 2026-11-10 | verify |
| 15 | `kakao-photo` | 카톡 사진 용량, 카톡 원본 사진 보내기 | unmeasured | Needs a Kakao help-centre quote on photo quality modes and limits. The Arch probe of cs.kakao.com reached a menu page only | `/photo-compress/` | Year-round | verify |
| 16 | `driver-license-photo` | 운전면허 사진 규격 2026 | unmeasured | Needs a 도로교통공단 quote for domestic issue/renewal. The Arch probe of safedriving.or.kr/guide/larGuide031.do found only the foreign-licence exchange rule ("6개월 이내 촬영한 여권용 컬러사진 3매 (규격 3.5cm*4.5cm)"). Do not use it for domestic renewal | `/id-photo/` (custom) | Year-round | verify |

- **Launch target: at least 12 published.** Pages 1–6 and 9–11 (9 pages) are ready. Pages 7–8 come with hwp-direct. Step 0 tries to clear 12–16. A page whose facts are not quoted stays `draft: true`. It is never published with guessed facts. It goes to Known Gaps with the URL tried and the verbatim failure. If fewer than 12 clear, Bob flags it in REVIEW-REQUEST. Arch decides; Bob does not pad.
- Dropped as doorway or thin: KB-variant pages ("사진 100kb", "사진 50kb"), per-agency clones without their own rules, and "pdf 보안 해제" (misuse, plan §3). "사진 업로드 안됨" is not a page: the word is banned (plain language) and the intent is covered by pages 3, 4 and 12.

### Step 0: verification (before any page copy)
- For each **verify** or "only if quoted" item, fetch the official page. Record `{url, title, quote (verbatim, ≤ 300 chars), retrieved: YYYY-MM-DD}` in that page's frontmatter `sources`. If the fetch fails, record the verbatim error in BUILD-LOG and leave the page `draft: true`.
- Blog posts, news and competitor sites are never a source for a spec. Our own behaviour is sourced through `toolFacts` only.
- Id-photo facts use `{ preset: '<id>' }` sources. These resolve to that preset's first sourceUrl, its quote and its date from `src/data/id-photo-presets.ts`, the single source of truth. Never retype preset numbers.

### Content model
`src/content.config.ts`: Astro 7 content layer, `glob` loader over `src/content/guides/*.md`. Plain `.md`: no MDX, no new dependency. The zod schema fails the build on a violation.
- `title`: ≤ 40 chars without the suffix; the page `<title>` is title + " | 문서딱". `description`: 50–110 chars. `ogDescription`: ≤ 80. `query`: the target query, not rendered.
- `answer`: one sentence ending in 다/요, ≤ 120 chars. It is rendered first as `<p class="guide-answer">`, followed by "출처: <a>기관명</a> · 확인일 <time datetime>YYYY-MM-DD</time>".
- `published` and `updated`: ISO dates, `updated ≥ published`, neither in the future at build time. If the title contains a year, it must equal the year of `updated`.
- `category`: one of 사진, PDF, 한글파일. `tools`: slugs of live tools. `cta`: `{ href, label }`; the href must pass `deeplink.parse`. `related`: 2–4 guide slugs (a draft target is dropped at render with a build warning).
- `sources`: an array of `{preset}` or `{url, title, quote, retrieved}`, min 1. `toolFacts`: an array of `{ref, value}`; each `ref` is a key of `tool-facts.ts` and its value must match.
- `faq`: 3–6 `{q, a}`, phrased from real autocomplete or plan wording. It is rendered visibly, and FAQPage is built from the same data.
- `og`: `{ title (≤ 14 chars), line (≤ 34 chars, spec summary, e.g. "413×531픽셀 · 500KB 이하") }`.
- `season` (optional): `{ peak, refresh: string[] }`, runbook only, not rendered. `draft`: boolean, default false.

### Page structure (`src/layouts/Guide.astro`, `src/pages/guide/[slug].astro`)
Blocks in order:
1. H1 = title
2. Answer box
3. Share (G.7)
4. CTA button (`btn primary`, the preset deep link)
5. Body markdown: steps as `<ol>`, the spec table, and 자주 반려되는 이유 only if sourced
6. FAQ
7. "함께 보면 좋은 안내" (related)
8. "바로 쓰는 도구" (tools)
9. "확인일과 출처": every source title, its link (new tab, rel noopener noreferrer) and its date, plus "규격은 기관 사정에 따라 바뀔 수 있어요. 내기 전에 원문을 한 번 더 확인해 주세요."

Copy rules:
- Tone per docs/COPY.md: 해요체, no exclamation marks, no hype. None of 업로드·서버·브라우저·네트워크·메모리·EXIF·px·dpi; write "올리기/첨부", "픽셀", "해상도 300".
- **Quotes are never rendered** (they contain "dpi" and "pixel"). Pages paraphrase and link. Quotes stay in the frontmatter as the audit trail.
- Guides load no JS except the share script and the shared site script.

### JSON-LD (`src/data/jsonld.ts` gains `guideJsonLd`)
- `Article`: headline = title, description, datePublished, dateModified = updated, author and publisher = Organization "문서딱" (url, logo icon-512), image = the page's absolute OG URL, mainEntityOfPage = canonical, inLanguage "ko-KR", citation = the source URLs.
- `FAQPage` from `faq`; its text is identical to the visible FAQ.
- `BreadcrumbList`: 문서딱 › 안내 › title.
- **No HowTo.** Decision: Google dropped HowTo rich results in 2023, and the steps are already a visible `<ol>`. This is the reason for the decision only; no test depends on it.

### OG image per guide
- `src/pages/og/guide/[slug].png.ts`: a static endpoint, getStaticPaths over published guides.
- It draws with helpers exported from `scripts/gen-brand.mjs` (logo, 1200×630, brand colour, fonts registered once). **Do not duplicate them.**
- The image shows `og.title`, `og.line`, "문서딱" and the "docttak.com" domain line.
- Bytes are deterministic, ≤ 80 KB each. A text overflow throws, the same rule as gen-brand.
- `og:image` = this PNG, alt = og.title + " — " + og.line. `twitter:card` stays summary_large_image.

## G.2 /guide/ index
- `src/pages/guide/index.astro`: H1 "문서·사진 제출 안내". Guides are grouped by category, and each item shows the title and the answer.
- JSON-LD: `CollectionPage` + `BreadcrumbList`. Title "문서·사진 규격과 용량 안내 | 문서딱". Add an og.json entry (`default` image).
- Links to it:
  - the header nav gains "안내" → /guide/;
  - the footer gains "안내";
  - the home page gains a "자주 찾는 안내" section with 6 published guides, in this order: passport-photo, pdf-compress, pdf-merge, photo-kb, gosi-photo, id-photo-size.

## G.3 Technical SEO
- **Sitemap** (`sitemap.xml.ts`):
  - It lists the home page, tools, /guide/, guides and legal pages, each with `<lastmod>` (YYYY-MM-DD).
  - Tools get a new hand-maintained `updated` field in `tools.ts`. Legal pages get one constant. Both go on the docs/COPY.md release checklist.
  - Guides use `updated`. The home page and /guide/ use the max of their children.
  - No query-string URLs.
- **Canonical:** the path only, never the query string. Deep links canonicalize to the tool page.
- **robots.txt:**
  - Keep `User-agent: *` / `Allow: /`.
  - Add explicit `Allow: /` groups for OAI-SearchBot, ChatGPT-User, PerplexityBot, ClaudeBot, Claude-SearchBot, Google-Extended, Bingbot, Yeti (Naver) and Daumoa.
  - Training crawlers are not blocked. Decision: the owner's goal is maximum reach, and a policy change is one line.
  - Add `Sitemap:` lines for /sitemap.xml and /guide/rss.xml.
- **RSS:** `src/pages/guide/rss.xml.ts`, hand-written RSS 2.0 with no dependency.
  - Channel: title "문서딱 안내", link /guide/, language ko.
  - One item per published guide: title, link, guid (the URL, isPermaLink), pubDate = published (RFC 822, +0900), description = answer. All text is XML-escaped.
  - A `<link rel="alternate" type="application/rss+xml">` goes on /guide/ and on every guide.
- **llms.txt:** `src/pages/llms.txt.ts`. It holds "# 문서딱", one entity sentence, then the tools and guides as markdown links with their answers. It costs almost nothing; its effect is unverified (plan §7).
- **404:** keep the tool list and add "많이 찾는 안내" (5 guides).
  - Add a suggestion script, ≤ 1 KB gzip. It maps path tokens to a URL and shows "혹시 이 페이지를 찾으셨나요?" with a link when a token matches. With no match it shows nothing extra.
  - Token map: hwp or 한글 → /hwp-to-pdf/; passport or 여권 → /guide/passport-photo/; merge or 합치 → /pdf-merge/; compress or 용량 → /pdf-compress/; photo or 사진 → /photo-compress/; guide or guides → /guide/.
  - The map is generated at build from published slugs and live tools only.
- **`public/_redirects`:** CF Pages static 301s.
  - `/hwp/` and `/hwp-pdf/` → `/hwp-to-pdf/`.
  - `/guides/` → `/guide/`.
  - `/passport/` → `/guide/passport-photo/`.
- **Budgets (check-dist):**
  - guide page initial JS ≤ 4 KB gzip;
  - guide HTML ≤ 30 KB gzip;
  - each `og/guide/*.png` ≤ 80 KB raw.
  - Add /guide/, /guide/passport-photo/ and /guide/pdf-merge/ to lighthouserc: Perf ≥ 0.95, SEO = 1.0, A11y = 1.0.
- **Service worker:** guides and /guide/ are **not precached**.
  - `NOT_PRECACHED` in gen-sw.mjs becomes a predicate: `/licenses/`, or any path starting with `/guide/` or `/og/`.
  - Reason: gen-sw precaches every sitemap page, so guides would break the 450 KB precache limit.
- **UI font subset:** guide copy adds Hangul, so the subset generator must include `src/content/guides/*.md`. The 190 KB total / 50 KB per face budget holds. If it would be exceeded, **stop and flag to Arch**; the likely fix is a system-font fallback for the guide body. Do not raise the budget yourself.

## G.4 IndexNow
- **Key:** 32 hex characters (`crypto.randomBytes(16)`), generated once. It is committed as `public/<key>.txt` (content = key) and as `src/data/indexnow.json` `{ "key": "<key>" }`.
  - Decision: the key is public by protocol, since it must be served at the site root. It proves host ownership and grants nothing, so it is not a secret under the env-only rule.
- **Script:** `scripts/indexnow.mjs`, run as `npm run ping:indexnow -- <url...>`. Flags:
  - `--sitemap`: submit every sitemap URL (first submission);
  - `--dry-run`: print only.
- **Host:** `PUBLIC_SITE_URL`, default `https://docttak.com`.
  - Every URL must be absolute https on that host. Others are rejected: exit 1, listing them.
  - URLs are de-duplicated; at most 10,000 per call.
- **Preflight:** GET `https://<host>/<key>.txt` (10 s timeout). If the body is not the key, exit 1 with "IndexNow 키 파일이 사이트에 없습니다: <url> (<status>)". **Send no POST.**
- **Submit:** POST `https://api.indexnow.org/indexnow` with `Content-Type: application/json; charset=utf-8` and body `{host, key, keyLocation, urlList}`.
  - 200 or 202: print "IndexNow: N개 URL 제출 (<status>)", exit 0.
  - 400, 403, 422 or 429: print the status and the first 200 characters of the body, exit 1.
  - Network error: exit 1. No retries; the orchestrator reruns.
- It never runs in build, postbuild or the site. The runbook says when: after each deploy, with the changed URLs.

## G.5 Deep links (`src/lib/ui/deeplink.ts`, pure)
| Tool | Param | Valid values | Applies |
|---|---|---|---|
| /id-photo/ | `preset` | any `PRESETS` id except `custom` | selects the preset |
| /photo-compress/ | `target` | integer KB within `RANGES.targetKb` | mode = target; the chip if it is a chip value, else custom + value |
| /pdf-compress/ | `target` | MB within `TARGET_MB`, at most 1 decimal | mode = target; the chip or custom |
- `parse(slug, URLSearchParams)` returns a partial state or null. `serialize(slug, state)` returns a query string with whitelisted params only; defaults are omitted.
- Unknown or invalid params are ignored silently. The tool shows its defaults and nothing is thrown. A param value longer than 20 characters is ignored.
- On load, the params apply before the first render (empty state only, no flash).
- On any option change, `history.replaceState` to pathname + serialize(...), so the address bar is always shareable. Never `pushState` (it would flood the back button).
- The canonical stays path-only (G.3).

## G.6 "자주 쓰는 규격" quick links (tool pages)
A list of `<a data-deeplink href="/<tool>/?...">` links, placed below the options and above the FAQ.
- **id-photo:** one link per preset except `custom`; the label is the preset label.
- **photo-compress:** one link per sourced id-photo limit:
  - "Q-Net 원서 사진 (200KB 이하)" → `?target=200`;
  - "공무원 시험 원서 사진 (350KB 미만)" → `?target=349`;
  - "여권 온라인 신청 사진 (500KB 이하)" → `?target=500`.
  - Values are computed as floor(limitBytes / 1000) from the presets, never typed. Labels name only preset-sourced limits.
- **pdf-compress:**
  - "지메일 첨부 한도 (25MB)" → `?target=25` (the Gmail source; toolFacts);
  - plain "10MB로" and "5MB로" links (no claim about any agency).
- **Click with JS:** preventDefault, apply the values in place (loaded files are kept), replaceState, and announce "○○ 규격으로 바꿨어요" (announce.ts, `josa()`).
- **Without JS:** a normal navigation.
- **Below the list:** "관련 안내", up to 4 guides whose `tools` include this slug.

## G.7 Share (`src/lib/ui/share.ts` + `src/components/Share.astro`)
- **Buttons** (at least 44 px):
  - **[링크 보내기]**: rendered hidden, shown only when `navigator.share` is a function;
  - **[링크 복사]**: always shown.
- **URL:** for tools, `location.origin` + pathname + serialize(current state); for guides, the canonical URL. It **never** includes a file, a Blob, a `files` key or a file name.
- **Share:** `navigator.share({ title, text, url })`.
  - title = the page title without the suffix, then " | 문서딱".
  - text = the og description.
  - AbortError (the user cancelled) is silent. Any other error falls back to copy.
- **Copy:** `navigator.clipboard.writeText`.
  - On success, announce "링크를 복사했어요" and relabel the button "복사했어요" for 2 s.
  - On failure or when unavailable, show a readonly input with the URL, select it, and write "길게 누르거나 Ctrl+C로 복사해 주세요".
- **Placement:**
  - the done/result state of every live tool: pdf-merge, pdf-compress, photo-compress and id-photo (hwp-to-pdf only after hwp-direct merges);
  - every guide, under the answer.
- No Kakao SDK, no third-party script, no CSP or Permissions-Policy change. The current policy does not restrict web-share or clipboard-write.

## G.8 Capacity guard and runbook
- **check-dist** already fails above 15,000 files (`MAX_FILES`) and at 24 MiB or more per file. Keep both.
  - Add a table row "files N / guard 15,000 / CF 20,000".
  - Add a **warning** above 10,000 files.
  - A unit test pins the constants.
- **`docs/GROWTH-RUNBOOK.md`:**
  - **CF Free limits** (owner-verified, 2026-09-30): 20,000 files per site, 25 MiB per file, 500 builds per month. Static requests and bandwidth are unlimited. Functions are 100k/day, and we use none.
    - Headroom: 1,220 files and 67 MB today. Each guide adds about 2 files (HTML and OG PNG).
    - Builds: at most 1 deploy per day is about 30 of the 500.
  - **One-time setup:**
    - Google Search Console: domain property via DNS TXT, submit the sitemap, file a change of address from pages.dev.
    - 네이버 서치어드바이저: verify via `PUBLIC_NAVER_SITE_VERIFICATION`, submit the sitemap **and** /guide/rss.xml, request 웹 페이지 수집 for the top 10 URLs.
    - Bing Webmaster Tools: import from Search Console.
    - IndexNow: run `--sitemap` once.
  - **Weekly (5 min):**
    - Search Console: the top 20 queries by impressions. For a query at position 8–20, edit only the title and answer of that page, bump `updated`, deploy and ping IndexNow.
    - 서치어드바이저: 수집 오류.
    - Bing: AI Performance citations.
  - **Monthly (15 min):** one spreadsheet row with indexed pages (Google, Naver, Bing), clicks, new queries and Bing AI citations. Measure the unmeasured queries in the Naver keyword tool.
  - **Quarterly:** ask ChatGPT, Perplexity and 네이버 AI 브리핑 the 10 P0 questions, and record whether 문서딱 is cited.
  - **Season calendar:** the refresh dates from the page table. Every January, re-verify all `sources` and bump `updated` only for pages that were re-checked.
  - **Milestones and stop criteria** (plan §9; all targets are estimates):
    - 90 days (2026-12-31): at least 20 pages indexed (Google and Naver), impressions on every P0 query, at least 30 Google clicks per day. Stop criterion: under 10 indexed → a technical SEO audit, then rework the content.
    - 6 months (2027-03-31): at least 300 clicks per day, at least 3 keywords in the top 10, 1 Naver 웹문서 first-page result. Stop criterion: under 100 per day, or 0 in the top 10 → shift time to the next product.
    - 12 months (2027-09-30): 90k–150k PV per month. Stop criterion: under 30k → maintenance mode (yearly re-verify only).
    - Owner time above 5 h per week is itself a review signal.
  - **Blind spot by design:** no analytics, cookies or events. Direct visits and Kakao visits are invisible.

## Out of scope (→ Known Gaps if they surface)
- Kakao SDK share, analytics, beacons, or any runtime third-party request.
- New tools (HEIC→JPG, 사진→PDF).
- Naver blog and community posting (owner, manual). The GitHub preset repo and backlinks.
- HowTo schema, hreflang, English pages.
- The code and copy of the HWP tool (hwp-direct).
- Pages 12–16 whose facts could not be quoted; they stay draft.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| Guide facts | An agency changes its spec after `retrieved` | Every page shows 확인일, the original link and the "원문을 한 번 더 확인" line. January re-verify in the runbook. T9 fails a source older than 400 days | A dated, linked claim, never a silent stale one |
| Fact typed by hand | A number differs from the preset or constant | T9: every number+unit in the body must come from the source quotes of that page, presets or toolFacts. toolFact values must equal `tool-facts.ts` | Build fails |
| Deep link | `?preset=../../x`, `?target=99999999` | Whitelist and range; ignored; defaults | The normal tool |
| Deep link | Valid preset, but the controller renders before the parse | Apply before first render; e2e checks the value at load | Correct preset |
| Share | `navigator.share` exists but rejects (no user gesture, desktop policy) | A non-Abort error falls back to copy | The copy path works |
| Share | Clipboard blocked (plain http, iframe, old iOS) | Readonly field with the URL selected, plus instructions | A clear manual path |
| Share | A file leaks into the share payload | share.ts never takes a file. The unit test asserts the argument keys are exactly title, text, url, and that the url has no `blob:` and no file name | Nothing leaks |
| OG endpoint | A long title overflows the canvas | Throw; the build fails (as gen-brand) | Build fails |
| SW | Guides precached, precache over 450 KB | `/guide/` and `/og/` excluded; T10 | Build fails if it regresses |
| IndexNow | Key file not deployed yet, or wrong host | Preflight aborts, no POST, exit 1 with a message | The orchestrator sees why |
| IndexNow | 429 or 422 | Exit 1 with the status and body; no retry loop | The orchestrator sees why |
| Sitemap | lastmod in the future, or bumped without a change | Schema rejects future dates. The runbook bumps `updated` only on a real change | Build fails on a future date |
| _redirects | A target is renamed later | Unit test: every target exists in dist | Build fails |
| 404 script | A token maps to an unpublished guide | The map is generated from published slugs and live tools | Live links only |
| File count | Guides and OG images grow past the guard | check-dist fails at 15,000 and warns at 10,000 | Build fails |
| Font subset | Guide Hangul pushes UI fonts over 190 KB | check-dist fails; Bob stops and flags | Build fails |

## Test map
**Unit (vitest):**
- **T1** `deeplink.test.ts` [GAP, new]:
  - parse and serialize round-trip for each tool;
  - invalid, oversized and unknown params → null;
  - the `custom` preset is rejected;
  - target bounds: photo 10, 20000, 9, 20001, "1e3", "200.5"; pdf "0.5", "100", "100.1", "0.45".
- **T2** `share.test.ts` (jsdom) [GAP, new]:
  - the share arguments are exactly title, text and url;
  - AbortError is silent; any other error → copy;
  - a clipboard reject → the readonly field;
  - "링크 보내기" stays hidden without `navigator.share`;
  - the title contains 문서딱.
- **T3** `indexnow.test.ts` (mock fetch) [GAP, new]:
  - a preflight mismatch → no POST, exit 1;
  - an off-host URL is rejected;
  - 200 and 202 succeed; 422 and 429 exit 1;
  - `--sitemap` reads the dist sitemap;
  - URLs are de-duplicated; the body shape and keyLocation are correct.
- **T4** `guides-schema.test.ts` [GAP, new]:
  - every guide parses;
  - every related, tool and preset ref exists;
  - every CTA href passes `deeplink.parse`;
  - the year-in-title rule holds; `updated` ≥ `published`, and neither is in the future.
- **T5** quick links [GAP, new]: the derived values equal floor(limitBytes / 1000), and the labels match the preset sources.
- **T6** [GAP, new]:
  - every `_redirects` target exists;
  - robots.txt lists every named bot and both Sitemap lines;
  - check-dist constants: 15,000, 24 MiB, warning at 10,000.

**Dist (`postbuild.test.ts`, a new "growth" describe):**
- **T7 Brand** [GAP, new]: every guide, /guide/, the RSS channel title, the OG alt texts and the JSON-LD names say 문서딱. "docttak" appears only as the domain: inside URL values, and on the OG domain line. The existing Polish Q brand test ("docttak" not followed by ".com" fails) must also cover the new pages, RSS and llms.txt.
- **T8 JSON-LD validity** [GAP, new; tool JSON-LD partly TESTED]:
  - every `application/ld+json` block on every page parses;
  - each guide has exactly one Article: required fields present, ISO dates, image absolute and present in dist;
  - one BreadcrumbList with positions 1..n and absolute items;
  - a FAQPage whose Q/A text equals the visible FAQ.
- **T9 Facts** [GAP, new]:
  - every guide has `.guide-answer`, a source link (external https, not our host) and a `<time datetime>`;
  - every number+unit (KB, MB, 픽셀, cm, mm, 개월) in the rendered body appears in the source quotes, resolved presets or toolFacts of that page;
  - every source is at most 400 days old at build;
  - no quote text is rendered.
- **T10 Uniqueness and indexing** [GAP, new; home and tool meta TESTED]:
  - titles and descriptions are unique across all indexable dist pages, and their lengths are within the schema;
  - canonicals are path-only, with no "?";
  - the sitemap has every published guide with lastmod, and no draft or query URL;
  - the RSS parses as XML and its items equal the published guides;
  - the SW precache list has no `/guide/` or `/og/` path;
  - every guide has a share preview: og:image points to its own PNG, which exists at 1200×630. This extends the Polish Q "share previews" test.
- **T11 Internal links resolve** [GAP, new]:
  - every `href`/`src` starting with "/" in every dist HTML maps to a dist file (after stripping ? and #);
  - a query string is allowed only on tool paths and must pass `deeplink.parse`;
  - every guide links to at least 2 guides and 1 tool;
  - every published guide is linked from /guide/.
- **T12 Plain language** [TESTED, extend the scope]: the existing Polish Q test covers the guides, /guide/, 404, the RSS text and the OG alt texts, with **no new exemption**. "픽셀(px)" appears at most once per page. Add a negative test: a fixture guide containing "업로드" must fail it.

**E2E (Playwright, all projects):**
- Deep links:
  - `/id-photo/?preset=gosi` has gosi selected at load;
  - `/photo-compress/?target=200` has the 200 chip checked; `?target=250` shows custom 250; `?target=abc` shows the defaults;
  - changing an option updates `location.search`;
  - a quick-link click keeps a loaded file.
- Share:
  - with `navigator.share` stubbed, assert the payload;
  - without share support, copy puts the URL with its params on the clipboard (grant clipboard permissions in Chromium; in WebKit and Firefox assert the fallback field);
  - the URL never contains `blob:`.
- Guides: /guide/ and one guide have 0 serious or critical axe findings. The CTA opens the tool with the preset applied.
- 404: `/hwp/abc` suggests /hwp-to-pdf/ (the e2e server serves 404.html).

**Regression (existing behaviour at risk):**
- Tool pages without params look and behave exactly as before, and the existing e2e suites pass unchanged.
- Home, tool meta and OG from Polish Q are unchanged, except the added nav link, footer link and home guides section.
- The precache stays under 450 KB.

## Unverified claims (and what is in hand)
- **Gmail 25MB: verified.** support.google.com/mail/answer/6584?hl=ko, fetched 2026-09-30: "개인 Gmail 계정의 경우 ... 제한은 25MB입니다".
- **Naver mail limit: unverified.** Verbatim: "Claude Code is unable to fetch from help.naver.com".
- **Kakao photo limits: unverified.** cs.kakao.com returned a menu page only.
- **Domestic driving-licence photo: unverified.** Only the foreign-licence exchange rule was found (quoted in the page table).
- **CF Pages `_redirects`** support and limits: Bob confirms them against developers.cloudflare.com/pages/configuration/redirects/ and quotes the result in BUILD-LOG before relying on them.
- **IndexNow endpoint and codes** (200/202/400/403/422/429): Bob confirms them against indexnow.org/documentation and quotes the result.
- **Google HowTo deprecation:** used only as the reason for a decision; no test depends on it.

## Deploy gate
1. **Bob** runs every unit, dist and e2e test, `astro check`, check-dist, lhci (with the new URLs), `smoke:assets` and `qa:visual`. REVIEW-REQUEST lists:
   - the published and draft pages, with each source quote and its date;
   - the budget table and the file count.
2. **Richard:**
   - checks **every** spec number on 3 random guides against the live official page;
   - reviews share.ts for any path that puts a file into the payload, and deeplink.ts for injection;
   - reviews robots.txt and the canonicals.
3. **Arch:** "Growth G is clear" → local commit `[Growth G] 안내 페이지 N개 + 딥링크·공유 + sitemap/RSS/IndexNow`. The orchestrator pushes and deploys. Then:
   - live smoke: /guide/, 3 guides, /guide/rss.xml, /sitemap.xml, /robots.txt, /<key>.txt, one OG PNG, a deep link on a phone, share on a phone;
   - `npm run ping:indexnow -- --sitemap`;
   - submit the RSS and the sitemap in 서치어드바이저, and the sitemap in Search Console (runbook);
   - run the Kakao share debugger on 2 guide URLs.
4. **BUILD-LOG:** the step complete, with the date. Draft pages go to Known Gaps with their publish-by dates: page 14 by 2026-11-10, page 13 by 2026-11-30.
