#!/usr/bin/env python3
"""
ساخت assetهای وب و آیکون‌های برنامهٔ «کارو — نرم‌افزار حسابداری» از لوگوی رسمی

منبع:
  scripts/assets/karo-logo.png  لوگوی کامل کارو (نشان + وردمارک) با پس‌زمینهٔ شفاف

اجرا:
  pip install pillow
  npm run icons:karo

خروجی‌ها:
  public/images/karo/logo.png        وردمارک کامل و شفاف (سایدبار، کاشی تیره، اسپلش)
  public/images/karo/mark.png        نشان مربعی برنامه روی کاشی تیره (۵۱۲×۵۱۲)
  public/images/karo/app-icon.png    آیکون برنامه (همان نشان مربعی)
  public/icons/icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'scripts' / 'assets' / 'karo-logo.png'
BRAND_DIR = ROOT / 'public' / 'images' / 'karo'
ICONS_DIR = ROOT / 'public' / 'icons'

# کاشی مشکی نشان، همان پس‌زمینهٔ لوگوی رسمی؛ متن سفید کارو روی آن خوانا می‌ماند.
TILE = (0, 0, 0)


def visible_bbox(image: Image.Image, threshold: int = 12) -> tuple[int, int, int, int]:
    """کادر محتوای قابل‌دیدن لوگوی دارای کانال آلفا."""
    bounds = image.getchannel('A').point(lambda value: 255 if value > threshold else 0).getbbox()
    if bounds is None:
        raise ValueError('لوگوی کارو کاملاً شفاف است.')
    return bounds


def crop_visible(image: Image.Image) -> Image.Image:
    return image.crop(visible_bbox(image))


def colored_bbox(image: Image.Image, threshold: int = 60) -> tuple[int, int, int, int]:
    """کادر بخش رنگی لوگو (نشان) — وردمارک کارو سفید است و رنگی محسوب نمی‌شود."""
    pixels = image.load()
    xs: list[int] = []
    ys: list[int] = []
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a > 20 and max(r, g, b) - min(r, g, b) > threshold:
                xs.append(x)
                ys.append(y)
    if not xs:
        raise ValueError('بخش رنگی نشان کارو پیدا نشد.')
    return min(xs), min(ys), max(xs), max(ys)


def emblem_of(logo: Image.Image) -> Image.Image:
    """نشان (بخش رنگی + شاه‌پر سفید چسبیده به آن) را از وردمارک جدا می‌کند."""
    left, top, right, bottom = colored_bbox(logo)
    # نوک سفیدِ نشان کمی از آخرین پیکسل رنگی جلوتر می‌رود؛ ۱۲ پیکسل حاشیه کافی است
    # و به وردمارک (که با فاصلهٔ بیشتری شروع می‌شود) نمی‌رسد.
    return logo.crop((left, top, min(right + 12, logo.width), bottom + 1))


def square_tile(emblem: Image.Image, size: int, mark_scale: float) -> Image.Image:
    """نشان را وسط کاشی مشکی مربعی می‌نشاند (پس‌زمینهٔ رسمی لوگو)."""
    tile = Image.new('RGB', (size, size), TILE)
    target_w = round(size * mark_scale)
    ratio = target_w / emblem.width
    resized = emblem.resize((target_w, round(emblem.height * ratio)), Image.Resampling.LANCZOS)
    tile.paste(resized, ((size - resized.width) // 2, (size - resized.height) // 2), resized)
    return tile


def save_icon(image: Image.Image, name: str) -> None:
    image.convert('RGB').save(ICONS_DIR / name, optimize=True)


def main() -> None:
    logo = Image.open(SOURCE).convert('RGBA')

    BRAND_DIR.mkdir(parents=True, exist_ok=True)
    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    # ۱) وردمارک کامل و بریده‌شده برای سطوح تیره (سایدبار/اسپلش)
    wordmark = crop_visible(logo)
    wordmark.save(BRAND_DIR / 'logo.png', optimize=True)

    # ۲) نشان مربعی برنامه از بخش نشانِ لوگو
    emblem = emblem_of(logo)
    app_icon = square_tile(emblem, 512, 0.62)
    app_icon.save(BRAND_DIR / 'mark.png', optimize=True)
    app_icon.save(BRAND_DIR / 'app-icon.png', optimize=True)

    # ۳) آیکون‌های PWA/favicon
    save_icon(app_icon.resize((192, 192), Image.Resampling.LANCZOS), 'icon-192.png')
    save_icon(app_icon, 'icon-512.png')
    save_icon(app_icon.resize((180, 180), Image.Resampling.LANCZOS), 'apple-touch-icon.png')
    save_icon(square_tile(emblem, 512, 0.44), 'icon-maskable-512.png')

    print('Karo logo assets rebuilt:', BRAND_DIR, ICONS_DIR)


if __name__ == '__main__':
    main()
