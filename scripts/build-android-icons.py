#!/usr/bin/env python3
"""
ساخت آیکن لانچر و اسپلش اندروید از لوگوی رسمی جدید حساب‌یار

منبع: public/icons/icon-512.png (خروجی scripts/build-app-logo.py)
اسپلش: public/images/hesabyar/logo.png (لوگوی کامل روی پس‌زمینه‌ی تیره)
اجرا: python3 scripts/build-android-icons.py

خروجی‌ها در android/app/src/main/res:
  mipmap-*/ic_launcher.png و ic_launcher_round.png و ic_launcher_foreground.png
  drawable*/splash.png (پس‌زمینه‌ی تیره + لوگوی کامل وسط)
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
SOURCE = ROOT / 'public' / 'icons' / 'icon-512.png'
LOGO = ROOT / 'public' / 'images' / 'hesabyar' / 'logo.png'
DARK = (0, 0, 0)

DENSITIES = [
    ('mdpi', 48, 108),
    ('hdpi', 72, 162),
    ('xhdpi', 96, 216),
    ('xxhdpi', 144, 324),
    ('xxxhdpi', 192, 432),
]


def edge_color(im: Image.Image) -> tuple[int, int, int]:
    px = im.load()
    w, _ = im.size
    strip = [px[x, 4][:3] for x in range(0, w, 8)]
    return tuple(sum(c[i] for c in strip) // len(strip) for i in range(3))  # type: ignore[return-value]


def main() -> None:
    icon = Image.open(SOURCE).convert('RGB')
    bg = edge_color(icon)

    for name, size, adaptive in DENSITIES:
        folder = RES / f'mipmap-{name}'
        folder.mkdir(parents=True, exist_ok=True)
        icon.resize((size, size), Image.LANCZOS).save(folder / 'ic_launcher.png', optimize=True)
        round_im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, size, size], fill=255)
        round_im.paste(icon.resize((size, size), Image.LANCZOS), (0, 0))
        round_im.putalpha(mask)
        round_im.save(folder / 'ic_launcher_round.png', optimize=True)
        canvas = Image.new('RGB', (adaptive, adaptive), bg)
        # The supplied icon already has generous safe padding around the mark.
        # Fill the adaptive layer so it does not get double-shrunk by Android's 72% safe zone.
        foreground = icon.resize((adaptive, adaptive), Image.Resampling.LANCZOS)
        canvas.paste(foreground, (0, 0))
        canvas.save(folder / 'ic_launcher_foreground.png', optimize=True)
        print(name, size, adaptive)

    colors = RES / 'values' / 'ic_launcher_background.xml'
    if colors.exists():
        colors.write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
            f'    <color name="ic_launcher_background">#{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}</color>\n</resources>\n',
            encoding='utf-8',
        )
        print('launcher background', bg)

    logo = Image.open(LOGO).convert('RGBA')
    for splash in sorted(RES.glob('drawable*/splash.png')):
        w, h = Image.open(splash).size
        im = Image.new('RGB', (w, h), DARK)
        max_w = round(w * 0.72)
        max_h = round(h * 0.42)
        # Reserve room for a white backing so the logo's navy wordmark stays readable on dark splash.
        ratio = min(max_w / (logo.width * 1.08), max_h / (logo.height * 1.2))
        lw, lh = round(logo.width * ratio), round(logo.height * ratio)
        resized = logo.resize((lw, lh), Image.Resampling.LANCZOS)
        pad_x, pad_y = round(lw * 0.04), round(lh * 0.1)
        backing = Image.new('RGBA', (lw + 2 * pad_x, lh + 2 * pad_y), (255, 255, 255, 255))
        backing.alpha_composite(resized, (pad_x, pad_y))
        mask = Image.new('L', backing.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, backing.width - 1, backing.height - 1),
            radius=round(min(backing.size) * 0.08),
            fill=255,
        )
        backing.putalpha(mask)
        im.paste(backing.convert('RGB'), ((w - backing.width) // 2, (h - backing.height) // 2))
        im.save(splash, optimize=True)
        print('splash', splash.parent.name, (w, h))


if __name__ == '__main__':
    main()
