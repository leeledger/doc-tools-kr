# Review Request — CARD1026 Step A (sources + QR engine)
Date: 2026-10-26
Ready for Review: YES
Status: DONE

## Files Changed
- package.json:54,68 + package-lock.json (+15 lines, 2 entries) — uqr 0.1.3 (dependencies, exact) and jsqr 1.4.0
  (devDependencies, exact); lock written with --package-lock-only, nothing else moved.
- licenses.manifest.json:429-435 — uqr entry 「QR코드 만들기·전자명함 만들기: QR 그림」, files [LICENSE].
- handoff/sources/card1026/*.txt (new, 6 files) — Q0 verbatim excerpts with URL, fetch date 2026-10-26 and sha256:
  rfc2426, rfc2425 §5.8.1, qrcode-com (capacity rows v1/v15/v16/v40, quiet zone, trademark; ko + en), zxing
  Barcode-Contents (tel, SMSTO, WIFI), Apple Tech Talk 206 transcript, Apple iCloud vCard 3.0 line.
- src/lib/qr/encode.ts:1-44 — encodeQr (ecc M, border 0, no boost), fixSurrogates loop, 2,331-byte tooLong, dense > v15.
- src/lib/qr/render.ts:1-69 — qrSvg (viewBox incl. 4-module quiet zone, white rect, one path, title + role, crispEdges),
  pngModulePx, qrRgba (pure), qrPng (canvas putImageData → PNG blob).
- src/lib/qr/payload.ts:1-88 — normalizeUrl / normalizePhone and the url, text, tel, SMSTO, WIFI builders.
- src/lib/qr/vcard.ts:1-110 — ContactFields, CONTACT_MAX (C9), escapeText, displayName (FN), foldLine (75 octets, no
  split inside UTF-8 or a backslash pair), unfold, vcard(fields, {fold}).
- tests/helpers/qr-decode.ts:1-8 — jsQR decode → binaryData → strict UTF-8 TextDecoder (reusable by Step B/C e2e).
- tests/unit/qr-encode.test.ts, qr-render.test.ts, qr-payload.test.ts, qr-vcard.test.ts (new, 35 tests) — every C4–C8
  case in the brief's test map, jsQR round trips (Hangul, emoji, URL, multi-line, escaped Wi-Fi, all-max vCard).
- handoff/BUILD-LOG.md (end) — CARD1026 A entry (CRLF kept).

## Gates run (low-memory host, targeted)
- vitest qr-* 35/35; plus adsense, bgremove, check-licenses, drop-links, hwp-notice, idphoto-landmarker, polish,
  postbuild, handoff, handoff-sweep → 14 files 341/341.
- PUBLIC_SITE_URL=https://docttak.com npm run build + check-dist OK (0 WARNINGs; preload 92.1/92.66 KB; precache
  432.9/450 KB). npm run check 0/0.
- check:licenses: worktree junction issue (as PRINT1023 B); equivalence run (script's allowed/componentProblems over the
  root checkout's npm ls with this lock + manifest) → 0 problems, uqr MIT, jsqr not shipped. CI is authoritative.
- Not run: full vitest, e2e, LHCI (no page change).

## Open Questions
- Decisions (a)–(h) in the BUILD-LOG entry, especially: SVG path as horizontal runs instead of 1×1 squares (a);
  putImageData instead of per-module fillRect (b); URL scheme rule + host must contain a dot (c); vCard URL with
  `;` `,` `\` percent-encoded rather than text-escaped (d); TEL values kept as typed (f).
- For Arch: Apple's transcript says 「Hidden SSIDs are not supported.」 (affects the C7 hidden checkbox copy in Step B);
  RFC 2426 says 75 *characters* (our 75 octets is stricter; no saved source says octets); the saved trademark sentence
  names DENSO WAVE INCORPORATED, not 「(주)덴소웨이브」 (C16 wording).
- All-max contact is 2,300 / 2,331 bytes — fits with 31 bytes spare; any later field or maxLength increase breaks it
  (the unit test will catch it).

## Out of Scope (logged in BUILD-LOG)
- check:licenses cannot run inside a junctioned worktree (pre-existing, PRINT1023 B).
