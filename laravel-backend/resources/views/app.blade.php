<!doctype html>
<html lang="fa" dir="rtl">
    <head>
        <meta charset="UTF-8" />
        <link rel="icon" type="image/png" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="csrf-token" content="{{ csrf_token() }}" />
        <!-- پیش‌بارگذاری فونت متغیر وزیرمتن (زیرمجموعه‌ی عربی و لاتین) تا نمایش/چاپ با فونت جایگزین انجام نشود -->
        <link
            rel="preload"
            href="/fonts/vazirmatn-arabic-wght-normal.woff2"
            as="font"
            type="font/woff2"
            crossorigin
        />
        <link
            rel="preload"
            href="/fonts/vazirmatn-latin-wght-normal.woff2"
            as="font"
            type="font/woff2"
            crossorigin
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <meta name="theme-color" content="#0B1B3A" />
        <meta
            name="description"
            content="کارو نرم‌افزار حسابداری — مدیریت مالی فروشگاهی، شخصی و حقوق و دستمزد؛ فارسی و آفلاین‌فرست"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="کارو" />
        <title>کارو نرم‌افزار حسابداری</title>

        @viteReactRefresh
        @vite(['resources/js/main.tsx'])
    </head>
    <body>
        <div id="root"></div>
        <noscript>
            <div style="font-family: Tahoma, sans-serif; padding: 2rem; text-align: center">
                کارو برای اجرا به JavaScript نیاز دارد؛ لطفاً آن را در مرورگر فعال کنید.
            </div>
        </noscript>
    </body>
</html>
