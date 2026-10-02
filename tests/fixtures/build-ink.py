# Builds the ink-key ground-truth fixtures in tests/fixtures/ink/ (Sprint C, C1-core; dev only, never shipped).
# Port of the spike's compose_gt.py gt14 / gt15 / gt16 (synthetic ink on photographed-like paper) plus the
# brief's hard variants. Python + numpy + Pillow (HPND licence). Seeded: every run writes the same pixels.
#
# Font: Pretendard (SIL OFL 1.1, the `pretendard` npm dependency already in the repo; run `npm ci` first).
# The spike's HANBatangB (Hancom) and malgunbd (Microsoft) are not used.
#
# Per fixture: <id>.jpg (input, as a phone would save it); per family: <gt>.alpha.png (GT alpha, 8-bit grey,
# shared by the variants: same seed, same alpha).
#   gt14  blue-ink signature            gt15  red 도장 with ink gaps        gt16  printed logo
#   -shadow  elliptical shadow, -40 % light over about a third of the frame (ink and paper alike)
#   -yellow  paper tone #E9DDB5 instead of the spike's light grey
#   -jpeg    saved at JPEG q70 instead of q92
#   gt15-stampOnText  gt15 over black printed text lines (GT = the stamp only; scored in 빨간 도장 mode)
#   gt14-kraft  a dark signature on brown kraft board with fibres and flecks (C1 review, Richard's c07 / Arch's
#               "d17-like" case): 자동 must classify it black/blue and leave no texture (residue <= 0.2 %).
#               IoU is reported, not gated: on board this textured the strokes pick up texture at their edges.
# meta.json records the GT ink colour (for the composite error) and the scoring mode of each fixture.
# Run: python tests/fixtures/build-ink.py
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "ink"
FONT_DIR = ROOT / "node_modules" / "pretendard" / "dist" / "public" / "static"
W, H, S = 1280, 960, 4
SEED = 7


def room_light():
    """Spike paper() light falloff, like a phone photo under room light."""
    yy, xx = np.mgrid[0:H, 0:W] / max(W, H)
    return 1 - 0.10 * ((xx - 0.2) ** 2 + (yy - 0.1) ** 2) - 0.06 * xx


LIGHT = room_light()


def paper(rng, base=(0.93, 0.92, 0.89)):
    """Spike paper(): uneven light, low-frequency grain, fine noise."""
    light = LIGHT
    g = (rng.normal(0, 1, (H // 4, W // 4)) * 40 + 128).clip(0, 255).astype(np.uint8)
    grain = np.array(Image.fromarray(g).resize((W, H), Image.BICUBIC)) / 255 - 0.5
    P = np.array(base)[None, None, :] * light[..., None] + 0.03 * grain[..., None] + rng.normal(0, 0.008, (H, W, 1))
    return P.clip(0, 1)


def kraft(rng, base):
    """Brown kraft board: the room light, coarse mottling, horizontal fibres and a few darker flecks."""
    def up(a, size=(W, H)):
        g = ((a * 40) + 128).clip(0, 255).astype(np.uint8)
        return np.array(Image.fromarray(g).resize(size, Image.BICUBIC)) / 255 - 0.5
    mottle = up(rng.normal(0, 1, (H // 24, W // 24)))
    fibres = up(rng.normal(0, 1, (H // 2, W // 24)))
    fleck = (rng.random((H, W)) < 0.0015).astype(np.uint8) * 255
    fleck = np.array(Image.fromarray(fleck).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
    T = 0.22 * mottle + 0.18 * fibres - 0.6 * fleck.clip(0, 0.25)
    # Fine per-channel noise, strongest in blue (the darkest channel of brown board, as phone JPEGs show it).
    noise = rng.normal(0, 1, (H, W, 3)) * np.array([0.016, 0.024, 0.036])[None, None, :]
    P = np.array(base)[None, None, :] * (LIGHT * (1 + T))[..., None] + noise
    return P.clip(0, 1)


def ss_mask(draw_fn):
    """Draw at 4x and downsample with Lanczos: an anti-aliased coverage mask in 0..1."""
    m = Image.new("L", (W * S, H * S), 0)
    draw_fn(ImageDraw.Draw(m), S)
    return np.array(m.resize((W, H), Image.LANCZOS)).astype(np.float32) / 255


def sig(d, s):
    pts = []
    for t in np.linspace(0, 1, 400):
        pts.append(((300 + 700 * t + 60 * math.sin(t * 31)) * s, (520 - 120 * math.sin(t * 9) * math.exp(-t) + 40 * math.cos(t * 23)) * s))
    d.line(pts, fill=255, width=int(5 * s), joint="curve")
    d.line([(420 * s, 640 * s), (980 * s, 600 * s)], fill=255, width=int(3 * s))


def seal_font():
    return ImageFont.truetype(str(FONT_DIR / "Pretendard-Black.otf"), 150 * S)


def seal(d, s):
    cx, cy, r = 640 * s, 480 * s, 260 * s
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=255, width=int(22 * s))
    font = seal_font()
    for j, ch in enumerate(["홍길", "동인"]):
        d.text((cx - 170 * s, cy - 190 * s + j * 190 * s), ch, font=font, fill=255)


def logo(d, s):
    font = ImageFont.truetype(str(FONT_DIR / "Pretendard-Bold.otf"), 170 * S)
    d.rounded_rectangle([250 * s, 330 * s, 470 * s, 550 * s], radius=40 * s, fill=255)
    d.text((520 * s, 330 * s), "문서딱", font=font, fill=255)


TEXT_LINES = [
    "위 사람은 본 회사의 직원으로 재직하고 있음을 증명합니다.",
    "이 문서는 시험용으로 만든 가짜 서류이며 실제 효력이 없습니다.",
    "성명 홍길동   주소 서울특별시 중구 세종대로 110",
    "발급일 2026년 10월 2일   용도 제출용",
    "위의 내용이 사실과 다름이 없음을 확인합니다.",
]


def text_lines(d, s):
    font = ImageFont.truetype(str(FONT_DIR / "Pretendard-Regular.otf"), 38 * S)
    for j, line in enumerate(TEXT_LINES):
        d.text((90 * s, (250 + j * 105) * s), line, font=font, fill=255)


def shadow_light(rng_shadow):
    """-40 % light inside a soft ellipse covering about a third of the frame (a hand or phone shadow)."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W * 0.28 + rng_shadow.integers(-20, 20), H * 0.70 + rng_shadow.integers(-20, 20)
    ax, ay = W * 0.33, H * 0.37  # clipped by the frame: about a third of the pixels are inside (meta shadowShare)
    inside = (((xx - cx) / ax) ** 2 + ((yy - cy) / ay) ** 2) <= 1
    soft = np.array(Image.fromarray((inside * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(25))).astype(np.float32) / 255
    return 1 - 0.40 * soft, float(inside.mean())


def compose(A, ink, P):
    """Ink over paper. The ink is lit by the same room light as the paper (round 2: physical; the spike lit the
    paper only, so ink in the dim corner looked brighter than the paper around it allowed)."""
    F = np.array(ink)[None, None, :] * LIGHT[..., None]
    return A[..., None] * F + (1 - A[..., None]) * P


def save(name, I, q, meta, info):
    Image.fromarray((I * 255 + 0.5).clip(0, 255).astype(np.uint8)).save(OUT / f"{name}.jpg", quality=q)
    meta[name] = {**info, "alpha": f"{info['gt']}.alpha.png"}


def main():
    OUT.mkdir(exist_ok=True)
    meta = {}
    # Alphas (spike recipes; the 도장 ink gaps come from a seeded speckle field).
    rng = np.random.default_rng(SEED)
    a14 = ss_mask(sig)
    a14 = np.array(Image.fromarray((a14 * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32) / 255 * 0.92
    a15 = ss_mask(seal)
    speck = np.array(Image.fromarray((rng.random((240, 320)) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)) / 255
    a15 = a15 * np.clip((speck - 0.12) * 3, 0, 1) * 0.9
    a16 = ss_mask(logo)
    text = ss_mask(text_lines)
    light, shadow_share = shadow_light(np.random.default_rng(SEED + 100))
    sets = [
        ("gt14", a14, (0.10, 0.14, 0.42), "auto", "synthetic blue-ink signature"),
        ("gt15", a15, (0.80, 0.12, 0.12), "auto", "synthetic red 도장 impression with ink gaps (Pretendard Black 홍길/동인)"),
        ("gt16", a16, (0.05, 0.20, 0.45), "auto", "synthetic printed logo (Pretendard Bold 문서딱)"),
    ]
    for i, (gid, A, ink, mode, desc) in enumerate(sets):
        # One paper seed per fixture family: every variant has the same grain and noise.
        def pap(base=(0.93, 0.92, 0.89)):
            return paper(np.random.default_rng(SEED * 1000 + i), base)

        P = pap()
        Image.fromarray((A * 255 + 0.5).clip(0, 255).astype(np.uint8)).save(OUT / f"{gid}.alpha.png", optimize=True)
        base = dict(gt=gid, ink=list(ink), mode=mode, desc=desc)
        save(gid, compose(A, ink, P), 92, meta, {**base, "variant": "base", "jpegQ": 92})
        save(f"{gid}-shadow", compose(A, ink, P) * light[..., None], 92, meta, {**base, "variant": "shadow", "jpegQ": 92, "shadowShare": round(shadow_share, 3)})
        yel = tuple(c / 255 for c in (0xE9, 0xDD, 0xB5))
        save(f"{gid}-yellow", compose(A, ink, pap(yel)), 92, meta, {**base, "variant": "yellow", "jpegQ": 92, "paper": "#E9DDB5"})
        save(f"{gid}-jpeg", compose(A, ink, P), 70, meta, {**base, "variant": "jpeg", "jpegQ": 70})
        if gid == "gt14":
            kr = tuple(c / 255 for c in (0x9C, 0x74, 0x4E))
            dark = (0.09, 0.08, 0.08)
            info = {**base, "ink": list(dark), "variant": "kraft", "jpegQ": 92, "paper": "#9C744E", "guess": "black", "iouGate": False, "desc": "dark signature on brown kraft board"}
            save("gt14-kraft", compose(A, dark, kraft(np.random.default_rng(SEED * 1000 + 50), kr)), 92, meta, info)
        if gid == "gt15":
            printed = compose(text, (0.08, 0.08, 0.08), P)
            save("gt15-stampOnText", compose(A, ink, printed), 92, meta, {**base, "variant": "stampOnText", "mode": "red", "jpegQ": 92})
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf8")
    print(f"{len(meta)} fixtures -> {OUT}")


if __name__ == "__main__":
    main()
