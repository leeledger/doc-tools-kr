# Review Feedback — CI fix after TOOLS5
Date: 2026-10-10
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- tests/e2e/pdf-sign.spec.ts:232-248 (confidence: 4/10, appendix) — measuring the drag relative to `#sg-stage` can no longer see the window scrolling during a drag. A user would not notice a 1 px shift like that, and x stayed exact on every try, so I accept the change. If CI still shows -119 after this, Bob's own note applies: the drag itself is off. Do not loosen the check any further.

## Escalate to Architect
None. Open question (c2): reducedMotion on WebKit only is the right call. The site already honours it (app.css:448, global.css:141). Chromium and Firefox still run with smooth scrolling, and a lost click while the page is still scrolling is a harness artifact, not something a user does. Open question (d): a menu that scrolls inside itself when it is taller than the window is a plain bug fix, not a product decision.

## Verified
- (a) ga.test.ts:227-231: `existsSync` and `ROOT` are already imported or defined (lines 5, 17). The `birefnet-lite-512` directory name matches copy-vendor.mjs:149/156. `bgRemoveOn` accepts only '1' (scripts/lib/bgremove.mjs:11-13), so the explicit '0' is a correct "off". Root cause holds: check-dist.mjs:297 fails any flag-off build that carries birefnet/onnxruntime files.
- (b) id-photo.spec.ts:658: the expectation now matches the shortened description. Test-only change.
- (c1) controller.ts:542-549: `rangeBox` (183) and `whereRadios` (201) are in scope. The guard acts only if a 넣을 쪽 radio still has focus and the range box is shown. Chromium, Firefox and keyboard-arrow paths already have focus in the field, so the timeout does nothing there. iOS/macOS Safari do not mouse-focus radios, so it does nothing there either. No regression.
- (c2) playwright.config.ts: all five WebKit projects are covered. For the cloud projects, `defaultBrowserType === 'webkit'` picks up Desktop Safari and iPhone 14. No product code branches on reduced motion; it is CSS only.
- (d) app.css:36-38: on desktop the header is 61 px and the panel starts at about 58 px, so it ends about 18 px above the bottom of the window. On a phone the sheet hangs from the sticky `.top` (top 100% = 61 px) and ends about 15 px above the bottom. The 100vh fallback comes before dvh. Focus outlines (3 px + 2 px offset) fit inside the panel padding (6 px; on a phone 8/12 px), so overflow does not clip them. polish.spec.ts:655-660 now asserts the click point is on screen instead of clicking blind.
- (f) pdf-sign.spec.ts:285-289: reading box and stage in one evaluate on the stable `#sg-stage` is correct. The old version could resolve a box that had already been replaced.
- Workflows: the tags exist (`gh api`): checkout v7.0.1, setup-node v7.1.0, upload-artifact v7.0.2, cache v6.1.0. All run on node24. The inputs used (node-version-file, cache, name/path/include-hidden-files/retention-days, path/key/restore-keys) are unchanged. upload-artifact `archive` defaults to true, so uploading directories still works. setup-node's automatic package-manager cache does not apply, because package.json has no `packageManager` field. checkout v7's new block on fork PR checkout covers only pull_request_target/workflow_run; ci.yml uses pull_request. ops-weekly's `git push` relies on the persisted credentials (default on), with contents: write.

## Cleared
I reviewed all fourteen changed files of the CI fix: two product fixes, the test-only changes, the Playwright config and five workflows. Every root cause is convincing, no test change hides a real bug, and the action upgrades are real releases with the inputs we use unchanged.
