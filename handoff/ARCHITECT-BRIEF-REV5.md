# Architect Brief — REV5 (무료 임베드 위젯: 증명사진 규격 맞추기)

Source: owner "수익화 가능한 수단을 최대한 많이" (2026-10-12); `C:/dev/doc-tools-kr/reports/문서딱 수익화 전략 검증.md` L65, L73 (Photopea 방식, 백링크·브랜드 노출, 유료 화이트라벨은 나중). BUILD-LOG REV2 order: 3순위 (before AdSense). Base: REV3 deployed.

## Goal
A 사진관·학원·행정사 site can paste one iframe snippet and its visitors get the full ID-photo tool (files still never leave the device), with a "문서딱 제공" credit and a host-side backlink, counted in admin as via=embed; /embed/ explains it with copy-ready code; no server, no third-party script, no change to any existing page.

## Locked decisions
1. **Form: iframe only.** Snippet = plain HTML, no host-side JS:
   ```
   <iframe src="https://docttak.com/embed/id-photo/" title="증명사진 규격 맞추기 (문서딱)" width="100%" height="820" style="border:0;max-width:720px" loading="lazy"></iframe>
   <p><a href="https://docttak.com/id-photo/">증명사진 규격 맞추기</a> · 문서딱 제공</p>
   ```
   The second line is the backlink (a link inside our iframe is not a backlink for the host page). No `sandbox` attribute in the snippet (downloads in sandboxed frames need allow-downloads and vary by browser). No postMessage auto-resize (needs host JS): fixed height, the embed page scrolls inside if needed.
   Rejected: a script snippet or web component (third-party script on the host, support burden); a photo-compress widget now (Known Gap: add only after at least one real embed shows up in admin).
2. **Make the change easy first (R5.1, refactor, no behavior change):** extract the tool body of `src/pages/id-photo/index.astro` into `src/components/IdPhotoTool.astro` (prop `embed: boolean`). /id-photo/ HTML must be byte-identical after R5.1 (diff of dist/id-photo/index.html pasted); precache unchanged.
3. **Embed route `src/pages/embed/id-photo/index.astro`** with a new minimal layout `src/layouts/Embed.astro`:
   - Same CSS and core font preload as the tool (tool strings only: 0 new core chars). No site header, menu or footer, no share, no 이어서 하기 group, **no affiliate and no 사진관 links** (Coupang links on unregistered host sites break Partners rules; an info link would send the host's visitors away), no GA, no Web Analytics beacon, no AdSlot.
   - **No service worker registration** (no site.ts import): third-party-context storage is partitioned and SW behavior varies; the embed is online-only. The controller must tolerate storage failure (existing store-failure path; e2e covers it inside the frame).
   - Footer inside the frame: `문서딱 제공` linking to `https://docttak.com/id-photo/?via=embed` (target=_blank, rel=noopener) and `파일은 이 기기 밖으로 나가지 않아요.`
   - meta robots noindex, canonical to `/id-photo/`, not in sitemap, not in llms.txt; not precached (gen-sw only reads sitemap pages: verify).
4. **Headers:** a `_headers` block for `/embed/*`: first detach (`! Content-Security-Policy`), then the site-wide policy with `frame-ancestors *` (every other directive identical; GA/analytics sources are not needed there because the embed ships neither). Plus `X-Robots-Tag: noindex`. Every other route keeps frame-ancestors none (regression test). GA/analytics CSP extensions in gen-headers must not touch the embed line (same exactly-one-line targeting rule as REV4; whichever of REV4/REV5 lands second reuses the first one helper). Flag: probe `curl -sI` on preview `/embed/id-photo/` and `/id-photo/` and paste both CSP lines (and the Cloudflare doc line for the detach syntax).
   - COOP same-origin is ignored inside iframes (no change). Permissions-Policy unchanged (the tool uses no camera).
5. **Counting:** usage `VIAS` += `embed`. The embed page sends via=embed on every event (pick, start, success, fail, download); never the host URL or referrer (whitelist principle). Admin and weekly: the existing via split gains an embed column; no new table. Which host sites embed us: the owner sees referrers in the Cloudflare dashboard (server side, nothing new sent; runbook note). Privacy: the usage list sentence gains `다른 누리집에 넣은 도구에서 쓴 것인지`; date per the existing rule. The `?via=embed` arrival on /id-photo/ is counted only if the existing arrive path already supports it; otherwise Known Gap.
6. **Info page `src/pages/embed/index.astro`** (indexable, in sitemap and llms.txt, added to NOT_PRECACHED like guides): title/description within the SEO-LENGTH limits (meta-length test), e.g. title `내 누리집에 증명사진 도구 넣기 (무료)`. Content in plain Korean, system-font class like guides (0 core font bytes): what it is; who it is for (사진관·학원·행정사); a live preview iframe of /embed/id-photo/ (loading=lazy, below the fold); the snippet in a pre/code block plus a 복사 button (small page script; on clipboard failure it selects the text; the code stays selectable without JS); 조건 (무료 / 문서딱 표시와 아래 링크를 지우지 말아 주세요 / 바뀌거나 멈출 수 있어요); white-label one line `로고를 바꾸거나 문서딱 표시를 빼고 싶으면 메일로 알려 주세요.` + footerContact email.
   - Discovery links: **not** in the site footer (precache bytes on every precached page). From /id-photo/ page bottom only if the flag-on cloud precache stays at or under 450 KB (measure and report); otherwise only sitemap, llms.txt and the blog team.
7. **Terms:** a short /terms/ section 「다른 누리집에 넣어 쓰기」 matching the info-page 조건, with the TERMS date rule. **Owner approves the wording (escalate);** Bob drafts it.
8. **No change** to /id-photo/ behavior, CSP elsewhere, or CLAUDE.md content by Bob. At the deploy gate Arch shows the owner a one-clause addition to the CLAUDE.md Privacy/runtime line ("/embed/* allows framing by any site; it ships no third-party script").

## Flow
```
host page (사진관 site)
  <iframe src=docttak.com/embed/id-photo/>   _headers /embed/*: detach CSP; CSP with frame-ancestors *; noindex
      Embed.astro: IdPhotoTool(embed) + credit footer; no SW, no GA, no outbound links except the credit
      user picks photo -> on-device processing (same controller) -> download inside the frame
      track(..., via=embed) -> /api/usage (same origin as the frame) -> admin via column
  <p><a href=docttak.com/id-photo/>...</a> 문서딱 제공</p>     <- backlink in host HTML
/embed/ info page: explanation + preview + copy code + white-label contact
every other route: frame-ancestors none (unchanged)
```

## Build Order
- R5.1 (own commit): IdPhotoTool.astro extraction; /id-photo/ byte-identical; precache unchanged.
- R5.2: Embed.astro + /embed/id-photo/; the embed prop hides share, chain group and links; credit footer.
- R5.3: headers (Decision 4) + tests.
- R5.4: usage via=embed (usage.mjs VIAS, client, admin column) + privacy sentence.
- R5.5: /embed/ info page + copy button + meta lengths; sitemap and llms.txt include /embed/ (never /embed/id-photo/).
- R5.6: /terms/ draft (owner approval before deploy).
- R5.7: check-dist: /embed/id-photo/ has noindex + canonical, no sponsored link, no GA/beacon script, no SW registration; `_headers` has frame-ancestors * only on /embed/*.
- R5.8: docs: OPS-RUNBOOK §12 (what the widget is; where usage shows; seeing host sites in Cloudflare; answering a white-label mail: price and terms are the owner decision), REVENUE-MODEL §1 status "W: 구현".
- Flag: if the controller hard-depends on the SW, IndexedDB or a top-level-only API (window.top, navigator.share), stop and list it before patching.
- Flag: never raise precache or font budgets.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| Framing | Global CSP still sent next to the embed CSP: frame refused | Detach + curl probe + e2e in a cross-origin frame | Blank frame on host (caught before deploy) |
| Framing | Relaxation leaks to /id-photo/ | Header unit test + e2e: framed /id-photo/ is refused | Build fails |
| Storage | Partitioned/blocked storage in third-party context (Safari) | Existing store-failure path; e2e in webkit frame | Tool works, no saved state |
| Download | A browser blocks downloads from a cross-origin frame | e2e download event in all 5 projects; if blocked, show a 새 창에서 열기 link to /id-photo/?via=embed | Clear fallback link |
| Height | Mobile host page cuts the tool | Fixed 820 px + internal scroll; info page tells hosts to keep the height | Scroll inside the frame |
| SEO | /embed/id-photo/ indexed as a duplicate | noindex header + meta + canonical; not in sitemap | Nothing |
| Abuse | Host removes the credit | Terms line; nothing technical (accepted) | Nothing |
| Usage | via=embed rejected by an old Function | usage.mjs ships in the same deploy; validate test | Count briefly lower |
| Fonts/precache | Info page grows core font or precache | System-font class; NOT_PRECACHED; measured | Build fails if not |
No silent and untested path remains.

## Test map
- R5.1 byte-identical /id-photo/ [GAP->scripted diff].
- usage validate: via=embed ok on all events; unknown via null [GAP->unit]; admin via column [GAP->unit].
- headers: embed block once with detach; the /* block keeps frame-ancestors none; GA/analytics extension leaves the embed line alone [GAP->unit].
- check-dist R5.7 rules [GAP->postbuild fixtures].
- e2e embed.spec (5 browsers + axe): a host page on a second origin (or page.setContent with the iframe) loads /embed/id-photo/; fixture photo -> result -> download event from the frame; no request leaves the site origin (no-upload fixture covers the frame); no SW registration in the frame; credit link present; share, chain and links absent; framed /id-photo/ refused [GAP->e2e].
- e2e /embed/ page: snippet text exact; copy button copies (chromium clipboard permission) and the fallback selects [GAP->e2e]; meta-length includes /embed/ [GAP->unit].
- Regression: id-photo e2e, usage cloud spec, site.spec sitemap list [TESTED; update the sitemap expectation].

## Out of Scope (-> BUILD-LOG Known Gaps)
- photo-compress and other widgets; paid white-label (pricing, logo swap, credit removal); postMessage auto-resize; host analytics; other languages.

## Acceptance
- R5.1 is a separate commit with the byte-identical proof.
- vitest green; astro check 0; check:quotes and meta-length green.
- Default and cloud (flag-on) builds: check-dist OK; precache unchanged vs REV3 (or delta reported, at or under 450 KB); core font +0.
- Preview probe pasted: /embed/id-photo/ CSP has frame-ancestors *; /id-photo/ has none.
- e2e 5 projects + axe green incl. embed.spec; LHCI adds /embed/ (LCP at or under 2,000 ms).
- Owner item in REVIEW-REQUEST: /terms/ wording approval.
