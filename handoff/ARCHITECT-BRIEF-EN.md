# Architect Brief — EN (English version at /en/), phased EN0–EN4

Owner ask: English 문서딱 at https://docttak.com/en/ for the global market (higher RPM). Arch, 2026-10-12.
Base: after REV2 commit. ARCHITECT-BRIEF.md first line untouched. Owner decisions D1–D6 at the end; D1 blocks EN1 copy only, not EN0.

## Goal
Global users find and use the PDF/photo tools in plain English at /en/<tool>/, with ko<->en hreflang pairs,
while every Korean page, font byte, precache byte and JS budget stays where it is.

## Locked decisions
1. **Route model:** static twins. `src/pages/en/<slug>/index.astro` per tool, same slug as Korean. `/en/` home,
   `/en/privacy/`, `/en/terms/`. No Astro i18n routing config, no middleware, no second build (two builds merged
   into one dist breaks sitemap/SW/check-dist; rejected).
2. **Layout:** new `src/layouts/BaseEn.astro` (not a `lang` prop on Base.astro). Korean pages stay byte-identical by
   construction; Base.astro gets one footer line only (item 9). BaseEn imports **exactly** the three CSS files of
   Base in the same order, so Astro emits the same CSS chunk (a different import set can split app.css into a 2nd
   request on Korean pages = LCP regression).
3. **Fonts:** EN pages use the system stack. One rule in `src/styles/app.css` (the UI-font stylesheet, so the
   check-dist system-font rule holds): `html[lang="en"] body { font-family: system-ui, -apple-system, "Segoe UI",
   Roboto, "Helvetica Neue", Arial, sans-serif; }`. BaseEn has **0** font preloads. `@font-face` stays declared but is
   never matched, so no woff2 request (e2e asserts). Selector is `html[lang="en"]`, never `:lang(en)` (the "English"
   link on Korean pages carries lang="en" and must keep the UI font).
4. **Core font isolation:** `scripts/lib/ui-font-chars.mjs` skips `src/i18n/` and `src/pages/en/` (neither core
   nor late). All English text lives there: catalogs, EN tool registry, EN components (`src/i18n/en/components/`).
   Korean catalogs stay under `src/tools/<tool>/` so core/late classification is unchanged. PRELOAD_TRIPWIRE is not
   raised; core 400+800 bytes must equal HEAD.
5. **Controller messages (EN0 refactor):** each in-scope controller takes a required catalog argument:
   `initMergeTool(KO)`. `src/tools/<tool>/messages.ko.ts` (Korean, moved verbatim) and
   `src/i18n/en/tools/<tool>.ts` (English), both typed by one `Messages` interface in the ko file
   (`satisfies`). Plurals/particles are functions in the catalog (`mergeButton: (n) => ...`); josa stays inside
   the ko catalog only. Shared lib strings (format.ts `formatPages` 쪽, pdf-pick `nonPdfMessage`, engine-load,
   lib/image/messages.ts, next-steps labels) become catalog entries passed down, not locale switches inside libs.
   No runtime `lang` lookups, no default-to-KO parameter (a default would bundle KO into EN and hide a missed
   wiring). Korean pages never import an EN catalog (check-dist marker, item 12).
6. **Markup:** EN pages duplicate the Korean page markup with English text, **same element ids**. Drift guard:
   check-dist id-parity rule (the `id` set of each EN page = that of its Korean twin, minus a per-page allowlist in
   `scripts/lib/en-check.mjs`). No shared ToolMarkup extraction now (would rewrite every Korean page; REV5 does it
   for id-photo only and EN3 reuses that).
7. **hreflang:** in `sitemap.xml` only (xmlns:xhtml, `xhtml:link` on both ko and en `<url>` entries: `ko`, `en`,
   `x-default` -> **EN URL**). Zero bytes added to precached Korean HTML. Google documents sitemap, HTML and HTTP
   header as equivalent methods (developers.google.com/search/docs/specialty/international/localized-versions);
   one method = no inconsistency. Every page self-canonical. EN pages: `<html lang="en">`, `og:locale en_US`,
   `og:locale:alternate ko_KR`. robots.txt unchanged (same sitemap). IndexNow list gains the /en/ URLs.
8. **Precache / SW:** `NOT_PRECACHED` gains `path.startsWith('/en/')`; `RUNTIME_PAGES` (src/sw/sw.ts) unchanged, so
   EN pages are network-only. Offline on /en/ falls back to the Korean /offline/ page: Known Gap, EN2.
9. **Language switch:** EN pages: footer `<a href="/<slug>/" hreflang="ko" lang="ko">한국어</a>`. Korean pages
   **with an EN twin** (+ home): footer `<a href="/en/<slug>/" hreflang="en" lang="en">English</a>` (~60 B/page).
   Rule: if precache headroom after REV3 R3.0 is < 1.0 KB, the KO-side link is omitted on precached pages (hreflang
   still pairs them). No auto-redirect by Accept-Language/IP (Googlebot crawls from the US; it would hide Korean pages).
10. **Analytics on /en/:** CF Web Analytics yes (cookieless). **GA4 no** (BaseEn never renders /ga.js: the simplest
    GDPR/ePrivacy-compliant choice, no consent banner). **Usage beacon off on /en/ in EN1**: one guard in
    `src/lib/ui/usage.ts` (send only when `document.documentElement.lang === 'ko'`), so Korean stats stay clean.
    EN2 adds a whitelisted `l` key (ko|en) + admin split.
11. **Monetization on /en/:** none in EN1–EN3. Coupang / affiliate / `.out-links` / `rel="sponsored"` forbidden under
    /en/ (check-dist). No ad slot markup. AdSense only on future EN guide articles (EN4: extends the REV4 guide
    allowlist and guide CSP block to /en/guide/). Amazon Associates in EN4 (owner signup).
12. **check-dist:** all EN rules in a new `scripts/lib/en-check.mjs` (pattern of print-links-check.mjs); one import +
    one call in check-dist.mjs. Existing rules change scope, never weaken: "exactly 2 core preloads" -> Korean pages;
    EN pages exactly 0. "Exactly one /ga.js" -> Korean pages; EN pages 0. Font coverage -> Korean pages; EN pages
    exempt (system font, asserted by rule 3). Meta length becomes lang-aware in `scripts/lib/meta-length.mjs`.
13. **Meta length for English** (code points; SERP truncates by pixels, ~600 px): title <= 60 incl. suffix,
    description 70–155, og/twitter description <= 155. Korean 40 / 40–80 unchanged. Constants in
    `src/i18n/en/site.ts` + meta-length.mjs; a unit test keeps them equal (pattern of the TITLE_MAX test).
14. **Excluded from EN (Korea-only):** HWP/HWPX tools (hwp-to-pdf, hwp-viewer, hwpx-to-hwp), Korean ID presets,
    Korean guides/hubs, Coupang. stamp-signature only as "Signature image maker" in EN2 (no 도장 framing).
    remove-background: **not in EN** while its default path sends a photo to /api/remove-bg (EU personal-data
    processing + privacy-officer duties abroad); revisit as on-device-only EN5 if demand shows.
15. **Copy (docs/COPY.md gets an "English" section):** plain English, 6th–8th grade, sentence case, task first.
    Title/H1/lead say what it does + "Free, no sign-up". **Privacy is the #2 message, never the lead**: one line under
    the drop zone ("Your files stay on your device. Nothing is uploaded."), one "why" point, one FAQ ("Are my files
    uploaded?"), and allowed as the 2nd sentence of the meta description (it is the long-tail search term).
    "upload" and "browser" are allowed in English (they are the words users search). No "AI", no "secure/military
    grade". Units MB/KB, en-US number format.

## Flow
~~~
request /en/pdf-merge/
  CF Pages static -> dist/en/pdf-merge/index.html (BaseEn: lang=en, 0 preloads, no ga.js, CF beacon if token)
  page <script>: import { initMergeTool } from tools/pdf-merge/controller
                 import { EN } from i18n/en/tools/pdf-merge      --> initMergeTool(EN)
  Korean page:   import { KO } from tools/pdf-merge/messages.ko  --> initMergeTool(KO)
controller -> libs (format/pdf-pick/engine-load) receive catalog entries; workers unchanged (codes only, no text)
SW: /en/ pages not precached, not runtime-stored; offline navigation -> /offline/ (KO)   [Known Gap]
sitemap.xml: <url ko> + xhtml:link ko/en/x-default(en)  <->  <url en> + the same three links
not found under /en/ -> dist/en/404.html if CF nearest-404 holds (verify), else root 404 (KO)
~~~

## Phases (one step at a time; each its own Bob/Richard cycle)

### EN0 — Catalog refactor, no behavior change (worktree, parallel with REV3)
- Tools: pdf-merge, pdf-compress (incl. `level-copy.ts`, stays a CORE_PATH), image-to-jpg. Plus the shared libs they
  touch: lib/ui/format.ts, pdf-pick.ts, engine-load.ts, next-steps.ts (labels only), lib/image/messages.ts;
  components EngineError.astro / Share.astro (labels via props; Korean pages pass the current Korean).
- Move strings verbatim into `messages.ko.ts`; controller signature `init*(m: Messages)`; Korean pages pass KO.
- Flag: workers stay text-free (they return codes today; if one returns Korean text, stop and report).
- Flag: the `ui-shared` manualChunks regex in astro.config.mjs must still match the libs (no renamed modules).
- Acceptance:
  - Every Korean HTML file in dist byte-identical to the pre-EN0 build (diff script output pasted; hashed asset
    names normalized).
  - Every check-dist budget within +1% of HEAD; core font bytes = HEAD; precache delta <= +0.1 KB.
  - Unit: each ko catalog value equals the old literal (snapshot taken before the move).
  - Existing e2e for the 3 tools × 5 projects green; vitest + astro check green.

### EN1 — English foundation + 3 tools (after REV3 R3.0 is merged; needs D1, D2, D3, D5)
Build order:
1. `src/i18n/en/site.ts` (EN SITE: name per D1, tagline, TITLE_SUFFIX, meta limits), `src/i18n/en/tools.ts`
   (EN registry for the 3 slugs: name, title, description, h1, summary, faq, updated; icons imported from
   tools.ts; FAQ numbers read from the same `limits.ts`, en-US formatting), `src/i18n/en/og.json`.
2. `src/layouts/BaseEn.astro` + `src/i18n/en/components/` (Share, RelatedTools limited to EN twins, EngineError EN).
   Header nav lists EN tools only; footer: Privacy, Terms, Open-source licenses (-> Korean /licenses/, noted),
   한국어 switch, © line. No blog links (Korean blogs).
3. Pages: `/en/` (H1 + 3 tool cards + short FAQ), `/en/pdf-merge/`, `/en/pdf-compress/`, `/en/image-to-jpg/`
   (title targets "HEIC to JPG"), `/en/privacy/`, `/en/terms/` (D3 content), `/en/404` (see Unverified).
   Chain/next-steps group not rendered on EN (EN2). JSON-LD in `src/i18n/en/jsonld.ts` (WebApplication + FAQPage,
   inLanguage en).
4. Shared one-liners: app.css font rule; ui-font-chars.mjs exclusions; gen-sw NOT_PRECACHED; usage.ts lang guard;
   Base.astro KO footer "English" link via `enTwin(path)` from `src/i18n/en/tools.ts`; sitemap.xml.ts xhtml
   alternates; llms.txt.ts appends an "## English" section; gen-brand.mjs also draws the `src/i18n/en/og.json`
   images (Pretendard has Latin) as `/brand/og-en-<image>.png`; IndexNow list.
5. `scripts/lib/en-check.mjs` rules, pass/fail fixtures in a NEW `tests/unit/en-check.test.ts` (not
   postbuild.test.ts: REV3/4/5 all edit it):
   a. EN HTML: `lang="en"`; 0 font preloads; no `/ga.js`; no `link.coupang.com`, no `rel` containing sponsored,
      no `.out-links`, no ad slot markup.
   b. No Hangul in visible text of EN pages except inside an element with `lang="ko"`.
   c. No Korean page initial or controller chunk graph contains `EN_CATALOG_MARK` (exported by every EN catalog);
      no EN page graph contains a KO catalog mark.
   d. id parity EN page vs Korean twin (allowlist per page).
   e. Sitemap: every /en/ URL has a Korean twin; reciprocal `xhtml:link` ko/en/x-default on both; x-default = en;
      every EN page canonical = itself.
   f. Meta length by lang (decision 13).
   g. Precache list has no /en/ path.
   h. Each Korean page links the same CSS files as before EN1 (CSS split guard, decision 2).
6. `docs/COPY.md` English section; tests.
- Acceptance:
  - check-dist OK on default, cloud flag-on (CI env) and AUTOFRAME builds; precache <= 450 KB, delta reported;
    core font = HEAD; Korean HTML diff = only the footer "English" line on twin pages + home.
  - e2e `tests/e2e/en.spec.ts` × 5 projects: each EN page loads; `html[lang=en]`; no woff2 request; no ga.js request;
    axe 0 serious/critical; no Hangul in `body.innerText` outside `[lang=ko]` after each flow; real flows under the
    no-upload fixture: merge 2 PDFs, compress to a target, HEIC/PNG -> JPG; non-PDF error shows the English message;
    language switch round-trips both ways.
  - Existing Korean e2e suites green (regression).
  - vitest: catalog key parity (type + runtime), EN catalog values Hangul-free, meta-length constants equal,
    usage guard (lang=en -> no send).

### EN2 — Remaining global tools + usage split (after EN1 deployed)
- jpg-to-pdf (+ Letter page size if D4 = yes), pdf-to-jpg, pdf-split, pdf-password, pdf-sign, photo-compress
  ("compress image to 100 KB"), stamp-signature as "Signature image maker" (transparent PNG).
  Per tool: EN0-style refactor commit, then EN page commit. May split EN2a (PDF) / EN2b (photo).
- Chain/next-steps on EN with EN-only destinations (a KO destination from an EN page = check-dist failure).
- Usage `l` key (ko|en) in scripts/lib/usage.mjs whitelist + admin/weekly split + Korean privacy sentence + EN
  privacy update; remove the EN1 guard. `/en/offline/` + SW fallback by path prefix.
- Acceptance as EN1 per tool; usage e2e asserts `l=en` from /en/ and `l=ko` from Korean pages.

### EN3 — Passport / ID photo (global) — after REV5 (reuses IdPhotoTool.astro)
- Strong niche, only with official sources, same discipline as Korean presets (verbatim `quote` + URL + retrieved date
  + `check:quotes` source-watch). Candidates: US passport/visa 2x2 in (600x600 px online; travel.state.gov), UK
  passport digital (gov.uk), Schengen/EU 35x45 mm, Canada 50x70 mm, Australia 35x45 mm, India passport/visa,
  China visa 33x48 mm, Japan 35x45 mm. Ship only presets whose official page was quoted; drop the rest.
- Own preset file `src/i18n/en/id-photo-presets.ts` so Korean preset ids / preset-ids.ts stay untouched.
- No print/affiliate links. Line: "Check the current rules for your country before you submit."
- Why not EN1: id-photo is the hottest file set in flight (REV2 done, REV3 links, REV5 extraction), and a wrong size
  rejected at a passport office is the worst failure this site can cause abroad.

### EN4 — English guides + monetization (after REV4)
- `/en/guide/<slug>/` long-tail articles (passport sizes by country, merge PDF without uploading, compress PDF to
  1 MB, HEIC to JPG on Windows). Separate content collection; guide schema gains lang.
- AdSense on EN guide articles only: extend the REV4 allowlist + guide CSP block to /en/guide/. EEA/UK/CH CMP
  question (Unverified, D6) decided before EN ad serving.
- Amazon Associates links on EN guides (owner signup; mandated disclosure verbatim from the program page).

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| Catalog wiring | A missed Korean string shows on EN | en-check (b) on static HTML + e2e innerText scan after flows | Caught pre-deploy |
| Catalog bundling | KO page imports EN catalog (bytes on precached pages) | en-check (c) marker | Build fails |
| CSS split | BaseEn import set differs -> KO pages gain a CSS request | Same imports + en-check (h) | Build fails |
| Font | EN text triggers anolim woff2 (EN LCP) or grows core font | Decision 3 + e2e no-woff2 + PRELOAD_TRIPWIRE + exclusion | Build/e2e fails |
| Markup drift | KO page gains an id, EN twin not updated -> controller null deref on EN | en-check (d) id parity | Build fails |
| hreflang | One-way pair or wrong x-default -> Google ignores the pair | en-check (e) | Build fails |
| Precache | KO "English" links push cloud flag-on over 450 KB | gen-sw gate + decision 9 fallback | Build fails |
| Analytics | GA tag leaks onto /en/ (EU consent breach) | en-check (a) + e2e no ga.js request | Build/e2e fails |
| Usage | EN events pollute Korean stats | usage.ts guard + unit test | (silent otherwise) tested |
| Affiliate | Coupang link copied into an EN page | en-check (a) | Build fails |
| 404 | /en/typo serves the Korean 404 | Probe; fallback acceptable | Korean 404 (clear, not broken) |
| Offline | EN user offline gets the Korean offline page | Known Gap -> EN2 | Korean message |
| Chain | EN result hands off to a Korean tool | Not rendered in EN1; EN2 check-dist rule | n/a |

## Test map
- BaseEn head/footer/no-GA/no-preload — [GAP] -> en-check (a) fixtures + en.spec.
- EN catalogs complete & Hangul-free — [GAP] -> unit.
- KO catalogs equal old literals — [GAP] -> EN0 snapshot unit.
- KO HTML unchanged — [GAP] -> EN0 dist diff; EN1 diff = footer line only.
- EN tool flows ×3 with no-upload — [GAP] -> en.spec × 5 projects.
- EN errors (non-PDF, corrupt, too big) in English — [GAP] -> en.spec, one per tool.
- axe on EN pages — [GAP] -> en.spec (axe pattern from growth.spec / hubs.spec).
- Sitemap reciprocity / x-default — [GAP] -> en-check (e) + unit on the sitemap route.
- Meta length by lang — [GAP] -> meta-length unit + en-check (f).
- Precache excludes /en/ — [GAP] -> en-check (g).
- Core font bytes = HEAD — [TESTED] PRELOAD_TRIPWIRE; no woff2 on EN — [GAP] e2e request assert.
- Korean tool regressions — [TESTED] existing specs, all 5 projects, must stay green.
- Usage guard on EN — [GAP] -> unit; Korean usage.spec unchanged [TESTED].

## Unverified claims (prove with a probe or doc line before relying on them)
- Cloudflare Pages serves the nearest 404.html up the path tree (so dist/en/404.html serves unknown /en/ paths):
  cite the CF Pages "Not Found behavior" doc line and curl -sI a preview /en/nope/. Astro may emit
  src/pages/en/404.astro as en/404/index.html under build.format directory: check dist; if so a postbuild copy to
  en/404.html is OK.
- Google requires a Google-certified CMP to serve ads to EEA/UK/CH users (EN4 only): cite the Google EU user consent
  policy page before EN ad serving.
- GDPR Art. 27(2) exemption from an EU representative (occasional, low-risk processing): a legal reading; owner or
  counsel confirms (D3). The brief does not assert it.

## Out of Scope (-> BUILD-LOG Known Gaps if surfaced)
- HWP/HWPX, Korean presets, Korean guides in English; remove-background EN (cloud path).
- Other languages: EN catalogs make them possible later; no [lang] dynamic routing now.
- Auto language redirect; region-gated GA; consent banner.
- English /licenses/ (Korean page linked from the EN footer).
- EN offline page, EN usage split, EN chain (all EN2).

## Shared files (conflicts with in-flight work)
| File | EN step | Also touched by | Risk / handling |
|---|---|---|---|
| src/tools/{pdf-merge,pdf-compress,image-to-jpg}/controller.ts, limits.ts | EN0 | none in REV3/4/5 | Low; worktree OK |
| src/lib/ui/format.ts, pdf-pick.ts, engine-load.ts, next-steps.ts; src/lib/image/messages.ts | EN0 | CHAIN (done) | Low |
| src/components/EngineError.astro, Share.astro | EN0 | none | Low |
| src/pages/{pdf-merge,pdf-compress,image-to-jpg}/index.astro (script lines) | EN0 | REV3 (pdf-merge OutLinks if placed) | Low |
| scripts/check-dist.mjs | EN1 (1 import + call; preload/GA/coverage scope) | REV3, REV4, REV5 | **High**; rules in en-check.mjs, rebase last |
| tests/unit/postbuild.test.ts | avoided (new en-check.test.ts) | REV3, REV4, REV5 | none if avoided |
| scripts/gen-sw.mjs (NOT_PRECACHED) | EN1 | REV3 (/hwp-to-pdf/ out) | Medium, 1 line; EN1 after REV3 |
| src/lib/ui/usage.ts | EN1 guard, EN2 l key | REV3 (guide out) | Medium; after REV3 |
| scripts/lib/usage.mjs + admin-view + functions | EN2 | REV3 (GUIDE_OUT) | Medium; after REV3 |
| src/layouts/Base.astro (footer link) | EN1 | REV4 (verification meta) | Low, 1 line |
| src/styles/app.css (1 rule) | EN1 | REV3 (.print-links -> .out-links, L486) | Low |
| scripts/lib/ui-font-chars.mjs | EN1 | REV3 (rename in stripComments) | Low |
| scripts/lib/meta-length.mjs | EN1 | none | Low |
| src/pages/sitemap.xml.ts, llms.txt.ts | EN1 | GROWTH3 (reads guides dynamically) | Low |
| scripts/gen-brand.mjs, src/data/indexnow.json | EN1 | GROWTH3 | Low |
| src/data/site.ts | not touched (EN constants in src/i18n/en/site.ts) | REV4 | none |
| public/_headers | not touched in EN1–EN3; EN4 extends the REV4 guide CSP | REV3/4/5 | EN4 after REV4 |
| CLAUDE.md | owner edits only (D1, D2) | REV4, REV5 (owner text) | Owner |
| src/data/id-photo-presets.ts, src/tools/id-photo/ | EN3 only | REV2, REV3, REV5 | EN3 after REV5 |
| docs/COPY.md | EN1 (new section at end) | REV3 | Low |

Ordering: REV2 commit -> EN0 (worktree, parallel with REV3) -> REV3 merged -> EN1 -> EN2 -> REV5 -> EN3 -> REV4 -> EN4.

## SEO reality (for the owner)
- Head terms ("merge pdf", "compress pdf", "jpg to pdf") belong to iLovePDF, Smallpdf, Adobe, PDF24, Sejda with
  years of links; /en/ will not rank for them in the first 6–12 months.
- Realistic targets (long tail the product serves better): "merge pdf without uploading", "compress pdf to 1mb /
  500kb", "heic to jpg without upload / on windows", "compress image to 100kb / 50kb / 20kb", "passport photo 2x2
  online free", "uk passport photo size online", "transparent signature png". Indian exam-form photo/signature KB
  limits are the closest analogue of the Korean product (high volume, low RPM); US/UK/CA/AU are the RPM targets.
- Expect near-zero EN traffic for 3–6 months; the gate to continue past EN2 is Search Console impressions on /en/.
- Search Console: the domain property already covers /en/ (optional URL-prefix property for /en/ reports). Bing
  Webmaster Tools matters more for English (Bing feeds DuckDuckGo, ChatGPT search, Copilot).

## Owner decisions / actions
- **D1 English brand name** (blocks EN1 copy): CLAUDE.md says "Never ... Docttak as a name"; 문서딱 is unreadable
  abroad. Arch recommends **"Docttak"** in English copy only (matches the domain); owner amends CLAUDE.md:
  "문서딱 in Korean copy; Docttak in English copy (/en/)".
- **D2 English copy rule** (decision 15): privacy as #2 message; "upload"/"browser" allowed in English. Owner amends
  the CLAUDE.md "Plain language" line for /en/.
- **D3 English privacy policy & terms:** controller identity (name or business name) and contact email published on
  /en/privacy/ (GDPR Art. 13; the production cloud build already sets PUBLIC_CONTACT_EMAIL); governing law for terms
  (recommend Republic of Korea); Art. 27 EU representative: counsel, or accept the exemption reading. Bob drafts:
  on-device processing; CF Web Analytics (cookieless, Cloudflare as processor, US transfer under DPF/SCCs);
  Cloudflare hosting logs; no cookies on /en/; Korean pages use GA4; rights (access, erasure, objection, complaint to
  a supervisory authority); CCPA: no sale/share, no sensitive data; not directed to children under 13/16. Owner
  approves the final text before deploy.
- **D4 Letter page size** in jpg-to-pdf (new product behavior; US default). Arch recommends yes, EN2.
- **D5 x-default -> English** (Arch default). Override only if unmatched languages should see Korean.
- **D6 EN ads:** CMP for EEA/UK (Google free Privacy & messaging) or no ads for EEA/UK on EN guides. Decide at EN4.
- **Actions (owner only):** Bing Webmaster Tools (import from Search Console); optional URL-prefix GSC property for
  /en/; Amazon Associates signup (EN4). No AdSense step until EN4.

## Orchestrator note (2026-10-13, after EN0)
- EN0 actuals accepted: precache +2.6–2.7 KB, three JS entries +1.7–2.9% (check-dist budgets pass). EN1+ acceptance = check-dist budgets + precache ≤450 KB, not the original "+1% / +0.1 KB" EN0 wording.
- check-dist finds the image-to-jpg controller by file name: EN1 must use the same naming (en/controller.ts) or switch check-dist to a sturdier lookup.
- Owner decisions: English brand "Docttak" (update CLAUDE.md naming rule for EN pages only); no-upload is the secondary message; EN privacy/terms reuse the Korean policy's officer/contact, governing law Republic of Korea; final EN legal text shown to the owner before deploy.
