# راهنمای ادامه کار با هاست cPanel کارن سافت

این راهنما برای وضعیت فعلی شما نوشته شده است: یک هاست اشتراکی cPanel/CloudLinux برای `karen-soft.ir` دارید و می‌خواهید مرحله‌به‌مرحله آن را برای سایت، ساب‌دامین‌های آینده و در نهایت سرویس لایسنس آماده کنید.

> نکته مهم: چیزی که در تصویر دیده می‌شود «هاست اشتراکی» است، نه VPS. بنابراین فعلاً نباید داده مالی کاربران، فایل پشتیبان کاربران، APK، یا کلید خصوصی لایسنس را داخل فضای عمومی وب قرار دهید.

---

## هدف پیشنهادی برای این هاست

در شروع، این هاست را برای این موارد استفاده کنید:

1. سایت اصلی/معرفی `karen-soft.ir`
2. محیط آزمایشی، مثل `staging.karen-soft.ir`
3. یک سرویس لایسنس سبک PHP/MySQL، مثل `license.karen-soft.ir`
4. ساب‌دامین‌های سبک آینده

فعلاً این موارد را روی این هاست نبرید:

- دیتابیس اصلی اطلاعات مالی کاربران
- فایل‌های پشتیبان کاربران
- APK/AAB و فایل‌های دانلود حجیم
- کلید خصوصی امضای لایسنس داخل `public_html`
- سرویس Node.js، مگر اینکه هاست صریحاً پشتیبانی Node.js داشته باشد

برنامه فعلی حساب‌یار می‌تواند تا زمان آماده شدن محیط جدید روی انتشار فعلی باقی بماند.

---

## گام ۱ — امنیت خود پنل را انجام دهید

قبل از هر تغییر فنی:

1. رمز ناحیه کاربری و cPanel را عوض کنید و رمز قوی و یکتا بگذارید.
2. اگر ورود دومرحله‌ای وجود دارد، فعال کنید.
3. ایمیل بازیابی حساب را بررسی کنید.
4. نشست‌های فعال/دستگاه‌های ناشناس را ببندید.
5. رمزها، کلیدها و کوکی‌ها را در چت، تیکت عمومی یا اسکرین‌شات نفرستید.

**خروجی این مرحله:** دسترسی پنل امن است و رمزها فقط در password manager نگهداری می‌شوند.

---

## گام ۲ — مشخصات واقعی هاست را استخراج کنید

تصویر فعلی ناحیه کاربری/محصول است. برای تصمیم فنی باید خود cPanel یا بخش مشخصات سرویس را ببینید.

در cPanel این موارد را پیدا کنید:

| مورد          | جای احتمالی در cPanel                 | چیزی که باید یادداشت شود        |
| ------------- | ------------------------------------- | ------------------------------- |
| نسخه PHP      | Select PHP Version / MultiPHP Manager | مثلاً 8.2 یا 8.3                |
| دیتابیس       | MySQL Databases / phpMyAdmin          | MySQL یا MariaDB و نسخه         |
| فضای دیسک     | Statistics / Resource Usage           | سهمیه کل و مقدار مصرف‌شده       |
| محدودیت منابع | Resource Usage / CloudLinux           | CPU، RAM، Entry Processes، I/O  |
| SSL           | SSL/TLS Status / Let’s Encrypt        | امکان صدور خودکار گواهی         |
| مسیر سایت     | Domains / Subdomains                  | Document Root واقعی             |
| بکاپ          | Backup / Backup Wizard                | نوع بکاپ و امکان دانلود/بازیابی |
| SSH/Terminal  | Terminal / SSH Access                 | وجود یا عدم وجود                |
| Cron          | Cron Jobs                             | امکان اجرای زمان‌بندی‌شده       |

اگر بخش SSH/Terminal وجود ندارد، طبیعی است؛ خیلی از هاست‌های اشتراکی آن را محدود می‌کنند.

**خروجی این مرحله:** یک یادداشت کوتاه دارید مثل:

```text
PHP: 8.3
DB: MariaDB 10.x
Disk: 500MB total / 60MB used
SSL: AutoSSL available
SSH: no
Cron: yes
Document root: /home/USER/public_html
Backup: weekly, downloadable
```

اعداد بالا فقط نمونه‌اند؛ مقدار واقعی سرویس خودتان را بنویسید.

---

## گام ۳ — فعلاً DNS تولید را تغییر ندهید

اگر `hesabyar.karen-soft.ir` الان روی GitHub Pages یا سرویس دیگری کار می‌کند، فعلاً رکورد آن را عوض نکنید.

ابتدا فقط یک محیط آزمایشی بسازید:

```text
staging.karen-soft.ir
```

یا اگر می‌خواهید سرویس لایسنس را جدا آزمایش کنید:

```text
license-staging.karen-soft.ir
```

### اگر DNS دامنه داخل همین هاست است

در cPanel بخش **Domains** یا **Subdomains** را باز کنید و ساب‌دامین آزمایشی را بسازید.

### اگر DNS دامنه جای دیگری است

در پنل DNS دامنه، یک رکورد A برای ساب‌دامین آزمایشی به IP هاست اضافه کنید:

```text
Type: A
Name: staging
Value: SERVER_IP
TTL: 300
```

برای سرویس لایسنس آزمایشی:

```text
Type: A
Name: license-staging
Value: SERVER_IP
TTL: 300
```

**قانون مهم:** تا وقتی محیط جدید تست نشده، رکوردهای اصلی سایت، ایمیل و `hesabyar` را تغییر ندهید.

---

## گام ۴ — ساختار پوشه‌ها را امن بچینید

در File Manager مسیر خانه کاربر cPanel را ببینید. معمولاً چیزی شبیه این است:

```text
/home/CPANEL_USER/
```

ساختار پیشنهادی:

```text
/home/CPANEL_USER/
├── public_html/                  # سایت اصلی karen-soft.ir
├── staging.karen-soft.ir/        # محیط آزمایشی، اگر cPanel این مسیر را ساخت
├── license.karen-soft.ir/        # فقط فایل‌های عمومی API لایسنس
├── private/                      # خارج از دسترس وب
│   ├── config/
│   └── keys/
└── backups/                      # بکاپ‌های موقت، نه فایل عمومی
```

نام دقیق پوشه ساب‌دامین را از بخش **Domains** بخوانید. ممکن است cPanel مسیر دیگری ساخته باشد.

### قانون طلایی

هر چیزی که نباید عمومی دانلود شود باید **خارج از Document Root** باشد:

- کلید خصوصی لایسنس
- فایل تنظیمات دیتابیس
- توکن‌های مدیریتی
- فایل‌های `.env`
- لاگ‌های حساس

داخل `public_html` یا پوشه عمومی ساب‌دامین فقط فایل‌هایی باشد که واقعاً باید توسط مرورگر دیده شوند.

---

## گام ۵ — HTTPS را فعال کنید

در cPanel بخش **SSL/TLS Status** یا **Let’s Encrypt** را باز کنید.

برای این دامنه‌ها گواهی بگیرید:

```text
karen-soft.ir
www.karen-soft.ir
staging.karen-soft.ir
license-staging.karen-soft.ir
```

بعد از صدور گواهی، بررسی کنید:

```text
https://staging.karen-soft.ir
```

بدون خطای گواهی باز شود.

اگر گزینه **Force HTTPS Redirect** وجود دارد، فعلاً برای ساب‌دامین آزمایشی فعال کنید. برای دامنه اصلی بعد از تست کامل فعال شود.

---

## گام ۶ — نسخه PHP را تنظیم کنید

در **Select PHP Version** یا **MultiPHP Manager**:

1. نسخه‌ای را انتخاب کنید که هنوز پشتیبانی امنیتی دارد؛ مثلاً PHP 8.2 یا 8.3، بسته به امکان هاست.
2. برای سرویس لایسنس PHP این اکستنشن‌ها معمولاً لازم‌اند:

```text
openssl
pdo_mysql
mbstring
json
curl
sodium
```

وجود `sodium` برای Ed25519 مفید است. اگر نبود، باید از RSA-PSS/openssl یا روش سازگار دیگر استفاده شود.

3. تنظیمات پیشنهادی برای محیط تولید:

```text
display_errors = Off
log_errors = On
expose_php = Off
```

اگر هاست اجازه تغییر مستقیم نمی‌دهد، از پشتیبانی بخواهید.

---

## گام ۷ — یک تست سلامت بسیار ساده بگذارید

برای مطمئن شدن از اینکه ساب‌دامین و PHP درست کار می‌کنند، داخل Document Root ساب‌دامین آزمایشی یک فایل موقت بسازید:

```php
<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

echo json_encode([
    'ok' => true,
    'service' => 'karen-staging',
    'time' => gmdate('c'),
], JSON_UNESCAPED_UNICODE);
```

نام فایل:

```text
health.php
```

بعد باز کنید:

```text
https://staging.karen-soft.ir/health.php
```

باید خروجی شبیه این ببینید:

```json
{ "ok": true, "service": "karen-staging", "time": "2026-08-22T12:00:00+00:00" }
```

بعد از تست، یا فایل را حذف کنید یا نگه دارید ولی هیچ اطلاعات حساسی در آن نگذارید. فایل `phpinfo()` عمومی نسازید.

---

## گام ۸ — دیتابیس آزمایشی بسازید

در cPanel بخش **MySQL Databases**:

1. یک دیتابیس جدید بسازید، مثلاً:

```text
CPANELUSER_karen_staging
```

2. یک کاربر دیتابیس جدا بسازید.
3. رمز قوی و یکتا بگذارید.
4. کاربر را به دیتابیس متصل کنید.
5. فقط دسترسی‌های لازم بدهید. برای شروع توسعه:

```text
SELECT
INSERT
UPDATE
DELETE
CREATE
ALTER
INDEX
```

دسترسی‌های مدیریتی غیرضروری مثل `DROP`، `GRANT` یا `ALL PRIVILEGES` را بی‌دلیل ندهید.

اطلاعات اتصال را در password manager نگه دارید. در چت نفرستید.

نمونه ساختار اطلاعات، فقط برای یادداشت شخصی:

```text
DB_HOST: localhost
DB_NAME: CPANELUSER_karen_staging
DB_USER: CPANELUSER_license_user
DB_PASS: <در password manager>
```

---

## گام ۹ — بکاپ دستی بگیرید

حتی اگر هاست بکاپ خودکار دارد، قبل از ادامه یک بکاپ دستی بگیرید.

در cPanel:

```text
Backup / Backup Wizard
```

اگر امکان دارد:

- Full Backup بگیرید.
- یا حداقل Home Directory + MySQL Databases را بگیرید.
- فایل بکاپ را خارج از هاست هم نگه دارید.
- بازیابی را در محیط آزمایشی تست کنید.

اگر بکاپ هاست ماهانه/هفتگی است، برای سرویس لایسنس باید خودتان برنامه بکاپ روزانه داشته باشید.

---

## گام ۱۰ — مانیتورینگ ساده اضافه کنید

برای شروع، یک مانیتورینگ خارجی برای این آدرس‌ها تنظیم کنید:

```text
https://karen-soft.ir
https://staging.karen-soft.ir/health.php
```

بعداً برای سرویس لایسنس:

```text
https://license.karen-soft.ir/health.php
```

هدف این است که اگر هاست خوابید، سریع بفهمید. آپتایم ۹۸٪ یعنی باید برای قطعی برنامه داشته باشید.

---

## گام ۱۱ — تصمیم بگیرید اول چه چیزی بالا بیاید

سه مسیر دارید:

### مسیر A — سایت اصلی کارن سافت

اگر هدف اول سایت معرفی است:

1. فایل‌های سایت اصلی را در `public_html` قرار دهید.
2. HTTPS را تست کنید.
3. فرم تماس/ایمیل را جداگانه تست کنید.
4. فعلاً دیتابیس لازم نیست.

### مسیر B — انتقال حساب‌یار به ساب‌دامین

اگر هدف انتقال حساب‌یار است:

1. ابتدا روی `staging.karen-soft.ir` تست کنید.
2. خروجی build را بسازید:

```bash
npm ci
npm run build
```

3. محتویات پوشه `dist` را داخل Document Root ساب‌دامین آپلود کنید؛ خود پوشه `dist` را به‌عنوان زیرپوشه نگذارید، مگر اینکه مسیر سایت را همان بدانید.
4. فایل `.htaccess` موجود در خروجی باید منتقل شود.
5. مسیرهای داخلی برنامه را تست کنید.
6. PWA و حالت آفلاین را تست کنید.
7. فقط بعد از موفقیت، DNS `hesabyar.karen-soft.ir` را تغییر دهید.

> تغییر آدرس برنامه می‌تواند روی داده محلی مرورگر اثر بگذارد. کاربران باید قبل از مهاجرت پشتیبان بگیرند.

### مسیر C — سرویس لایسنس

اگر هدف اصلی امنیت لایسنس است:

1. روی `license-staging.karen-soft.ir` شروع کنید.
2. دیتابیس جدا بسازید.
3. کلید خصوصی را خارج از Document Root نگه دارید.
4. API را با PHP/MySQL پیاده کنید، مگر هاست Node.js داشته باشد.
   5.endpointهای اولیه:

```text
POST /v1/activations
POST /v1/license/refresh
GET  /v1/entitlements
GET  /health.php
```

6. نرخ تلاش، لاگ، لغو، سقف دستگاه و تمدید را تست کنید.
7. بعد از تست، به `license.karen-soft.ir` منتقل کنید.

---

## گام ۱۲ — هدرهای امنیتی پایه

اگر هاست Apache/LiteSpeed است و اجازه `.htaccess` دارید، برای ساب‌دامین آزمایشی می‌توانید این پایه را داشته باشید:

```apache
Options -Indexes

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
</IfModule>

<FilesMatch "^\.">
  Require all denied
</FilesMatch>
```

برای خود حساب‌یار که بارکدخوان دارد، `camera=()` نگذارید؛ باید متناسب با برنامه تنظیم شود:

```apache
Header always set Permissions-Policy "camera=(self), microphone=(), geolocation=()"
```

CSP را ابتدا Report-Only و بعد از تست PDF، بارکد، PWA و آفلاین فعال کنید.

---

## چیزهایی که الان نباید انجام دهید

- کلید خصوصی لایسنس را داخل `public_html` نگذارید.
- فایل `.env` دارای رمز را عمومی آپلود نکنید.
- `VITE_LICENSE_SECRET` را وارد خروجی مرورگر نکنید.
- دیتابیس مالی واقعی کاربران را روی این هاست آزمایشی نبرید.
- APK/AAB و پشتیبان کاربران را برای دانلود عمومی اینجا نگذارید.
- قبل از تست، DNS اصلی `hesabyar.karen-soft.ir` را عوض نکنید.
- اسکریپت صدور لایسنس فعلی را به‌عنوان راه‌حل تجاری ضدکپی منتشر نکنید.

---

## چک‌لیست پیام بعدی به من

بعد از انجام گام‌های ۱ تا ۷، این اطلاعات را بدون رمز و کلید بفرستید:

```text
PHP version:
MySQL/MariaDB version:
Disk quota:
Disk used:
SSL available: yes/no
SSH/Terminal available: yes/no
Cron available: yes/no
Document root for staging:
Health test result: ok/error
Goal first: main-site / hesabyar / license-api
```

با این اطلاعات، مرحله بعد را دقیق‌تر می‌چینیم: یا استقرار سایت، یا ساخت API لایسنس، یا انتقال آزمایشی حساب‌یار.
