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

## مستندات

- [`docs/android-release.md`](docs/android-release.md) — ساخت و انتشار اندروید
- [`docs/security-step-by-step.md`](docs/security-step-by-step.md) — امنیت و لایسنس
- [`docs/business-guide.md`](docs/business-guide.md) — راهنمای کسب‌وکار
- [`docs/cpanel-setup.md`](docs/cpanel-setup.md) — استقرار روی cPanel
- [`docs/domain-setup.md`](docs/domain-setup.md) — اتصال دامنهٔ `karo.karen-soft.ir` به GitHub Pages
