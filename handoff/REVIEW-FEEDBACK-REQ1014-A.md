# Review Feedback — REQ1014-A
Date: 2026-10-14
Reviewer: Richard
Verdict: CLEAR
Ready for Builder: YES

Scope: `git diff origin/main...HEAD` (c6392bb on ee4950c) against handoff/ARCHITECT-BRIEF-REQ1014-A.md.

## Merge with origin/main (5bac90a, REQ1014-C)
- Code merges clean. `git merge-tree` reports conflicts only in `handoff/BUILD-LOG.md` and `handoff/REVIEW-REQUEST.md` (doc text, both sides appended). The request's "clean" claim is wrong for those two files; resolve by keeping both sides.
- Tested on a temporary merge commit (A + C): `astro check` 0 errors / 0 warnings; vitest 71 of 76 files passed, and the other 5 failed only because that tree had no generated assets or dist. After copying src/generated, bgremove, hwp-pdf-export, usage and visits all passed (271 tests). C's PRESETS (police / hanja / jlpt) and their labels sit next to A's additive blocks in usage.mjs without interaction. A's land skip and campaign SQL do not read PRESETS. Nothing in A breaks with C.

## Must Fix
(none)

## Should Fix
- handoff/BUILD-LOG.md, handoff/REVIEW-REQUEST.md (confidence 10/10): these two conflict with main on merge. Resolve by hand at merge time and keep both entries. In REVIEW-REQUEST, change "merge-tree … clean" to "code clean, handoff docs conflict".
- handoff/ARCHITECT-BRIEF-REQ1014-A.md (confidence 9/10): untracked in this worktree. Commit it with the merge so the spec travels with the code.
- scripts/lib/usage.mjs:105 (confidence 9/10): the comment still reads `/** Keys in Analytics Engine blob order (blob1 .. blob12). */` while BLOB_KEYS now has 14. Fix: "blob1 .. blob14".
- src/lib/ui/usage.ts readUtmStash, src/lib/ui/utm-land.ts land() (confidence 5/10, verify): an expired entry is removed only when a later start/success reads it. Otherwise `{s,c,at}` stays in sessionStorage until the tab closes. Behaviour is still correct: nothing is attributed after 3 h, and the entry dies with the tab, which is what the privacy line promises ("이 창을 닫으면 지워지는 … 최대 3시간"). No change needed unless Arch wants the wording to be literal.
- scripts/lib/admin-view.mjs renderAdminPage, isEmpty branch (confidence 6/10): when usage is empty and the campaign query failed (`campaigns === null`), there is no campaign notice. Harmless (an empty period has no campaigns). Optional: show campaignSection(null) there too.

## Escalate to Architect
- Open Question 1 (`?worker&url` instead of `import()` in site.ts): I recommend accepting it. Verified on dist-bgcloud: `_astro/utm-land-*.js` is 1,442 B, ES format (astro.config worker.format 'es'), minified, with no import or export statements. Defines are applied (`__USAGE_SAMPLE__` → 1, the trailing `land()` call kept). site.ts is its only reference, and the default `dist/` has no utm-land file. CSP `script-src 'self'` allows a same-origin module script. The intent of D6 holds: no runtime imports, lazy-only, and the shared chunk is untouched. One small hardening for later (not blocking): add a dist test that the usage build's utm-land file has no `import` and the default build has none of these files. network-guard and utm-land tests cover the payload but not the file shape.
- Open Question 2 (privacy wording adds 느붙셉억 to the core font): I recommend accepting it and recording a G3 exception in BUILD-LOG. The glyphs come straight from the D18 legal text, which Arch approved. Font budget and Lighthouse pass. Rewording legal copy to dodge glyphs would give a worse privacy notice for a few hundred bytes. This is Arch's call because it deviates from a written gate.
- Q3–Q6: no code decision. The post-deploy probe (D11 fallback is built and tested), the Play status (owner) and the PRIVACY_UTM date re-confirm stay on the deploy checklist.

## Cleared
I reviewed UTM capture and attribution, server validation, the campaign module and its admin and weekly-report wiring, the visits totals and fallbacks, the sign hand-off event, sniff-format, and the privacy text. All match the brief:
- Capture: the stash is written before readUrl, ko pages only, never /embed/, and not at all in usage-off builds (the tracker is null there).
- Server validation: us/uc are allowed only on land, start and success; us must be on the whitelist or 'other'; uc must match CAMPAIGN_RE; t = home or guide only on land; g on land only with t = guide; via = direct. No file data.
- Campaign SQL: built only from a DATASET_RE-checked name and a PERIODS-checked integer. Admin output is escaped, including in the XSS scenario. shapeUsage skips land rows. The prev totals query ignores the land kind.
- visits.mjs: the GraphQL filters (filterOf) are built from constants only. The total node drives totals. prev asks for total only. pagesByVisits backs up pages with the honest message. The countryPaths fallback is used only when errors[] names the like fields.
- sign-handoff: `next` is tracked only after a successful store and before go().
- sniff-format: pure and never throws. Every code is at most 24 chars and labelled.
- Privacy: the text matches the behaviour.
