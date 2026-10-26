# Review Feedback — CARD1026 Step A (sources + QR engine)
Date: 2026-10-26
Ready for Builder: YES

## Must Fix
None.

## Should Fix
None that blocks or is worth a change now. Notes for the record:
- src/lib/qr/render.ts:15-27, 58-69 (drift (a)/(b), accepted) — the SVG uses horizontal runs instead of 1×1 squares, and
  the PNG uses putImageData instead of fillRect. Both draw the same pixels: the test rebuilds the module matrix from the
  path and compares it to the encoder output, and the RGBA image is exact integer pixels with no smoothing. No change.
- src/lib/qr/vcard.ts:55 (decision (d), accepted) — `;` `,` `\` in the vCard URL become %3B/%2C/%5C, while the 인터넷 주소
  tab keeps the raw href. Most servers read both the same; text-escaping would leave a literal backslash in readers that
  don't unescape uri values, which is worse. Step C's live smoke should open one URL with a comma from the contact
  card (confidence 4, appendix only).
- src/lib/qr/payload.ts:80 — SSID_MAX counts characters (as the brief says), but the real Wi-Fi limit is 32 octets
  (about 10 Hangul). Harmless: a longer name can't match a real network, and no saved source gives 32. Don't state
  the number in Step B copy unless a source is saved (confidence 4).

## Escalate to Architect
None. Bob's open items (hidden SSID, 75 characters vs octets, trademark wording) are covered by orchestrator E1–E3.
75 octets is stricter than RFC 2426's "75 characters", so it is compliant.

## Cleared
Reviewed encode/render/payload/vcard.ts, the jsQR helper, the 4 test files (35/35 rerun here), package.json/lock,
the manifest and the saved sources. Checked:
- uqr 0.1.3: `border: 0` returns the matrix as-is; `makeSegments` makes one numeric, alphanumeric or byte segment
  with no ECI, so the 2,331-byte cut matches the v40-M binary capacity in qrcode-com.txt:13-14. 412/413 bytes give
  v15/v16 (:23-25) and 14/15 bytes give v1/v2 at M.
- fixSurrogates catches every unpaired surrogate before uqr's encodeURI and matches TextEncoder's U+FFFD byte count.
- The quiet zone is 4 modules on every side (qrcode-com.txt:33), colors are #000 on #fff, and the PNG module size
  follows the brief's formula.
- Wi-Fi escaping (\ ; , : ", one pass) and the payload form match zxing:49,63 (the wiki example is tested). SMSTO and
  tel match the brief.
- vCard escaping matches RFC 2426 ESCAPED-CHAR (backslash first; ':' and '"' left alone). N has 5 components, ADR 7,
  ORG 2. CRLF follows every line, there is no BOM and no CHARSET. foldLine keeps every physical line at 75 octets or
  less (a continuation's leading space counts), never splits a code point or an escape pair, and unfold(fold(x)) = x.
- The all-max worst case (Hangul is 3 bytes per UTF-16 unit, the Hangul URL path 9) comes to 2,300 bytes and decodes.
- The round trips are real: jsQR binaryData goes through a strict UTF-8 TextDecoder.
- Licenses: uqr MIT is in the manifest; jsqr Apache-2.0 is dev-only and not imported from src/.
