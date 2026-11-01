# راهنمای قدم‌به‌قدم ساخت حساب‌یار حرفه‌ای با بک‌اند

تاریخ: ۱۴۰۵/۰۸/۱۰  
وضعیت فعلی: وب‌اپ React/PWA آفلاین‌فرست + بک‌اند لایسنس PHP/MySQL روی staging + پنل ادمین + APK ادمین آزمایشی.

هدف این راهنما: تبدیل حساب‌یار از یک اپ آفلاین با لایسنس آزمایشی به یک محصول حرفه‌ای، امن، قابل نگهداری و قابل انتشار.

---

## 0. تصمیم محصول را قبل از کدنویسی مشخص کن

اول باید دقیقاً مشخص شود «بک‌اند» قرار است چه کاری انجام دهد. سه سطح ممکن است:

### سطح A — بک‌اند فقط برای لایسنس، ادمین و انتشار

- دادهٔ مالی کاربر روی دستگاه خودش می‌ماند.
- سرور فقط فعال‌سازی، تمدید، لغو دستگاه، صدور لایسنس و مدیریت مشتری را انجام می‌دهد.
- کمترین ریسک و سریع‌ترین مسیر.
- مناسب نسخهٔ فعلی.

### سطح B — بک‌اند برای حساب کاربری، بکاپ ابری و بازیابی

- کاربر حساب دارد.
- فایل پشتیبان رمزنگاری‌شده در سرور ذخیره می‌شود.
- دادهٔ مالی همچنان local-first است، اما کاربر می‌تواند روی دستگاه جدید بازیابی کند.
- نیاز به احراز هویت، رمزنگاری، محدودیت حجم و سیاست حفظ داده دارد.

### سطح C — بک‌اند برای همگام‌سازی چنددستگاهی و نسخهٔ سازمانی

- چند کاربر/دستگاه روی یک کسب‌وکار کار می‌کنند.
- داده‌ها با sync engine هماهنگ می‌شوند.
- نیاز به conflict resolution، audit log، نقش‌ها، صف، مانیتورینگ و پشتیبان‌گیری جدی دارد.
- پیچیده‌ترین و پرهزینه‌ترین مسیر.

### پیشنهاد من

مسیر را مرحله‌ای برو:

```text
A → B → C
```

یعنی اول لایسنس و staging را کامل و امن کن، بعد بکاپ ابری رمزنگاری‌شده اضافه کن، و فقط اگر مشتری واقعاً نیاز داشت همگام‌سازی چنددستگاهی بساز.

---

## 1. معماری هدف پیشنهادی

```text
React PWA / Android WebView / Capacitor
        |
        | HTTPS
        v
Same-origin Web App: /app/
        |
        | fetch
        v
APIها:
  /v1/          ← لایسنس فعلی
  /api/v1/      ← API محصول در آینده
  /admin/       ← پنل مدیریت
        |
        v
Backend Services
  - License Service
  - Auth Service
  - Backup/Sync Service
  - Admin/Audit Service
        |
        v
MySQL/PostgreSQL + Redis + Object Storage
        |
        v
Encrypted Backups + Logs + Monitoring
```

### اصل‌های معماری

1. دادهٔ مالی کاربر هرگز با انقضای لایسنس قفل یا پاک نشود.
2. کلید خصوصی issuer و secrets فقط سمت سرور بمانند.
3. وب‌اپ و API ترجیحاً same-origin باشند تا CORS ساده‌تر شود.
4. staging و production کاملاً جدا باشند: دیتابیس، کلید، دامنه، تنظیمات.
5. هر تغییر دیتابیس migration نسخه‌دار داشته باشد.
6. هر پاسخ خصوصی `Cache-Control: no-store` داشته باشد.
7. هر عملیات مالی/ادمین قابل ردیابی باشد.

---

## 2. قدم اول: تثبیت بک‌اند لایسنس فعلی

قبل از اضافه کردن قابلیت جدید، باید مشکل فعلی ارتباط حل شود.

### 2.1 اصلاح باگ base64url

در کلاینت، کلید عمومی دستگاه و امضای refresh با `base64url` ارسال می‌شوند. در `activations.php` و `refresh.php` باید decode سازگار با base64url استفاده شود.

کارها:

- افزودن یا استفاده از helper مثل `karen_b64url_decode`.
- جایگزینی `base64_decode($devicePublicKeyB64, true)` در activation.
- جایگزینی `base64_decode($signatureB64, true)` در refresh.
- حفظ بررسی طول: کلید عمومی 32 بایت، امضا 64 بایت.
- افزودن تست با کلید/امضای واقعی تولیدشده توسط WebCrypto.

معیار پذیرش:

- فعال‌سازی از مرورگر واقعی موفق شود.
- refresh از مرورگر واقعی موفق شود.
- امضای دست‌کاری‌شده رد شود.
- nonce تکراری `replay_detected` بدهد.

### 2.2 نصب وب‌اپ staging در `/app/`

کارها:

- اجرای `admin/deploy-app.php` یا نصب دستی zip.
- بررسی وجود `ZipArchive`، `curl` یا `allow_url_fopen`.
- تست مسیرهای:
  - `/app/`
  - `/app/settings`
  - `/app/manifest.webmanifest`
  - `/app/sw.js`
- حذف installer پس از موفقیت.

معیار پذیرش:

- `/app/` بدون 404 باز شود.
- SPA routeها مثل `/app/settings` بعد از refresh کار کنند.
- PWA نصب شود یا خطای نصب مشخص باشد.

### 2.3 سخت‌سازی کلاینت لایسنس

کارها:

- بررسی `claims.iss` و `claims.aud` در کلاینت.
- پین کردن کلید عمومی issuer در بیلد staging/production.
- اگر کلید عمومی پین‌شده وجود ندارد، بیلد سروری fail شود.
- تست issuer اشتباه، audience اشتباه، kid اشتباه، کلید اشتباه.

معیار پذیرش:

- توکن با issuer/audience اشتباه رد شود.
- توکن با کلید عمومی ناسازگار رد شود.
- توکن معتبر staging فقط در محیط staging پذیرفته شود.

### 2.4 حذف صفحات تست و نصب‌کننده

بعد از تأیید staging:

- `activation-test.php`
- `refresh-test.php`
- `verify-test.php`
- `revocation-test.php`
- `license-revocation-test.php`
- `device-limit-test.php`
- `app-client-test.php`
- `admin/deploy-app.php`
- `admin/upgrade-admin.php`

از webroot حذف شوند. در مخزن می‌توانند برای توسعه بمانند، ولی در بستهٔ استقرار نباشند.

---

## 3. قدم دوم: محیط‌ها را از هم جدا کن

حداقل سه محیط لازم است:

| محیط        | دامنه پیشنهادی                                  | کاربرد                 |
| ----------- | ----------------------------------------------- | ---------------------- |
| development | localhost یا dev داخلی                          | توسعه روزمره           |
| staging     | `staging.karen-soft.ir`                         | تست کامل قبل از انتشار |
| production  | `hesabyar.karen-soft.ir` یا `app.karen-soft.ir` | کاربران واقعی          |

### برای هر محیط جدا کن

- دیتابیس
- کاربر دیتابیس
- کلید Ed25519 issuer
- کلیدهای API/SMS/Storage
- تنظیمات CORS
- نرخ‌نامه‌ها و محدودیت‌ها
- لاگ‌ها و مانیتورینگ

### روی cPanel فعلی

- تنظیمات خصوصی خارج از `public_html` بمانند:
  ```text
  /home/karensof/private/karen-staging/
  ```
- برای production بعداً:
  ```text
  /home/karensof/private/karen-production/
  ```
- فایل‌های کلید خصوصی نباید داخل webroot باشند.
- دسترسی فایل‌های خصوصی باید `0600` و پوشه‌ها `0700` باشد.

### روی Cloudflare

چون DNS در Cloudflare مدیریت می‌شود:

- رکوردها را در Cloudflare بساز، نه cPanel Zone Editor.
- برای staging فعلاً `A staging → IP هاست` با حالت DNS only مناسب است.
- برای production بعد از تست، رکورد `hesabyar` یا `app` را تغییر بده.
- اگر از Cloudflare proxy استفاده می‌کنی، SSL/TLS را روی `Full (strict)` بگذار.
- HSTS را با احتیاط و بعد از تست فعال کن.

---

## 4. قدم سوم: استانداردسازی API

API فعلی لایسنس خوب است، ولی برای محصول حرفه‌ای باید قرارداد یکدست داشته باشی.

### ساختار پیشنهادی

```text
/v1/activations.php
/v1/refresh.php
/v1/verify.php

/api/v1/auth/request-otp
/api/v1/auth/verify-otp
/api/v1/auth/logout
/api/v1/me
/api/v1/businesses
/api/v1/devices
/api/v1/backups
/api/v1/sync/push
/api/v1/sync/pull
```

### قالب پاسخ موفق

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "request_id": "..."
  }
}
```

### قالب پاسخ خطا

```json
{
  "ok": false,
  "error": {
    "code": "rate_limited",
    "message": "تلاش بیش از حد. چند دقیقه بعد دوباره تلاش کنید.",
    "request_id": "..."
  }
}
```

### قواعد API

- فقط HTTPS.
- ورودی JSON با محدودیت اندازه.
- اعتبارسنجی سمت سرور برای همهٔ فیلدها.
- prepared statement برای SQL.
- rate limit بر اساس IP، حساب، دستگاه و عملیات.
- پاسخ خصوصی `no-store`.
- CORS فقط برای originهای دقیق.
- برای cookie-based auth، محافظت CSRF.
- برای عملیات حساس، audit log.
- نسخه‌بندی API از همان ابتدا.

---

## 5. قدم چهارم: اگر حساب کاربری می‌خواهی، Auth را درست بساز

اگر فقط سطح A را می‌خواهی، این قدم فعلاً لازم نیست. برای سطح B/C لازم است.

### روش ورود پیشنهادی

برای بازار ایران:

- شماره موبایل + OTP پیامکی.
- بعداً امکان ایمیل/رمز عبور یا گذرواژهٔ سازمانی.

### الزامات امنیتی Auth

- OTP کوتاه‌مدت، مثلاً ۲ تا ۵ دقیقه.
- محدودیت ارسال OTP:
  - هر شماره: مثلاً ۳ بار در ۱۰ دقیقه.
  - هر IP: مثلاً ۱۰ بار در ۱۰ دقیقه.
- محدودیت تلاش تأیید OTP.
- هش کردن کد OTP در دیتابیس، نه ذخیرهٔ plaintext.
- نشست وب با cookie امن:
  - `Secure`
  - `HttpOnly`
  - `SameSite=Lax` یا `Strict`
- برای موبایل:
  - access token کوتاه‌مدت.
  - refresh token چرخشی.
  - ذخیرهٔ امن در سمت کلاینت.
- خروج از همهٔ دستگاه‌ها.
- مدیریت دستگاه‌های متصل.

### جداول پیشنهادی Auth

```text
users
- id
- uuid
- phone
- email
- status
- created_at
- updated_at

user_sessions
- id
- user_id
- device_id
- refresh_token_hash
- expires_at
- revoked_at
- created_at

otp_codes
- id
- phone
- code_hash
- expires_at
- attempts
- consumed_at
- created_at

devices
- id
- user_id
- device_key_id
- public_key
- label
- platform
- last_seen_at
- status
```

---

## 6. قدم پنجم: مدل کسب‌وکار و داده‌های مالی را سروری کن

برای سطح B/C، باید مشخص شود دادهٔ مالی متعلق به کیست.

### موجودیت‌های پیشنهادی

```text
businesses
- id
- uuid
- owner_user_id
- name
- currency
- settings
- created_at

business_members
- business_id
- user_id
- role: owner | admin | accountant | viewer
- created_at

licenses
- موجودی فعلی

subscriptions
- برای پرداخت/اشتراک در آینده

audit_logs
- actor
- action
- target_type
- target_id
- ip_hash
- user_agent
- created_at
```

### اصل مهم

اگر دادهٔ مالی قرار است sync شود، هر رکورد باید شناسهٔ پایدار داشته باشد:

```text
uuid
revision
updated_at
deleted_at
```

شناسهٔ عددی autoincrement برای sync کافی نیست.

---

## 7. قدم ششم: بکاپ ابری رمزنگاری‌شده

این بهترین قدم بعد از لایسنس است، چون بدون sync پیچیده ارزش زیادی می‌دهد.

### رفتار پیشنهادی

1. کاربر در برنامه بکاپ می‌گیرد.
2. فایل JSON با کلید کاربر رمزنگاری می‌شود.
3. فقط ciphertext به سرور ارسال می‌شود.
4. سرور حجم، تعداد و مالکیت را بررسی می‌کند.
5. کاربر روی دستگاه جدید وارد می‌شود و بکاپ را بازیابی می‌کند.
6. کلید رمزنگاری هرگز به سرور ارسال نمی‌شود.

### رمزنگاری پیشنهادی

- KDF: Argon2id یا PBKDF2 با پارامترهای قوی.
- رمزنگاری: AES-256-GCM.
- برای هر بکاپ nonce تصادفی.
- کلید.master از passphrase کاربر مشتق شود.
- recovery code برای فراموشی رمز.
- اگر کاربر رمز را فراموش کند و recovery code نداشته باشد، داده قابل بازیابی نیست؛ این باید شفاف گفته شود.

### جداول بکاپ

```text
backups
- id
- uuid
- business_id
- user_id
- device_id
- storage_path
- sha256
- size_bytes
- encrypted: true
- created_at

backup_retention_policies
- business_id
- max_backups
- max_age_days
```

### محدودیت‌ها

- حداکثر حجم هر بکاپ.
- حداکثر تعداد بکاپ برای هر حساب.
- rate limit برای upload/download.
- حذف بکاپ‌های قدیمی طبق سیاست.
- تست restore واقعی.

---

## 8. قدم هفتم: اگر همگام‌سازی می‌خواهی، Sync Engine بساز

این مرحله را فقط وقتی شروع کن که بکاپ ابری پایدار شده باشد.

### مدل local-first

- دادهٔ اصلی در IndexedDB می‌ماند.
- هر تغییر در یک outbox محلی ثبت می‌شود.
- وقتی اینترنت هست، تغییرات push می‌شوند.
- تغییرات دیگران pull می‌شوند.
- تعارض‌ها حل یا به کاربر نشان داده می‌شوند.

### جداول sync

```text
sync_changes
- id
- business_id
- entity_type
- entity_uuid
- revision
- device_id
- encrypted_payload
- deleted
- created_at

sync_cursors
- business_id
- device_id
- last_revision
- updated_at

idempotency_keys
- key
- user_id
- request_hash
- response
- created_at
```

### قواعد sync

- هر درخواست push باید idempotency key داشته باشد.
- سرور revision جدید اختصاص دهد.
- رکوردهای مالی مهم مثل فاکتور نباید بی‌صدا overwrite شوند.
- برای تعارض‌ها صف حل تعارض یا UI حل تعارض بساز.
- حذف منطقی با `deleted_at` بهتر از حذف فیزیکی است.
- pull باید صفحه‌بندی و cursor داشته باشد.
- payload مالی ترجیحاً end-to-end encrypted باشد.

---

## 9. قدم هشتم: امنیت داده و PIN را ارتقا بده

حتی اگر بک‌اند اضافه شود، امنیت سمت کلاینت مهم است.

### کارهای ضروری

- مهاجرت PIN از SHA-256 ساده به PBKDF2/Argon2id.
- salt تصادفی برای هر کاربر/دستگاه.
- محدودیت تلاش ناموفق.
- قفل خودکار بعد از زمان بی‌کاری.
- پاک نکردن داده با رمز اشتباه.
- رمزنگاری IndexedDB یا حداقل بخش‌های حساس.
- رمزنگاری backup محلی و ابری.

### مسیر پیشنهادی مهاجرت

1. نسخهٔ جدید، هش قدیمی را هنوز می‌فهمد.
2. بعد از ورود موفق با PIN قدیمی، هش جدید ساخته می‌شود.
3. داده‌ها به‌تدریج به فرمت رمزنگاری‌شده migrate می‌شوند.
4. قبل از migration، backup خودکار گرفته می‌شود.
5. rollback باید ممکن باشد.

---

## 10. قدم نهم: هدرها و تنظیمات وب را حرفه‌ای کن

برای وب‌اپ:

```text
Content-Security-Policy
Strict-Transport-Security
X-Content-Type-Options: nosniff
Referrer-Policy
Permissions-Policy
X-Frame-Options یا frame-ancestors
Cache-Control مناسب
```

### CSP پیشنهادی اولیه

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self';
manifest-src 'self';
worker-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

بعد باید بر اساس نیاز واقعی محدودتر شود.

### Service Worker

- فقط assetهای static کش شوند.
- پاسخ API کش نشود.
- صفحات authenticated کش نشوند.
- scope دقیق باشد.
- برای به‌روزرسانی، پیام «نسخهٔ جدید آماده است» یا autoUpdate کنترل‌شده.

---

## 11. قدم دهم: CI/CD و کیفیت کد

یک workflow حداقلی:

```text
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

بعداً اضافه کن:

```text
Playwright E2E
Integration tests for API
Contract tests for license API
Database migration tests
Secret scanning
Dependency update bot
```

### قانون انتشار

- هیچ تغییر مستقیمی روی production بدون تست staging.
- هر release باید نسخه، changelog و rollback plan داشته باشد.
- migration دیتابیس قبل از backup خودکار اجرا شود.
- APK اندروید با keystore رسمی امضا شود، نه debug.

---

## 12. قدم یازدهم: مانیتورینگ و عملیات

حداقل موارد:

- uptime برای سایت، staging و API.
- health endpoint عمومی بدون اطلاعات حساس.
- readiness داخلی برای DB/Redis/Storage.
- خطاهای PHP/Node با request_id.
- هشدار پر شدن دیسک/دیتابیس.
- هشدار خطای زیاد activation/refresh.
- هشدار تلاش ناموفق ادمین.
- لاگ audit برای صدور/لغو لایسنس.
- بکاپ روزانه دیتابیس و فایل‌های مهم.
- تست restore ماهانه.

### لاگ خوب باید چه داشته باشد؟

```text
time
request_id
environment
service
action
status
duration_ms
user_id_hash
device_id_hash
ip_hash
error_code
```

نباید چه چیزی لاگ شود؟

- رمز عبور
- OTP
- کلید خصوصی
- توکن کامل
- دادهٔ مالی خام
- فایل پشتیبان plaintext

---

## 13. قدم دوازدهم: انتشار production

فقط وقتی staging کامل تأیید شد.

### چک‌لیست قبل از production

- [ ] باگ base64url رفع شده.
- [ ] `/app/` روی staging سالم است.
- [ ] فعال‌سازی/refresh/verify/revocation/device-limit تست شده.
- [ ] issuer public key پین شده.
- [ ] `iss/aud` در کلاینت بررسی می‌شود.
- [ ] صفحات تست و installer حذف شده‌اند.
- [ ] وابستگی‌های critical/high ارتقا یافته‌اند.
- [ ] CSP/HSTS تست شده.
- [ ] backup و restore تست شده.
- [ ] CI سبز است.
- [ ] دیتابیس production جداست.
- [ ] کلید production جداست.
- [ ] DNS در Cloudflare آماده است.
- [ ] SSL/TLS سالم است.
- [ ] مانیتورینگ فعال است.
- [ ] rollback plan نوشته شده.

### مراحل انتقال

1. گرفتن backup کامل از وضعیت فعلی.
2. ساخت دیتابیس و کاربر production.
3. ساخت کلیدهای production خارج از webroot.
4. استقرار API و وب‌اپ در مسیر production.
5. تست سلامت و یک فعال‌سازی آزمایشی.
6. تغییر DNS در Cloudflare.
7. تست از چند دستگاه/مرورگر.
8. مانیتورینگ ۲۴ تا ۷۲ ساعت.
9. حذف مسیرهای موقت.

---

## 14. برنامه اجرایی پیشنهادی

### هفته ۱ — رفع انسداد و staging

- اصلاح base64url.
- تست قرارداد واقعی مرورگر/PHP.
- نصب `/app/`.
- پین کردن issuer key.
- بررسی iss/aud.
- حذف صفحات تست اضافی.

خروجی هفته ۱: staging واقعاً کار می‌کند.

### هفته ۲ — سخت‌سازی و CI

- ارتقای jspdf/zod/react-router.
- افزودن CSP/HSTS.
- افزودن CI.
- اعتبارسنجی عمیق backup.
- تست E2E اصلی.

خروجی هفته ۲: کیفیت و امنیت پایه بالا می‌رود.

### هفته ۳ — تصمیم محصول و بکاپ ابری

- انتخاب سطح A/B/C.
- اگر B: طراحی auth و backup encrypted.
- پیاده‌سازی OTP یا login.
- upload/download بکاپ رمزنگاری‌شده.
- تست restore روی دستگاه جدید.

خروجی هفته ۳: کاربر می‌تواند داده‌اش را امن بازیابی کند.

### هفته ۴ — production یا sync

- اگر هدف A/B است: انتشار production کنترل‌شده.
- اگر هدف C است: طراحی sync engine و شروع نسخهٔ آزمایشی.

خروجی هفته ۴: محصول قابل ارائه به مشتری واقعی.

---

## 15. ترتیب دقیق کارهایی که من پیشنهاد می‌کنم الان انجام دهیم

1. اصلاح `activations.php` و `refresh.php` برای base64url.
2. دادن فایل کامل اصلاح‌شده به‌صورت inline برای کپی در cPanel.
3. تست فعال‌سازی واقعی از مرورگر.
4. نصب/تأیید `/app/`.
5. اصلاح کلاینت برای `iss/aud` و issuer key pinning.
6. ساخت بیلد staging جدید.
7. تست کامل سناریوی لایسنس.
8. حذف صفحات تست/installer.
9. ارتقای وابستگی‌ها و CI.
10. تصمیم برای بکاپ ابری یا sync.

---

## 16. جمع‌بندی

برای حرفه‌ای شدن حساب‌یار لازم نیست از اول همه‌چیز را بازنویسی کنی. مسیر درست این است:

```text
لایسنس امن و تست‌شده
→ وب‌اپ staging سالم
→ امنیت و CI
→ بکاپ ابری رمزنگاری‌شده
→ در صورت نیاز sync چنددستگاهی
→ production کنترل‌شده
```

مهم‌ترین اصل: دادهٔ مالی کاربر باید همیشه در دسترس خودش بماند، حتی اگر لایسنس منقضی شود، اینترنت قطع شود یا سرور موقتاً از دسترس خارج شود.
