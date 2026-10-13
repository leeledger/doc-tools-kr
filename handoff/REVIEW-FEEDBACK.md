# Review Feedback — Step REV5 (free embed widget: 증명사진 규격 맞추기)
Date: 2026-10-13
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- scripts/lib/embed-check.mjs:60-63 (confidence: 8/10) — `framing` only catches blocks whose CSP line has `frame-ancestors (?!'none')`. Two regressions slip through: a block with only `! Content-Security-Policy` and no replacement (the route is then sent with no CSP at all and can be framed), and a block that detaches and sets a policy without any `frame-ancestors` directive. Quoted: `const framing = all.filter((b) => b.lines.some((l) => l.startsWith('Content-Security-Policy:') && /frame-ancestors (?!'none')/.test(l)));`. Fix: (a) any block containing `! Content-Security-Policy` must be a `/embed/<tool>/*` block, and (b) every CSP line outside `/*` must carry a `frame-ancestors` directive. Add both cases to the embedHeaderProblems fixture test. public/_headers today is correct, so this does not block.
- src/pages/terms/index.astro:47 vs src/pages/embed/index.astro (조건) (confidence: 6/10) — the info page says 「도구 안의 「문서딱 제공」 표시와 코드 아래 줄의 링크를 지우지 말아 주세요」, the terms say 「「문서딱 제공」 표시와 함께 넣는 링크를 지우거나 가리지 말아 주세요」. "함께 넣는 링크" is less clear than "코드 아래 줄의 링크", and "가리지" appears only in the terms. The two say the same thing, but align the wording when the owner approves 11항 (for example 「코드와 함께 넣는 아래 줄의 링크」 in both).
- src/pages/embed/index.astro (`<pre id="embed-code" … aria-label="넣을 코드">`) (confidence: 4/10, verify) — `aria-label` on a `pre` (generic role) is not supported by all screen readers. Bob reports axe is clean, so check only. If needed, use `role="region"` with the label, or a visible caption plus `aria-labelledby`.

## Escalate to Architect
- /terms/ 시행일 for the whole page: `TERMS_EFFECTIVE = TERMS_EMBED` (src/data/legal.ts) moves the top-line 「시행일」 from 2026년 9월 30일 (default) / PRIVACY_CLOUD (cloud) to 2026년 10월 20일 in every build. From deploy until 10/20, the whole page reads as not yet in effect, although only 11항 is new and 11항 already states its own date. Whether that is right under 9항 (7-day notice) is an owner/legal decision, not a code one. Bring it to the owner together with the 11항 wording approval.
- Dates to re-confirm at the gate (Bob flagged these as well): PRIVACY_EMBED 2026년 10월 13일 (the same date as PRIVACY_OUT, so two history lines share it), EMBED_UPDATED 2026-10-13, TERMS_EMBED = deploy + 7 days.
- Cloudflare detach + re-add in the same block is modelled correctly in serve.mjs (detach is applied before the same rule sets the header, so the value is not appended). It is still unproven on a real Pages deploy. Arch must `curl -sI` a preview of `/embed/id-photo/` and `/id-photo/` before production, as Bob's Open Question 4 says.

## Cleared
Reviewed and passed:
- public/_headers: frame-ancestors * only in `/embed/id-photo/*`, after `! Content-Security-Policy`, other directives identical, X-Robots-Tag noindex. `/*` keeps 'none'. The `/.well-known/assetlinks.json` and preview-host blocks are intact.
- extendSiteCsp: GA and Web Analytics change only the `/*` CSP line.
- Embed.astro: noindex, canonical to /id-photo/, no site script/SW/GA/beacon/ad. The credit link opens in a new tab with ?via=embed.
- IdPhotoTool embed: affiliate, 사진관 links, Share, #idp-next and AdSlot all dropped. The controller now treats #idp-next as optional.
- usage: arrival() returns via=embed from the frame's own path before it reads the referrer, so no host data. VIAS, the admin column and the weekly column are updated.
- gen-sw: NOT_PRECACHED covers the /embed/ prefix. Sitemap and llms.txt list /embed/ only.
- check-dist R5.7 rules and the matching unit and e2e tests.
- /id-photo/: only the script tag moved (accepted deviation).
- /embed/ page: copy and the clipboard fallback (selects the code, polite live status), click-to-open preview with a no-JS link.
- Privacy line and history entry.
