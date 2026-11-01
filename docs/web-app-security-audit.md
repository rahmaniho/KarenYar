# گزارش ممیزی ارتباط وب‌اپ، بک‌اند و امنیت حساب‌یار

تاریخ بررسی: ۱۴۰۵/۰۸/۱۰ — 2026-11-01  
شاخه بررسی: `arena/c373199a-karenyar` @ `984488a`  
دامنه‌ها: `hesabyar.karen-soft.ir`، `staging.karen-soft.ir`

> این گزارش بر پایهٔ بررسی کد، تست‌های واحد/پوشش، تحلیل ایستای PHP، اجرای محمولهٔ رمزنگاری واقعی در PHP 8.3 wasm و بررسی زندهٔ URLهای عمومی است. رفتار داخلی هاست، `bootstrap.php`، لاگ‌های PHP، هدرهای TLS/HTTP واقعی و نصب کامل وب‌اپ روی هاست هنوز به‌طور مستقیم تأیید نشده‌اند.

---

## 1. جمع‌بندی مدیریتی

وضعیت فعلی برای «وب‌اپ حرفه‌ای» **قابل ارتقا است، اما هنوز آمادهٔ تولید نیست**.

سه نتیجهٔ اصلی:

1. **بک‌اند لایسنس از نظر طراحی پایه خوب است**: امضای Ed25519 سمت سرور، توکن کوتاه‌مدت، nonce ضد replay، rate limit، CORS دقیق، prepared statement و تراکنش دیتابیس.
2. **ارتباط واقعی مرورگر با بک‌اند هنوز تأیید نمی‌شود و یک باگ قطعی دارد**: کلید عمومی دستگاه و امضای refresh در کلاینت `base64url` هستند، ولی `activations.php` و `refresh.php` با `base64_decode(..., true)` الفبای استاندارد را انتظار دارند. در تست واقعی، هر دو مقدار رد شدند.
3. **امنیت دادهٔ کاربر هنوز در سطح محصول حرفه‌ای نیست**: PIN فقط هش سریع SHA-256 با salt ثابت است، داده‌های IndexedDB و فایل پشتیبان رمزنگاری نشده‌اند، CSP/HSTS روی وب‌اپ وجود ندارد و چند وابستگی دارای advisory امنیتی هستند.

### پاسخ کوتاه به سؤال «سایت با بک‌اند ارتباط خوبی می‌گیرد؟»

- سایت اصلی `hesabyar.karen-soft.ir` در حال حاضر **بیلد آفلاین/دمو** است و طبق ورک‌فلو Pages با `VITE_LICENSE_API_BASE` ساخته نمی‌شود؛ بنابراین فعلاً به بک‌اند لایسنس وصل نیست.
- بک‌اند staging زنده است و endpointها پاسخ می‌دهند.
- وب‌اپ staging در `/app/` هنوز **404** است؛ یعنی نصب/استقرار آن تأیید نشده.
- حتی بعد از نصب، باگ `base64url` باعث می‌شود فعال‌سازی/تمدید واقعی مرورگر در اغلب موارد شکست بخورد.

---

## 2. نتایج بررسی زنده

| آدرس                                                 | نتیجه                                                                      | تفسیر                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `https://staging.karen-soft.ir/health.php`           | `{"ok":true,"service":"karen-staging","time":"2026-11-01T05:02:24+00:00"}` | PHP و مسیر سلامت staging فعال است.                                                |
| `https://staging.karen-soft.ir/v1/activations.php`   | `{"ok":false,"error":"method_not_allowed"}`                                | endpoint وجود دارد و GET را رد می‌کند؛ رفتار مورد انتظار برای POST-only.          |
| `https://staging.karen-soft.ir/v1/refresh.php`       | `{"ok":false,"error":"method_not_allowed"}`                                | endpoint وجود دارد.                                                               |
| `https://staging.karen-soft.ir/v1/verify.php`        | `{"ok":false,"error":"method_not_allowed"}`                                | endpoint وجود دارد.                                                               |
| `https://staging.karen-soft.ir/admin/`               | `401 Unauthorized`                                                         | Directory Privacy حداقل روی صفحهٔ اصلی ادمین فعال است.                            |
| `https://staging.karen-soft.ir/app/`                 | `404 Not Found`                                                            | وب‌اپ آزمایشی هنوز نصب/قابل دسترسی نیست.                                          |
| `https://staging.karen-soft.ir/activation-test.php`  | `404 Not Found`                                                            | صفحهٔ تست قدیمی ظاهراً حذف شده یا در دسترس نیست؛ خوب.                             |
| `https://staging.karen-soft.ir/app-client-test.php`  | `{"ok":false,"error":"not_found"}`                                         | پاسخ 404 منطقی؛ صفحهٔ تست کلاینت در دسترس نیست.                                   |
| `https://staging.karen-soft.ir/admin/deploy-app.php` | خطای HTTP 500 در بررسی بیرونی                                              | نصب‌کننده باید روی هاست بررسی و پس از موفقیت حذف شود؛ علت 500 از اینجا قطعی نیست. |
| `https://hesabyar.karen-soft.ir/`                    | داشبورد آفلاین با پیام «همه‌چیز روی همین دستگاه و آفلاین در دسترس است»     | سایت اصلی فعلاً حالت local/offline دارد.                                          |

هدرهای امنیتی واقعی مثل CSP، HSTS، X-Frame-Options و Cache-Control از ابزار بررسی صفحه قابل استخراج نبودند؛ بنابراین دربارهٔ آن‌ها فقط می‌توان گفت **در فایل‌های استقرار موجود در مخزن تعریف نشده‌اند** و باید روی هاست با DevTools یا `curl -I` تأیید شوند.

---

## 3. نتایج تست و کیفیت کد

| بررسی                              | نتیجه                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `npm ci`                           | موفق، 878 بسته                                                                    |
| `npm run typecheck`                | موفق                                                                              |
| `npm test`                         | **26 فایل / 185 تست، همه PASS**                                                   |
| `npm run lint -- --max-warnings 0` | موفق                                                                              |
| `npm run build:staging-web`        | موفق، 97 ورودی precache                                                           |
| `npm run test:coverage`            | موفق؛ پوشش کلی حدود **86٪ lines/statements**، **85٪ branches**، **84٪ functions** |
| تحلیل ایستای PHP با `php-parser`   | **13 فایل PHP، بدون خطای parse**                                                  |
| `npm audit --omit=dev`             | **5 آسیب‌پذیری: 1 critical، 2 high، 2 moderate**                                  |
| `npm audit` کامل                   | 41 مورد شامل dev dependencies؛ برای تولید، audit بدون dev مهم‌تر است              |
| تست E2E Playwright                 | در CI اجرا نمی‌شود و در این ممیزی اجرا نشد                                        |

نکتهٔ پوشش تست: هستهٔ محاسباتی و دیتابیس پوشش خوبی دارند، اما کلاینت HTTP لایسنس و هویت دستگاه پوشش پایینی دارند:

- `src/core/license/server/api.ts`: حدود 14٪ lines
- `src/core/license/server/device-identity.ts`: حدود 5٪ lines
- `src/core/license/server/token.ts`: حدود 93٪ lines

این یعنی تست‌های موجود بیشتر منطق استور و توکن را پوشش می‌دهند، نه قرارداد واقعی HTTP/encoding بین مرورگر و PHP را.

---

## 4. یافته‌های بحرانی و فوری

### P0-1. ناسازگاری قطعی `base64url` بین کلاینت و PHP

**شدت:** بحرانی برای یکپارچگی فعال‌سازی/تمدید  
**وضعیت:** اثبات‌شده با تست محمولهٔ واقعی

کلاینت:

- `src/core/license/server/token.ts:53-57` تابع `bytesToBase64Url` کاراکترهای `+` و `/` را به `-` و `_` تبدیل می‌کند و `=` را حذف می‌کند.
- `src/core/license/server/device-identity.ts:80` کلید عمومی دستگاه را با `bytesToBase64Url` می‌سازد.
- `src/core/license/server/api.ts:145` همان مقدار را در `device_public_key_b64` می‌فرستد.
- `src/core/license/server/api.ts:179` امضای refresh را با `bytesToBase64Url` در `signature_b64` می‌فرستد.

سمت PHP:

- `deploy/cpanel-staging/v1/activations.php:72` از `base64_decode($devicePublicKeyB64, true)` استفاده می‌کند.
- `deploy/cpanel-staging/v1/refresh.php:107` از `base64_decode($signatureB64, true)` استفاده می‌کند.

`base64_decode` در حالت strict الفبای استاندارد را می‌پذیرد، نه `-` و `_` را.

#### شواهد تست

یک جفت‌کلید Ed25519 واقعی با WebCrypto ساخته شد و امضای refresh تولید شد:

```text
publicKeyB64Url: cBb_FcK0BC8SLBqQn_T2G6mRuwZTlPu23SnQrnG-8sc
signatureB64Url: VV1jS3ibqIQJ1BtFcUTPggiTjVAgJoU03VSxlRdVxy7nOXD3RCr92c6hwPT7XVjKx-40TcZe5qk_UkFGDYHiAA
```

نتیجه در PHP 8.3:

```json
{
  "strict_pub": false,
  "strict_sig": false,
  "normalized_pub_len": 32,
  "normalized_sig_len": 64
}
```

یعنی مقدار واقعی مرورگر توسط decode سخت‌گیرانهٔ فعلی رد می‌شود، ولی پس از تبدیل الفبا به استاندارد، طول صحیح 32 بایت کلید و 64 بایت امضا به دست می‌آید.

#### اثر

- فعال‌سازی واقعی وب‌اپ اغلب با `invalid_device_public_key` شکست می‌خورد.
- تمدید واقعی اغلب با `invalid_signature` شکست می‌خورد.
- تست‌های قبلی PHP/صفحه‌های 테스트 احتمالاً از `base64_encode` استاندارد سمت PHP استفاده می‌کردند، بنابراین این باگ را نشان ندادند.

#### اصلاح پیشنهادی

در `activations.php` و `refresh.php` از decoder سازگار با base64url استفاده شود. اگر `karen_b64url_decode` در `bootstrap.php` موجود است، همان استفاده شود؛ چون `verify.php:47-49` پیش‌تر از آن استفاده می‌کند.

نمونه منطق امن:

```php
function karen_b64url_decode_compat(string $value): string|false
{
    $value = trim($value);
    if ($value === '' || strlen($value) > 512) {
        return false;
    }
    if (preg_match('/[^A-Za-z0-9+\/=_-]/', $value)) {
        return false;
    }
    $normalized = strtr($value, '-_', '+/');
    $normalized .= str_repeat('=', (4 - strlen($normalized) % 4) % 4);
    return base64_decode($normalized, true);
}
```

سپس:

- در activation: طول خروجی دقیقاً 32 بایت باشد.
- در refresh: طول خروجی دقیقاً 64 بایت باشد.
- تست قراردادی جدید با کلید/امضای تولیدشده در مرورگر یا WebCrypto اضافه شود، نه فقط `base64_encode` سمت PHP.

---

### P0-2. وب‌اپ staging نصب/قابل دسترسی نیست

**شدت:** بحرانی برای تحویل و تست end-to-end  
**وضعیت:** مشاهدهٔ زنده

`https://staging.karen-soft.ir/app/` پاسخ 404 می‌دهد. بنابراین حتی اگر کد کلاینت درست باشد، هنوز مسیر واقعی «مرورگر ← `/app/` ← `/v1/`» روی هاست تأیید نشده است.

#### اصلاح پیشنهادی

1. نصب‌کنندهٔ `admin/deploy-app.php` یا نصب دستی zip بررسی شود.
2. اگر HTTP 500 می‌دهد، لاگ خطای PHP و وجود `ZipArchive`، `curl` یا `allow_url_fopen` بررسی شود.
3. بعد از نصب، این مسیرها تست شوند:
   - `/app/`
   - `/app/settings`
   - `/app/manifest.webmanifest`
   - `/app/sw.js`
4. فعال‌سازی با کد staging از مرورگر واقعی انجام شود.
5. بعد از موفقیت، فایل نصب‌کننده از webroot حذف شود.

---

## 5. یافته‌های امنیتی با اولویت بالا

### P1-1. راستی‌آزمایی توکن در کلاینت `iss` و `aud` را کنترل نمی‌کند

**شدت:** بالا  
**فایل‌ها:** `src/core/license/server/token.ts:111-131`، `src/core/license/server/api.ts:106-119`

کلاینت این موارد را بررسی می‌کند:

- قالب `HY2`
- `alg = EdDSA`
- `typ = hesabyar-license`
- `kid`
- `env`
- `product`
- `device_key_id`
- امضا
- `exp/nbf/iat`

اما `claims.iss` و `claims.aud` فقط از نظر رشتهٔ غیرخالی بررسی می‌شوند، نه از نظر مقدار مورد انتظار. در مقابل، `verify.php:131-137` هر دو را با `KAREN_ISSUER` و `KAREN_AUDIENCE` مقایسه می‌کند.

#### اثر

اگر پاسخ API اشتباه، جعلی یا متعلق به سرویس دیگری باشد و کلید عمومی همراه پاسخ پذیرفته شود، کلاینت ممکن است توکنی با issuer/audience نامعتبر را بپذیرد. TLS ریسک را کم می‌کند، اما برای محصول حرفه‌ای کافی نیست.

#### اصلاح پیشنهادی

- در `ServerLicenseConfig` مقادیر مورد انتظار `issuer` و `audience` اضافه شود.
- در `verifyLicenseToken` بررسی شود:

```ts
if (claims.iss !== options.issuer) invalid();
if (claims.aud !== options.audience) invalid();
```

- برای staging/production، کلید عمومی issuer از build/env پین شود و اگر وجود نداشت، بیلد یا فعال‌سازی fail closed شود.
- تست‌های جدید برای issuer اشتباه، audience اشتباه و کلید پین‌شدهٔ ناسازگار اضافه شود.

---

### P1-2. کلید عمومی issuer به‌صورت اختیاری/TOFU پذیرفته می‌شود

**شدت:** بالا  
**فایل‌ها:** `src/core/license/server/config.ts:23-24`، `src/core/license/server/api.ts:106-114`، `scripts/build-staging-web.mjs:11-16`

`VITE_LICENSE_ISSUER_PUBLIC_KEY` اختیاری است و در بیلد staging ست نمی‌شود. در نتیجه کلید عمومی از پاسخ سرور یا IndexedDB پذیرفته می‌شود.

#### اثر

- چرخش کلید یا پاسخ ناسازگار می‌تواند بی‌صدا پذیرفته شود.
- اگر مسیر پاسخ مخدوش شود، کلید مهاجم می‌تواند جایگزین شود.
- کلاینت به جای «اعمال از پیش تعریف‌شده»، به اولین پاسخ اعتماد می‌کند.

#### اصلاح پیشنهادی

- برای بیلد staging و production، کلید عمومی issuer الزامی شود.
- `build-staging-web.mjs` باید نبود کلید عمومی را خطای build بداند.
- در زمان refresh، کلید عمومی پاسخ با کلید پین‌شده مقایسه شود.
- رویهٔ رسمی key rotation تعریف شود: kid جدید، دورهٔ گذار، به‌روزرسانی بیلد، سپس حذف kid قدیمی.

---

### P1-3. PIN فعلی محافظت واقعی از داده نیست

**شدت:** بالا برای محرمانگی دادهٔ مالی  
**فایل‌ها:** `src/core/utils/pin.ts:5-26`، `src/store/settings-store.ts:24-25`، `src/store/lock-store.ts:7-15`، `src/components/LockScreen.tsx:27-45`

مشکلات:

1. PIN با `SHA-256(PIN_SALT + pin)` هش می‌شود.
2. salt ثابت و عمومی است.
3. هیچ KDF کند مثل PBKDF2/Argon2id وجود ندارد.
4. محدودیت تلاش مؤثر وجود ندارد؛ شمارندهٔ `attempts` فقط برای انیمیشن است.
5. قفل فقط UI را می‌بندد؛ داده‌های IndexedDB همچنان قابل خواندن‌اند.
6. `localStorage` و IndexedDB توسط هر JS هم‌مبدأ یا دسترسی فیزیکی/مرورگر قابل بررسی‌اند.

#### اثر

PIN چهار تا دوازده رقمی در برابر حملهٔ آفلاین بسیار ضعیف است. اگر دستگاه یا مرورگر در دسترس باشد، دادهٔ مالی با قفل فعلی محافظت نمی‌شود.

#### اصلاح پیشنهادی

حداقل:

- استفاده از PBKDF2 با salt تصادفی per-user و iteration بالا، یا Argon2id در صورت امکان.
- قالب نسخه‌دار مثل `pin:v2:pbkdf2:600000:salt:hash`.
- migration خودکار هش قدیمی پس از ورود موفق.
- تأخیر/قفل موقت پس از تلاش ناموفق.

برای محصول حرفه‌ای:

- رمزنگاری داده‌ها با AES-GCM.
- کلید داده از PIN/passphrase مشتق شود.
- در حالت قفل، کلید در حافظه نماند.
- پشتیبان‌ها نیز رمزنگاری شوند.
- تغییر PIN بدون از دست دادن داده انجام شود.

این یک refactor مرحله‌ای است و نباید بدون تست migration روی دادهٔ واقعی انجام شود.

---

### P1-4. داده‌ها و پشتیبان‌ها رمزنگاری نشده‌اند

**شدت:** بالا  
**فایل‌ها:** `src/core/db/db.ts`، `src/core/db/backup.ts:56-70,140-147`

داده‌های مالی، مشتریان، کارکنان و فاکتورها در IndexedDB به‌صورت plaintext ذخیره می‌شوند. خروجی پشتیبان نیز JSON خوانا است.

#### اثر

- دسترسی به دستگاه، پروفایل مرورگر، یا فایل پشتیبان = دسترسی به داده.
- اشتراک‌گذاری ناخواستهٔ فایل backup می‌تواند افشای اطلاعات مالی باشد.

#### اصلاح پیشنهادی

- تعریف threat model: محافظت در برابر دستگاه مشترک، گم‌شدن دستگاه، XSS، یا سرور؟
- اگر هدف محافظت در برابر دسترسی محلی است، رمزنگاری at-rest لازم است.
- فایل پشتیبان باید فرمت رمزنگاری‌شده داشته باشد، مثلاً:
  - `karenyar-encrypted-backup`
  - version
  - KDF parameters
  - salt
  - nonce
  - ciphertext
- کلید لایسنس و کلید دستگاه همچنان از backup حذف شوند؛ رفتار فعلی خوب است.

---

### P1-5. آسیب‌پذیری وابستگی‌های production

**شدت:** بالا/بحرانی بر اساس advisory، با exploitability متفاوت در کد فعلی  
**منبع:** `npm audit --omit=dev`

| بسته               |          نسخهٔ فعلی | شدت      | مسیر اصلاح پیشنهادی           |
| ------------------ | ------------------: | -------- | ----------------------------- |
| `jspdf`            |               2.5.2 | critical | ارتقا به 4.2.1 یا جدیدتر      |
| `dompurify`        | 2.5.9 از طریق jspdf | high     | با ارتقای jspdf به نسخهٔ سالم |
| `zod`              |             3.25.76 | high     | ارتقا به 4.6.7 یا جدیدتر      |
| `react-router-dom` |              6.30.6 | moderate | ارتقا به 7.18.5 یا جدیدتر     |
| `react-router`     |              وابسته | moderate | همراه react-router-dom        |

#### بررسی exploitability

- کد PDF فعلی در `src/core/utils/pdf.ts` از `html2canvas` و `pdf.addImage` استفاده می‌کند، نه `pdf.html()`، `addJS` یا AcroForm. بنابراین بعضی advisoryهای jsPDF در مسیر فعلی مستقیماً فعال نیستند، اما ریسک کتابخانهٔ قدیمی همچنان بالاست.
- `zod` برای اعتبارسنجی فرم‌ها استفاده می‌شود؛ advisory فعلی بیشتر DoS حافظه‌ای است، نه سرقت داده.
- React Router advisoryها شامل open redirect و SSR hydration هستند؛ اپ فعل SSR ندارد و لینک‌ها عمدتاً داخلی‌اند، ولی ارتقا همچنان لازم است.

#### اصلاح پیشنهادی

- ارتقای جداگانه و تست‌شده:
  1. `jspdf` و تست خروجی PDF فارسی/RTL.
  2. `zod` و تست تمام schemaها.
  3. `react-router-dom` و تست مسیرها، basename، lazy loading و PWA.
- افزودن `npm audit --omit=dev --audit-level=high` به CI.
- فعال‌سازی Dependabot/Renovate.

---

## 6. یافته‌های با اولویت متوسط

### P2-1. اعتبارسنجی backup فقط ساختار آرایه‌ها را بررسی می‌کند

**فایل:** `src/core/db/backup.ts:73-106`

`validateBackup` بررسی می‌کند که هر جدول آرایه باشد، اما محتوای ردیف‌ها را اعتبارسنجی نمی‌کند.

#### اثر

- فایل مخرب یا خراب می‌تواند دادهٔ نامعتبر وارد IndexedDB کند.
- ممکن است UI بعداً crash کند یا محاسبات مالی اشتباه شوند.
- محدودیت اندازه/تعداد ردیف قبل از `file.text()` و `JSON.parse` وجود ندارد.

#### اصلاح پیشنهادی

- schema برای هر جدول با Zod یا validator مشابه.
- محدودیت اندازهٔ فایل، تعداد ردیف و طول رشته‌ها.
- بررسی روابط: `invoiceItems.invoiceId`، `stockMovements.productId`، `customerPayments.customerId` و غیره.
- پیش‌نمایش قبل از جایگزینی کامل داده.
- حفظ رفتار اتمیک فعلی که خوب است.

---

### P2-2. لغو لایسنس فقط از مسیر refresh منتقل می‌شود

**فایل‌ها:** `src/hooks/use-license-sync.ts:9-28`، `src/store/license-store.ts:292-346`، `deploy/cpanel-staging/v1/verify.php`

کلاینت React endpoint `verify.php` را صدا نمی‌زند. بررسی دوره‌ای هر 6 ساعت و throttle ده دقیقه‌ای است. توکن‌ها تا 7 روز اعتبار دارند.

#### اثر

لغو دستگاه/لایسنس ممکن است با تأخیر دیده شود. این با معماری offline-first قابل توجیه است، ولی باید آگاهانه انتخاب شود.

#### اصلاح پیشنهادی

- هنگام آنلاین‌شدن، startup و عملیات حساس، `verify.php` یا refresh سریع‌تر انجام شود.
- TTL توکن به 24 ساعت کاهش یابد، اگر تجربهٔ آفلاین اجازه می‌دهد.
- پیام وضعیت برای کاربر شفاف باشد.
- دسترسی به داده و خروجی گرفتن همچنان باز بماند؛ رفتار فعلی درست است.

---

### P2-3. ترتیب قفل‌ها در activation و refresh متفاوت است

**فایل‌ها:**

- `activations.php:105-150`: ابتدا license، سپس device.
- `refresh.php:130-155`: ابتدا device join license، با `FOR UPDATE`.

#### اثر

در بار همزمان، احتمال deadlock یا انتظار طولانی وجود دارد. همچنین `refresh.php:178` پاک‌سازی nonce را داخل هر تراکنش انجام می‌دهد:

```sql
DELETE FROM device_refresh_nonces WHERE expires_at < UTC_TIMESTAMP() LIMIT 100
```

این کار می‌تواند contention را بیشتر کند.

#### اصلاح پیشنهادی

- ترتیب قفل ثابت: همیشه license سپس device.
- در refresh، ابتدا license_id دستگاه خوانده شود، سپس license قفل شود، سپس device.
- پاک‌سازی nonce به cron یا پاک‌سازی probabilistic خارج از تراکنش منتقل شود.
- ایندکس `expires_at` موجود است و خوب است.

---

### P2-4. هدرهای امنیتی وب‌اپ کامل نیستند

**فایل‌ها:** `deploy/cpanel-staging/app.htaccess`، `public/.htaccess`

موارد موجود:

- `X-Content-Type-Options: nosniff` در app.htaccess
- `Referrer-Policy`
- `Permissions-Policy`
- `X-Robots-Tag`
- Cache-Control برای shell/SW/manifest

موارد غایب:

- `Content-Security-Policy`
- `Strict-Transport-Security`
- `X-Frame-Options` یا `frame-ancestors`
- `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy` در صورت نیاز

#### اصلاح پیشنهادی

برای `/app/` حداقل:

```apache
Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
Header always set X-Frame-Options "DENY"
Header always set Strict-Transport-Security "max-age=300; includeSubDomains"
```

HSTS باید ابتدا با max-age کوتاه تست شود و فقط وقتی همهٔ زیردامنه‌ها HTTPS سالم دارند `includeSubDomains` اضافه شود. `preload` بدون تصمیم بلندمدت فعال نشود.

CSP نهایی باید با نیاز واقعی اپ تست شود؛ اگر inline style/script لازم است، به‌جای `unsafe-inline` گسترده از nonce/hash یا refactor استفاده شود.

---

### P2-5. Service Worker باید صریحاً API/admin را مستثنا کند

**فایل:** `vite.config.ts:25-26`

```ts
navigateFallback: `${base}index.html`,
navigateFallbackDenylist: [/^\/api\//],
```

در استقرار فعلی، scope وب‌اپ `/app/` است و `/v1/` و `/admin/` خارج از آن‌اند؛ بنابراین ریسک فوری interception ندارند. اما denylist فقط `/api/` را مستثنا کرده و برای تغییرات آینده دفاع کافی نیست.

#### اصلاح پیشنهادی

```ts
navigateFallbackDenylist: [/^\/api\//, /^\/v1\//, /^\/admin\//],
```

همچنین runtime caching برای imageها نباید پاسخ‌های authenticated یا API را کش کند. در scope فعلی مشکل جدی دیده نشد، ولی تست باید اضافه شود.

---

### P2-6. صفحات تست و نصب‌کننده باید از webroot حذف شوند

**فایل‌ها:** `deploy/cpanel-staging/*test.php`، `admin/deploy-app.php`، `admin/upgrade-admin.php`

برخی صفحات تست فقط با `confirm` query string محافظت می‌شوند، نه احراز هویت ادمین. نصب‌کننده‌ها احراز هویت، CSRF، rate limit و SHA-256 دارند که خوب است، ولی نباید دائمی روی هاست بمانند.

#### اصلاح پیشنهادی

- پس از تأیید staging، تمام صفحات تست و installer از webroot حذف شوند.
- در مخزن می‌توانند تحت `deploy/` بمانند، ولی بستهٔ استقرار نباید آن‌ها را در مسیر عمومی قرار دهد.
- برای جلوگیری از اشتباه، یک اسکریپت packaging بسازد که فقط فایل‌های لازم را در zip قرار دهد.

---

### P2-7. CI فاقد دروازه‌های کیفیت/امنیت است

**فایل‌ها:** `.github/workflows/pages.yml`، `.github/workflows/android.yml`، `.github/workflows/admin-android.yml`

ورک‌فلوی Pages فقط build می‌کند. تست، lint، typecheck و audit در CI اجرا نمی‌شوند.

#### اصلاح پیشنهادی

یک workflow مستقل برای PR و push:

```yaml
- npm ci
- npm run typecheck
- npm run lint
- npm test
- npm run build
- npm audit --omit=dev --audit-level=high
```

و در مرحلهٔ بعد:

- Playwright E2E روی Chromium و mobile viewport.
- تست قرارداد لایسنس با mock server یا staging ایزوله.
- pin کردن اکشن‌ها به SHA یا نسخه‌های جدید پایدار.
- مهاجرت از Node 20/actionهای deprecated به نسخه‌های پشتیبانی‌شده.

---

## 7. یافته‌های پنل ادمین و PR #13

PR #13 هنوز open است و فایل‌های داشبورد جدید روی شاخهٔ فعلی نیستند، اما از ref همان PR بررسی شدند.

### نکات مثبت

- احراز هویت با Directory Privacy و `REMOTE_USER`.
- session cookie با `secure`, `httponly`, `SameSite=Strict`.
- CSRF برای عملیات POST.
- rate limit برای صدور لایسنس و عملیات ادمین.
- PRG پس از POST.
- CSP در `index.php` و `issue-license.php` جدید:
  - `default-src 'none'`
  - `script-src 'self' 'nonce-...'`
  - `style-src 'self'`
  - `frame-ancestors 'none'`
- Service worker فقط assetهای static را کش می‌کند و صفحات PHP authenticated را کش نمی‌کند.
- خروجی HTML با `htmlspecialchars` محافظت می‌شود.
- `innerHTML` در admin.js فقط برای SVGهای ثابت داخلی استفاده شده، نه دادهٔ کاربر.

### ریسک‌ها

1. **PWA پشت Directory Privacy** ممکن است در Chrome/Android هنگام fetch کردن `manifest.json` یا `sw.js` با 401 مواجه شود و نصب PWA شکست بخورد. APK جداگانه این مشکل را ندارد.
2. نصب‌کنندهٔ `upgrade-admin.php` باید بعد از موفقیت حذف شود.
3. CSP فعلی خوب است، ولی باید روی هاست واقعی تست شود که فونت/آیکون/manifest/SW بدون خطا load شوند.
4. لاگ ادمین بهتر است شامل actor، action، target، IP hash و زمان باشد؛ `license_events` برای رویدادهای لایسنس خوب است، ولی ورود/صدور/تغییر ادمین نیز باید قابل ردیابی باشد.

---

## 8. نکات مثبت امنیتی که باید حفظ شوند

- کلید خصوصی issuer فقط سمت سرور است.
- توکن‌ها با Ed25519 امضا می‌شوند.
- کلید خصوصی دستگاه در WebCrypto non-extractable ساخته می‌شود.
- جدول license در backup خروجی نمی‌آید.
- پاسخ‌های لایسنس `Cache-Control: no-store` دارند.
- کلاینت لایسنس cookie ارسال نمی‌کند: `credentials: 'omit'`.
- CORS فقط origin دقیق staging را می‌پذیرد.
- rate limit برای activation/refresh/verify/admin وجود دارد.
- nonce ضد replay برای refresh وجود دارد.
- prepared statement و transaction در PHP استفاده شده است.
- انقضا/لغو لایسنس دادهٔ کاربر را پاک نمی‌کند و backup/PDF را پس از اولین فعال‌سازی باز نگه می‌دارد.
- در `src/` استفادهٔ خطرناک `dangerouslySetInnerHTML`، `eval` یا `new Function` دیده نشد.
- تست‌های واحد فعلی سبز هستند و هستهٔ محاسباتی پوشش خوبی دارد.

---

## 9. مواردی که هنوز تأیید نشده‌اند

- نسخهٔ دقیق PHP روی هاست و فعال بودن `sodium`، `ZipArchive`، `curl`، `allow_url_fopen`.
- محتوای `bootstrap.php` و پیاده‌سازی دقیق `karen_rate_limit`، `karen_client_ip_hash`، `karen_read_json` و `karen_b64url_decode`.
- هدرهای واقعی HTTP/TLS روی هاست.
- نصب موفق `/app/` و فعال‌سازی واقعی از مرورگر.
- رفتار PWA ادمین پشت Directory Privacy روی Chrome Android.
- اجرای E2E روی staging.
- cron، backup خودکار، restore test و مانیتورینگ.
- امضای release.keystore برای APK ادمین؛ نسخهٔ فعلی debug-signed است.
- سیاست production برای issuer key rotation و device recovery.

---

## 10. نقشهٔ راه پیشنهادی برای وب‌اپ حرفه‌ای

### فاز ۱ — رفع انسداد یکپارچگی

1. اصلاح `base64url` در activation و refresh.
2. افزودن تست قرارداد با کلید/امضای واقعی WebCrypto.
3. پین کردن issuer public key و بررسی `iss/aud`.
4. نصب/تأیید `/app/` روی staging.
5. اجرای سناریوی کامل:
   - فعال‌سازی
   - refresh
   - verify
   - لغو دستگاه
   - لغو لایسنس
   - سقف دستگاه
   - حالت آفلاین
6. حذف صفحات تست/installer پس از موفقیت.

### فاز ۲ — سخت‌سازی امنیتی

1. ارتقای `jspdf`، `zod`، `react-router-dom`.
2. افزودن CSP/HSTS/X-Frame-Options.
3. اعتبارسنجی عمیق backup و محدودیت اندازه.
4. مهاجرت PIN به KDF کند و سپس برنامهٔ رمزنگاری داده.
5. CI با typecheck/lint/test/audit/e2e.
6. مانیتورینگ خطا و uptime.

### فاز ۳ — محصول حرفه‌ای

اگر هدف فقط لایسنس است، معماری فعلی کافی است. اگر هدف «وب‌اپ حرفه‌ای چنددستگاهی/حساب کاربری» است، این موارد نیز لازم‌اند:

- حساب کاربری و نشست امن.
- sync رمزنگاری‌شدهٔ end-to-end یا حداقل server-side encryption.
- کنترل دسترسی و audit log.
- backup/restore خودکار و تست‌شده.
- مدیریت نسخه، rollback و release channel.
- صفحهٔ وضعیت، خطاهای قابل ردیابی و پشتیبانی.
- سیاست حفظ حریم خصوصی و شرایط استفاده.
- تست بار و rate limit واقعی.
- امضای release برای APK و انتشار کنترل‌شده.

---

## 11. اولویت اجرای پیشنهادی

| اولویت | اقدام                         | دلیل                                      |
| ------ | ----------------------------- | ----------------------------------------- |
| 1      | اصلاح base64url               | بدون آن فعال‌سازی/تمدید واقعی کار نمی‌کند |
| 2      | نصب و تست `/app/`             | integration هنوز end-to-end تأیید نشده    |
| 3      | issuer pinning + iss/aud      | اعتماد توکن باید صریح باشد                |
| 4      | ارتقای وابستگی‌های production | advisoryهای critical/high                 |
| 5      | CSP/HSTS و حذف صفحات تست      | کاهش سطح حمله                             |
| 6      | اعتبارسنجی backup             | جلوگیری از ورود دادهٔ خراب/مخرب           |
| 7      | PIN KDF و رمزنگاری داده       | محافظت واقعی از اطلاعات مالی              |
| 8      | CI و E2E                      | جلوگیری از regression                     |

---

## 12. نتیجهٔ نهایی

بک‌اند لایسنس از نظر معماری امنیتی پایه‌های درستی دارد، اما **ارتباط واقعی وب‌اپ با آن هنوز کامل و تأییدشده نیست**. مهم‌ترین مانع فنی، ناسازگاری `base64url` است که با تست واقعی اثبات شد. مهم‌ترین مانع محصولی، نبود رمزنگاری داده و محافظت واقعی PIN است.

برای تبدیل به وب‌اپ حرفه‌ای، ابتدا باید فاز ۱ انجام شود تا staging واقعاً کار کند؛ سپس سخت‌سازی امنیتی و CI؛ و بعد تصمیم دربارهٔ حساب کاربری/sync/رمزنگاری گرفته شود. تولید نباید تا پیش از تأیید staging و رفع P0/P1ها تغییر کند.
