<?php

/*
|--------------------------------------------------------------------------
| تنظیمات فروش، پرداخت و تمدید لایسنس
|--------------------------------------------------------------------------
|
| قیمت‌ها به تومان ذخیره می‌شوند؛ درگاه زرین‌پال مبلغ را در واحد ریال
| می‌خواهد، پس هنگام ارسال ×۱۰ می‌شود (`toman_to_rials`).
|
*/

return [

    // واحد نمایش قیمت در رابط کاربری
    'currency' => 'toman',
    'currency_label' => 'تومان',
    'toman_to_rials' => 10,

    // دورهٔ آزمایشی خودکار برای ثبت‌نام‌های آنلاین (روز)
    'trial_days' => (int) env('KARO_TRIAL_DAYS', 14),

    // اجازهٔ ثبت‌نام آنلاین فروشگاه؛ اگر false باشد فقط مدیر فروشگاه می‌سازد.
    'public_registration' => (bool) env('KARO_PUBLIC_SIGNUP', true),

    // درگاه پیش‌فرض: manual (کارت به کارت) یا zarinpal
    'gateway' => env('KARO_PAYMENT_GATEWAY', 'manual'),

    // روزهای یادآوری تمدید (به ترتیب نزولی، از بزرگ به کوچک)
    'reminder_days' => [30, 7, 0],

    // آدرس بازگشت از درگاه؛ پیش‌فرض مسیر داخلی برنامه است.
    'callback_path' => env('KARO_PAYMENT_CALLBACK', '/billing/callback'),

    // شماره/حساب مقصد برای پرداخت کارت‌به‌کارت
    'bank' => [
        'holder' => env('KARO_BANK_HOLDER', ''),
        'account' => env('KARO_BANK_ACCOUNT', ''),
        'sheba' => env('KARO_BANK_SHEBA', ''),
        'card' => env('KARO_BANK_CARD', ''),
    ],

    /*
    |--------------------------------------------------------------------------
    | پلن‌ها
    |--------------------------------------------------------------------------
    |
    | months = 0 یعنی مادام‌العمر. amount به تومان است.
    |
    */
    'plans' => [
        'pro_monthly' => [
            'label' => 'حرفه‌ای — ماهانه',
            'tier' => 'pro',
            'months' => 1,
            'amount' => 490_000,
            'description' => 'همهٔ امکانات حسابداری و گزارش‌ها، یک ماه',
        ],
        'pro_yearly' => [
            'label' => 'حرفه‌ای — سالانه',
            'tier' => 'pro',
            'months' => 12,
            'amount' => 4_900_000,
            'description' => 'دو ماه هدیه نسبت به پرداخت ماهانه',
        ],
        'proplus_monthly' => [
            'label' => 'کامل (Pro+) — ماهانه',
            'tier' => 'proplus',
            'months' => 1,
            'amount' => 890_000,
            'description' => 'همهٔ امکانات + اولویت پشتیبانی، یک ماه',
        ],
        'proplus_yearly' => [
            'label' => 'کامل (Pro+) — سالانه',
            'tier' => 'proplus',
            'months' => 12,
            'amount' => 8_900_000,
            'description' => 'همهٔ امکانات + اولویت پشتیبانی، یک سال',
        ],
        'lifetime' => [
            'label' => 'مادام‌العمر',
            'tier' => 'proplus',
            'months' => 0,
            'amount' => 24_900_000,
            'description' => 'بدون انقضا؛ همراه با یک سال پشتیبانی',
        ],
    ],

    'gateways' => [
        'manual' => [
            'label' => 'کارت به کارت / واریز بانکی',
            'enabled' => true,
        ],
        'zarinpal' => [
            'label' => 'درگاه زرین‌پال',
            'enabled' => env('ZARINPAL_MERCHANT_ID') !== null && env('ZARINPAL_MERCHANT_ID') !== '',
            'merchant_id' => env('ZARINPAL_MERCHANT_ID', ''),
            'sandbox' => (bool) env('ZARINPAL_SANDBOX', false),
            'base_url' => env('ZARINPAL_SANDBOX', false)
                ? 'https://sandbox.zarinpal.com'
                : 'https://payment.zarinpal.com',
        ],
    ],

];
