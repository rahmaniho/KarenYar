#!/usr/bin/env python3
"""
ساخت آیکون‌های برنامه‌ی «حساب‌یار» از لوگوی رسمی جدید حساب‌یار

منبع: scripts/assets/hesabyar-logo.png (لوگوی رسمی آپلودشده — پس‌زمینه‌ی تیره)
اجرا:
  pip install pillow
  python3 scripts/build-app-logo.py

خروجی‌ها:
  public/images/hesabyar/mark.png      نشان مربع H برای UI (۵۱۲×۵۱۲)
  public/images/hesabyar/logo.png      لوگوی کامل حساب‌یار + Powered by KarenSoft
  public/images/hesabyar/app-icon.png  آیکون برنامه با حاشیه‌ی امن (۵۱۲×۵۱۲)
  public/icons/icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'scripts' / 'assets' / 'hesabyar-logo.png'
BRAND_DIR = ROOT / 'public' / 'images' / 'hesabyar'
ICONS_DIR = ROOT / 'public' / 'icons'


def main() -> None:
    src = Image.open(SOURCE).convert('RGB')
    BRAND_DIR.mkdir(parents=True, exist_ok=True)
    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    # نشان مربع H — بدون ورود به نوشتار فارسی/انگلیسی
    mark = src.crop((270, 268, 630, 628)).resize((512, 512), Image.LANCZOS)
    mark.save(BRAND_DIR / 'mark.png', optimize=True)

    # لوگوی کامل (نشان + حساب‌یار + Hesabyar + Powered by KarenSoft)
    logo = src.crop((244, 218, 1195, 680))
    logo.save(BRAND_DIR / 'logo.png', optimize=True)

    # آیکون برنامه: نشان با حاشیه‌ی امن عمودی/افقی برای ماسک‌های PWA/Android
    tall = src.crop((270, 228, 630, 668))  # 360x440
    w, h = tall.size
    side = h
    canvas = Image.new('RGB', (side, h))
    left_w = (side - w) // 2
    canvas.paste(tall, (left_w, 0))
    left = tall.crop((0, 0, 1, h)).resize((left_w, h))
    right = tall.crop((w - 1, 0, w, h)).resize((side - w - left_w, h))
    canvas.paste(left, (0, 0))
    canvas.paste(right, (left_w + w, 0))
    app = canvas.resize((512, 512), Image.LANCZOS)
    app.save(BRAND_DIR / 'app-icon.png', optimize=True)

    def save_icon(img: Image.Image, name: str) -> None:
        img.convert('RGB').quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(
            ICONS_DIR / name, optimize=True
        )

    save_icon(app.resize((192, 192), Image.LANCZOS), 'icon-192.png')
    save_icon(app, 'icon-512.png')
    save_icon(app.resize((180, 180), Image.LANCZOS), 'apple-touch-icon.png')
    save_icon(app, 'icon-maskable-512.png')
    print('Hesabyar brand assets rebuilt:', BRAND_DIR, ICONS_DIR)


if __name__ == '__main__':
    main()
