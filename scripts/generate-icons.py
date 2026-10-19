"""PWA用PNGを生成。Python 3標準ライブラリのみで実行可能。"""

import math
from pathlib import Path
import struct
import zlib


ROOT = Path(__file__).resolve().parent.parent / "public" / "icons"
SEGMENTS = [
    (144, 250, 256, 150), (256, 150, 368, 250),
    (168, 234, 168, 362), (168, 362, 344, 362), (344, 362, 344, 234),
    (224, 362, 224, 286), (224, 286, 288, 286), (288, 286, 288, 362),
]


def distance(x, y, segment):
    ax, ay, bx, by = segment
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - ax - t * dx, y - ay - t * dy)


def chunk(kind, data):
    return (struct.pack(">I", len(data)) + kind + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF))


def generate(size, name, square=False):
    rows = bytearray()
    scale = 512 / size
    for row in range(size):
        rows.append(0)
        for column in range(size):
            x, y = (column + 0.5) * scale, (row + 0.5) * scale
            edge = math.hypot(max(112 - x, 0, x - 400), max(112 - y, 0, y - 400))
            alpha = 255 if square else round(max(0, min(1, (112 - edge) / scale + 0.5)) * 255)
            stroke = min(distance(x, y, segment) for segment in SEGMENTS)
            blend = max(0, min(1, (12 - stroke) / scale + 0.5))
            color = [round(bg + (fg - bg) * blend)
                     for bg, fg in zip((50, 91, 74), (248, 249, 244))]
            rows.extend((*color, alpha))
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
    png += chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")
    (ROOT / name).write_bytes(png)


ROOT.mkdir(parents=True, exist_ok=True)
generate(180, "apple-touch-icon.png", square=True)
generate(192, "pwa-192x192.png")
generate(512, "pwa-512x512.png")
generate(512, "pwa-maskable-512x512.png", square=True)
