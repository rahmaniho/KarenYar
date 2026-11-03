# گزارش مهندسی تایپوگرافی فارسی، چاپ و خروجی PDF — حساب‌یار

تاریخ: ۱۴۰۵/۰۸/۱۳ — روی branch `arena/6aba9502-karenyar`

این سند نتیجه‌ی ممیزی، پیاده‌سازی و 검증 واقعی پروژه است.
هر مورد با تست خودکار یا خروجی واقعی (PDF و تصویر رسترشده) اثبات شده است.

## ۱. معماری قبلی

- Frontend: React 18 + Vite + TypeScript + Tailwind 3، PWA، اپ اندروید با Capacitor، دیتابیس Dexie، state با zustand.
- RTL وب: index.html با lang="fa" و dir="rtl"؛ شکل‌دهی و bidi فارسی به موتور Unicode مرورگر سپرده شده بود.
- فونت: وزیرمتن نسخه‌ی 33.003؛ woff2 برای وب و TTF برای PDF.
- PDF فاکتور: موتور برداری اختصاصی (src/core/pdf/) با pdf-lib و fontkit؛ فونت TTF کامل در PDF embed می‌شود،
  گلیف‌ها با اپراتور خام PDF رسم می‌شوند و متن منطقی با /ActualText برای کپی و جست‌وجو حفظ می‌شود.
- PDF فیش حقوقی: html2canvas به JPEG و سپس jsPDF؛ یعنی PDF تصویری و بدون متن قابل انتخاب.
- چاپ: window.print() با @media print و کلاس .print-area در globals.css؛ @page A4.
- CSV: UTF-8 با BOM و محافظت از فرمول اکسل.
- اعداد و تاریخ: Intl.NumberFormat fa-IR و jalaali-js؛ مبالغ در دیتابیس به تومان و تبدیل واحد فقط در UI.

## ۲. مشکلات شناسایی‌شده و علت فنی

1. فونت وب woff2 فقط ۵۴۱ گلیف داشت و ارقام لاتین 0-9 و … و – و « » را نداشت؛ متن با Tahoma رندر می‌شد.
   علت: woff2 قبلی زیرمجموعه‌ی محدود بود، در حالی که TTF همان پروژه ۸۹۵ گلیف کامل داشت.
2. در شکل‌دهی PDF، حروف right-joining مثل ا د ر ز و باعث می‌شدند حرف بعدی شکل اشتباه بگیرد (مثال: و در «دارو»).
   علت: joinsNext با ترکیب اشتباه تعریف شده بود و برای این حروف همیشه true می‌شد.
3. حرف بعد از ligature لا/لآ به لام نمی‌چسبید (م در «سلام» isolated می‌شد).
   علت: بعد از مصرف جفت لا، حرف قبلی الف در نظر گرفته می‌شد نه لام.
4. ZWNJ و علامت − در bidi به‌عنوان LTR طبقه‌بندی می‌شدند و ترتیب را به‌هم می‌زدند.
   علت: این نویسه‌ها در فهرست neutral نبودند.
5. PDF فیش حقوقی تصویری بود و متن آن قابل انتخاب نبود.
6. چاپ فیش قبل از کامل‌شدن فونت وب انجام می‌شد (بدون document.fonts.ready).
7. مقادیر لاتین (کد پیگیری، تلفن) ایزوله‌سازی bidi نداشتند.
8. در چاپ، متن بلند می‌توانست بریده شود و کنترل orphan/widow نبود.

## ۳. راهکارهای پیاده‌شده

1. ساخت woff2 از همان TTF پروژه با scripts/build-web-fonts.py (fontTools): پوشش کامل لاتین + فارسی + علائم.
   فایل Vazirmatn-ExtraBold.ttf از مخزن رسمی فونت (مجوز OFL) اضافه شد. پیش‌بارگذاری ۴ وزن در index.html.
2. اصلاح shapePersian: joinsNext یعنی initial !== isolated و joinsPrevious یعنی final !== isolated؛
   tatweel استثناست. بعد از ligature لا/لآ، حرف بعدی به لام می‌چسبد. ZWNJ و علائم ریاضی/نگارشی در فهرست neutral.
3. فیش حقوقی برداری با همان موتور PDF (src/features/payroll/payroll-pdf.ts).
4. حذف مسیر تصویری: src/core/utils/pdf.ts و پکیج‌های jspdf و html2canvas و @fontsource/vazirmatn حذف شدند.
5. کامپوننت Ltr (dir="ltr" با ایزوله‌سازی) برای کد پیگیری، تلفن و کد ملی در فاکتور، فیش و مشتریان.
6. بهبود @media print: ارتفاع/اسکرول آزاد، overflow-wrap، orphans/widows، ایزوله‌سازی [dir=ltr].
   در هر دو صفحه‌ی چاپ، قبل از window.print() منتظر document.fonts.ready می‌مانیم.
7. ماژول amount-words به src/core/text/ منتقل شد تا payroll به store وابسته نباشد.

## ۴. فایل‌های تغییر‌داده‌شده

- public/fonts/*.woff2 (ساخته‌شده‌ی جدید)، public/fonts/Vazirmatn-ExtraBold.ttf (جدید)
- scripts/build-web-fonts.py و scripts/render-typography-sample.mts (جدید)
- src/core/pdf/persian.ts (اصلاح شکل‌دهی و bidi)، src/core/pdf/font.ts (codePointForGlyph)
- src/core/pdf/persian.test.ts و font-coverage.test.ts (جدید)
- src/features/store/invoice-pdf.vector.test.ts (جدید)
- src/features/payroll/payroll-pdf.ts و payroll-pdf.test.ts (جدید) و PayrollCalculatePage.tsx
- src/features/store/InvoicePrintDocument.tsx و CustomersPage.tsx (ایزوله‌سازی LTR)
- src/components/Ltr.tsx (جدید)، src/core/text/amount-words.ts (جابجایی)
- index.html (preload فونت)، src/styles/globals.css (بهبودهای چاپ)
- vite.config.ts و package.json/package-lock.json (حذف ۳ پکیج، افزودن اسکریپت samples)
- docs/samples/ — دو PDF نمونه و تصویر رسترشده‌ی آن‌ها
- src/core/utils/pdf.ts (حذف)

## ۵. کتابخانه‌ها

- حذف: jspdf، html2canvas، @fontsource/vazirmatn (استفاده‌نشده).
- اضافه: هیچ. fontTools فقط برای اسکریپت build فونت خارج از باندل اپ.

## ۶. تست‌ها

- ۴۶ فایل تست و ۳۵۸ تست پاس شدند. tsc و eslint و build همگی بدون خطا.
- persian.test.ts: ۲۷ تست شکل‌دهی و bidi با ۹ رشته‌ی آزمایشی.
- font-coverage.test.ts: ۱۴ تست پوشش گلیف فونت‌های embedشده.
- invoice-pdf.vector.test.ts و payroll-pdf.test.ts: PDF واقعی؛ A4، فونت embed (FontFile2)،
  بدون .notdef، گلیف‌های Presentation-Forms، /ActualText منطقی، صفحه‌بندی چندصفحه‌ای.

## ۷. خروجی واقعی

- docs/samples/persian-typography-verification.pdf و PNG آن: ۹ رشته‌ی آزمایشی با ۳ وزن؛
  حروف متصل، RTL صحیح، ZWNJ حفظ‌شده، لاتین/اعداد/تاریخ/٪/−/پرانتز درست؛ بازرسی بصری انجام شد.
- docs/samples/factor-persian-verification.pdf: فاکتور واقعی با ۳ فونت Vazirmatn embedشده.

## ۸. محدودیت‌های باقی‌مانده

- استخراج متن خام در برخی ابزارها (بدون ActualText) ترتیب دیداری نشان می‌دهد؛
  Acrobat و Chrome (PDFium) از /ActualText استفاده می‌کنند و متن منطقی کپی می‌شود.
- CSV جهت سلول را بیان نمی‌کند؛ اکسل با BOM متن فارسی را RTL نشان می‌دهد.
  در ویندوز با list-separator «;» ممکن است CSV با کاما یک ستون شود؛ در صورت نیاز خروجی با ; اضافه شود.
- تست‌های Playwright در این محیط اجرا نشد (دانلود مرورگر مسدود است) و در CI اجرا می‌شوند.

## ۹. پیشنهادهای مرحله‌ی بعد

1. Visual regression خودکار با Playwright در CI.
2. خروجی Excel (.xlsx) با سلول‌های راست‌به‌چپ در صورت نیاز.
3. استفاده از فونت متغیر (یک فایل به‌جای ۴) برای کاهش حجم.
4. ToUnicode کامل‌تر برای ابزارهایی که ActualText را نمی‌خوانند.
