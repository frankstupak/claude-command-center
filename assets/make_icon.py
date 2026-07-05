#!/usr/bin/env python3
# Claude Command Center icon generator. Draws the app's own face: four tiled
# chat panes, the active one lit in the warm accent, usage strip on the bottom.
from PIL import Image, ImageDraw

BG      = (23, 23, 26, 255)     # near-black rounded square
BORDER  = (48, 48, 54, 255)
TILE    = (43, 43, 48, 255)     # idle pane
TILE_LN = (78, 78, 86, 255)     # idle "text" lines
ACCENT  = (208, 137, 74, 255)   # #d0894a warm accent (active pane + meter)
ACCENT_LN = (250, 235, 222, 235)
BAR_BG  = (14, 14, 16, 255)
GREY_LN = (70, 70, 76, 255)

def rr(d, box, r, fill):
    d.rounded_rectangle(box, radius=r, fill=fill)

def render(px):
    S = 512
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # background plate
    rr(d, (8, 8, S-8, S-8), 104, BG)
    d.rounded_rectangle((8, 8, S-8, S-8), radius=104, outline=BORDER, width=4)

    pad = 74
    x0, y0, x1, y1 = pad, pad, S-pad, S-pad
    bar_h = 46
    gap = 20
    grid_bottom = y1 - bar_h - gap
    mid_x = (x0 + x1) // 2
    mid_y = (y0 + grid_bottom) // 2

    tiles = [
        (x0, y0, mid_x - gap//2, mid_y - gap//2, True),    # top-left = active
        (mid_x + gap//2, y0, x1, mid_y - gap//2, False),
        (x0, mid_y + gap//2, mid_x - gap//2, grid_bottom, False),
        (mid_x + gap//2, mid_y + gap//2, x1, grid_bottom, False),
    ]
    for (tx0, ty0, tx1, ty1, active) in tiles:
        rr(d, (tx0, ty0, tx1, ty1), 16, ACCENT if active else TILE)
        # chat text lines
        lx0 = tx0 + 20
        ln_col = ACCENT_LN if active else TILE_LN
        widths = [0.72, 0.5, 0.62]
        ly = ty0 + 26
        for w in widths:
            lw = int((tx1 - tx0 - 40) * w)
            rr(d, (lx0, ly, lx0 + lw, ly + 12), 6, ln_col)
            ly += 26

    # usage bar with three meters (active=accent, then grey)
    rr(d, (x0, y1 - bar_h, x1, y1), 16, BAR_BG)
    seg_w = (x1 - x0 - 4*24) // 3
    sx = x0 + 24
    for i in range(3):
        col = ACCENT if i == 0 else GREY_LN
        fillw = int(seg_w * (0.85 if i == 0 else (0.55 if i == 1 else 0.35)))
        rr(d, (sx, y1 - bar_h//2 - 5, sx + seg_w, y1 - bar_h//2 + 5), 5, (40,40,44,255))
        rr(d, (sx, y1 - bar_h//2 - 5, sx + fillw, y1 - bar_h//2 + 5), 5, col)
        sx += seg_w + 24

    if px != S:
        img = img.resize((px, px), Image.LANCZOS)
    return img

import os
out = os.path.dirname(os.path.abspath(__file__))
for px in (512, 256, 128, 64):
    render(px).save(os.path.join(out, f"icon-{px}.png"))
render(256).save(os.path.join(out, "claude-command-center.png"))
print("wrote:", ", ".join(f"icon-{p}.png" for p in (512,256,128,64)), "+ claude-command-center.png")
