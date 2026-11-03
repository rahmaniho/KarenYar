#!/usr/bin/env python3
"""
ساخت assetهای برنامهٔ «حساب‌یار» از دو فایل رسمی لوگو

منابع:
  scripts/assets/hesabyar-app-icon.png  نشان مربعی برای آیکون برنامه
  scripts/assets/hesabyar-logo.png      وردمارک کامل برای وب و اسپلش

اجرا:
  pip install pillow
  python3 scripts/build-app-logo.py

خروجی‌ها:
  public/images/hesabyar/mark.png      آیکون مربع برای UI (۵۱۲×۵۱۲)
  public/images/hesabyar/logo.png      وردمارک کامل و شفاف حساب‌یار
  public/images/hesabyar/app-icon.png  آیکون برنامه (۵۱۲×۵۱۲)
  public/icons/icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WORDMARK_SOURCE = ROOT / 'scripts' / 'assets' / 'hesabyar-logo.png'
APP_ICON_SOURCE = ROOT / 'scripts' / 'assets' / 'hesabyar-app-icon.png'
BRAND_DIR = ROOT / 'public' / 'images' / 'hesabyar'
ICONS_DIR = ROOT / 'public' / 'icons'


def crop_visible(image: Image.Image, threshold: int = 8) -> Image.Image:
    """برش تا محدودهٔ محتوای قابل‌دیدنِ لوگوی دارای کانال آلفا."""
    alpha = image.getchannel('A').point(lambda value: 255 if value > threshold else 0)
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError('لوگوی حساب‌یار کاملاً شفاف است.')
    return image.crop(bounds)


def save_icon(image: Image.Image, name: str) -> None:
    image.convert('RGB').save(ICONS_DIR / name, optimize=True)


def main() -> None:
    wordmark_source = Image.open(WORDMARK_SOURCE).convert('RGBA')
    icon_source = Image.open(APP_ICON_SOURCE).convert('RGB')
    if icon_source.width != icon_source.height:
        raise ValueError(f'آیکون برنامه باید مربعی باشد: {icon_source.size}')

    BRAND_DIR.mkdir(parents=True, exist_ok=True)
    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    # وردمارک آپلودشده را با شفافیت اصلی و بدون حاشیهٔ خالی برای وب/اسپلش آماده کن.
    logo = crop_visible(wordmark_source)
    logo.save(BRAND_DIR / 'logo.png', optimize=True)

    # آیکون مربعی آپلودشده را بدون تغییر طراحی به همهٔ اندازه‌های موردنیاز تبدیل کن.
    app_icon = icon_source.resize((512, 512), Image.Resampling.LANCZOS)
    app_icon.save(BRAND_DIR / 'mark.png', optimize=True)
    app_icon.save(BRAND_DIR / 'app-icon.png', optimize=True)

    save_icon(app_icon.resize((192, 192), Image.Resampling.LANCZOS), 'icon-192.png')
    save_icon(app_icon, 'icon-512.png')
    save_icon(app_icon.resize((180, 180), Image.Resampling.LANCZOS), 'apple-touch-icon.png')
    save_icon(app_icon, 'icon-maskable-512.png')
    print('Hesabyar logo assets rebuilt:', BRAND_DIR, ICONS_DIR)


if __name__ == '__main__':
    main()
