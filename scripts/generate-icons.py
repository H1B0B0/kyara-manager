#!/usr/bin/env python3
"""Generate crisp RGBA PNG icons for Kyara Manager (16, 32, 48, 128)."""

import math
import os
import struct
import zlib

BG_COLOR = (14, 13, 18, 255)        # #0e0d12 obsidian
BORDER_COLOR = (46, 43, 54, 255)    # #2e2b36 dark zinc
VERMILION = (255, 77, 46, 255)      # #ff4d2e vermilion seal
VERMILION_DARK = (185, 38, 18, 255) # deep crimson accent
GOLD = (245, 197, 24, 255)          # #f5c518 chakra gold
PAPER = (244, 240, 234, 255)        # #f4f0ea warm highlight


def blend(dst, src, alpha_factor=1.0):
    sa = (src[3] / 255.0) * max(0.0, min(1.0, alpha_factor))
    da = dst[3] / 255.0
    out_a = sa + da * (1.0 - sa)
    if out_a <= 1e-6:
        return (0, 0, 0, 0)
    r = (src[0] * sa + dst[0] * da * (1.0 - sa)) / out_a
    g = (src[1] * sa + dst[1] * da * (1.0 - sa)) / out_a
    b = (src[2] * sa + dst[2] * da * (1.0 - sa)) / out_a
    return (int(round(r)), int(round(g)), int(round(b)), int(round(out_a * 255)))


def sd_rounded_box(px, py, cx, cy, half_w, half_h, radius):
    qx = abs(px - cx) - (half_w - radius)
    qy = abs(py - cy) - (half_h - radius)
    ox = max(qx, 0.0)
    oy = max(qy, 0.0)
    return math.hypot(ox, oy) + min(max(qx, qy), 0.0) - radius


def render_icon(size):
    cx = (size - 1) / 2.0
    cy = (size - 1) / 2.0
    half = size / 2.0
    corner_r = size * 0.22
    border_w = max(1.0, size * 0.0625)

    pixels = []
    for y in range(size):
        row = []
        for x in range(size):
            d_box = sd_rounded_box(x, y, cx, cy, half - 0.5, half - 0.5, corner_r)
            if d_box > 0.75:
                row.append((0, 0, 0, 0))
                continue

            box_alpha = max(0.0, min(1.0, 0.5 - d_box))
            color = (BG_COLOR[0], BG_COLOR[1], BG_COLOR[2], int(round(255 * box_alpha)))

            # Subtle inner border (#2e2b36)
            d_inner = sd_rounded_box(
                x, y, cx, cy,
                half - 0.5 - border_w,
                half - 0.5 - border_w,
                max(1.0, corner_r - border_w),
            )
            if d_inner > -0.75:
                b_alpha = max(0.0, min(1.0, 0.5 + d_inner)) * box_alpha
                color = blend(color, BORDER_COLOR, b_alpha)

            # Normalized coordinates [-1, 1]
            nx = (x - cx) / half
            ny = (y - cy) / half

            # Japanese seal frame (subtle vermilion square ring)
            seal_d = max(abs(nx), abs(ny))
            ring_outer = 0.70
            ring_inner = 0.62 if size >= 32 else 0.58
            if ring_inner - 0.04 <= seal_d <= ring_outer + 0.04:
                a_out = max(0.0, min(1.0, (ring_outer - seal_d) * half * 0.8 + 0.5))
                a_in = max(0.0, min(1.0, (seal_d - ring_inner) * half * 0.8 + 0.5))
                ring_a = a_out * a_in * 0.45
                color = blend(color, VERMILION_DARK, ring_a)

            # Outer Vermilion Diamond (#ff4d2e)
            diamond_d = abs(nx) * 1.05 + abs(ny) * 0.92
            d_outer = 0.58
            if diamond_d <= d_outer + (1.5 / half):
                a_dia = max(0.0, min(1.0, (d_outer - diamond_d) * half * 0.75 + 0.5))
                shade = VERMILION if (nx + ny) <= 0.08 else VERMILION_DARK
                color = blend(color, shade, a_dia)

            # Inner Dark Cutout for crisp contrast
            d_cut = 0.34
            if diamond_d <= d_cut + (1.5 / half):
                a_cut = max(0.0, min(1.0, (d_cut - diamond_d) * half * 0.75 + 0.5))
                color = blend(color, BG_COLOR, a_cut)

            # Inner Gold Chakra Core (#f5c518)
            d_gold = 0.22 if size >= 32 else 0.25
            if diamond_d <= d_gold + (1.5 / half):
                a_gold = max(0.0, min(1.0, (d_gold - diamond_d) * half * 0.8 + 0.5))
                core_col = PAPER if diamond_d < 0.06 and size >= 48 else GOLD
                color = blend(color, core_col, a_gold)

            row.append(color)
        pixels.append(row)
    return pixels


def write_png(filepath, width, height, pixels):
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter type 0 (None)
        for r, g, b, a in row:
            raw.extend((r, g, b, a))

    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), level=9)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")

    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "wb") as f:
        f.write(png)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons_dir = os.path.join(root, "icons")
    for s in (16, 32, 48, 128):
        out = os.path.join(icons_dir, f"icon-{s}.png")
        px = render_icon(s)
        write_png(out, s, s, px)
        print(f"Generated {out} ({s}x{s})")


if __name__ == "__main__":
    main()
