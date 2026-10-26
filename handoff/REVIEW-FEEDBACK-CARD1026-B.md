# Review Feedback — CARD1026 Step B (/qr-code/)
Date: 2026-10-26
Ready for Builder: YES

Reviewed f775c8e against ARCHITECT-BRIEF-CARD1026.md Step B (C9, C10, C12, C14–C16, C18) and the locked decisions E1–E3.

## Must Fix
None.

## Should Fix
- src/tools/qr-code/controller.ts:93, 102, 105 (confidence: 8/10). Answer to open question (c): the preview text is not enough. While the person is typing it says something untrue. The lines:
  `if (contactEmpty(f)) return { ok: false, errors: strict ? [...] : [] };` and `const shown = problems.filter(([, code]) => strict || code !== 'need');`
  If only 휴대폰 is filled on 연락처, the result is no error, no QR, and the preview still says 「쓰는 대로 여기에 QR이 나와요.」. The same happens on 와이파이 with a name and no password (WPA/WEP), and on 문자 with a message and no number. The person writes and nothing appears. Only a 받기 press explains why.
  Fix: keep the red error and aria-invalid for the 받기 press, as now. In non-strict mode, when the active panel has at least one non-empty field and the build failed only because a required field is missing, change the #qr-empty text to a neutral hint for that kind, e.g. 「이름이나 회사를 쓰면 QR이 나와요.」, 「비밀번호를 쓰면 QR이 나와요.」, 「받는 전화번호를 쓰면 QR이 나와요.」. Put it back to the default text when the panel is empty. Run the glyph check on the new words and add one e2e assertion (only 휴대폰 filled → the hint text).
- tests/e2e/qr-code.spec.ts (confidence: 8/10). There is no test where a 받기 press that triggers the controller load actually downloads. In the empty-click test (lines 150–154) the replay only focuses the field. Add one test, run on every project: set #qr-url's value with page.evaluate and fire no input event, so the controller does not load. Then make the first interaction a #qr-png click and expect a QR코드.png download that decodes to the href. That covers decision (d) on webkit and mobile-safari in CI.

## Answers to Bob's questions
- (c) Missing-field guidance: see Should Fix 1. Showing these only on a 받기 press is correct; the gap is the preview text.
- (d) The replayed first click (entry.ts:41–48, `m.initQrCode(); pending?.click();`). This is not a new defect on iPhone, confidence 7/10.
  1. The normal PNG path already downloads outside the gesture. controller.ts:197–199 calls `qrPng(modules).then((blob) => { saveBlob(blob, 'QR코드.png'); ...` after an async canvas encode. photo-compress, stamp-maker and remove-background do the same.
  2. WebKit does not require a user gesture for a same-origin blob: `<a download>` click. That gate applies to popups (`window.open`), not to anchor downloads.
  3. If WebKit did block it, the existing webkit and mobile-safari PNG tests in this spec (lines 43–50, after `fill`) would already fail.
  The replay has no double-fire window: initQrCode attaches the button listeners and `onEarlyClick` is removed in the same callback. Showing it on a real iPhone stays an O1/owner item. The new test from Should Fix 2 shows it on the WebKit engine.
  **This does not hold for navigator.share.** WebKit requires transient user activation for share, and a replayed click after an async import gets NotAllowedError. For Step C: never replay a 보내기 press. Keep 보내기 hidden until the controller has loaded and canShare is true; the brief's canShare rule already does this if the button is only shown by the controller. Have the Step C review check this.
- Title 38 chars, 「인터넷 주소」 dropped: accepted. C18 allows shortening as long as the head keyword stays first, and 「가입 없이」 and 「와이파이·연락처」 are kept.
- The 2,331 quote 「2,953 2,331 1,663 1,273」 is the binary L/M/Q/H run of the version 40 row in handoff/sources/card1026/qrcode-com.txt:13. Accepted, provided check:quotes --exact passes on the live page (gate).

## Checked and passed
- Brand and plain language: 문서딱 only in the title suffix and examples (docttak.com is the domain). No 업로드/서버/브라우저. The privacy line sits below the fields in the same pattern as /stamp-maker/ and /english-name/, so it does not lead. COPY.md has the CARD1026 line. 큐/팩/톡 appear only in keywords; 촘 appears only in the tool note (system font).
- Privacy (C12): no form, no `name` on text fields, fixed file names. No storage/cookie/history; check-dist scans the page's own chunks and the controller closure. The preview `innerHTML` is the module-only SVG (controller.ts:157–159). Usage sends start and download with no values. e2e checks that URL, storage and requests are clean.
- Precache (C14): /qr-code/ is in both gen-sw NOT_PRECACHED and sw.ts RUNTIME_PAGES. Precache 437.2/444.7 of 450 KB. No budget was raised: new QR_INITIAL_KB 12.9 and QR_CONTROLLER_KB 9.2 constants only, PRECACHE_LIMIT and the preload tripwire untouched.
- Registration: tools.ts (after stamp-maker), site.ts HOME_DESC_ORDER, og.json, usage TOOLS/labels/UsageTool, bgcloud LOCAL_SCOPE_RE, lighthouserc, qa/visual, check-dist block, test lists. tool-guide-order and NEXT_GUIDES wait for Step D, and the reverse links for Step C; both are logged and accepted.
- a11y: fieldset/legend native radio group using the existing .chip pattern (focus-visible ring, 44 px targets). Every field has its own error slot via aria-describedby and aria-invalid, and the first invalid field gets focus. axe runs on every kind and on the error states; the arrow-key test passes; 360 px has no sideways scroll.
- Tool note: 4 CONTENT1021 headings. Three qrcode.com quotes match the saved source (lines 13, 33, 44). The trademark sentence matches E3 verbatim. toolFacts come from QR_MAX_BYTES, SMS_MAX and QUIET. No Wi-Fi name length and no fold length (E1/E2 notes). No hidden-network option (E1; e2e asserts there is no checkbox).
- Static QR only. 「가입 없이 무료」 and 「기간이 지나도 QR이 멈추지 않아요」 appear on the page (C1).

## Escalate to Architect
- Step C carry-forward (not a code decision for B): never replay a 보내기 press across the lazy load (WebKit transient activation). The Step C brief or review should name it.

## Cleared
/qr-code/ page, entry/controller, ContactFields, contact checks, tool note, registration, check-dist block and e2e reviewed against Step B and E1–E3: no Must Fix, two Should Fix (preview hint for missing required fields; a first-click-download e2e).
