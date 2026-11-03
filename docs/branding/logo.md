# لوگوی رسمی حساب‌یار

لوگوی رسمی برنامه در `scripts/assets/hesabyar-logo.png` نگهداری می‌شود. این فایل منبع تولید همهٔ مشتقات برند است و نباید مستقیم در UI استفاده شود.

## خروجی‌ها

| فایل                                                 | کاربرد                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| `public/images/hesabyar/mark.png`                    | نشان مربع H در سایدبار، هدر موبایل، آواتار، چاپ/PDF فاکتور و فیش حقوق |
| `public/images/hesabyar/logo.png`                    | لوگوی کامل در صفحهٔ قفل و بخش «درباره» تنظیمات                        |
| `public/images/hesabyar/app-icon.png`                | آیکون برنامه با حاشیهٔ امن برای PWA و Android                         |
| `public/icons/icon-192.png`                          | favicon و آیکون PWA                                                   |
| `public/icons/icon-512.png`                          | آیکون PWA و منبع لانچر Android                                        |
| `public/icons/icon-maskable-512.png`                 | آیکون maskable PWA                                                    |
| `public/icons/apple-touch-icon.png`                  | آیکون iOS                                                             |
| `android/app/src/main/res/mipmap-*/ic_launcher*.png` | لانچر Android                                                         |
| `android/app/src/main/res/drawable*/splash.png`      | اسپلش Android با لوگوی کامل                                           |

## بازتولید

```bash
pip install pillow
npm run icons:hesabyar
```

این دستور ابتدا `scripts/build-app-logo.py` و سپس `scripts/build-android-icons.py` را اجرا می‌کند.

## نکته‌های برند

- نشان H فقط از لوگوی رسمی برش می‌خورد؛ نوشتار فارسی/انگلیسی وارد آیکون مربع نمی‌شود.
- لوگوی کامل شامل «حساب‌یار / Hesabyar / Powered by KarenSoft» است.
- اعتبار vendor «طراحی و توسعه توسط کارن سافت» در `KarenSoftCredit` همچنان از نشان و وردمارک کارن سافت استفاده می‌کند و با لوگوی برنامه جایگزین نشده است.
- پس‌زمینهٔ اسپلش و `background_color` پشتیبان‌گیری PWA با پس‌زمینهٔ تیرهٔ لوگو هماهنگ شده است.
