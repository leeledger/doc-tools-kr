# Review Feedback — Step 3 (사진 용량 줄이기 `/photo-compress/`), round 2
Date: 2026-09-30
Ready for Builder: NO (1 Must Fix, a two-line copy gate)

Gates I ran on the round-2 tree:
- check 0/0/0; unit 190/190; build OK, all budgets met.
- Photo e2e on chromium + firefox + webkit: 45 passed, 27 skipped (F1/F2 and viewport reasons), 0 failed, no flakes this run.

Round-1 Must Fix, re-verified with my own probes:
- **Strip between scans: FIXED.**
  - APP1 "Exif…GPS" inserted after scan 1 of portrait_pd.jpg (progressive): the sniffer now flags hasExif; the strip drops the segment (348,183 → 348,129) and the output equals the strip of the clean file byte for byte.
  - COM with FF D9 in its payload after scan 1: dropped whole; the output also equals the clean strip (it used to be a 47 KB truncated cut).
  - The final re-sniff now also rejects any EXIF, XMP or GPS left in the output.
- **Compare aspect: FIXED.** At 1280×900 the stage ratio is 0.562 against the image's 0.562. The Pixel-class viewport matches as well. The screenshot shows no distortion.

Should Fix, all verified in code:
- The scorer has its own try, and a failure keeps the full-size result.
- `touch-action: none` applies only at 2× and 4×.
- The arrow keys return early at 1×.
- Re-baselined pairs get 0.001 SSIM / 0.05 dB of slack.
- A run with no corpus exits 1 unless `--fixtures-only` is given; that run is labelled PARTIAL.

The new sniff walk showed no regressions:
- Over the 22 corpus files and the 7 fixtures: 0 false truncated, the strip succeeds on every JPEG, and no Exif is left after it.
- The walk breaks on junk before SOS, which is still truncated as before.
- The PNG eXIf and iTXt XMP, WebP EXIF chunk and HEIF 'Exif' checks only raise the metadata flags. Their only effect is a privacy-first re-encode. A false positive on the HEIF 'Exif' search costs one re-save note, which is acceptable.

## Must Fix
- src/tools/photo-compress/controller.ts:269-270 with messages.ts:69-70 (confidence: 9/10) — The "grown" line is chosen by `rep.outBytes > rep.inBytes` alone, not by `rep.resaved`. A file with no private data that grows on re-encode is therefore told a false privacy reason.
  - Verified in Chromium at the default 500 KB: opaque_rgba.png (a synthetic PNG with no EXIF, GPS or orientation) shows "8.7 KB → 43.5 KB (늘어남) — 위치 정보 등 개인정보를 지우고 방향을 바로잡느라 다시 저장했습니다. 목표 용량 안입니다."
  - Small PNG and CMYK inputs under the target are common, so this false claim would reach users.
  - Fix: show `NOTES.grown` only when `rep.resaved && out > in`. A grown row without `resaved` needs its own neutral line, e.g. "{before} → {after} (늘어남) — JPG로 바꾸면서 용량이 늘었습니다. 목표 용량 안입니다." The exact copy, or whether such a row should simply be kept, is for Arch (see Escalate).
  - Add an e2e for opaque_rgba.png at 500 KB.

## Should Fix
- src/lib/image/sniff.ts:155 with 199-202 (confidence: 4/10, appendix) — Now that the walk reads every APP1, including those between scans, a second Exif APP1 can overwrite `orientation`. Browsers honour the first. Only read the orientation from the first Exif APP1. This is rare, and the decode aspect guard already contains the damage.

## Escalate to Architect
- **A non-JPEG input with nothing private, already under the target** (a clean PNG, BMP or GIF, or a CMYK JPEG) is re-encoded to JPG and can grow severalfold (opaque_rgba.png: 8.7 KB → 43.5 KB).
  - The round-1b rule said "Nothing to remove → keep the original". Bob read "nothing to remove" as "the JPEG strip changes no byte", so it never applies to other formats.
  - Should a clean PNG or other non-JPEG under the target be kept, or be converted to JPG with a neutral "grown" line? A site that requires a JPG would want the conversion.
  - Product decision. Either way, the Must Fix copy gate above is needed.

## Cleared
Round 2 is reviewed:
- **Fixed as asked:** both round-1 Must Fix items, verified with my probes and screenshots, and all round-1 Should Fix items.
- **Arch decisions implemented:** the privacy-first kept rule in every mode (engine.ts:374-386), and the grown copy for re-saved rows (apart from the Must Fix above).
- **Harness and sniffer:** the regress harness is now tighter, and the new sniff walk regresses nothing on the corpus or the fixtures.


# Round 3 — orchestrator verification (2026-09-30)
The single round-2 Must Fix (privacy reason in the grown line only when rep.resaved) was verified by the orchestrator in messages.ts:73-78 and controller.ts:270, with unit + e2e coverage (194/194, photo e2e 72 passed / 0 failed). Verdict: APPROVE — Step 3 clear.
