# Review Feedback — Step LP1028
Date: 2026-10-28
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- scripts/lib/out-links-check.mjs coupangProblems (confidence: 8/10) — the "inside a div carrying hidden" rule (h) runs only for LinkPrice links. The owner's rule is now "Coupang on result screens only" too, but nothing in check-dist stops a Coupang group from appearing on an empty tool screen. Today every Coupang group does sit in a hidden wrapper (#hw-result, #merge-result, #idp-done, etc.; checked in dist), so nothing is broken. Recommendation: apply the same hiddenSpans check to link.coupang.com anchors in coupangProblems, with one fixture that passes and one that fails. Under 5 minutes, otherwise BUILD-LOG.
- src/data/legal.ts PRIVACY_LP_KINDS (confidence: 6/10) — the history line says 「이력서 상담」 where the link says 「컨설팅」. The meaning is the same, it adds no new glyph, and the plain-language rule is met. Accepted as Bob's decision 2; noted only.

## Escalate to Architect
- CLAUDE.md still says "Coupang Partners links are off in code (`AFF_ENABLED = false`) ... check-dist asserts 0 Coupang links". That is now false: AFF_ENABLED = true, Coupang shows on result screens, and rule (e) checks exact counts. The project instructions are Arch/owner territory, so Bob correctly left them alone. Arch should update the line and add LinkPrice (`PUBLIC_AFF_LINKPRICE`, click.linkprice.com, result screens only, guides/content free until the AdSense re-review) in the same commit or right after the merge.
- Decision 1 (Coupang now off only for "0"): I accept this as "keeping the env gate". The kill switch works, and production behaves the same whether the variable is "1" or deleted. One side effect: every preview or local build without the variable now shows Coupang links. Arch should confirm that is acceptable, and the runbook should say that turning it off means `PUBLIC_AFF_COUPANG=0` (not deleting it).

## Cleared
I reviewed all LP1028 changes. All four LinkPrice hrefs match the brief byte for byte (scripted compare, and the dist HTML only entity-encodes `&`). Every link has rel="sponsored noopener", target=_blank, data-out and 「광고」 in its name. The network's disclosure comes first in every group; Coupang keeps its required REV2 wording. There is one group per screen, and on /id-photo/ passport_online shows LinkPrice while other presets show Coupang. Every group sits in a hidden result wrapper. dist has 0 affiliate links on guide, en, embed and home pages, and LinkPrice appears on exactly the six result pages. No new script or request, CSP untouched, budgets and glyph counts unchanged. The privacy wording and the cp-hancom label are acceptable. The new copy follows the brand and plain-language rules. Targeted unit tests (affiliate, usage, postbuild, hwp-viewer, adsense) pass, 339/339. Bob's two red gates are environment-only: ga.test reruns check-dist without the AUTOFRAME flag on an AUTOFRAME dist (the test comments say so), and check:licenses reads the root node_modules through the junction, with no package.json or lockfile change.
