#!/usr/bin/env python3
"""
ساخت آیکن لانچر و اسپلش اندروید از لوگوی خود برنامه

منبع: public/icons/icon-512.png (خروجی scripts/build-app-logo.py)
اجرا: python3 scripts/build-android-icons.py

خروجی‌ها در android/app/src/main/res:
  mipmap-*/ic_launcher.png و ic_launcher_round.png و ic_launcher_foreground.png
  drawable*/splash.png (سرمه‌ای برند + لوگوی وسط)
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
SOURCE = ROOT / 'public' / 'icons' / 'icon-512.png'
NAVY = (11, 27, 58)  # #0B1B3A

# چگالی‌ها: (پوشه، اندازه‌ی آیکن معمولی، اندازه‌ی بوم پیش‌زمینه‌ی تطبیقی ۱۰۸dp)
DENSITIES = [
    ('mdpi', 48, 108),
    ('hdpi', 72, 162),
    ('xhdpi', 96, 216),
    ('xxhdpi', 144, 324),
    ('xxxhdpi', 192, 432),
]


def edge_color(im: Image.Image) -> tuple[int, int, int]:
    """رنگ لبه‌ی بالایی آیکن برای پس‌زمینه‌ی آیکن تطبیقی"""
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
        # آیکن گرد: ماسک دایره روی همان کاشی
        round_im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, size, size], fill=255)
        round_im.paste(icon.resize((size, size), Image.LANCZOS), (0, 0))
        round_im.putalpha(mask)
        round_im.save(folder / 'ic_launcher_round.png', optimize=True)
        # پیش‌زمینه‌ی تطبیقی: آیکن با حاشیه‌ی امن داخل بوم بزرگ‌تر (برش سیستم، لوگو را نمی‌خورد)
        canvas = Image.new('RGB', (adaptive, adaptive), bg)
        inner = icon.resize((round(adaptive * 0.72),) * 2, Image.LANCZOS)
        off = (adaptive - inner.width) // 2
        canvas.paste(inner, (off, off))
        canvas.save(folder / 'ic_launcher_foreground.png', optimize=True)
        print(name, size, adaptive)

    # رنگ پس‌زمینه‌ی آیکن تطبیقی هم‌رنگ لبه‌ی لوگو
    colors = RES / 'values' / 'ic_launcher_background.xml'
    if colors.exists():
        colors.write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
            f'    <color name="ic_launcher_background">#{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}</color>\n</resources>\n',
            encoding='utf-8',
        )
        print('launcher background', bg)

    # اسپلش‌ها: پس‌زمینه‌ی سرمه‌ای برند + لوگو در مرکز (با همان ابعاد فایل‌های قالب)
    for splash in sorted(RES.glob('drawable*/splash.png')):
        w, h = Image.open(splash).size
        im = Image.new('RGB', (w, h), NAVY)
        logo_size = round(min(w, h) * 0.38)
        logo = icon.resize((logo_size, logo_size), Image.LANCZOS)
        im.paste(logo, ((w - logo_size) // 2, (h - logo_size) // 2))
        im.save(splash, optimize=True)
        print('splash', splash.parent.name, (w, h))


if __name__ == '__main__':
    main()
