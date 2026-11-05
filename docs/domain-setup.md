# اتصال دامنهٔ `karo.karen-soft.ir` به وب‌اپ کارو

آدرس رسمی اپ: **https://karo.karen-soft.ir**

این سند همهٔ «اتصال‌های» لازم برای نمایش وب‌اپ روی این آدرس را فهرست می‌کند؛ هم آنچه در مخزن
انجام شده و هم کارهایی که باید در پنل DNS/GitHub انجام شود.

## وضعیت بررسی‌شده (۱۴۰۵/۰۸/۱۴ — 2026-11-05)

| اتصال                                            | وضعیت                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `CNAME` (ریشهٔ مخزن)                             | ✅ `karo.karen-soft.ir`                                                      |
| `public/CNAME` (داخل خروجی build و Pages)        | ✅ `karo.karen-soft.ir` — قبلاً `hesabyar` بود و هر بار دامنه را برمی‌گرداند |
| Custom domain در تنظیمات GitHub Pages            | ✅ روی `karo.karen-soft.ir` تنظیم است ولی **unverified**                     |
| `https_enforced` در GitHub Pages                 | ⛔️ خاموش؛ تا صدور گواهی برای دامنه                                           |
| DNS دامنهٔ `karo`                                | ⛔️ هم‌اکنون به Cloudflare/هاست cPanel می‌رود (صفحهٔ خالی `Index of /`)       |
| خروجی deploy (workflow «Deploy to GitHub Pages») | ✅ سالم؛ `VITE_BASE=/` و `404.html` برای مسیرهای SPA                         |
| منبع انتشار Pages                                | ⚠️ روی «Deploy from a branch» است؛ باید «GitHub Actions» شود (گام ۰)         |
| canonical/og:url                                 | ✅ `https://karo.karen-soft.ir/`                                             |
| PWA (manifest + آیکون‌ها + `sw.js`)              | ✅ مسیرهای ریشه‌ای، مستقل از دامنه                                           |
| سرویس لایسنس سروری                               | ℹ️ در بیلد Pages فعال نیست (`VITE_LICENSE_API_BASE` ست نشده) → حالت آفلاین   |

> جمع‌بندی: از سمت کد و مخزن همه‌چیز آماده است؛ تنها چیزی که مانده **رکورد DNS** و سپس
> **تأیید مالکیت دامنه** در GitHub است.

## گام ۰ — منبع انتشار GitHub Pages را روی «GitHub Actions» بگذارید

تنظیم فعلی مخزن روی **Deploy from a branch: main / (root)** است؛ یعنی با هر push، GitHub
ابتدا خودِ فایل‌های خام شاخه (از جمله `index.html` بدون build) را منتشر می‌کند و چند دقیقه بعد
workflow «Deploy to GitHub Pages» خروجی ساخته‌شده را جای آن می‌گذارد. نتیجه: پنجرهٔ کوتاه
خرابی و وابستگی به موفقیت workflow.

درستش این است:

**Settings → Pages → Build and deployment → Source: «GitHub Actions»**

یا با توکنی که دسترسی `pages:write` دارد:

```bash
gh api -X PUT repos/rahmaniho/KarenYar/pages \
  -f build_type=workflow \
  -f cname=karo.karen-soft.ir
```

بعد از این تغییر، وضعیت `build_type` باید `workflow` شود و دیگر build خودکار از شاخه ساخته نشود.

## گام ۱ — رکورد DNS (در Cloudflare یا پنل DNS)

1. رکوردهای فعلی زیردامنهٔ `karo` را که به IP هاست cPanel اشاره می‌کنند حذف کنید
   (`A`/`AAAA`/`CNAME`).
2. یک رکورد جدید بسازید:

   | Type    | Name | Target                | Proxy                  |
   | ------- | ---- | --------------------- | ---------------------- |
   | `CNAME` | karo | `rahmaniho.github.io` | **DNS only** (خاکستری) |

   حالت «DNS only» را تا صدور گواهی نگه دارید؛ بعد از فعال‌شدن HTTPS می‌توانید پروکسی
   Cloudflare را روشن کنید (حالت SSL باید **Full (strict)** باشد، نه Flexible).

3. مطمئن شوید رکورد Wildcard یا `CNAME` سطح دامنه، زیردامنهٔ `karo` را نمی‌بلعد.

بررسی سریع:

```bash
dig +short karo.karen-soft.ir
# انتظار: IPهای GitHub Pages (185.199.108-111.153) یا CNAME به rahmaniho.github.io
```

## گام ۲ — تأیید مالکیت دامنه (TXT)

چون دامنه در GitHub Pages با وضعیت `unverified` ثبت شده است، GitHub برای جلوگیری از
تصاحب دامنه یک رکورد TXT می‌خواهد:

1. به **Settings → Pages → Custom domain** بروید؛ GitHub مقدار رکورد را نشان می‌دهد
   (شکل `_github-pages-challenge-rahmaniho.karo`).
2. همان TXT را در پنل DNS اضافه کنید.
3. برگردید و **Verify** را بزنید؛ وضعیت باید `verified` شود.

## گام ۳ — HTTPS

پس از verified شدن دامنه و درست‌بودن DNS، گواهی Let's Encrypt برای دامنه صادر می‌شود
(چند دقیقه تا چند ساعت). بعد:

- **Settings → Pages → Enforce HTTPS** را روشن کنید.

اگر با پروکسی Cloudflare خطای «Too many redirects» دیدید، SSL را روی **Full (strict)**
بگذارید و «Always Use HTTPS» را در Cloudflare روشن نگه دارید.

## گام ۴ — انتشار و آزمایش

```bash
git push origin main            # یا merge از شاخهٔ کاری
gh run watch                    # اجرای «Deploy to GitHub Pages»
```

آزمون اتصال:

```bash
curl -sI https://karo.karen-soft.ir/ | head -5           # انتظار: HTTP/2 200
curl -s  https://karo.karen-soft.ir/ | grep -o '<title>.*</title>'
# انتظار: <title>کارو نرم‌افزار حسابداری</title>
curl -sI https://karo.karen-soft.ir/sw.js | head -3      # سرویس‌ورکر PWA
curl -sI https://karo.karen-soft.ir/store/products       # مسیر SPA → 200 با index
curl -sI https://karo.karen-soft.ir/images/karo/logo.png # لوگوی کارو
```

workflow بعد از هر انتشار یک مرحلهٔ «Connection check» دارد که همین بررسی را انجام می‌دهد و
اگر دامنه هنوز اپ را سرو نکند، فقط **هشدار** ثبت می‌کند (بدون شکستن انتشار).

## مسیر جایگزین (سریع‌ترین) — سرو از همان هاست cPanel

رکورد DNS فعلی `karo` به هاست کارن‌سافت اشاره می‌کند و Document Root آن زیردامنه خالی است؛
پس برای دیدن اپ روی همین آدرس، **بدون هیچ تغییر DNS** فقط کافی است بستهٔ آماده را آپلود کنید:

```bash
npm ci
npm run build:web-archive         # build با base=/ + ساخت ZIP
# خروجی: deploy/cpanel-app/artifacts/karo-web.zip
```

سپس `karo-web.zip` را در **cPanel → File Manager** داخل Document Root زیردامنهٔ
`karo.karen-soft.ir` آپلود و Extract کنید (همراه فایل مخفی `.htaccess`). جزئیات:
[`deploy/cpanel-app/README.md`](../deploy/cpanel-app/README.md).

در این حالت:

- رکوردهای DNS فعلی (اشاره به cPanel) را دست نزنید؛
- برای اینکه دو منبع برای یک دامنه نداشته باشیم، در GitHub Pages دامنهٔ سفارشی را بردارید
  (Settings → Pages → Custom domain → Remove) و فایل `CNAME` را هم پاک کنید تا انتشار
  بعدی آن را برنگرداند.

## نکته‌های سازگاری

- **داده‌های محلی:** با تغییر دامنه، `localStorage`/IndexedDB از دید مرورگر یک «سایت جدید»
  است؛ کاربرانِ نسخهٔ قبلی باید قبل از مهاجرت از بخش «پشتیبان و داده» فایل پشتیبان بگیرند و
  در دامنهٔ جدید بازیابی کنند (فرمت پشتیبان مستقل از دامنه است).
- **لایسنس آفلاین:** توکن‌های لایسنس آفلاین به دامنه گره نخورده‌اند و بعد از تغییر دامنه
  معتبر می‌مانند؛ ثبت دستگاه در نسخهٔ سروری (اگر فعال شود) بر اساس شناسهٔ دستگاه است.
- **دامنهٔ قدیمی:** اگر `hesabyar.karen-soft.ir` هنوز در DNS هست، بهترین کار یک ریدایرکت
  301 به `https://karo.karen-soft.ir` است (Cloudflare Redirect Rule) تا بوکمارک‌های قبلی
  و PWA نصب‌شدهٔ کاربران به آدرس تازه برسد.
