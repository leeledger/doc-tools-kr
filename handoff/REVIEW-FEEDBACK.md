# Review Feedback — Step EN1
Date: 2026-10-13
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- scripts/check-dist.mjs:116 (confidence: 8/10) — `if (EN_PAGE_RE.test(p)) continue;` sits above the two lines that apply to every page regardless of GA (`if (html.includes('googletagmanager')) …` and `if (html.includes('gtag(')) …`). en-check rule (a) covers `src="/ga.js"` and `googletagmanager` but not an inline `gtag(` call, so English pages lost the inline-gtag guard. That is a scope change that drops a check, which the brief does not allow ("change scope, never weaken"). Fix: move the `continue` below line 125, or add `/\bgtag\(/` to the rule (a) list in en-check.mjs with a fixture.
- scripts/lib/en-check.mjs:51-58 `readableText` (confidence: 8/10) — rule (b) reads only title, description, og/twitter description and body text (with `<script>` removed). It does not look at JSON-LD (`<script type="application/ld+json">`, which search engines show), `og:image:alt` or `twitter:image:alt`. The current dist is clean: I scanned the whole HTML of every dist/en/ page and found Hangul only in the 한국어 switch. But a Korean string added later to `src/i18n/en/jsonld.ts` or to `sharePreviewEn` alt text would not be caught. Fix: also scan the ld+json text and the two image:alt values, with one fixture each.

## Escalate to Architect
None. Open Questions 1–3 are closed by orchestrator and owner decisions. Q4 (Cloudflare nearest-404 behaviour) still needs `curl -sI <preview>/en/nope/` before production. If that fails, unknown /en/ paths get the Korean 404, which the brief accepts as a fallback.

## Cleared
I checked the following against dist and source:
- **No Korean on /en/:** every dist/en/ page passes, including JS-rendered text. The share and update-bar words come from data attributes. File names come from the EN catalogs. The Korean strings still inside shared chunks are fallbacks that EN pages never use.
- **Docttak stays on /en/:** the name appears in no shared chunk, no Korean page, not in llms.txt and not in the manifest.
- **hreflang:** the sitemap pairs are reciprocal, with ko/en and x-default = en on all 6 pairs.
- **Head tags:** every EN page has its own canonical, `html lang="en"` and `og:locale` en_US. The 404 page has no canonical.
- **Tags and links on EN pages:** 0 font preloads, no ga.js, no Coupang, sponsored, out-links or ad markup, and one shared stylesheet.
- **Precache:** no /en/ path in sw.js.
- **Usage beacon:** `createTracker` only sends on ko pages.
- **Meta lengths:** limits depend on page language; the EN constants match their tests.
- **404 handling:** en404 rename plus the serve.mjs nearest-404 model.
- **Korean footer link:** marked up correctly, and the font rule keeps it in the UI font.
- **CLAUDE.md:** the edits stay inside the D1/D2 English-only scope.
- **Tests:** the en-check rules (a)–(h) and their fixtures test real behaviour. en-check and usage unit tests pass (152).
