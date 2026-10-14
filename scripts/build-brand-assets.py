#!/usr/bin/env python3
"""
ساخت assetهای برند کارن‌سافت از لوگوی اصلی + بازتولید آیکون‌های PWA حساب‌یار

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
  public/icons/icon-*.png                  (آیکون‌های PWA از روی نشان اصلی)
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BRAND_DIR = ROOT / 'public' / 'images' / 'karensoft'
ICONS_DIR = ROOT / 'public' / 'icons'
NAVY = (11, 27, 58, 255)  # #0B1B3A
NEON = (57, 255, 136, 255)  # #39FF88
WHITE = (255, 255, 255, 255)


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

    # ——— آیکون‌های PWA از روی نشان: تایلد روشن با نشان آبی روی پس‌زمینه‌ی سرمه‌ای ———
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    build_icon(mark256, 192, 'icon-192.png', rounded=True)
    build_icon(mark256, 512, 'icon-512.png', rounded=True)
    build_icon(mark256, 512, 'icon-maskable-512.png', rounded=False)
    build_icon(mark256, 180, 'apple-touch-icon.png', rounded=False)
    print('PWA icons rebuilt from original mark')


def build_icon(mark: Image.Image, size: int, name: str, rounded: bool) -> None:
    """پس‌زمینه‌ی سرمه‌ای + مربع سفید با گوشه‌ی نرم + نشان KS در مرکز (در ناحیه‌ی امن)"""
    img = Image.new('RGBA', (size, size), NAVY)
    if rounded:
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size, size], radius=int(size * 0.22), fill=255)
        bg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        bg.paste(img, (0, 0))
        img = bg
        img.putalpha(mask)
    draw = ImageDraw.Draw(img)
    tile_ratio = 0.62 if rounded else 0.52
    tile = int(size * tile_ratio)
    off = (size - tile) // 2
    draw.rounded_rectangle([off, off, off + tile, off + tile], radius=int(tile * 0.24), fill=(245, 247, 250, 255))
    mark_size = int(tile * 0.78)
    mark_img = mark.resize((mark_size, mark_size), Image.LANCZOS)
    moff = (size - mark_size) // 2
    img.paste(mark_img, (moff, moff), mark_img)
    # نقطه‌ی نئونی ظریف در گوشه‌ی تایلد — امضای حساب‌یار
    r = max(4, int(size * 0.035))
    cx, cy = off + tile - int(tile * 0.16), off + int(tile * 0.16)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=NEON)
    img.save(ICONS_DIR / name)


if __name__ == '__main__':
    main()
