#!/usr/bin/env python3
"""
ساخت assetهای برند کارن‌سافت (اعتبار vendor) از لوگوی اصلی کارن‌سافت

آیکون‌های PWA و لانچر متعلق به لوگوی کارو هستند و در scripts/build-app-logo.py ساخته می‌شوند.

منبع لوگو (مخزن karen-soft):
  gh api -H "Accept: application/vnd.github.raw" \\
      repos/rahmaniho/karen-soft/contents/public/images/logo.png > logo.png
یا:
  curl -L https://raw.githubusercontent.com/rahmaniho/karen-soft/refs/heads/main/public/images/logo.png -o logo.png

اجرا:
  pip install pillow
  python3 scripts/build-brand-assets.py [مسیر/logo.png]

خروجی‌ها:
  public/images/karensoft/mark.png         (نشان KS — مربع ۲۵۶)
  public/images/karensoft/wordmark-fa.png  (کارن سافت + خط نقطه‌ای — ارتفاع ۹۶)
  public/images/karensoft/wordmark-en.png  (Karensoft — ارتفاع ۴۸)
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BRAND_DIR = ROOT / 'public' / 'images' / 'karensoft'


def trim_alpha(im: Image.Image, threshold: int = 8) -> Image.Image:
    """برش تا جعبه‌ی محصورِ آلفای مؤثر (alpha > threshold)"""
    alpha = im.getchannel('A').point(lambda a: 255 if a > threshold else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError('تصویر کاملاً شفاف است!')
    return im.crop(bbox)


def crop_rows(im: Image.Image, y0: int, y1: int) -> Image.Image:
    return trim_alpha(im.crop((0, y0, im.width, y1)))


def main() -> None:
    candidates = [Path(sys.argv[1])] if len(sys.argv) > 1 else [ROOT / 'scripts' / 'karensoft-logo.png', ROOT / 'logo.png', Path('/tmp/brand/logo.png')]
    src = next((c for c in candidates if c.exists()), candidates[0])
    logo = Image.open(src).convert('RGBA')
    assert logo.size == (501, 501), f'ابعاد غیرمنتظره‌ی لوگو: {logo.size}'

    BRAND_DIR.mkdir(parents=True, exist_ok=True)

    # ۱) نشان KS: ردیف‌های ۸۴ تا ۲۶۰، مربع با حاشیه، ۲۵۶×۲۵۶
    mark = crop_rows(logo, 84, 260)
    side = max(mark.size) + 16
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2), mark)
    mark256 = square.resize((256, 256), Image.LANCZOS)
    mark256.save(BRAND_DIR / 'mark.png')
    print('mark.png', mark256.size)

    # ۲) «کارن سافت» + خط نقطه‌ای: ردیف‌های ۲۸۰ تا ۳۷۶ → ارتفاع ۹۶
    fa = crop_rows(logo, 280, 376)
    fa = fa.resize((round(fa.width * 96 / fa.height), 96), Image.LANCZOS)
    fa.save(BRAND_DIR / 'wordmark-fa.png')
    print('wordmark-fa.png', fa.size)

    # ۳) Karensoft: ردیف‌های ۳۸۰ تا ۴۲۰ → ارتفاع ۴۸
    en = crop_rows(logo, 380, 420)
    en = en.resize((round(en.width * 48 / en.height), 48), Image.LANCZOS)
    en.save(BRAND_DIR / 'wordmark-en.png')
    print('wordmark-en.png', en.size)

    # آیکون‌های برنامه/PWA برند کارو هستند و در scripts/build-app-logo.py ساخته می‌شوند.


if __name__ == '__main__':
    main()
