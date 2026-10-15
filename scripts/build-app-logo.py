#!/usr/bin/env python3
"""
ساخت آیکون‌های برنامه‌ی «حساب‌یار» از لوگوی اصلی برنامه

منبع: public/images/karensoft/KarenYar.png (لوگوی خودِ برنامه — آپلودشده توسط کارن‌سافت)
این فایل پس‌زمینه‌ی سفید و بازتاب زیر لوگو دارد؛ اسکریپت کاشیِ لوگو را برش می‌زند،
مربع و بهینه می‌کند و آیکون‌های PWA را از روی آن می‌سازد.

اجرا:
  pip install pillow
  python3 scripts/build-app-logo.py

خروجی‌ها:
  public/images/karensoft/KarenYar.png  (همان فایل، برش‌خورده و بهینه ۵۱۲×۵۱۲)
  public/icons/icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
APP_LOGO = ROOT / 'public' / 'images' / 'karensoft' / 'KarenYar.png'
ICONS_DIR = ROOT / 'public' / 'icons'


def strong_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    """جعبه‌ی محصور پیکسل‌های «رنگی قوی» — بدنه‌ی اصلی لوگو (بدون پس‌زمینه‌ی سفید و بازتاب کم‌رنگ)"""
    px = im.load()
    w, h = im.size
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y][:3]
            if max(r, g, b) - min(r, g, b) > 45:
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y
    if max_x < 0:
        raise ValueError('ناحیه‌ی لوگو پیدا نشد!')
    return min_x, min_y, max_x, max_y


def main() -> None:
    src = Image.open(APP_LOGO).convert('RGB')

    # برش کاشی لوگو: مربع هم‌ضلع با پهنای جعبه‌ی قوی، از بالای جعبه (بازتاب پایین حذف می‌شود)
    x0, y0, x1, _ = strong_bbox(src)
    side = x1 - x0 + 1
    tile = src.crop((x0, y0, x0 + side, y0 + side))

    # ۳٪ برش داخلی: گوشه‌های سفیدِ گردِ کاشی و لبه‌ی بازتاب کاملاً حذف می‌شود تا آیکون تمام‌قاب شود
    inset = round(side * 0.03)
    tile = tile.crop((inset, inset, side - inset, side - inset))

    tile512 = tile.resize((512, 512), Image.LANCZOS)
    tile512.save(APP_LOGO, optimize=True)
    print('app logo:', APP_LOGO.name, tile512.size)

    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    def save_icon(img: Image.Image, name: str) -> None:
        # پالت تطبیقی: حجم آیکون‌ها (داخل precache آفلاین) سبک می‌ماند و در ابعاد آیکن افت کیفیت دیده نمی‌شود
        img.convert('RGB').quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(
            ICONS_DIR / name, optimize=True
        )

    save_icon(tile512.resize((192, 192), Image.LANCZOS), 'icon-192.png')
    save_icon(tile512, 'icon-512.png')
    save_icon(tile512.resize((180, 180), Image.LANCZOS), 'apple-touch-icon.png')

    # ماسک‌پذیر: لوگو در ناحیه‌ی امن ۸۰٪ روی رنگ لبه‌ی خودش (آبی) می‌نشیند
    edge = tile512.resize((1, 512)).resize((512, 1))  # میانگین تقریبی لبه‌ها
    bg_color = tile512.getpixel((256, 6))[:3]
    maskable = Image.new('RGB', (512, 512), bg_color)
    inner = tile512.resize((410, 410), Image.LANCZOS)
    maskable.paste(inner, ((512 - 410) // 2, (512 - 410) // 2))
    save_icon(maskable, 'icon-maskable-512.png')
    _ = edge
    print('PWA icons rebuilt from app logo')


if __name__ == '__main__':
    main()
