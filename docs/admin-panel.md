# پنل مدیریت کارو — نسخهٔ حرفه‌ای (داشبورد + سه فاز)

این سند پنل مدیریت جدید را توصیف می‌کند: مسیرها، صفحات، قواعد امنیتی/داده و کارهایی که
در سه فاز «ایمن‌سازی»، «ابزار پشتیبانی» و «تجربه و بینش» انجام شده است. ارزیابی قبلی و
دلایل هر تغییر در `docs/admin-panel-assessment.md` آمده است.

> اصل حاکم: **پول و مجوز فقط در سرور**؛ پنل مدیر فقط نمایش و فرمان است. هیچ عملیات مالی
> بدون تأییدیه، مرجع قابل ردیابی و ثبت در دفتر رویدادها انجام نمی‌شود.

---

## ۱) ساختار رابط کاربری

`features/admin/AdminApp.tsx` یک برنامهٔ مستقل با مسیرهای اختصاصی است (قابل لینک‌دهی):

| مسیر | صفحه | کار |
| --- | --- | --- |
| `/admin` | داشبورد | KPI، روند درآمد ۱۲ ماه، ترکیب مشترکان، درآمد هر پلن، آخرین پرداخت‌ها، انقضای نزدیک، کوپن‌های پرمصرف، اقدام‌های پیشنهادی |
| `/admin/stores` | فروشگاه‌ها | جست‌وجو/فیلتر/صفحه‌بندی، ساخت و ویرایش فروشگاه و لایسنس، آرشیو، بازیابی، حذف دائمی دومرحله‌ای |
| `/admin/subscribers` | مشترکان | آمار، فیلتر وضعیت/پلن، صفحه‌بندی، جزئیات کامل مشترک (پرداخت‌ها، تلاش‌های درگاه، تاریخچه، کاربران) و سه فرم عملیات |
| `/admin/orders` | پرداخت‌ها | فهرست/فیلتر/جست‌وجو، تأیید دستی با **شمارهٔ پیگیری اجباری**، رد با دلیل، ابطال پرداخت با دلیل |
| `/admin/plans` | تعرفه‌ها | ویرایش قیمت، فعال/غیرفعال، تاریخچهٔ قیمت، فروش و درآمد هر پلن |
| `/admin/coupons` | کدهای تخفیف | ساخت/ویرایش، بازهٔ زمانی، سقف مصرف، محدودیت پلن، فعال/غیرفعال، حذف |
| `/admin/audit` | دفتر رویدادها | فیلتر نوع رویداد/جست‌وجو/صفحه‌بندی، جزئیات `meta` و IP |
| `/admin/managers` | مدیران | ساخت/ویرایش/غیرفعال‌سازی حساب مدیر، محافظت از غیرفعال‌سازی خود |

پوسته (`AdminShell.tsx`) شامل سایدبار RTL، نوار بالا با جست‌وجوی سراسری (هدایت به مشترکان)،
نشان تعداد پرداخت‌های در انتظار و منوی موبایل است. همهٔ اعداد فارسی و تاریخ‌ها جلالی‌اند.

## ۲) فاز ۱ — ایمن‌سازی عملیات

- **تأیید پرداخت دستی امن**: دیالوگ با خلاصهٔ سفارش (فروشگاه، مبلغ، پلن، کاربران، مدت) و
  فیلد اجباری «شمارهٔ پیگیری بانکی». بک‌اند بدون این مقدار درخواست را رد می‌کند
  (`OrderController::approve`) و در `subscription_payments` + `audit_logs` ثبت می‌شود.
- **ابطال پرداخت (void)**: `POST api/manager/orders/{order}/void` با دلیل الزامی؛ وضعیت سفارش
  `voided`، فاکتور `voided_at` می‌گیرد، رکوردها حذف نمی‌شوند و **اشتراک خودکار قطع نمی‌شود**
  (سیاست شفاف؛ قطع دسترسی با «تعلیق» و دلیل جداگانه).
- **آرشیو به‌جای حذف**: `DELETE api/manager/stores/{store}` پیش‌فرض آرشیو می‌کند
  (`archived_at`، `is_active=false`) و داده‌های مالی/فاکتور/تاریخچه حفظ می‌شوند؛ ورود کاربران
  فروشگاه آرشیوشده مسدود می‌شود (در `AuthController` و `EnsureStoreUser`). «حذف دائمی» فقط برای
  فروشگاه آرشیوشده و با تایپ دقیق نام انجام می‌شود.
- **حساب‌های مدیر**: `GET/POST/PUT/DELETE api/manager/managers` با محافظت «غیرفعال‌سازی خود»
  و ثبت رویداد؛ حذف فیزیکی وجود ندارد.
- **محدودیت نرخ**: کل گروه `manager` روی `throttle:180,1` و عملیات نوشتن/حذف روی
  `throttle:20..60,1`.
- **حذف رمز پیش‌فرض**: `DatabaseSeeder` فقط با `KARO_MANAGER_EMAIL` و `KARO_MANAGER_PASSWORD`
  حساب می‌سازد؛ در غیر این صورت هشدار می‌دهد و کاری نمی‌کند.

## ۳) فاز ۲ — ابزار پشتیبانی

- **کشوی جزئیات مشترک** از `GET api/manager/subscribers/{license}`: پرداخت‌ها، تلاش‌های درگاه،
  تاریخچه و کاربران + سه فرم (تمدید/تغییر پلن، تغییر سقف، تغییر وضعیت) با دلیل الزامی.
- **پلن و سقف در فرم فروشگاه**: انتخاب پلن، سقف کاربران، مادام‌العمر/انقضا و دلیل؛
  اعتبارسنجی در `LicenseService::adminOverride` (کف سقف = کاربران فعال، حفظ `starts_at`،
  تعیین `tier` از پلن، ثبت در `subscription_history` با اکشن `admin_license_updated`).
- **تاریخچهٔ قیمت پلن** در UI (`GET api/manager/plans/{code}/prices`).
- **ویرایش کامل کوپن** (بازهٔ زمانی، محدودیت پلن، سقف، فعال/غیرفعال) از `PUT api/manager/coupons/{id}`.
- **اصلاح باگ فیلتر**: فیلتر وضعیت مشترکان در SQL اعمال می‌شود (نه بعد از `limit`) و آخرین
  پرداخت هر مشترک با زیرکوئری خوانده می‌شود (حذف N+1).
- **صفحه‌بندی سمت سرور** برای فروشگاه‌ها، مشترکان، سفارش‌ها و رویدادها + `meta` استاندارد.

## ۴) فاز ۳ — تجربه و بینش

- **داشبورد مدیریتی** `GET api/manager/dashboard`: درآمد امروز/ماه/سال، رشد ماهانه، MRR/ARR
  برآوردی (تعرفهٔ جاری × سقف کاربران، بدون آزمایشی)، ترکیب مشترکان، روند ۱۲ ماه، درآمد هر پلن،
  سفارش‌های در انتظار (تعداد و مبلغ)، انقضای ۱۴ روز آینده، کوپن‌های پرمصرف و اقدام‌های پیشنهادی.
- **نمودارها** با Recharts (Area/Bar/Pie) و رنگ‌بندی نئونی هم‌خوان با برند.
- **برچسب فارسی کامل رویدادها** (پلن، کوپن، تیم، مدیر، ابطال) + نمایش `meta` و IP.
- **یکدست‌سازی تم تیره** با کارت‌های شیشه‌ای و کنتراست خوانا (شامل فرم‌ها و دیالوگ‌ها).

## ۵) قراردادهای API (نمای کلی)

```
GET    api/manager/dashboard
GET    api/manager/stores?q=&status=active|archived&page=&limit=
POST   api/manager/stores                        {name,email,password,license{plan_code,seats,...}}
PUT    api/manager/stores/{store}                 (email/password اختیاری؛ license.reason لازم)
DELETE api/manager/stores/{store}                 {mode:archive|purge, confirm_name?, reason?}
POST   api/manager/stores/{store}/restore
PUT    api/manager/stores/{store}/license         {plan_code,seats,expires_at,reason}
GET    api/manager/orders?status=&q=&page=&limit=
POST   api/manager/orders/{order}/approve         {reference (اجباری), note?}
POST   api/manager/orders/{order}/reject          {reason (اجباری)}
POST   api/manager/orders/{order}/void            {reason (اجباری)}
GET    api/manager/subscribers?q=&status=&plan_code=&page=
GET    api/manager/subscribers/{license}
POST   api/manager/subscribers/{license}/(extend|status|seats)   {reason (اجباری)}
GET    api/manager/plans | POST | PUT {plan:code} | PATCH {plan:code}/toggle | GET {plan:code}/prices
GET    api/manager/coupons | POST | PUT {id} | DELETE {id}
GET    api/manager/audit?action=&q=&page= | GET api/manager/audit/actions
GET/POST api/manager/managers | PUT/DELETE api/manager/managers/{manager}
```

## ۶) قواعد داده و امنیت (خلاصه)

1. مبلغ، تخفیف، سقف کاربر و وضعیت اشتراک همیشه سمت سرور محاسبه/اعتبارسنجی می‌شود.
2. هیچ عملیات مالی بدون مرجع (شمارهٔ پیگیری) و دلیل (رد/ابطال/تعلیق/تغییر سقف) انجام نمی‌شود.
3. حذف دادهٔ مالی با «آرشیو» جایگزین شده؛ حذف دائمی دومرحله‌ای و ثبت‌شده است.
4. هر تغییر قیمت/دسترسی/وضعیت در `audit_logs` و (برای اشتراک) در `subscription_history` ثبت می‌شود.
5. مسیرهای مدیر با `EnsureManager` + throttle محافظت می‌شوند؛ CSRF از کوکی `XSRF-TOKEN` خوانده می‌شود.
6. حساب مدیر فقط با ENV ساخته می‌شود؛ غیرفعال‌سازی حساب مدیر دیگر ممکن است، خودزنی نه.

## ۷) تست‌ها

| دامنه | تست |
| --- | --- |
| داشبورد (KPI، MRR، روند، انقضا، دسترسی) | `tests/Feature/ManagerDashboardTest.php` |
| تأیید/رد/ابطال پرداخت + دسترسی + صفحه‌بندی | `tests/Feature/ManagerOrdersTest.php` |
| آرشیو/بازیابی/حذف دائمی، ورود مسدود، سقف/پلن | `tests/Feature/StoreManagementTest.php` |
| حساب‌های مدیر | `tests/Feature/ManagerAccountTest.php` |
| فیلتر/صفحه‌بندی/اکشن‌های دفتر رویداد | `tests/Feature/AuditTest.php` |
| رابط: داشبورد، پرداخت‌ها، فروشگاه‌ها، مدیران، رویدادها | `frontend-overlay/features/admin/*.test.tsx` |

## ۸) نکات استقرار

- مهاجرت جدید: `php artisan migrate` (ستون‌های `stores.archived_at`، `orders.voided_at/void_reason`،
  `subscription_invoices.voided_at` + ایندکس پرداخت‌ها).
- حساب مدیر: `KARO_MANAGER_EMAIL`/`KARO_MANAGER_PASSWORD` را در `.env` بگذارید و
  `php artisan db:seed --class=DatabaseSeeder` را فقط یک بار اجرا کنید (یا از `tinker` استفاده کنید).
- اگر روی نسخهٔ قبلی پنل هستید: آدرس `/admin` را به تیم پشتیبانی اعلام کنید؛ `/` هم به داشبورد می‌رود.
