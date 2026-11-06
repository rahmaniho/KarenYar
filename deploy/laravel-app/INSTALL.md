# نصب کارو (نسخهٔ Laravel) روی cPanel — `karo.karen-soft.ir`

این بسته شامل خودِ اپلیکیشن Laravel و دارایی‌های ساخته‌شدهٔ فرانت‌اند
(`public/build`) است. `vendor/` و `node_modules/` داخل بسته نیستند و روی سرور
نصب می‌شوند.

## پیش‌نیازها

| مورد          | مقدار                                                                               |
| ------------- | ----------------------------------------------------------------------------------- |
| PHP           | ۸.۳ یا بالاتر (MultiPHP Manager در cPanel)                                          |
| اکستنشن‌ها    | `mbstring`, `openssl`, `pdo_mysql`, `fileinfo`, `ctype`, `json`, `tokenizer`, `xml` |
| دیتابیس       | MySQL/MariaDB + یک کاربر دیتابیس                                                    |
| دسترسی        | Terminal cPanel یا SSH (برای composer و artisan)                                    |
| Document Root | روی `.../laravel-backend/public`                                                    |

> **دربارهٔ دامنه:** همین حالا `karo.karen-soft.ir` روی همین هاست cPanel است
> (پاسخ «Index of /» یعنی پوشه‌ی خالی). پس برای این روش **هیچ تغییری در DNS
> لازم نیست**؛ فقط Document Root همان زیردامنه را عوض می‌کنیم. اگر بعداً بخواهید
> به GitHub Pages برگردید، همان Document Root را به پوشهٔ بستهٔ استاتیک
> (`deploy/cpanel-app`) تغییر دهید.

## گام‌به‌گام

1. **دیتابیس بسازید** (cPanel → MySQL Databases): نام دیتابیس، کاربر و رمز را
   نگه دارید. کاراکترست را `utf8mb4` بگذارید.

2. **بسته را آپلود و باز کنید** — فایل `karo-laravel.zip` را در `~/karo-app`
   آپلود کنید (File Manager → Upload → Extract).

3. **نسخهٔ PHP را تنظیم کنید** (MultiPHP Manager روی دامنه/زیردامنه → 8.3+).

4. **Document Root را تنظیم کنید**: در cPanel → Domains → `karo.karen-soft.ir`
   → Document Root = `/home/USERNAME/karo-app/laravel-backend/public`.
   (اگر cPanel اجازه نداد، پوشهٔ `public` را به `public_html` منتقل نکنید؛
   به‌جایش از `.htaccess` ریشهٔ قبلی استفاده کنید.)

5. **`.env` بسازید**:

   ```bash
   cd ~/karo-app/laravel-backend
   cp .env.example .env
   ```

   سپس این مقادیر را در `.env` بگذارید:

   ```dotenv
   APP_NAME="کارو نرم افزار حسابداری"
   APP_ENV=production
   APP_DEBUG=false
   APP_URL=https://karo.karen-soft.ir

   DB_CONNECTION=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_DATABASE=USER_DBNAME
   DB_USERNAME=USER_DBUSER
   DB_PASSWORD=...

   SESSION_DRIVER=database
   SESSION_SECURE_COOKIE=true
   SESSION_DOMAIN=null
   ```

6. **نصب وابستگی‌ها و راه‌اندازی**:

   ```bash
   composer install --no-dev --optimize-autoloader --no-interaction
   php artisan key:generate
   touch database/database.sqlite   # فقط اگر SQLite می‌مانید
   php artisan migrate --force
   php artisan storage:link
   php artisan config:cache
   php artisan route:cache
   ```

7. **مجوز پوشه‌ها**: `storage/` و `bootstrap/cache/` باید توسط کاربر وب‌سرور
   قابل نوشتن باشند (معمولاً `chmod -R ug+rwX storage bootstrap/cache`).

8. **حساب مدیر کل بسازید**:

   ```bash
   php artisan tinker --execute="\App\Models\User::create(['name'=>'مدیر','email'=>'admin@karen-soft.ir','password'=>'رمز-قوی','role'=>'manager','is_active'=>true]);"
   ```

   بعد از ورود با همین ایمیل/رمز، از پنل مدیر فروشگاه‌ها و لایسنس‌ها را بسازید.

9. **بررسی سلامت**: `https://karo.karen-soft.ir/up` باید `200` بدهد و
   صفحهٔ ورود کارو باز شود.

## نکات عملیاتی

- **صف**: پیش‌فرض `QUEUE_CONNECTION=database` است. اگر کارهای پس‌زمینه لازم شد،
  یک Cron با دستور `php artisan queue:work --stop-when-empty --max-time=280`
  هر دقیقه اضافه کنید.
- **پشتیبان‌گیری**: از دیتابیس و پوشهٔ `storage/` نسخهٔ پشتیبان بگیرید.
- **به‌روزرسانی**: بستهٔ تازه را در همان مسیر باز کنید، سپس
  `composer install --no-dev` و `php artisan migrate --force` و
  `php artisan optimize` را اجرا کنید.
- **فروش و تمدید (مسیر پول)**: در `.env` مقدار `KARO_PAYMENT_GATEWAY` را روی
  `manual` (کارت به کارت، پیش‌فرض) یا `zarinpal` بگذارید. برای زرین‌پال
  `ZARINPAL_MERCHANT_ID` را از پنل زرین‌پال بگیرید و تا زمان تست
  `ZARINPAL_SANDBOX=true` بگذارید. سپس `php artisan config:cache`.
  مبالغ/پلن‌ها در `config/billing.php` تعریف شده‌اند (به تومان).
- **یادآوری تمدید**: یک Cron روزانه با دستور
  `php artisan schedule:run >> /dev/null 2>&1` (یا مستقیم
  `php artisan karo:licenses:remind`) اضافه کنید. ایمیل با `MAIL_*` ارسال
  می‌شود؛ برای تست ابتدا `php artisan karo:licenses:remind --dry-run`.
- **HTTPS**: SSL را در cPanel فعال کنید (Let's Encrypt) تا `SESSION_SECURE_COOKIE`
  درست کار کند.
- **مهاجرت دادهٔ کاربران آفلاین**: هر کاربر از نسخهٔ آفلاین فایل پشتیبان JSON
  می‌گیرد و در «تنظیمات ← انتقال دادهٔ دستگاه به سرور» بارگذاری می‌کند
  (`POST /api/sync/import`، ادغامی و بی‌خطر برای اجرای دوباره).
