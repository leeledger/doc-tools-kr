# Architect Brief - LCP fix after TOOLS4 (UI font split: core + late)

## Goal
The two preloaded UI faces (400, 800) carry only characters that can render before interaction; characters used
only by tool controllers/libs move to small "late" faces (same family, same weights, disjoint unicode-range) that
the browser fetches only when such text appears. New controller strings stop growing the preloaded bytes.

## Decision (Arch, 2026-10-06)
- Threshold stays at 2,000 ms (owner rule). No copy change (option a: treats the symptom; the next tool re-breaks
  it). No lazy photo-compress controller (option c: bigger diff, misses the root: every tool page sits one lantern
  step under 2,000 and the preloaded font bytes are the lever shared by all pages).
- Chosen: option (b), implemented as static LATE FACES, not by dropping the characters to the "Pretendard
  Variable" fallback. Reason: WebKit ignores the variation axis (Polish P.12), so bold status text
  (.progress-box p 700, .result-title 800) would mix weights in Safari. Late faces keep real static weights.
- Feasibility probe (Arch, current tree, gen-ui-font's own stripComments): characters in files outside
  src/tools/** and src/lib/** = 589 (incl. ASCII). Non-ASCII characters used ONLY in src/tools/** + src/lib/**
  = 47. Core ~590 glyphs vs 622 pre-TOOLS4: the preloaded faces end smaller than the last green build.
  Of the 12 TOOLS4 syllables, 4 move to late (from controllers); 8 are page/data copy and stay core.

## Flow
```
prebuild: gen-ui-font.mjs
  walk src/ --> core = chars in files OUTSIDE src/tools/**, src/lib/** (+ CORE_PATHS) + ASCII + forced punctuation
            \-> late = chars in src/tools/**, src/lib/**  MINUS core
  per weight 400/700/800: anolim-ui-{w}.woff2 (core range) + anolim-ui-late-{w}.woff2 (late range)
  anolim-ui.css: up to 6 @font-face, one family "Anolim UI Sans", disjoint unicode-range
page load:   preload core-400 + core-800 --> first paint / LCP   (no late face requested)
interaction: controller writes a status string with a late char --> browser fetches late-{w} (few KB) --> swap
offline:     late faces are /_astro/ assets --> same runtime-cache path as the 700 face today
```

## Build Order
1. scripts/gen-ui-font.mjs: split the walk into core (all files except src/tools/**, src/lib/**, plus an explicit
   CORE_PATHS allowlist, empty to start) and late (src/tools/**, src/lib/** minus core). Same stripComments; ASCII
   and the forced punctuation stay core. Emit anolim-ui-{400,700,800}.woff2 (core) and
   anolim-ui-late-{400,700,800}.woff2 (late); disjoint unicode-range; skip a late face if its set is empty. Log
   both counts and every size. Update the header comment (why: preloaded bytes are the LCP lever).
2. src/layouts/Base.astro: preloads unchanged, exactly core 400 + core 800. Late faces never preloaded.
3. scripts/check-dist.mjs (UI fonts block ~l.307-322):
   - regex distinguishes core and late; expect 3 core + <=3 late; core <= 50 KB each (unchanged); late <= 8 KB
     each; total <= 190 KB (unchanged).
   - NEW tripwire: core-400 + core-800 raw bytes <= (pre-TOOLS4 400+800 sum, Bob measures from the files he
     already used) - 2,048. Put the number and its source commit in the comment.
   - NEW coverage check: every character of the visible text of every built HTML page (strip script, style,
     JSON-LD, comments; include alt/placeholder/title/value text) must be inside the core unicode-range. Exception
     only for guide prose rendered in the system font (docs/COPY.md l.88), using the selector the guide layout
     already uses; if there is no clean boundary, include it. Failure lists page + characters. Fix for a src/lib
     module rendered into HTML at build time (e.g. lib/ui/site.ts): add it to CORE_PATHS. Never weaken the check.
   - preload count stays exactly 2 and both must be core files.
4. tests/unit/postbuild.test.ts (~l.365-386): core faces 3, late faces <=3; ranges disjoint; union = the old full
   set; per-file budgets; OFL reserved-name check covers late faces (same renameFont / reservedNameProblems).
5. e2e (growth.spec or polish.spec): home, every live tool page and one guide: load, networkidle + 1 s, assert no
   request matches /anolim-ui-late-/ (catches JS-rendered first-screen text the HTML check cannot see). One
   positive test on /photo-compress/: run a compress, assert the late face is requested when its text appears.
6. scripts/gen-sw.mjs: no change expected (precaches only preloaded fonts). Confirm late faces behave offline
   like the 700 face (runtime /_astro/ cache) and say so in the build notes.
7. Measure (Acceptance), log "LCP fix after TOOLS4" in BUILD-LOG with numbers, update REVIEW-REQUEST.
- Flag: do NOT touch lighthouserc.json thresholds/aggregation, the 50 KB core cap, or the 2-preload rule.
- Flag: no copy edits. If CORE_PATHS growth eats the margin, stop and escalate; do not reword.
- Flag: keep the uncommitted CI-fix changes (manualChunks, preload.ts, specs); this builds on top of them.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| Core scope | a src/lib string rendered into static HTML lands in late, LCP text waits on an unpreloaded face | check-dist coverage check fails build; CORE_PATHS | nothing (build blocked) |
| JS first-screen text | entry.ts renders initial text with a late char, extra request before LCP | e2e no-late-request-on-load | nothing (test blocks) |
| Late fetch fails / offline first visit | late glyphs fall to next family | font-display swap, same as 700 face today | a few glyphs in fallback face, readable |
| Swap after interaction | late face arrives ~50-100 ms after the status text | status area not LCP; lhci CLS gate 0.01 on all URLs | brief glyph swap in status line |
| Ranges overlap | browser picks late for core chars or fetches both | unit disjoint + union | nothing (test blocks) |
| OFL | late face leaks "Pretendard" in name table | existing reservedNameProblems throw, applied to every face | nothing (build blocked) |

## Test map
- core/late split in gen-ui-font: [GAP] -> unit (4)
- ranges disjoint, union = old set: [GAP] -> unit (4)
- static HTML chars subset of core: [GAP] -> check-dist (3)
- preloaded-bytes tripwire: [GAP] -> check-dist (3)
- no late request on first load: [GAP] -> e2e (5)
- late face loads on interaction: [GAP] -> e2e (5)
- exactly 2 preloads: [TESTED] check-dist l.315 (extend: core only)
- per-face 50 KB, total 190 KB, weights 400/700/800 only: [TESTED] check-dist + postbuild.test (extend)
- OFL reserved name: [TESTED] gen-ui-font throw (extend to late)
- Regression CLS <= 0.01 and LCP <= 2,000 on all 23 lhci URLs: [TESTED] lighthouserc (run locally, below)

## Out of Scope
- Copy changes; lazy /photo-compress/ controller; any lighthouserc change.
- WebKit pdf-merge flaky 4/12 (already Known Gap).

## Acceptance
- gen-ui-font log: core <= 600 characters; each late face <= 8 KB; core-400 + core-800 <= tripwire.
- Local lhci on a PUBLIC_BG_REMOVE=1 build, 5 runs: /photo-compress/ and /pdf-merge/ median <= 1,985 ms (the lower
  lantern quantum; a 2,040 median is a fail), and ALL 23 URLs pass every assertion incl. CLS <= 0.01 and
  perf >= 0.95. Report medians for /, /photo-compress/, /pdf-merge/, /pdf-compress/, /id-photo/, /pdf-password/.
- check-dist OK on dist-noauto, dist, dist-bg, dist-bgcloud; astro check 0 errors; all unit pass; e2e chromium +
  mobile-chrome site/polish/growth/photo-compress/pdf-password pass.
- CI checks job green after push (source of truth per lighthouserc $comment). If CI is still over 2,000 on any URL,
  stop and report runner numbers to Arch; no blind tuning.

---

# Round 2 (Arch, 2026-10-06) - after Bob's BLOCKED report

## Diagnosis accepted
Bob's evidence is conclusive: the core split cut 2.4 KB of preloaded bytes and moved /photo-compress/ 0 ms;
blocking the non-preloaded 700 face (48.9 KB, fetched before LCP on every tool page because primary buttons,
section h2 and .quick-sub render at 700 above the fold, and font fetch is per rendered character at that weight)
gives 1,813 ms on all 5 runs. My round-1 lever was wrong; the 700 face is the lever. Keep the round-1 work
(core/late split, coverage check, tripwire): it is correct and cheap, and it stops late strings growing the faces.

## Decision 1 - /photo-compress/ fix: retire the 700 face; 700 text renders with the preloaded 800 face. Revert the chunk move.
- Why not a "first-screen 700" subset: weight is decided by CSS cascade + inheritance + UA defaults (strong, b,
  summary, th), and fetch is triggered by any rendered 700 character anywhere on the page (FAQ summaries,
  related links), not only above the fold. Computing that set statically is fragile, and it would still be one
  more pre-LCP request (~20 KB) with an uncertain gain (maybe one lantern step).
- Why not a third preload: a 4th font request already broke home LCP once (G2 ci-green, 600 face). Rule stays.
- Retiring 700 removes one request from every page (the measured 1,813 case), cuts total font bytes by ~49 KB,
  and needs no new machinery. Visual cost: medium-bold UI text (buttons, labels, h2, summaries, links) becomes
  the same heavy weight as headings. Reversible in one commit. Arch decides it as a minor visual change; it is
  shown to the owner at the deploy gate with before/after screenshots (owner may veto; fallback below).
- Build order:
  1. scripts/gen-ui-font.mjs: UI_WEIGHTS = [400, 800] (core and late). Comment: why (700 face was the pre-LCP
     request on every tool page; Lighthouse with it blocked 2,119 -> 1,813).
  2. CSS, explicit: every `font-weight: 700` in src/styles/app.css, global.css, src/tools/hwp-viewer/viewer.css,
     src/tools/remove-background/bg.css, src/tools/stamp-signature/stamp.css becomes 800 (31 occurrences incl.
     generated; do not hand-edit src/generated). Also `font-weight: bold` / 600 if any.
     UA-default bold (strong, b, th, summary, h2-h6 = 700) needs no edit: CSS font matching picks the 800 face
     for a 700 request when no 700 face exists (no synthesis). Verify in a test, do not assume (below).
  3. scripts/check-dist.mjs: UI_WEIGHTS {400, 800}; core faces exactly 2, late <= 2; any CSS font-weight 700
     fails (message says why); preloads exactly 2 = core 400 + core 800 (unchanged); total budget may stay 190 KB.
  4. tests/unit/postbuild.test.ts: faces 2 core + <= 2 late; no 700 file.
  5. e2e (polish.spec): on /photo-compress/ and home, after load, `document.fonts` has no 700 face loaded and no
     request for any anolim-ui-700 file; computed font-weight of the primary button is 800; a `strong` element
     (any page that has one) renders with a loaded UI face, not a synthesized/fallback one
     (document.fonts.check('700 16px "Anolim UI Sans"', '<its text>') true and no extra request).
  6. Revert the CI-fix manualChunks move (raster.ts and reorder.ts back out of `ui-shared`, astro.config.mjs).
     Data: with the font split it is neutral on /pdf-merge/ (1,970 without vs 1,974 with), /pdf-compress/,
     /id-photo/, /hwp-to-pdf/, and makes /photo-compress/ worse (1,980 -> 2,119); Richard's Should Fix agrees.
     Re-measure after step 1-2; keep the revert unless it makes any URL fail (then report, do not choose blind).
  7. Run the visual-qa skill on home, /photo-compress/, /pdf-merge/, /id-photo/, /stamp-signature/, /guide/
     before and after (desktop, mobile, dark). Check: no button label wraps or overflows at 360 px, no clipped
     chip/badge text. Attach the screenshot paths in REVIEW-REQUEST for the owner.
- Fallback if the owner vetoes the heavier look: restore 700 as a third non-preloaded face cut to the characters
  of text whose computed weight is 700 in the built pages (Playwright pass over dist, not static CSS guessing),
  and re-measure. Not built now.

## Decision 2 - tripwire baseline: yes, 2909fe3 + prebuild JSON (94,884 B).
That is what the last green build actually shipped; the no-JSON number (93,392) describes a build nobody ran.
Change: limit = 94,884 (drop the -2,048). The LCP margin now comes from retiring 700; the tripwire's job is
"preloaded bytes never exceed the last green build", one number for every variant. Comment cites commit + method.

## Decision 3 - AUTOFRAME=1 core 601 chars / 64 B margin: drop the character-count test; bytes are the gate.
"core <= 600" was my proxy; the byte tripwire measures what matters and check-dist runs it on every variant
build. Remove the count assertion from postbuild.test.ts (it also depended on which prebuild ran last - a test
must not). With Decision 2 the AUTOFRAME build has ~2.1 KB margin; log every variant's margin in BUILD-LOG.

## Decision 4 - /guide/ `section h2` exemption: accepted.
The coverage check asks "does every character that renders in the UI font have a core glyph". Text that the
shipped CSS puts in the system font does not render in the UI font, so deriving exemptions from the shipped CSS
is the correct rule and matches docs/COPY.md l.88 (and G2 A1: /guide/ topic names are system font). Keep
fontcover's throw on unknown selector shapes. Add one unit case asserting the /guide/ h2 is exempt only on
/guide/ (scoped), not on tool pages.

## Round 2 acceptance (replaces round-1 LCP lines; the rest of round-1 acceptance stands)
- Local lhci, PUBLIC_BG_REMOVE=1 build, 5 runs: all 23 URLs pass every assertion; /photo-compress/ and
  /pdf-merge/ medians <= 1,985 ms with no single run above 2,000 on /photo-compress/; report all tool medians.
- CLS 0 / <= 0.01 everywhere (heavier glyphs must not shift layout: font metrics are per family, so they should
  not; lhci proves it).
- check-dist OK on dist-noauto, dist (AUTOFRAME=1), dist-bg, dist-bgcloud with the margins logged; astro check 0;
  unit all pass; e2e chromium + mobile-chrome full + webkit/mobile-safari font specs pass.
- visual-qa before/after attached; no new high-severity issue.
- Flags unchanged: 2,000 ms threshold, lighthouserc, copy, 2-preload rule. CI checks job is the final word;
  if CI is still over 2,000 anywhere, stop and report runner numbers.
