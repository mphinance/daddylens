#!/usr/bin/env python3
"""Generate DaddyLens extension icons (16/48/128) — a cyan lens ring over a
dark glass rounded square with a '$'. Rendered at 4x then downsampled for
crisp edges. Run: python3 scripts/make-icons.py"""

import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "assets")
os.makedirs(OUT, exist_ok=True)

BG = (20, 24, 36, 255)       # #141824 dark glass
RING = (125, 211, 252, 255)  # #7dd3fc cyan accent
DOLLAR = (230, 233, 239, 255)


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def load_font(px):
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, px)
    return ImageFont.load_default()


def render(px):
    s = px * 4  # supersample
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Dark rounded background.
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BG)

    # Dollar sign, centered.
    font = load_font(int(s * 0.5))
    tb = d.textbbox((0, 0), "$", font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    d.text(((s - tw) / 2 - tb[0], (s - th) / 2 - tb[1]), "$", font=font, fill=DOLLAR)

    # Lens ring: circle in the lower-right with a short handle (a magnifier).
    lw = max(2, int(s * 0.055))
    r = int(s * 0.30)
    cx, cy = int(s * 0.66), int(s * 0.66)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=RING, width=lw)
    # Handle.
    hx, hy = cx + int(r * 0.72), cy + int(r * 0.72)
    d.line([hx, hy, hx + int(s * 0.14), hy + int(s * 0.14)], fill=RING, width=lw)

    img = img.resize((px, px), Image.LANCZOS)
    img.putalpha(Image.composite(img.getchannel("A"), Image.new("L", (px, px), 0),
                                 rounded_mask(px, int(px * 0.22))))
    return img


for size in (16, 48, 128):
    render(size).save(os.path.join(OUT, f"icon-{size}.png"))
    print(f"wrote icon-{size}.png")
