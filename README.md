# کارو — نرم‌افزار حسابداری

<img src="public/images/karo/app-icon.png" alt="لوگوی کارو" width="96" height="96" align="right" />

**کارو** یک نرم‌افزار حسابداری فارسی و آفلاین‌فرست برای کسب‌وکارهای کوچک است: فروش و انبار،
فاکتور، درآمد و هزینه، حقوق و دستمزد، و ابزارهای محاسباتی — همه در یک محیط ساده و یکپارچه.

- برند پیشین این محصول «حساب‌یار» بود؛ از این نسخه با نام **کارو — نرم‌افزار حسابداری** منتشر می‌شود.
- نسخهٔ آنلاین: **https://karo.karen-soft.ir** (راهنمای اتصال دامنه: [`docs/domain-setup.md`](docs/domain-setup.md))
- طراحی و توسعه: **کارن سافت** — [karen-soft.ir](https://www.karen-soft.ir)

## اجرا

```bash
npm install
npm run dev      # نسخهٔ توسعه روی http://localhost:5173
npm run build    # ساخت نسخهٔ تولیدی در dist/
```

## آزمون و کیفیت

```bash
npm test                 # تست‌های واحد (Vitest)
npm run typecheck        # بررسی نوع‌ها
npm run lint             # ESLint
npm run test:e2e         # Playwright
npm run test:android-release
```

## آیکون‌ها و لوگو

لوگوی رسمی در `scripts/assets/karo-logo.png` نگهداری می‌شود و همهٔ خروجی‌های وب، PWA، لانچر و
اسپلش اندروید از آن ساخته می‌شوند:

```bash
pip install pillow
npm run icons:karo
```

جزئیات در [`docs/branding/logo.md`](docs/branding/logo.md).

## نسخهٔ متصل به سرور (Laravel)

پوشهٔ [`laravel-backend/`](laravel-backend/README.md) یک بک‌اند Laravel است که همان رابط کاربری
`src/` را در **حالت سروری** سرو می‌کند: ورود با نشست، نقش مدیر/فروشگاه، لایسنس فروشگاه‌محور و
همگام‌سازی داده در دیتابیس. اپ اصلی (PWA/اندروید) همچنان آفلاین با Dexie کار می‌کند.

کپی فرانت‌اند داخل لاراول **تولیدشده** است (`src/` + overlay) و دستی ویرایش نمی‌شود:

```bash
npm run sync:laravel-frontend    # بازسازی laravel-backend/resources/js
npm run check:laravel-frontend   # بررسی هم‌خوانی (در CI)
npm run build:laravel-package    # بستهٔ استقرار روی cPanel
```

همگام‌سازی افزایشی و تشخیص تعارض دارد، و کاربران نسخهٔ آفلاین می‌توانند داده‌شان را
از همان فایل پشتیبان JSON به سرور منتقل کنند.

جزئیات: [`docs/laravel-integration.md`](docs/laravel-integration.md)

## مستندات

- [`docs/android-release.md`](docs/android-release.md) — ساخت و انتشار اندروید
- [`docs/security-step-by-step.md`](docs/security-step-by-step.md) — امنیت و لایسنس
- [`docs/business-guide.md`](docs/business-guide.md) — راهنمای کسب‌وکار
- [`docs/cpanel-setup.md`](docs/cpanel-setup.md) — استقرار روی cPanel
- [`docs/domain-setup.md`](docs/domain-setup.md) — اتصال دامنهٔ `karo.karen-soft.ir` به GitHub Pages
- [`docs/laravel-integration.md`](docs/laravel-integration.md) — یکپارچگی با بک‌اند Laravel و قاعدهٔ همگام‌سازی فرانت‌اند
- [`laravel-backend/README.md`](laravel-backend/README.md) — راه‌اندازی، API و استقرار بک‌اند
- [`deploy/laravel-app/INSTALL.md`](deploy/laravel-app/INSTALL.md) — نصب گام‌به‌گام نسخهٔ Laravel روی `karo.karen-soft.ir`
- [`deploy/cpanel-app/README.md`](deploy/cpanel-app/README.md) — آپلود بستهٔ آماده روی هاست cPanel
