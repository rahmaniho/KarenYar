# کارو — بک‌اند Laravel

این پوشه، **نسخهٔ متصل‌به‌سرور** «کارو نرم افزار حسابداری» است: یک اپلیکیشن
Laravel که همان رابط کاربری React اپ اصلی (`../src`) را سرو می‌کند و دادهٔ
فروشگاه‌ها را در دیتابیس نگه می‌دارد.

> اپ اصلی (PWA/اندروید) همان‌طور آفلاین با Dexie کار می‌کند. این نسخه برای
> استقرار چندفروشگاهی/وب است و داده را از سرور می‌خواند.

## پشته

| بخش        | نسخه                                      |
| ---------- | ----------------------------------------- |
| PHP        | `^8.3` (تست‌شده روی 8.5)                  |
| Laravel    | `^13.17`                                  |
| تست بک‌اند | Pest 5                                    |
| فرانت‌اند  | React 18 + Vite 5 + TypeScript            |
| دیتابیس    | SQLite (پیش‌فرض) — در تولید MySQL/MariaDB |

## راه‌اندازی محلی

```bash
cd laravel-backend
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite      # اگر SQLite می‌مانید
php artisan migrate --seed
npm install
npm run dev                          # Vite
php artisan serve                    # http://127.0.0.1:8000
```

`composer run dev` هم سرور + صف + Vite را با هم بالا می‌آورد.

## ساختار

```
app/Http/Controllers/Api/     AuthController، LicenseController، SyncController، Manager/StoreController
app/Http/Middleware/          EnsureManager (نقش مدیر)، EnsureStoreUser (کاربر فروشگاه)
app/Models/                   Store، License، User، و مدل‌های دامنه (فاکتور، محصول، ...)
database/migrations/          ۲۰ مایگریشن دامنه
routes/web.php                API با نشست/CSRF + fallback مربوط به SPA
resources/js/                 ⚠️ تولیدشده — کپی src/ + overlay (پایین را ببینید)
resources/views/app.blade.php پوستهٔ HTML (فقط یک ریشهٔ #root + csrf-token)
public/                       Document Root (فونت‌ها، آیکون‌ها، تصاویر کارو)
frontend-overlay/             تنها فایل‌هایی که با src/ فرق دارند (مرجعِ ویرایش)
```

## فرانت‌اند تولیدشده است — مستقیم ویرایش نکنید

`resources/js` با این اسکریپت بازسازی می‌شود:

```bash
npm run sync:laravel-frontend     # از ریشهٔ مخزن
npm run check:laravel-frontend    # بررسی هم‌خوانی (در CI اجرا می‌شود)
```

قاعده: `resources/js = src/ + frontend-overlay/`.
پس هر تغییری که مخصوص نسخهٔ لاراول است در `laravel-backend/frontend-overlay/`
انجام می‌شود و بعد اسکریپت بالا اجرا می‌شود. جزئیات در
[`docs/laravel-integration.md`](../docs/laravel-integration.md).

## API

| متد                 | مسیر                               | دسترسی                             |
| ------------------- | ---------------------------------- | ---------------------------------- |
| POST                | `/api/login`                       | عمومی (throttle: ۱۰ در دقیقه)      |
| POST                | `/api/logout`                      | واردشده                            |
| GET                 | `/api/me`                          | واردشده (کاربر + فروشگاه + لایسنس) |
| GET                 | `/api/license`                     | واردشده                            |
| GET/POST/PUT/DELETE | `/api/manager/stores[/{id}]`       | نقش `manager`                      |
| PUT                 | `/api/manager/stores/{id}/license` | نقش `manager`                      |
| GET                 | `/api/sync/pull`                   | کاربر فروشگاه                      |
| POST                | `/api/sync/push`                   | کاربر فروشگاه (دسته‌ای و اتمیک)    |
| POST                | `/api/sync/wipe`                   | کاربر فروشگاه                      |

## تست

```bash
composer test          # Pest (بک‌اند)
npm run typecheck      # TypeScript روی resources/js
npm test               # Vitest روی resources/js
```

## استقرار (cPanel)

1. Document Root دامنه/زیردامنه را روی `laravel-backend/public` بگذارید.
2. PHP 8.3+ و اکستنشن‌های `mbstring`، `pdo_mysql`، `openssl`، `fileinfo` فعال باشد.
3. `composer install --no-dev --optimize-autoloader` و `npm ci && npm run build`.
4. `.env` تولیدی: `APP_ENV=production`، `APP_DEBUG=false`، `APP_URL=https://…`،
   اطلاعات MySQL، `SESSION_SECURE_COOKIE=true`، `SESSION_DRIVER=database`.
5. `php artisan migrate --force` و `php artisan storage:link`.
6. مجوز نوشتن روی `storage/` و `bootstrap/cache/`.
