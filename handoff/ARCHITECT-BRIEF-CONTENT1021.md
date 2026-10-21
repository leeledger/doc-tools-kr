# Architect Brief — CONTENT1021 (애드센스 재신청 P1: 안내 글 정리·보강)

Source: owner task 2026-10-21 (AdSense rejection 2026-10-20 「가치가 별로 없는 콘텐츠」; ADS1020 = P0, deployed). Base: main f0652e1.
Steps A → B1 → B2 → C → D, in order. Each step: Bob builds → Richard reviews → commit (orchestrator pushes + live smoke per step). Step N+1 starts after Step N is clear.

## Goal
After this sprint every guide page under /guide/ has ≥2,500 body characters of its own (scripts/lib/guide-length.mjs metric) and ≥2 of its own images, every Korean tool page has ≥2,000, duplicate photo/PDF guides are merged behind 301s, and the build fails if any of this regresses.

## Measured baseline (dist of 2026-10-20 23:47, prod-like)
- Guides (49 published + 2 hubs): only power-of-attorney 2,592 and passport-english-name 2,930 pass. Lowest: upload-limits hub 182, gosi-photo 211, resume-photo 218, photo-sizes hub 314. No guide has an image.
- Tool pages (22, metric T below): all under 2,000. Lowest char-count 720, english-address 752, pdf-merge 823; highest id-photo 1,903.
- Precache 431.1 / 450 KB (prod-like). Precached tool pages: /, /pdf-merge/, /pdf-compress/, /photo-compress/, /id-photo/, /stamp-signature/.

## Locked decisions (log in BUILD-LOG "CONTENT1021")
- D1 **Merges (301), 4 pairs.** Old page is deleted (its .md file); its facts/sources move into the survivor:
  | Old URL | → Survivor | Why |
  |---|---|---|
  | /guide/id-photo-size/ | /guide/photo-sizes/ (hub) | both are "증명사진 사이즈 한 표" |
  | /guide/id-photo-kb/ | /guide/photo-kb/ | same task (KB 맞추기), same tool |
  | /guide/passport-photo-error/ | /guide/passport-reissue-photo/ | both = 정부24 온라인 재발급 + same file table |
  | /guide/pdf-merge-free/ | /guide/pdf-merge/ | same task, same tool |
  `public/_redirects`: `<old>/` and `<old>` (no slash) → survivor, 301 (existing file pattern). Survivor gets an H2 carrying the old query (e.g. 「정부24 여권 사진 오류 코드별 해결」, 「증명사진 용량 맞추기 (200·350·500 KB)」, 「맥에서 무료로 합치기」) so the old intent keeps a home. Survivor `updated` = the build day.
- D2 **Differentiate, don't merge, the rest.** Exam/ID photo guides (gosi, police-exam, kuksiwon, qnet, korcham, history-exam, hanja-exam, jlpt, teps, admission, resume, id-card, driver-license, youth-card, intl-driving-license, baby-passport) stay: each is a different issuer with its own rules, expanded with that issuer's own content (D6), not shared filler. passport-photo becomes the 「촬영 기준」 page (얼굴·귀·옷·안경·종이 사진·사진관 vs 직접 찍기); its online-file/error detail shrinks to one line + link to passport-reissue-photo. HWP guides keep separate angles: hwp-on-phone = 휴대폰, open-hwp-without-hangul = PC, what-is-hwpx = 형식 설명.
- D3 **Hubs get sources + fact check.** `src/data/hub-schema.ts` gains `sources` (same union as guides: preset | url+title+quote+retrieved[+via], default []). Hub pages run `unsourcedFacts` on their body like `src/pages/guide/[slug].astro` (build fails on an unsourced number); allowed facts = hub sources + facts of the rendered table rows. Hubs count as guides for D4/D5 (same metric, 2,500, images rule). A guide `related` entry that pointed to id-photo-size gets another guide slug; the hub is linked in the body.
- D4 **Length bars (never lowered).** `scripts/lib/guide-length.mjs`: `GUIDE_MIN_CHARS = 2500`, `TOOL_MIN_CHARS = 2000`. New `toolBodyChars(html)` (metric T): text inside `<main>` minus `section.tool` (widget), `section.quick`, `section.related`, ad slots, script/style/template; same normalisation as guideBodyChars (tags out, entities decoded, URLs dropped, whitespace removed). Balanced `<section>` depth cutter, not first `</section>`. FAQ counts for tools. CLI: `node scripts/guide-length.mjs` (guides + hubs), `--tools` (tool pages); both print FAIL under the bar.
- D5 **Enforcement in check-dist** (postbuild; fails the build):
  1. Every visible guide and hub exists in dist with `<div class="guide-body">` and guideBodyChars ≥ GUIDE_MIN_CHARS. Expected list comes from the content, so a layout change cannot silently skip a page.
  2. Every built Korean tool page (LIVE_TOOLS at root; /en/, /embed/ excluded) has toolBodyChars ≥ TOOL_MIN_CHARS.
  3. Images: each guide/hub body has ≥2 `<figure class="guide-fig">` whose `<img>` src starts `/img/guide/<own slug>/`, file exists in dist, `width`/`height` positive integers matching the file's aspect within 1 percent, `alt` ≥10 code points, `loading="lazy"`, `decoding="async"`, plus a `<figcaption>`. SHA-256 of every guide image unique site-wide. SVG ≤30 KB, WebP/PNG ≤80 KB.
  4. SVG safety: no `<script`, `<foreignObject`, `on*=` attributes, `<image`, or `href`/`xlink:href` other than `#…`; no @import or url() fonts.
  5. Uniqueness (the "고유" in 고유 글자수): no `p`, `li`, `blockquote` or `figcaption` text of ≥60 code points (whitespace removed) appears in two different guide/hub bodies; same rule across tool-notes sections (D8). Existing collisions the rule finds are rewritten, never whitelisted.
  6. No D1 old path appears in any dist text file except `_redirects`; no old path has a dist file; every `_redirects` target exists (existing unit test).
  - Scaffolding (Steps A–C only): `LENGTH_PENDING` (Set of slugs/tool paths) in guide-length.mjs downgrades rules 1–3 to WARN for pages not yet expanded. Each step removes its pages. Step D deletes the constant and every reference; the unit test then asserts `GUIDE_MIN_CHARS === 2500`, `TOOL_MIN_CHARS === 2000` and that the module exports no `LENGTH_PENDING`. Rules 4–6 have no exemption from Step A on. A page that passes may never be added to the list.
- D6 **What goes into a guide (no filler).** Per guide, pick from: step-by-step per device (아이폰·갤럭시·PC; OS menu names cited from Apple/Samsung/Microsoft help when stated as fact); the issuer's own rules quoted or paraphrased (배경, 촬영 시점, 모자·안경, 신분증 인정 범위, 사진 변경 방법, 접수 순서); 「안 될 때」 troubleshooting; 「내기 전에 확인할 것」 checklist; how it differs from the neighbouring document (links). Not allowed: invented experience ("제가 해 보니"), paragraphs reused across guides, padded figcaptions, tool self-praise, dates/fees/ages not in an official source.
- D7 **Numbers.** Every new number (any unit, incl. 원·세·일·장·회) comes from an official page: a front-matter `sources` entry (url, title, verbatim quote ≤300, `retrieved` = fetch day, `via: browser` for script-shell pages) **and** a saved excerpt `handoff/sources/content1021/<slug>-<n>.txt` (URL, fetch date, the verbatim lines). `npm run check:quotes` (--exact) passes. Extend `src/data/guide-facts.ts` `Unit` with `원` and `세` (money and age are the specs most likely to be invented); an existing guide that then fails gets a source or loses the number, never a weaker check. Tool limits come from TOOL_FACTS via `toolFacts`. If an official page cannot be read, write the passage without the number and log URL + verbatim failure in the step's BUILD-LOG entry.
- D8 **Tool pages: notes collection.** New collection `toolNotes`: `src/content/tool-notes/<tool-slug>.md` (filename = the tool slug of a Korean tool page; front matter `sources` and `toolFacts`, strict, both default []; body Markdown with H2s). `src/components/ToolNotes.astro` renders `<section class="tool-notes" aria-labelledby=…>` between `section.why` and `section.faq` on every Korean tool page (no change to /en/ or /embed/). Build fails on unsourcedFacts in a note (note's own sources + toolFacts). Content per tool, plain Korean (docs/COPY.md; scripts/lib/plain-words.mjs gate): 「이럴 때 써요」, 「아이폰·갤럭시·PC에서」 (where to find the file, where the result is saved), 「결과가 이상할 때」, 「주의할 점」. Tool FAQ items in src/data/tools.ts may be added (they count in metric T) within existing schema limits. Unit: every tool page has a notes file; a notes file for an unknown slug fails.
- D9 **Images.** Files at `public/img/guide/<slug>/<n>-<name>.svg` or `.webp`. In Markdown as raw HTML: `<figure class="guide-fig"><img src="/img/guide/<slug>/1-name.svg" width="W" height="H" alt="…" loading="lazy" decoding="async"><figcaption>…</figcaption></figure>`, never before the first H2 (LCP stays text). Allowed kinds: hand-written SVG diagrams (framing guide with measurement lines, step flow, before/after size, error-code map, comparison) and screenshots of 문서딱's own tool screens made by a committed script `scripts/guide-shots.mjs` (Playwright, fixed viewport, WebP, deterministic). No photos of real people (illustrated silhouette only), no third-party site screenshots, no stock or AI images, no logos.
  SVG: own opaque light background + 1px border (readable in dark mode), system-ui / Apple SD Gothic Neo / Malgun Gothic / sans-serif font stack, `role="img"` + `<title>`. Every number drawn in an SVG passes unsourcedFacts with that guide's facts (unit test reads the SVG text nodes).
  CSS: guide-fig img max-width 100 percent, height auto, dark-mode border. `_headers`: `/img/guide/*` Cache-Control public, max-age=604800. Not precached (confirm in gen-sw output).
- D10 **Precache budget.** Expanding the 5 precached tool pages adds roughly 12–15 KB. If gen-sw goes over 450 KB: move /stamp-signature/ to NOT_PRECACHED (+ sw.ts RUNTIME_PAGES, TOOLS4 precedent), then /photo-compress/ if still over; log the measurements. Never raise PRECACHE_LIMIT.
- D11 **Copy rules unchanged**: "문서딱" only; no 업로드/서버/브라우저/네트워크/EXIF/dpi on Korean pages; do not lead with "files never leave"; the 배경 지우기 exception wording only where CLAUDE.md allows; title/answer/description lengths per guide-schema. Bylines/JSON-LD unchanged.
- D12 **AdSense review request** stays an owner item (OPS-RUNBOOK §11 step 3): once, after Step D is live, not before mid-November. Note it in the Step D BUILD-LOG entry; never touch the console.

## Flow
```
content .md ──astro build──> dist/guide/<slug>/index.html ─┐
tool-notes .md ─────────────> dist/<tool>/index.html ──────┤
public/img/guide/<slug>/* ──> dist/img/guide/<slug>/* ─────┤
public/_redirects (old → survivor 301) ────────────────────┤
                                                           v
postbuild check-dist: D5.1 guide ≥2,500 · D5.2 tool ≥2,000 · D5.3 ≥2 own figures, unique hashes
                      D5.4 SVG safe · D5.5 no shared ≥60-char block · D5.6 no old path in dist
                      (Steps A–C: LENGTH_PENDING → WARN for 5.1–5.3 only; Step D: constant deleted)
                      any FAIL ─> build fails ─> Cloudflare keeps the last good deploy
old URL request ─> Cloudflare _redirects 301 ─> survivor (H2 for the old query)
```

## Build Order
### Step A — consolidation + enforcement scaffolding + 5 pilot pages
1. Refactor first (own commit): guide-length.mjs constants, `toolBodyChars`, CLI `--tools`, `LENGTH_PENDING` (= every page below the bar today), unit tests (tests/unit/guide-length.test.ts).
2. check-dist rules D5.1–D5.6 (pure lib functions in scripts/lib, unit-tested; check-dist only wires them). D7 Unit 원/세 + fix any existing guide it catches.
3. Hub sources + fact check (D3). Figure CSS + `_headers` rule (D9).
4. Merges D1: move content/sources, delete old .md, `_redirects`, update every reference (grep: guide `related` lists, body links, src/pages/index.astro, src/pages/404.astro, scripts/lib/guide-titles.mjs via its generator scripts/gen-guide-titles.mjs, tests/unit/guides-schema.test.ts, docs/GROWTH-RUNBOOK.md). Confirm llms.txt, RSS, sitemap, OG images drop the old slugs (all generated).
5. Pilots to the full bar (≥2,500 + 2 images, out of LENGTH_PENDING): photo-sizes hub, photo-kb, passport-reissue-photo, passport-photo (D2 re-angle), pdf-merge. Images only for power-of-attorney and passport-english-name (already long). `scripts/guide-shots.mjs` lands here.
### Step B1 — photo/ID/exam guides (18) to the full bar
baby-passport-photo, id-card-photo, driver-license-photo, youth-card-photo, intl-driving-license, id-card-copy, gosi-photo, police-exam-photo, kuksiwon-photo, qnet-photo, korcham-photo, history-exam-photo, hanja-exam-photo, jlpt-photo, teps-photo, admission-photo, resume-photo, upload-limits hub.
### Step B2 — PDF/HWP/서류/사진 보내기/서명 guides (22) to the full bar
pdf-compress, pdf-password, pdf-split, pdf-sign, pdf-to-jpg, jpg-to-pdf, email-attachment-limit, ecfs-pdf-limit, yearend-tax-pdf, gov24-pdf-save, kosaf-docs, univ-docs-upload, hwp-on-phone, hwp-to-pdf, hwpx-to-hwp, open-hwp-without-hangul, what-is-hwpx, heic-to-jpg, kakao-photo, remove-background (`requires: bg-remove`; must pass in the build where it is visible), stamp-image, e-signature-law.
### Step C — tool pages (22) to ≥2,000
toolNotes collection + ToolNotes.astro on every Korean tool page (D8); D10 precache check.
### Step D — lock
Delete LENGTH_PENDING and its code paths; final unit assertion (D5 scaffolding note); full gates; BUILD-LOG; orchestrator deploys + live smoke (curl -I of the 8 redirect URLs, 3 guide + 3 tool pages 200, their images 200, `node scripts/guide-length.mjs` and `--tools` on a fresh prod-like build pasted in full).

- Flag: never lower GUIDE_MIN_CHARS / TOOL_MIN_CHARS, never whitelist a duplicate block, never add a passing page to LENGTH_PENDING.
- Flag: a guide whose issuer page cannot be read and that cannot reach 2,500 with sourced or number-free practical content → stop on that guide, log tried URLs + verbatim errors, report to Arch (merge/draft is Arch's call, not Bob's).
- Flag: titles ≤40 with suffix; the year-in-title rule (driver-license 2026) holds with the new `updated`.
- Flag: Korean pages only; 「Docttak」 never on them.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| 301 | Old URL 404s (no-slash variant missing) | both variants in _redirects; unit: targets exist; live curl -I in Step A and D | 301 to survivor |
| 301 | A body/related still links an old slug | D5.6 dist-wide scan + schema `related` check | Build fails |
| Merge | Survivor loses a sourced number of the old page | move its `sources`; unsourcedFacts fails otherwise | Build fails |
| Length | Layout change moves text out of div.guide-body → metric silently low | D5.1 expected list from content; unit on the Guide layout output | Build fails |
| Length | Padding with repeated paragraphs | D5.5 cross-page duplicate rule + Richard read | Build fails |
| Facts | New fee/age invented | Unit 원/세 in checker + check:quotes --exact + saved excerpt | Build/CI fails |
| Facts | Number only in an SVG, unsourced | SVG text through unsourcedFacts (unit) | CI fails |
| Images | Missing width/height → CLS | D5.3 attributes + Lighthouse CI | Build fails |
| Images | SVG with script/external ref | D5.4 | Build fails |
| Images | One screenshot reused on 10 exam guides | D5.3 hash uniqueness | Build fails |
| Images | Unreadable in dark mode | opaque SVG background + qa:visual dark run | Fixed before review |
| Perf | Guide LCP/weight regresses | lazy figures after first H2, size caps, LH CI thresholds unchanged | No regression shipped |
| Precache | Tool notes push precache over 450 KB | D10 pre-locked page moves | Build fails until moved |
| Copy | Banned word in new prose | plain-words gate (existing) | Build/CI fails |
| Tool notes | Note for a flagged tool breaks the build where the tool is off | render only where the page is built; unit covers default + cloud builds | Build fails |
| Deploy | Steps A–C live with pending pages | accepted (production already has them); Step D removes the list; D12 holds the review request | Old state, no new harm |
No silent and untested path remains.

## Test map
- guide-length: constant values; toolBodyChars (nested sections; quick/related/tool excluded; FAQ counted; entities; URLs) [GAP→unit]; guideBodyChars [TESTED].
- check-dist libs: length rule, pending WARN vs FAIL, figure rule (missing attr, wrong slug dir, missing file, aspect mismatch, dup hash, size cap), SVG safety, duplicate-block rule, old-path scan [GAP→unit, pass and fail cases each].
- _redirects: 8 new lines, targets exist [TESTED pattern, extend]; sources absent from dist [GAP→unit].
- Hub schema `sources` + hub unsourcedFacts [GAP→unit in guides-schema.test.ts].
- guide-facts 원/세: unsourced fee flagged; sourced → [] [GAP→unit].
- SVG text facts per guide [GAP→unit].
- toolNotes: every Korean tool page has a note; unknown slug fails; unsourced number fails [GAP→unit].
- e2e [GAP→add]: one guide page shows 2 figures with naturalWidth > 0 and no off-site request (no-upload fixture); one tool page shows section.tool-notes; if tests/e2e/serve.mjs models _redirects, one old URL → 301 survivor (else unit + live curl).
- Regression [TESTED, stays green]: npm run check, npm test, check-dist default + prod-like + cloud builds, check:quotes, check:licenses, e2e chromium + 5 projects + cloud + axe, Lighthouse CI thresholds unchanged, regress --fixtures-only, en-check, embed-check.
- Manual (REVIEW-REQUEST per step): guide-length table before/after; precache number; qa:visual light/dark on 2 guides + 2 tool pages; live curl after deploy.

## Out of Scope (→ BUILD-LOG Known Gaps)
- English (/en/) pages and /embed/; publishing any draft guide; new guides; ad units/serve stage; Coupang; AdSense console actions; Search Console removals (sitemap + 301 suffice).

## Acceptance
- Step D, default and prod-like builds: `node scripts/guide-length.mjs` → every guide + hub ≥2,500; `--tools` → every Korean tool page ≥2,000; LENGTH_PENDING gone.
- 4 merged URLs (8 variants) 301 live; survivors carry the old intent H2; no old slug in dist.
- ≥2 own images per guide/hub: unique, safe, lazy, sized.
- check:quotes --exact green; every new number has a saved excerpt under handoff/sources/content1021/.
- All gates green, thresholds and budgets unchanged; Richard "clear" on each step; BUILD-LOG entry per step; live smoke.
