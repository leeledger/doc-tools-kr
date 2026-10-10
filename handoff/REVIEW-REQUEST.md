# Review Request — FOOTER-BLOGS
Date: 2026-10-10
Ready for Review: YES
Status: DONE

Owner request (2026-10-10, reverses the earlier "no blog link" choice): our two blogs in the footer of every page and
in the home Organization JSON-LD `sameAs`.

## Files Changed
- src/data/site.ts:13-21 — `BLOGS` (name, accessible label, URL) for 네이버 https://blog.naver.com/robohelio and 티스토리 https://docttak.tistory.com; single source for footer and JSON-LD.
- src/layouts/Base.astro:5,148 — new footer line `<p class="foot-blog">블로그: 네이버 · 티스토리</p>` between the legal nav and the copyright; links `rel="noopener"`, no nofollow, no target (same tab, as the site's other non-tool external links: privacy, licenses); `aria-label` "네이버 블로그" / "티스토리 블로그" (visible text is contained, label-in-name OK).
- src/styles/app.css:18,22 — `.foot-blog a` shares the `.foot-op a` rule (muted, inline-block, min-height 24 px target) and the hover colour.
- src/pages/index.astro:4,31 — Organization gains `sameAs: BLOGS.map((b) => b.url)`.
- tests/e2e/growth.spec.ts (end) — new test: every sitemap page plus /offline/ and the 404 has both links in the footer HTML with rel="noopener", no nofollow, no target; home footer links by accessible name; home Organization `sameAs` equals both URLs.
- tests/e2e/polish.spec.ts:126-150 — footer test checks the `.foot-blog` text and includes its line in the one-left-edge check (measured at the paragraph, since the line starts with plain text).
- tests/unit/postbuild.test.ts:745-749 — brand rule ("docttak" only as a domain) also strips https://docttak.tistory.com; it failed on every page before.

## Verification
- UI font: 티, 토 were new core glyphs (603 → 605). Core 400 44,860 → 44,800 B, 800 48,024 → 48,148 B; preloaded 90.8 KB default / 90.9 KB cloud vs tripwire 92.66 KB (headroom ~1.8 KB left). No wording fallback needed.
- vitest 1,341/1,341 (after the postbuild fix); astro check 0 errors.
- Default build and cloud build (BG_REMOVE+BG_CLOUD+officer+contact+usage+GA test id → dist-bgcloud) both check-dist OK.
- E2E site + polish + growth × chromium/mobile-chrome/webkit: 352 passed, 1 webkit share (G.7) flake passed on retry; the footer tests failed on a test-measurement bug (fixed, see polish hunk) and then passed 60/60 on all three projects. Axe (site.spec) clean on all pages.
- Screenshots 360 px light/dark of a guide footer: one line "블로그: 네이버 · 티스토리", aligned with the other lines, underlined muted links readable in both schemes.

## Open Questions
- Wording "블로그: 네이버 · 티스토리" vs a link-only line; chosen for brevity at 360 px.
- `sameAs` only on the home Organization (brief); the guide Article publisher Organization (src/data/jsonld.ts) is unchanged.

## Out of Scope (logged in BUILD-LOG)
- None.
