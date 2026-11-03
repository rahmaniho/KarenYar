# گزارش نهایی اصلاح و بازطراحی ماژول فاکتور

تاریخ: 2026-11-03  
مخزن: `rahmaniho/KarenYar` — شاخهٔ `arena/d20029d0-karenyar`  
هدف اعلام‌شده: `Hesabyar.karen-soft.ir`

> این تحویل بر پایهٔ ممیزی کد موجود انجام شده است. به سایت عملیاتی، پایگاه دادهٔ کاربران واقعی یا زیرساخت استقرار دسترسی نداشته‌ایم و هیچ دادهٔ تولیدی خوانده، تغییر یا پاک نشده است. استقرار انجام نشده است.

---

## 1. خلاصهٔ مدیریتی

ماژول فاکتور از نظر هستهٔ مالی، چرخهٔ پیش‌نویس/صدور، دریافت و برگشت وجه، ابطال، پشتیبان‌گیری، چاپ/PDF، فهرست عملیاتی و داشبورد اصلاح شد. محاسبات پول از float پراکنده به حساب دقیق BigInt با مقیاس ۱٬۰۰۰٬۰۰۰ و گرد کردن half-up منتقل شد. مبلغ داخلی همهٔ اسناد «تومان عدد صحیح» است و ریال فقط نمایش/ورودی است؛ تغییر واحد تنظیمات مبلغ سند را عوض نمی‌کند.

نتیجهٔ آزمون نهایی:

| بررسی                                      | نتیجه                       |
| ------------------------------------------ | --------------------------- |
| TypeScript                                 | exit 0                      |
| ESLint با `--max-warnings 0`               | exit 0                      |
| Unit/Integration (Vitest + fake-indexeddb) | **42 فایل، 312 آزمون موفق** |
| E2E (Playwright، Chromium + Pixel 7)       | **30 آزمون موفق**           |
| Build تولیدی Vite/PWA                      | exit 0                      |

خروجی خام در `docs/invoices/audit/` ذخیره شده است.

---

## 2. ممیزی اولیه و اولویت‌بندی

شرح کامل در `initial-audit.md` است. یافته‌های اصلی:

| کد     | شدت    | یافته                                                         | وضعیت نهایی                                                     |
| ------ | ------ | ------------------------------------------------------------- | --------------------------------------------------------------- |
| INV-01 | بحرانی | تبدیل/نمایش ناهماهنگ تومان/ریال بین فرم، فهرست، چاپ و داشبورد | اصلاح در هستهٔ فاکتور؛ POS/StoreReports هنوز helper قدیمی دارند |
| INV-02 | بحرانی | خطای float در تخفیف/مالیات/جمع‌ها                             | اصلاح با BigInt و آزمون‌های مرزی                                |
| INV-03 | بالا   | نبود پیش‌نویس رسمی، ویرایش و کپی مستقل                        | اصلاح: draft/issue/edit/copy/discard                            |
| INV-04 | بحرانی | دریافت/پرداخت بدون idempotency و بدون برگشت وجه/اصلاح         | اصلاح: payment/refund/reversal + کلید یکتا                      |
| INV-05 | بالا   | ابطال و وضعیت‌ها با محاسبات مالی/داشبورد ناسازگار             | اصلاح: ابطال حفظ سابقه، پیش‌نویس خارج از فروش                   |
| INV-06 | بالا   | پشتیبان‌گیری بدون رویداد مالی/کلید پرداخت و اعتبارسنجی روابط  | اصلاح: backup v3 + validation + import اتمی                     |
| INV-07 | متوسط  | دادهٔ نمایشی ممکن بود در build عملیاتی فعال شود               | اصلاح: guard فقط DEV + آزمون                                    |
| INV-08 | متوسط  | داشبورد/گزارش‌ها با بازه و مقایسهٔ نادرست                     | اصلاح داشبورد؛ StoreReportsPage بازطراحی نشده                   |
| INV-09 | متوسط  | فهرست فاکتور بدون مرکز عملیاتی/فیلتر مبلغ/URL                 | اصلاح: IssuedInvoicesPage                                       |
| INV-10 | بالا   | چاپ و PDF با فرم/جزئیات ناهماهنگ                              | اصلاح: parity چاپ/PDF                                           |
| INV-11 | متوسط  | صورت‌حساب مشتری برگشت وجه را نمی‌دید؛ نوشتن مستقیم پرداخت     | اصلاح: statement refund-aware + service دریافت مشتری            |
| INV-12 | متوسط  | CSV در برابر formula injection محافظت نداشت                   | اصلاح                                                           |
| INV-13 | پایین  | ورودی تاریخ/مبلغ خطا را پنهان می‌کرد                          | اصلاح: aria-invalid، جلوگیری از ثبت مقدار نامعتبر               |
| INV-14 | متوسط  | مهاجرت/backup بدون آزمون v3→v4                                | اصلاح و آزمون                                                   |
| INV-15 | پایین  | ناوبری تکراری فاکتور/فروش‌ها                                  | اصلاح: یک ورودی «فاکتورها» + redirect مسیر قدیمی                |

---

## 3. اصلاحات مالی و دامنه

### 3.1 پول دقیق

فایل‌های جدید:

- `src/core/currency/money.ts`
- `src/features/store/invoice-calc.ts`

قواعد:

- مقیاس داخلی پول: `1_000_000` واحد BigInt برای هر تومان.
- `assertMoney`: فقط عدد صحیح، محدود و ایمن تومان را می‌پذیرد.
- `quantityAmount` و `percentageAmount`: ضرب/درصد بدون float میانی.
- گرد کردن: half-up در خروجی تومان.
- تخفیف سطری قبل از جمع کل؛ تخفیف کلی بعد از جمع سطرها و قبل از مالیات؛ حمل/سایر هزینه‌ها بعد از مالیات و بدون مالیات.
- تخفیف کلی با `allocateInvoiceDiscount` به‌صورت exact و largest-remainder بین سطرها توزیع می‌شود تا جمع تخفیف‌های تخصیص‌یافته دقیقاً برابر تخفیف کل باشد.
- ورودی ریال باید مضرب ۱۰ باشد؛ کسر ریال رد می‌شود.
- تغییر `currencyUnit` فقط نمایش/ورودی را عوض می‌کند، نه مبلغ ذخیره‌شده.

### 3.2 چرخهٔ سند

فایل‌ها:

- `src/features/store/invoice.service.ts`
- `src/features/store/invoice-domain.ts`
- `src/store/invoice-editor-store.ts`
- `src/features/store/NewInvoicePage.tsx`

رفتار:

- پیش‌نویس شماره رزرو می‌کند ولی موجودی/درآمد/آمار فروش را تغییر نمی‌دهد.
- صدور = ذخیره + issue در یک تراکنش؛ شماره و اقلام و snapshot حفظ می‌شوند.
- ویرایش پیش‌نویس با `revision` خوش‌بینانه؛ تداخل هم‌زمان پیام روشن می‌دهد.
- کپی سند، کلید و شمارهٔ جدید می‌سازد و پرداخت‌ها را کپی نمی‌کند.
- حذف پیش‌نویس رویداد `draft_discarded` ثبت می‌کند.
- بازیابی خودکار فرم (`hesabyar-invoice-editor`) فقط پیش‌نویس محلی مرورگر است و «پیش‌نویس حسابداری» محسوب نمی‌شود.
- `issueInvoice` در تلاش مجددِ همان درخواست، اگر سند صادر شده و revision دقیقاً یک واحد جلو رفته باشد، همان id را برمی‌گرداند.

### 3.3 دریافت، برگشت وجه و اصلاح

فایل‌ها:

- `src/features/store/invoice-payment.service.ts`
- `src/features/store/customer-payment.service.ts`
- `src/features/store/use-attempt-key.ts`
- `src/features/store/InvoicePaymentDialog.tsx`

رفتار:

- `kind: 'payment' | 'refund'`؛ مبالغ همیشه مثبت.
- خالص دریافت = پرداخت‌ها − برگشت‌ها.
- پیش‌نویس/باطل‌شده دریافت/برگشت تاریخی را نگه می‌دارند ولی `paid/remaining` عملیاتی صفر است.
- دریافت عادی روی فاکتور تسویه‌شده/باطل‌شده/پیش‌نویس مجاز نیست.
- برگشت وجه فقط تا خالص دریافت‌شده و فقط روی سند نسیه یا باطل‌شده.
- اصلاح/حذف پرداخت، سند معکوس (`reversalOf`) می‌سازد؛ سابقه پاک نمی‌شود.
- `paymentKey` یکتا + `requestSignature`؛ استفادهٔ مجدد با محتوای متفاوت خطا می‌دهد.
- `useAttemptKey` برای payload یکسان، کلید را بین کلیک‌های مجدد ثابت نگه می‌دارد.
- دریافت عمومی مشتری هم از مسیر service با رویداد مالی انجام می‌شود، نه `db.customerPayments.add` مستقیم در UI.

### 3.4 ابطال و یکپارچگی انبار/درآمد

- ابطال، فاکتور و اقلام را حفظ می‌کند؛ موجودی و درآمد فروش را در همان تراکنش اصلاح می‌کند.
- دریافت‌های قبلی پاک نمی‌شوند؛ اگر خالص دریافت مثبت باشد، دیالوگ ابطال هشدار و تأیید صریح می‌خواهد.
- `checkoutKey` از فروش تکراری جلوگیری می‌کند؛ سبد معلق فقط پس از فروش موفق پاک می‌شود.
- پیش‌نویس‌ها از آمار فروش فعال و دریافتنی‌های عملیاتی خارج‌اند.

---

## 4. پایگاه داده، پشتیبان‌گیری و مهاجرت

فایل‌ها:

- `src/core/db/db.ts` — Dexie **v4**
- `src/core/db/backup.ts` — backup **v3**
- `src/core/db/migration.test.ts`
- `src/core/db/backup.test.ts`
- `src/core/db/seed.ts` / `seed.test.ts`

تغییرات افزایشی:

- جدول `financialEvents` برای رویدادهای مالی سند/پرداخت/مشتری.
- ایندکس‌های `customerPayments`: `kind`, `&paymentKey`, `[invoiceId+date]`.
- فیلدهای اختیاری پیش‌نویس/شرایط/یادداشت داخلی/snapshot/revision/issuedAt/shipping/other روی فاکتور.
- فیلدهای `unit`, `discountType`, `discountValue` روی قلم.
- `FinancialEvent.invoiceId` اختیاری شد تا دریافت عمومی مشتری بدون فاکتور هم رویداد داشته باشد؛ `customerId` و `paymentKey` اختیاری اضافه شد.

مهاجرت v3→v4:

- پرداخت‌های قدیمی بدون کلید حفظ می‌شوند.
- جدول رویداد مالی خالی ساخته می‌شود.
- هیچ دادهٔ کاربری پاک یا بازنویسی نمی‌شود.

پشتیبان‌گیری v3:

- قبل از import، روابط فاکتور/قلم/پرداخت/درآمد/رویداد اعتبارسنجی می‌شود.
- کلید پرداخت تکراری و رویداد یتیم رد می‌شود.
- import در تراکنش اتمی انجام می‌شود.
- نسخهٔ backup از 2 به 3 افزایش یافت؛ نسخهٔ قدیمی برنامه نمی‌تواند backup v3 را باز کند. راهنمای rollback در `migration-rollback.md` است.

---

## 5. رابط کاربری و ناوبری

فایل‌های اصلی:

- `NewInvoicePage.tsx`
- `IssuedInvoicesPage.tsx`
- `InvoiceViewPage.tsx`
- `InvoiceDashboardPage.tsx`
- `InvoicePaymentDialog.tsx`
- `VoidInvoiceDialog.tsx`
- `InvoiceMoneyInput.tsx`
- `CustomersPage.tsx`
- `src/app/router.tsx`
- `src/layouts/nav-items.ts`
- `src/components/AmountInput.tsx`
- `src/components/JalaliDateInput.tsx`

تحویل‌ها:

- فرم فاکتور RTL با قلم دستی/کالایی، تخفیف سطری/کلی، مالیات از تنظیمات، حمل/سایر، یادداشت داخلی و شرایط پرداخت.
- ورودی مبلغ واحد-آگاه؛ ورودی نامعتبر هم خطای قابل مشاهده می‌دهد و هم دکمهٔ ثبت/افزودن را غیرفعال می‌کند.
- فهرست عملیاتی با جست‌وجو، وضعیت، روش پرداخت، بازهٔ مبلغ، مرتب‌سازی، صفحه‌بندی، انتخاب گروهی، چاپ گروهی و CSV.
- فیلترها در URL می‌مانند؛ ورودی مبلغ نامعتبر خطای inline دارد.
- مسیر قدیمی `/store/invoices` به `/store/invoices/issued` redirect می‌شود؛ مسیر ویرایش `/store/invoices/:id/edit` اضافه شد.
- ناوبری یک ورودی «فاکتورها» دارد؛ صفحهٔ قدیمی `InvoicesPage.tsx` حذف نشده ولی دیگر route فعال ندارد.
- داشبورد فقط دادهٔ واقعی را نشان می‌دهد؛ مقایسه فقط وقتی بازهٔ قبل موجود/معنادار باشد فعال است.
- دادهٔ نمایشی فقط در DEV و از تنظیمات قابل تولید است؛ در build عملیاتی guard دارد.

---

## 6. چاپ و PDF

فایل‌ها:

- `InvoicePrintDocument.tsx`
- `invoice-pdf.ts`
- `InvoiceViewPage.tsx`

هماهنگی چاپ/PDF:

- وضعیت چرخهٔ سند، واترمارک پیش‌نویس، بنر ابطال.
- اطلاعات خریدار از snapshot سند.
- تخفیف سطری + تخفیف کلی تخصیص‌یافته و جمع خالص هر ردیف.
- حمل/سایر هزینه‌ها، مالیات، دریافت‌شده/برگشت‌شده/مانده.
- تعداد تا ۶ رقم اعشار.
- شرایط پرداخت و یادداشت عمومی؛ یادداشت داخلی در چاپ/PDF نمی‌آید.
- PDF برداری فقط هنگام درخواست بارگذاری می‌شود (`import('./invoice-pdf')`) تا فهرست/جزئیات اولیه سبک بماند.
- آزمون E2E، PDF چندصفحه‌ای با ۱۲۰ ردیف را واقعاً تولید و با `pdf-lib` باز می‌کند.

---

## 7. امنیت و خطاها

- جلوگیری از CSV formula injection در `src/core/utils/csv.ts`.
- غیرفعال‌سازی seed در build عملیاتی.
- اعتبارسنجی روابط backup قبل از پاک‌سازی/وارد کردن.
- خطاهای مالی/تراکنش به کاربر نشان داده می‌شود؛ مقدار پیش‌فرض غیرواقعی جای خطا نمی‌نشیند.
- ورودی تاریخ/مبلغ نامعتبر با `aria-invalid` و مسدودسازی ثبت.
- این برنامه backend/API فاکتور ندارد؛ بنابراین RBAC سمت سرور، امضای دیجیتال، sync چنددستگاهی و audit log سمت سرور در این تحویل اضافه نشده است. کنترل دسترسی موجود برنامه (لایسنس/PIN) حفظ شده است.

---

## 8. آزمون‌ها

### 8.1 دستورات

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

در این sandbox برای Playwright از Chromium نصب‌شده با `@sparticuz/chromium` و کتابخانه‌های استخراج‌شده استفاده شد:

```bash
LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
npm run test:e2e -- --workers=2
```

این مسیرها مخصوص sandbox هستند و به مخزن اضافه نشده‌اند. در محیط عادی، `npx playwright install chromium` کافی است.

### 8.2 پوشش سناریوهای مالی

| سناریو                              | پوشش                  |
| ----------------------------------- | --------------------- |
| بدون تخفیف/مالیات                   | unit + E2E            |
| تخفیف درصدی/مبلغی سطری و کلی        | unit exact allocation |
| چند قلم و تکرار یک کالا             | unit rollback/stock   |
| مالیات ترکیبی با تخفیف              | unit order/rounding   |
| دریافت کامل/جزئی/چندمرحله‌ای        | unit + E2E            |
| جلوگیری از پرداخت تکراری            | unit idempotency      |
| برگشت وجه و اصلاح پرداخت            | unit + E2E            |
| اضافه‌پرداخت                        | unit: مسدود می‌شود    |
| ابطال با حفظ دریافت‌ها              | unit + E2E POS        |
| کسر ریال/تومان نامعتبر              | unit + E2E            |
| تعداد/قیمت صفر، منفی، NaN، Infinity | unit validation       |
| تخفیف بیش از ۱۰۰٪/منفی              | unit validation       |
| pre-invoice/draft بدون اثر مالی     | unit + E2E            |
| تغییر واحد نمایش                    | E2E: مبلغ داخلی ثابت  |
| چاپ/PDF پیش‌نویس و یادداشت داخلی    | E2E                   |
| PDF چندصفحه‌ای                      | E2E واقعی             |
| موبایل و فیلتر URL                  | E2E Pixel 7           |
| backup/migration/seed guard         | unit                  |

### 8.3 نتیجهٔ نهایی

- Unit: `42 passed (42)`، `312 passed (312)`
- E2E: `30 passed`
- Typecheck/Lint/Build: exit 0
- هشدار build: `vendor-pdf-vector` حدود 1,007 kB / gzip 508 kB. این chunk قبلاً هم وجود داشت؛ اکنون فقط هنگام دانلود PDF بارگذاری می‌شود. حذف کامل هشدار نیازمند تغییر وابستگی PDF یا chunking عمیق‌تر است و در این تحویل انجام نشده است.

---

## 9. کارهای باقی‌مانده / خارج از دامنهٔ امن این تحویل

1. `StoreReportsPage.tsx` بازطراحی نشده و هنوز از helperهای قدیمی گزارش استفاده می‌کند. هستهٔ محاسبات فاکتور اصلاح شده ولی گزارش‌های آن صفحه باید جداگانه مهاجرت کنند.
2. `PosPage.tsx` / `pos-store.ts` هنوز نمایش/ورودی پول را کاملاً به `InvoiceMoneyInput` و canonical Toman wiring نبرده‌اند؛ ثبت فروش از مسیر service اکنون اعتبارسنجی دقیق دارد.
3. خرید، برگشت کالا/مرجوعی رسمی، پیش‌فاکتور تجاری جدا از پیش‌نویس، ضمیمهٔ فایل، اتصال بانکی/درگاه، API سمت سرور، RBAC و sync چنددستگاهی در کد موجود وجود نداشت و ساخته نشده است.
4. نرخ مالیات از تنظیمات پروژه خوانده می‌شود؛ هیچ نرخ قانونی جدیدی hardcode نشده است. انطباق مالیاتی/قانونی نیازمند تأیید حسابدار است.
5. چاپ فیزیکی، دستگاه Android واقعی، Safari/Firefox و بارگذاری روی سایت عملیاتی آزمایش نشده‌اند.
6. هیچ deployment، دسترسی به production، یا تغییر دادهٔ واقعی انجام نشده است.

---

## 10. راهنمای استقرار و rollback

خلاصه:

1. قبل از استقرار، از تنظیمات برنامه خروجی backup بگیرید.
2. نسخهٔ جدید را ابتدا روی staging با یک کپی از backup بالا بیاورید.
3. IndexedDB به‌صورت خودکار v3→v4 می‌شود؛ این مهاجرت افزایشی است.
4. backup جدید نسخهٔ 3 است. برای rollback به کد قدیمی، باید backup قبل از مهاجرت را نگه دارید؛ downgrade خودکار ارائه نشده است.
5. اگر بعد از مهاجرت دادهٔ جدید ثبت شد، rollback به backup قدیمی آن داده‌ها را از دست می‌دهد مگر اینکه جداگانه استخراج/مستند شود.

شرح کامل در `migration-rollback.md`.

---

## 11. فهرست فایل‌های کلیدی تغییرکرده/جدید

### جدید

- `src/core/currency/money.ts` + test
- `src/features/store/invoice-calc.ts` + test
- `src/features/store/InvoiceMoneyInput.tsx`
- `src/features/store/customer-payment.service.ts` + test
- `src/features/store/use-attempt-key.ts`
- `src/store/invoice-editor-store.ts`
- `src/features/store/invoice-draft.service.test.ts`
- `src/features/store/invoice-payment.service.test.ts`
- `src/core/utils/csv.test.ts`
- `e2e/invoices.spec.ts`
- `docs/invoices/*`

### تغییرکرده

- `src/core/db/db.ts`, `backup.ts`, `migration.test.ts`, `backup.test.ts`, `seed.ts`, `seed.test.ts`
- `src/core/currency/currency.ts`
- `src/core/utils/csv.ts`
- `src/features/store/invoice.service.ts`, `invoice-payment.service.ts`, `invoice-domain.ts`, `store-calc.ts`, `customers-calc.ts`, `invoice-search.ts`, `invoice-dashboard.ts`
- `NewInvoicePage.tsx`, `IssuedInvoicesPage.tsx`, `InvoiceViewPage.tsx`, `InvoiceDashboardPage.tsx`, `InvoicePaymentDialog.tsx`, `VoidInvoiceDialog.tsx`, `InvoicePrintDocument.tsx`, `invoice-pdf.ts`, `CustomersPage.tsx`
- `src/components/AmountInput.tsx`, `JalaliDateInput.tsx`
- `src/app/router.tsx`, `src/layouts/nav-items.ts` + test
- `src/pages/SettingsPage.tsx`
- `playwright.config.ts`, `e2e/pos.spec.ts`

`package.json` و `package-lock.json` تغییر نکرده‌اند.
