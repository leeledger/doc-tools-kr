# Review Feedback — LCP fix after TOOLS4 (rounds 1 + 2)
Date: 2026-10-07
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- scripts/gen-ui-font.mjs:2 (confidence: 9/10) — header still reads "cut from the variable font as static weight instances (400, 700, 800)"; 700 is retired (UI_WEIGHTS = [400, 800] at l.46). — Change to "(400, 800)" or drop the list and point to UI_WEIGHTS.
- scripts/check-dist.mjs (coverage error message) (confidence: 9/10) — says "add the rendering src/lib or src/tools file to CORE_PATHS in scripts/gen-ui-font.mjs"; CORE_PATHS lives in scripts/lib/ui-font-chars.mjs (`export const CORE_PATHS = [`). The person fixing a red build is sent to the wrong file. — Point the message at scripts/lib/ui-font-chars.mjs.
- scripts/check-dist.mjs font-weight guard (confidence: 6/10, verify) — scans only `_astro/*.css`. A `font-weight: 700` in a stylesheet Astro inlines into the HTML `<style>` (small scoped styles), a `style="font-weight:700"` attribute, or the `font: 700 …` shorthand gets past it. None exist in src/ today (I grepped .css/.astro/.ts). This gap predates the step. — Cheap hardening: also scan inline `<style>` blocks in pageHtml and the `font:` shorthand. If not now, log it to BUILD-LOG.
- scripts/lib/fontcover.mjs systemFontSelectors (confidence: 4/10, appendix) — exemptions are collected from all CSS together, not from the CSS a given page loads. Unscoped class selectors (no data-astro-cid) would therefore exempt matching classes on every page. That is harmless while the class names are guide-only. The scoped h2 case is covered by the new unit test.

## Escalate to Architect
- Screenshots (36 PNGs, ~19 MB, handoff/lcp-shots/): commit them or keep them out of the repo. Bob asked; this is not a code decision.
- visual-qa health score not produced (Bob used a one-off Playwright script). Brief step 7 named the visual-qa skill. Decide whether to run it at the deploy gate.

## Cleared
Reviewed:
- The core/late split (ui-font-chars.mjs): the late set is computed as "minus core", so the ranges are disjoint by construction. The unit test checks they are disjoint and that their union equals the old set. CORE_PATHS entries are checked to exist.
- The coverage check (fontcover.mjs plus check-dist). It removes script, style and comments, and includes alt, placeholder, title and value. Exemptions come from the shipped CSS and it throws on unknown selector shapes. I found no false negative that can occur in practice. JS-rendered first-screen text is covered by the e2e no-late-request test on home, every live tool and a guide. A positive late-load test is on /photo-compress/.
- Offline: preloads must be core 400/800 only, and the late faces are runtime-cached /_astro/ assets like the old 700 face.
- Retiring 700: 31 CSS edits change only the weight. No 600, bold or shorthand 700 is left in src/. check-dist rejects 700/bold with the reason. UA bold resolves to the 800 face (section h2 has no explicit weight, so the e2e ink probe really exercises UA 700). No synthesis because 800 is at or above 700.
- The 94,884 B tripwire matches Decision 2 and cites 2909fe3 plus the method.
- The manualChunks revert matches Decision 1.6.
- No change to lighthouserc.json, thresholds, copy (src/pages, src/data, docs untouched), or the 2-preload rule.
