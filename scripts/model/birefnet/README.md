# BiRefNet_lite 512 fp16 — our ONNX export (Sprint C, C2)

The model behind /remove-background/. We export it ourselves so its provenance is our commit, not a third-party file.

| Item | Value |
|---|---|
| Source | `ZhengPeng7/BiRefNet_lite`, HF commit `aa62cd87eafb9cc43056d08ef3615a14628b831d` (2026-08-29); model card `license: mit`; code https://github.com/ZhengPeng7/BiRefNet (MIT, Copyright (c) 2024 ZhengPeng) |
| Env | Python 3.10.21 (uv), torch 2.1.2+cpu, torchvision 0.16.2, onnx 1.16.2, onnxruntime 1.20.1, onnxconverter-common 1.14.0, transformers 4.44.2, timm 1.0.9, kornia 0.8.2 (`requirements.lock`, install line at its top) |
| Deform conv | path (b), `--deform gridsample`: `torchvision.ops.deform_conv2d` rewritten with `F.grid_sample` (bilinear, zeros, align_corners=False), proven equal to torchvision (max 3.9e-6). Path (a), `deform_conv2d_onnx_exporter` 1.2.0, fails on torch 2.0.1, 2.1.2 and 2.4.1 (C2.0) |
| Simplify (C2 round 2) | **onnxsim 0.4.36** (Apache-2.0) on the fp32 graph, 3 random-input checks: 17,112 → 1,870 nodes (the ~2,400 int64 shape nodes the web engine ran on the CPU at every session start are folded; the input is fixed at 512). Then the wide-op fix again (none). `export.py --resimplify <out dir>` applied it to the C2.0 export (`model_fp32.onnx` -> `<out dir>-sim`); a fresh export runs it as a step |
| Graph | wrapper `sigmoid(net(x)[-1])`; `input_image` 1×3×512×512 fp32 → `output_image` 1×1×512×512; opset 17; dynamo off; constant folding on; Split/Concat trees ≤ 6 (`fix_wide_ops.py`; none in this graph); fp16 with `keep_io_types=True` |
| Parts | byte split, **23 MiB** each (24 MiB parts hit `scripts/lib/capacity.mjs`'s `< 24 MiB` file guard; the C2.0 manifest's 24 MiB parts were re-cut with `export.py --resplit`, same bytes, same `sha256Total`) |
| exportId | **`aa62cd87-714d0a62`** (HF revision prefix + model SHA-256 prefix); 92,302,964 bytes; `sha256Total` `714d0a62f064d6d972911ba7cef8716d8a77f326e6f714379e3a77364ab92062`. Superseded: `aa62cd87-ce158794` (C2 round 1, not simplified, 93,300,659 bytes) |

## Files

- `export.py` — export (`--deform gridsample`; wide-op fix, onnxsim, fp16, parts), `--resimplify <out dir>`, `--resplit <out dir>`. Outputs go to `out/` (git-ignored).
- `parity.py --out <export out dir>` — the C2.0 gates on the **committed** parts (each part and the whole checked
  against `manifest.json`): fp32 vs torch, fp16 vs fp32, GT MAE/IoU on the 16 spike GT images, empty masks on the
  49 real photos (the 50 spike photos minus l04, a paper letterhead: Arch C2.0 ruling). Exit 1 on any miss.
  Needs the spike data (`BGREMOVE_SPIKE`, default `C:/dev/doc-tools-kr/spikes/bg-remove`).
- `metrics.py`, `fix_wide_ops.py` — from the spike, unchanged.
- `tiny.py` — the 272-byte stand-in model for the page e2e (`tests/fixtures/bgremove/tiny.onnx`).

## Shipping a new export

1. Export, then `parity.py` must exit 0.
2. Copy `out/<tag>/parts/*` to `vendor-assets/birefnet-lite-512/<exportId>/` and delete the old folder (one version only).
3. Update `BIREFNET_EXPORT` in `scripts/copy-vendor.mjs`, `EXPORT` in `parity.py`, `tests/fixtures/build-bgremove.py`
   and `scripts/regress/bgremove.mjs`; rebuild the fixtures; the page's Cache Storage name follows the exportId
   (old caches are deleted on the next use).
