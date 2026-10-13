# Review Request — EN1 (English foundation + 3 tools at /en/)
Date: 2026-10-13
Ready for Review: YES
Round 2 (2026-10-13): both REVIEW-FEEDBACK Should Fix items applied — check-dist keeps the every-page googletagmanager / inline gtag( rules on English pages and en-check rule (a) flags gtag( (+fixture); en-check readableText also scans JSON-LD, og:image:alt and twitter:image:alt (+3 fixtures). vitest en-check + postbuild 101/101; check-dist OK default 407.3 KB / cloud flag-on 415.4 KB.
Status: DONE_WITH_CONCERNS (owner must approve the English privacy policy and terms below before deploy; Cloudflare
nearest-404 behaviour needs a curl on a preview deploy)
Branch: c2-cloud, rebased onto origin/main 73f15c7 (WIP commit, rebase without conflicts, soft reset: EN1 uncommitted on top). Orchestrator accepted the 3 postbuild.test.ts lines and the `?en` approach (Open Questions 1, 2 closed).
Rebase re-run (73f15c7): vitest 73 files / 1,499 tests; astro check 0 errors; check-dist OK default (precache 407.3 KB) and cloud flag-on with AFF_COUPANG=1 (415.4 KB); e2e en + polish + site on chromium + mobile-chrome 277 passed, 5 skipped, 0 failed (polish terms test fixed upstream).

## What was built
/en/, /en/pdf-merge/, /en/pdf-compress/, /en/image-to-jpg/ (title targets "HEIC to JPG"), /en/privacy/, /en/terms/,
and dist/en/404.html. New BaseEn layout: lang=en, the same three CSS imports as Base (one stylesheet, the same file as
the Korean pages), 0 font preloads (system font via one `html[lang="en"] body` rule in app.css), no GA, the CF Web
Analytics beacon only when its token is set, no manifest, no ads, no Coupang/out-links, no next-step group. hreflang
only in sitemap.xml (xhtml:link ko/en/x-default=en on both twins of the 6 pairs). Korean twins (+ home, privacy, terms)
get a footer `English` link (hreflang="en" lang="en"); English pages get `한국어` (lang="ko"). EN pages are not
precached (NOT_PRECACHED `/en/` prefix; RUNTIME_PAGES unchanged). Usage beacon: only `<html lang="ko">` pages report.

## Files Changed
- src/i18n/en/site.ts (new) — SITE_EN (Docttak), TITLE_SUFFIX_EN, EN meta limits (60 / 70–155 / 155), sharePreviewEn.
- src/i18n/en/og.json (new) — EN share images (home, 3 tools, default) and page descriptions.
- src/i18n/en/tools.ts (new) — TOOLS_EN (name, title, description, h1, lead, summary, icon from tools.ts, FAQ with numbers read from the three limits.ts, en-US), HOME_TITLE_EN / HOME_DESCRIPTION_EN, enTwin() / koTwin().
- src/i18n/en/format.ts, src/i18n/en/shared.ts (new) — en-US number/size words; ENGINE_EN, NEXT_EN, nonPdfEn, pagesEn.
- src/i18n/en/tools/{pdf-merge,pdf-compress,image-to-jpg}.ts (new) — EN catalogs `satisfies Messages`, `mark: 'catalog-mark:en'`; LEVEL_COPY_EN.
- src/i18n/en/jsonld.ts (new) — WebApplication + BreadcrumbList + FAQPage (inLanguage en); WebSite + ItemList for /en/.
- src/i18n/en/legal.ts (new) — EN effective date, sitemap lastmod, Cloudflare policy URL.
- src/i18n/en/components/Share.astro, RelatedTools.astro (new) — English share block (data-copied attributes), EN-only related tools.
- src/layouts/BaseEn.astro (new) — the English layout (above).
- src/components/SiteScript.astro (new) — the site script shared by Base and BaseEn. A `<script>` in each layout made site.ts a shared chunk behind two wrappers (+1 request on every Korean page; measured, then fixed).
- src/pages/en/{index, pdf-merge/index, pdf-compress/index, image-to-jpg/index, privacy/index, terms/index, 404}.astro (new) — the pages; tool pages keep the Korean element ids.
- src/tools/image-to-jpg/en/controller.ts (new) — EN lazy binding `initImageToJpg(EN, p)` (orchestrator note: en/controller.ts naming).
- src/i18n/en/twin-modules.d.ts (new) — types for the `?en` imports: the English pages import the shared controllers / entry as `controller.ts?en` / `entry.ts?en`, so Vite bundles a second instance for them. Without it each controller became a chunk shared by the KO and EN page, and Rolldown does not hoist transitive imports (`hoistTransitiveImports` is "not implemented yet" in rolldown's types): /pdf-merge/ loaded handoff-marker, reorder and limits one round trip later and its local Lighthouse LCP went 1,819 → 1,967 ms (5 runs each, all within ±5 ms). With `?en`: 1,824 ms.
- src/layouts/Base.astro:11-12,58-59,151,157 — `enTwin(path)` footer link; `<SiteScript />` replaces the inline script.
- src/tools/{pdf-merge,pdf-compress,image-to-jpg}/controller.ts (3 hunks each) — the next-step slot is optional (the id-photo pattern); English pages have none.
- src/tools/{pdf-merge,pdf-compress,image-to-jpg}/messages.ko.ts — `mark: string` in Messages, `mark: 'catalog-mark:ko'` in KO.
- src/lib/ui/usage.ts:129-130,142-145 — `lang` dep; a tracker samples only when the page language is ko (no document while prerendering).
- src/lib/ui/share.ts:56,67-71 — copied messages from `data-copied` / `data-copied-short` (Korean fallback = today's text); the label comes back from the button's own text.
- src/lib/ui/sw-register.ts:19-25 — update-bar words from `body[data-sw-new|data-sw-reload]` (Korean fallback).
- src/styles/app.css:487-489 — `html[lang="en"] body { font-family: system-ui, … }` (in the UI-font stylesheet, so the check-dist system-font rule holds).
- scripts/lib/ui-font-chars.mjs:47-48,73-77 — EN_DIRS (`i18n/`, `pages/en/`) in neither font set.
- scripts/gen-sw.mjs:54-56 — `/en/` prefix not precached.
- src/pages/sitemap.xml.ts:6-7,27-45 — EN rows; xhtml:link alternates on both twins; xmlns:xhtml.
- src/pages/llms.txt.ts:7,30-35 — "## English" section (no brand name: the brand dist test reads llms.txt).
- scripts/gen-brand.mjs:81-83,152-173,248-259 — OG_EN, a `name` option for the wordmark, renderBrandEn() → brand/og-en-*.png (kept out of renderBrand, so the postbuild image list stays as it is).
- scripts/lib/meta-length.mjs:10-19,64-80 — EN_LIMITS, pageLang(); metaProblems picks the limits by `<html lang>`.
- scripts/lib/en-check.mjs (new) — rules a–h: head/monetization; Hangul outside lang=ko; catalog marks in the page JS graphs incl. dynamic imports; id parity with KO_ONLY_IDS; sitemap reciprocity / x-default / canonicals; precache; single stylesheet.
- scripts/check-dist.mjs:6,21-22,100-108,115-116,138-152,167-173,296-312,481-482,520-521 — en-check hook; GA / preload / font-coverage rules scoped to Korean pages (never weakened there); meta report per language; pageGraph() (static + dynamic imports); image-to-jpg lazy lookup through the page's dynamic import, for the KO and the EN page (orchestrator note: sturdier lookup — the chunk named controller* is now the shared controller and the catalogs sit in the ko/en wrappers, which the old name filter would have left out of the budget).
- astro.config.mjs:2-3,43-57,65 — `docttak-en-404` integration: en/404/index.html → en/404.html at build:done.
- tests/e2e/serve.mjs:3,147-150 — the nearest 404.html up the tree (models the Cloudflare Pages Not Found behaviour).
- tests/unit/en-check.test.ts (new) — 27 tests: rule fixtures a–h, catalog key parity (runtime), Hangul-free catalog values (functions called with samples), marks, EN meta constants = meta-length.mjs, registry lengths / FAQ numbers from limits, twins, EN_DIRS exclusion on a temp tree, usage guard, a dist block.
- tests/unit/messages-ko.test.ts:6,29-41,165-166 — EN0 should-fix: CMP.done with a non-empty extra; pickEngineCopy with a fake non-Korean catalog (offline / deployed / generic).
- tests/unit/next-steps.test.ts:6,75-86 — EN0 should-fix: showNextStepsIn with a fake non-Korean catalog.
- tests/unit/usage.test.ts:413 — the deps helper passes `lang: 'ko'`.
- tests/unit/postbuild.test.ts:648,854,1265 — three one-line edits (Open Question 1).
- tests/e2e/en.spec.ts (new) — 11 tests × 5 projects. tests/e2e/ga.cloud.spec.ts:101-112, usage.spec.ts:560-573 — EN pages: no GA tag/request, no usage beacon (the Korean flow still sends).
- tests/e2e/growth.spec.ts:216-218 (the blog-footer loop over every sitemap URL skips /en/), tests/e2e/site.spec.ts:146-149 (sitemap list: Korean list unchanged + the EN list).
- docs/COPY.md:113-124 — "English" section. CLAUDE.md:11-12 — brand rule (Docttak on /en/ only) and the English plain-language line (owner D1/D2 via the orchestrator).
- lighthouserc.json — /en/ and /en/pdf-merge/ added (CI +2 URLs).

## Verification (details and every number: handoff/BUILD-LOG.md "EN1")
- Korean HTML vs a fresh 3e3e676 build (same build id, hashed names normalized; the site CSS file is now named `build.*.css` instead of `anolim-ui-800.*.css`, still one file): 67 pages: 1 identical, 60 hash-only, 6 differ by exactly the footer `<a href="/en/…" hreflang="en" lang="en">English</a>` (/, /pdf-merge/, /pdf-compress/, /image-to-jpg/, /privacy/, /terms/).
- Fonts unchanged (PRELOAD_TRIPWIRE row, core and late files). Precache: default 406.7 → 407.3 KB; cloud flag-on 415.4 KB; autoframe 409.5 KB (all / 450); no /en/ URL.
- Korean initial JS (gzip, exact): / 1,513 → 1,544 B (site script: data-attribute fallbacks); /pdf-merge/ 18,246 → 18,314 B, same 8 files and depth; /pdf-compress/ 18,100 → 18,412 B, +1 file at depth 2 (compress limits.ts is now shared with the EN controller instance; imported directly by the entry); /image-to-jpg/ 9,172 → 9,229 B, same 4 files; image-to-jpg lazy controller 20.0 → 20.5 KB / 22. EN: /en/pdf-merge/ 18.2 KB, /en/pdf-compress/ 18.4 KB, /en/image-to-jpg/ 9.6 KB, EN lazy controller 20.8 KB / 22.
- Lighthouse (local lhci, 5 runs, default build; all lighthouserc assertions pass): /pdf-merge/ 1,824 ms (fresh 3e3e676: 1,819), /pdf-compress/ 1,820 (1,815), /image-to-jpg/ 1,664, / 1,660; /en/ 958, /en/pdf-merge/ 1,437, /en/pdf-compress/ 1,413, /en/image-to-jpg/ 1,421; CLS ≤ 0.0003; EN categories all 1.
- check-dist OK on default, cloud flag-on (CI env + PUBLIC_AFF_COUPANG=1) and AUTOFRAME builds.
- vitest 73 files / 1,499 tests; astro check 0 errors. e2e: see BUILD-LOG.

## Open Questions
1. tests/unit/postbuild.test.ts: the brief allowed one hook line; three were unavoidable, each with an `// EN1:` comment: (648) the dist walk skips dist/en/ (the Korean rules: og:site_name 문서딱, ko_KR, brand, plain language — English pages have en-check); (854) the REV5 test finds the site script by its chunk name, now `SiteScript.astro_astro_type_script…` (the SiteScript component is what keeps one site chunk); (1265) the T10 sitemap regex accepts the `<xhtml:link>` alternates. OK?
2. The `?en` module duplication (twin-modules.d.ts): English pages ship their own copy of each controller so the Korean chunk graph stays as it was (LCP above). Cost: no cache sharing between a KO and an EN controller (irrelevant for real visitors) and an ambient type file. Alternative considered: manualChunks (would drag the merge controller into /pdf-split/), side-effect imports in the KO page script (Rolldown kept only 1 of 3). OK?
3. The privacy officer's name renders in Hangul on /en/privacy/ (inside `<span lang="ko">`). The owner may prefer a romanized form (a new constant or env value).
4. Cloudflare Pages Not Found behaviour (the nearest 404.html up the tree, ending at /404.html) is modelled in serve.mjs and passes e2e; the doc line (Cloudflare Pages docs, "Serving Pages → Not Found behavior") is quoted from memory, not fetched this session: `curl -sI <preview>/en/nope/` before production. If it does not hold, unknown /en/ paths get the Korean 404 (brief: acceptable fallback).
5. EN privacy §6 says Cloudflare "states" it relies on the EU-U.S. DPF and SCCs (a reading of Cloudflare's policy, not fetched this session). Owner/counsel to confirm the wording; the GDPR Art. 27 representative question (D3) is not asserted anywhere.

## English legal text for owner approval (production = cloud build values; approve before deploy)
Conditional parts: "1. Who we are" and both contact lines appear only in the build that shows the officer on the Korean
policy (PUBLIC_BG_CLOUD=1, production; section numbers shift by one without it). With PUBLIC_CF_ANALYTICS_TOKEN set
(production), §4 gains: "To count visitors and see which pages are read, we use Cloudflare Web Analytics. It sets no
cookies. It collects the page address, the page you came from, the type of browser and device, and the country, and we
only see totals. It never includes your files. This is also based on our legitimate interest (GDPR Article 6(1)(f))."
and §5 reads "…use no advertising or tracking tools other than the cookieless visitor count above."

### /en/privacy/ — Privacy Policy
Effective: October 13, 2026

This policy covers the English pages of Docttak (docttak.com/en/). The Korean pages have their own Korean privacy policy (/privacy/).

**1. Who we are** — Docttak is run from the Republic of Korea. The person responsible for your data (the data controller and privacy officer) is 이종림. Contact: robotncoding@kakao.com.

**2. Your files stay on your device** — The tools work inside the page, on your phone or computer. The files you choose and their contents are not uploaded to us or to anyone else, and we do not store them. PDF passwords are used only while the page is open and are never saved or sent. When you close the page, everything is gone.

**3. No account, no personal details** — There is no sign-up. We do not ask for your name, email address or any other personal details.

**4. Hosting and access logs** — The site is hosted by Cloudflare, Inc. When you open a page, Cloudflare may keep a short record of the request (for example your IP address and the type of browser and device) for security and to run the service. We use these records only for those purposes, based on our legitimate interest in a safe, working site (GDPR Article 6(1)(f)). See the Cloudflare privacy policy (https://www.cloudflare.com/privacypolicy/). [+ the Web Analytics paragraph above when the token is set]

**5. Cookies** — The English pages set no cookies and use no advertising or tracking tools. To open pages faster, your browser may keep a copy of the site's own program files (its cache); this holds no personal data. The Korean pages use Google Analytics, which sets cookies; this is explained in the Korean privacy policy. [the last sentence only when GA is on]

**6. Transfers outside your country** — Cloudflare, Inc. is based in the United States and processes requests in its data centers around the world. Cloudflare states that it protects data transferred from the EU, the UK and Switzerland under the EU-U.S. Data Privacy Framework and its extensions and under Standard Contractual Clauses; see the Cloudflare privacy policy.

**7. Ads** — There are no ads on the English pages. If we ever add them, we will update this policy first.

**8. Your rights** — Depending on where you live (for example under the GDPR or the UK GDPR), you have the right to ask for access to your data, to have it corrected or erased, to restrict or object to its use, and to receive it in a portable form. You can also complain to the data protection authority of your country. Because we keep no account or files and cannot link the short access records to a person, we usually hold nothing we can find about you, but you can always write to us at robotncoding@kakao.com.

**9. California residents** — We do not sell or share personal information, and we do not collect sensitive personal information.

**10. Children** — The site is not directed to children under 13 (or under 16 in the EU), and we do not knowingly collect their personal information.

**11. Changes** — If we change this policy, we will post the new version on this page with a new effective date.

### /en/terms/ — Terms of Use
Effective: October 13, 2026

**1. About these terms** — These terms apply to the English pages of Docttak (docttak.com/en/, "the service"), run by its operator in the Republic of Korea ("we"). By using the service, you agree to these terms. The Korean pages have their own Korean terms (/terms/).

**2. The service** — The service is a set of free tools that process PDF and photo files on your own device (computer or phone). Your files are not uploaded to us or anyone else, and no account is needed.

**3. Price and ads** — All features are free. We may show ads in the future to cover running costs; if we do, we will update the privacy policy first.

**4. Your responsibilities** — Use only files you have the right to use. Do not use the service to process other people's documents without permission or for any unlawful purpose.

**5. Things you must not do** — Do not disrupt the service (for example with excessive automated requests), and do not redistribute it in a way that makes it look as if someone other than us provides it. Open-source components may be used under their own licenses.

**6. Results** — We do not guarantee that a result will meet the requirements of, or be accepted by, any organization, company or website. Before you submit a file, check the latest requirements (size, dimensions, format) against your result. The service does not change your original files, but please keep your own copy of them.

**7. Limitation of liability** — The service is free and provided "as is", without warranties of any kind. We are not liable for the quality of results, rejected submissions, or damage caused by your device or browser, except for damage caused by our intentional misconduct or gross negligence, or where the law does not allow such a limitation.

**8. Changes to the service** — We may change features or stop the service. We will post important changes on this page.

**9. Changes to these terms** — We will post changes to these terms, with their effective date, on this page at least 7 days before they take effect, or at least 30 days before if a change is unfavorable to you.

**10. Governing law** — These terms are governed by the laws of the Republic of Korea, and disputes are settled by the competent court under the Korean Civil Procedure Act. This does not take away any rights you have under the mandatory consumer protection laws of your country.

**11. Contact** — Questions about these terms: robotncoding@kakao.com. [production build only]

## Out of Scope (logged in BUILD-LOG Known Gaps)
- Offline on /en/ falls back to the Korean /offline/ page; EN usage split; EN chain (all EN2).
- `safeFileName` falls back to the Korean `문서` when a file name is only reserved characters (EN download name).
- loadDynamicFont() still adds the Pretendard dynamic-subset stylesheet on EN pages when a file is added (no woff2 is fetched: the family is not used there; e2e asserts no woff2 after the merge flow).
- /licenses/ is Korean (linked from the EN footer as "Open-source licenses (Korean)").
- IndexNow: no change needed; `scripts/indexnow.mjs --sitemap` submits every `<loc>`, so the /en/ URLs go with the next submission.
