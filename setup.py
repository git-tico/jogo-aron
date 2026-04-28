#!/usr/bin/env python3
"""Run once to generate icon-192.png and icon-512.png for the PWA."""
import struct, zlib, math, os

def make_png(size):
    rows = []
    for y in range(size):
        row = bytearray([0])  # filter type: None
        ny = y / (size - 1)
        for x in range(size):
            nx = x / (size - 1)
            row += bytearray(pixel(nx, ny))
        rows.append(bytes(row))

    compressed = zlib.compress(b''.join(rows), 6)

    def chunk(name, data):
        crc_data = name + data
        return (
            struct.pack('>I', len(data))
            + crc_data
            + struct.pack('>I', zlib.crc32(crc_data) & 0xffffffff)
        )

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', compressed)
        + chunk(b'IEND', b'')
    )

def pixel(nx, ny):
    """Return (r, g, b) for a normalized pixel position."""
    cx, cy = 0.5, 0.5

    # Signed distance helpers (normalized coords)
    dx = nx - cx
    dy = ny - cy

    # --- Rocket geometry (in normalized space, rocket centered) ---
    # Body: vertical rect
    body_x1, body_x2 = 0.36, 0.64
    body_y1, body_y2 = 0.32, 0.78

    # Nose cone: triangle above body
    nose_y_top    = 0.10
    nose_y_base   = body_y1

    # Fins: triangles at bottom sides
    fin_y1, fin_y2  = 0.75, 0.90

    # Window: circle in center of body
    win_cx, win_cy, win_r = 0.50, 0.52, 0.072

    # Flame: teardrop below body
    flame_y1, flame_y2 = body_y2, 0.95

    # --- Test regions ---
    dist_win = math.sqrt((nx - win_cx)**2 + (ny - win_cy)**2)
    if dist_win < win_r:
        # Blue window with radial gradient feel
        t = dist_win / win_r
        r = int(lerp(208, 85,  t))
        g = int(lerp(238, 170, t))
        b = int(lerp(255, 255, t))
        return (r, g, b)

    if body_x1 < nx < body_x2 and body_y1 < ny < body_y2:
        # White/silver body
        shine = 1 - abs(nx - 0.50) / 0.14
        v = int(lerp(178, 245, shine))
        return (v, v + 8, min(255, v + 18))

    # Nose cone
    if nose_y_top < ny < nose_y_base:
        frac = (ny - nose_y_top) / (nose_y_base - nose_y_top)
        half = frac * (body_x2 - body_x1) / 2
        if abs(nx - cx) < half:
            t = (nx - cx + half) / (2 * half) if half > 0 else 0.5
            r = int(lerp(220, 255, t))
            g = int(lerp(60,  130, t))
            b = int(lerp(20,  60,  t))
            return (r, g, b)

    # Left fin
    if fin_y1 < ny < fin_y2 and nx < body_x1:
        reach = (ny - fin_y1) / (fin_y2 - fin_y1) * 0.12
        if nx > body_x1 - reach:
            return (58, 130, 230)

    # Right fin
    if fin_y1 < ny < fin_y2 and nx > body_x2:
        reach = (ny - fin_y1) / (fin_y2 - fin_y1) * 0.12
        if nx < body_x2 + reach:
            return (58, 130, 230)

    # Flame
    if flame_y1 < ny < flame_y2:
        t     = (ny - flame_y1) / (flame_y2 - flame_y1)
        half  = (1 - t) * 0.10
        if abs(nx - cx) < half:
            r = 255
            g = int(lerp(200, 80, t))
            b = 0
            return (r, g, b)

    # Background gradient: dark blue top to deeper blue bottom
    r = int(lerp(6, 2, ny))
    g = int(lerp(16, 8, ny))
    b = int(lerp(55, 25, ny))
    return (r, g, b)

def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return a + (b - a) * t

script_dir = os.path.dirname(os.path.abspath(__file__))
for size in [192, 512]:
    fname = os.path.join(script_dir, f'icon-{size}.png')
    with open(fname, 'wb') as f:
        f.write(make_png(size))
    print(f'✓ {fname}')

print('Done! Icons ready for the PWA.')
