# استقرار «کارو» روی دامنهٔ `karo.karen-soft.ir` (هاست cPanel)

این پوشه بستهٔ آمادهٔ آپلود روی هاست اشتراکی است؛ برای زمانی که دامنه مثل امروز به
LiteSpeed/cPanel اشاره می‌کند و می‌خواهید اپ از همان هاست سرو شود (بدون تغییر DNS).

## ساخت بسته

```bash
npm ci
npm run build:web-archive     # build با base=/ + ساخت ZIP + چاپ sha256
```

خروجی: `deploy/cpanel-app/artifacts/karo-web.zip`

## آپلود

1. در **cPanel → File Manager** به Document Root زیردامنهٔ `karo.karen-soft.ir` بروید
   (معمولاً `public_html/karo` یا مسیری که در بخش Subdomains ساخته‌اید).
2. فایل `karo-web.zip` را آپلود و **Extract** کنید.
3. مطمئن شوید `index.html` مستقیماً در ریشهٔ همان پوشه است، نه داخل یک زیرپوشهٔ اضافه.
4. فایل مخفی `.htaccess` هم باید استخراج شده باشد (برای SPA fallback و کش نکردن `sw.js`).

## آزمایش

```bash
curl -sI https://karo.karen-soft.ir/ | head -5      # انتظار: 200
curl -s https://karo.karen-soft.ir/ | grep -o '<title>.*</title>'
# انتظار: <title>کارو نرم‌افزار حسابداری</title>
```

## نکته‌ها

- اگر بعداً همان دامنه را به GitHub Pages منتقل کردید، در تنظیمات Pages دامنه را بردارید
  (یا فایل `CNAME` را حذف کنید) تا دو منبع برای یک دامنه نداشته باشید.
- برای به‌روزرسانی، بستهٔ تازه بسازید و محتوای پوشه را جایگزین کنید؛ نیازی به پاک‌کردن
  دیتابیس یا دادهٔ کاربران نیست (داده‌ها در مرورگر کاربر ذخیره می‌شوند).
- کش مرورگر: `index.html`، `manifest.webmanifest` و `sw.js` در `.htaccess` بدون کش تنظیم
  شده‌اند تا نسخهٔ تازه سریع دیده شود.
