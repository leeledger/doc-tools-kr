# Review Feedback — STICKY-HEADER
Date: 2026-10-10
Ready for Builder: YES

## Must Fix
None.

## Should Fix
None.

## Escalate to Architect
None. 16 px clearance kept per orchestrator decision.

## Cleared
Verified the work. `--top-h` controls both `.top-inner` height (global.css:70) and, through `--top-clear`, `html scroll-padding-top` (global.css:37) and the menu-panel max-height (app.css:38), so the values can't drift apart. The only sticky header is Base.astro:105, and only Base imports global.css.

Result panels land in the same place as before: each removed `scroll-margin-top: 76px` (#cmp-result, #cmp-kept, #merge-result, #idp-headline, .ph-done-bar, .idp-done) gave 76 px with 0 padding, and now it is 0 margin with 76 px padding. No `scroll-margin-top` is left anywhere in src, so nothing adds on top of the padding. The guide topic headings move from 16 px to 76 px, which was the intended fix.

The phone sticky-bar `scroll-padding-bottom: 96px` (app.css:240) is a separate longhand and still applies. No JS works out header offsets by hand (reorder.ts autoscroll only uses the window edges).

The new polish tests check gap >= 0 in every case, including the page-bottom escape, so they fail at HEAD (about -61 px) and they test the real behaviour.

This is CSS scroll-snap/padding only, with no layout or header-geometry change, so LCP and CLS are unaffected.
