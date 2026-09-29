# Builds tests/fixtures/photo/cmyk.jpg (dev only; Pillow, HPND licence, never shipped).
# 400x300 CMYK JPEG with four 200x150 patches of known values (C, M, Y, K in 0-255):
#   top-left cyan (255,0,0,0), top-right magenta (0,255,0,0),
#   bottom-left yellow (0,0,255,0), bottom-right grey K=128 (0,0,0,128).
# Run: python tests/fixtures/build-cmyk.py
from pathlib import Path

from PIL import Image

PATCHES = [
    ((0, 0), (255, 0, 0, 0)),
    ((200, 0), (0, 255, 0, 0)),
    ((0, 150), (0, 0, 255, 0)),
    ((200, 150), (0, 0, 0, 128)),
]

img = Image.new("CMYK", (400, 300))
for (x, y), cmyk in PATCHES:
    img.paste(cmyk, (x, y, x + 200, y + 150))
out = Path(__file__).resolve().parent / "photo" / "cmyk.jpg"
out.parent.mkdir(parents=True, exist_ok=True)
img.save(out, "JPEG", quality=90)
print(f"fixtures: {out.name} {out.stat().st_size / 1024:.1f} KB")
