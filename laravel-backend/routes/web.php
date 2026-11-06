<?php

use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BillingController;
use App\Http\Controllers\Api\LicenseController;
use App\Http\Controllers\Api\Manager\CouponController;
use App\Http\Controllers\Api\Manager\OrderController;
use App\Http\Controllers\Api\Manager\PlanController;
use App\Http\Controllers\Api\Manager\SubscriberController;
use App\Http\Controllers\Api\Manager\StoreController;
use App\Http\Controllers\Api\RegistrationController;
use App\Http\Controllers\Api\SyncController;
use App\Http\Controllers\Api\TeamController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API (نشست لاراول + CSRF)
|--------------------------------------------------------------------------
|
| این مسیرها همان میان‌افزار وب را دارند (نشست/کوکی و CSRF)، چون فرانت‌اند
| React داخل خود لاراول سرو می‌شود و با همان کوکی نشست احراز هویت می‌کند.
| توکن CSRF از متای صفحه‌ی app.blade.php خوانده می‌شود.
|
*/

Route::prefix('api')->group(function () {
    Route::post('login', [AuthController::class, 'login'])
        ->middleware('throttle:10,1')
        ->name('api.login');

    // ————— ثبت‌نام و فروش (عمومی) —————
    Route::post('register', [RegistrationController::class, 'store'])
        ->middleware('throttle:10,60')
        ->name('api.register');

    Route::get('subscription/plans', [BillingController::class, 'plans'])
        ->middleware('throttle:120,1')
        ->name('api.plans');

    // محاسبهٔ قیمت (پیش‌فاکتور) — فقط سرور قیمت را تعیین می‌کند.
    Route::get('subscription/quote', [BillingController::class, 'quote'])
        ->middleware('throttle:120,1')
        ->name('api.subscription.quote');

    // بازگشت از درگاه پرداخت؛ نیازی به نشست ندارد چون تأیید در سرور انجام می‌شود.
    Route::get('billing/callback', [BillingController::class, 'callback'])
        ->name('api.billing.callback');

    Route::middleware('auth')->group(function () {
        Route::post('logout', [AuthController::class, 'logout'])->name('api.logout');
        Route::get('me', [AuthController::class, 'me'])->name('api.me');
        Route::get('license', [LicenseController::class, 'show'])->name('api.license');
        Route::get('audit', [AuditController::class, 'mine'])->name('api.audit');

        // ————— اشتراک، خرید و تمدید —————
        Route::middleware('store.user')->group(function () {
            Route::get('subscription', [BillingController::class, 'show'])->name('api.subscription');
            Route::get('subscription/status', [BillingController::class, 'status'])->name('api.subscription.status');
            Route::post('subscription/checkout', [BillingController::class, 'checkout'])
                ->middleware('throttle:15,1')
                ->name('api.subscription.checkout');
            Route::get('subscription/invoices/{number}', [BillingController::class, 'invoice'])
                ->name('api.subscription.invoice');

            // ————— کاربران فروشگاه و سقف اشتراک —————
            Route::get('team', [TeamController::class, 'index'])->name('api.team');
            Route::post('team', [TeamController::class, 'store'])->name('api.team.store');
            Route::put('team/{member}', [TeamController::class, 'update'])->name('api.team.update');
            Route::delete('team/{member}', [TeamController::class, 'destroy'])->name('api.team.destroy');
            Route::post('team/{member}/restore', [TeamController::class, 'restore'])->name('api.team.restore');
        });

        // ————— مدیر کل: فروشگاه‌ها و لایسنس‌ها —————
        Route::middleware('manager')->prefix('manager')->group(function () {
            Route::get('stores', [StoreController::class, 'index']);
            Route::post('stores', [StoreController::class, 'store']);
            Route::get('stores/{store}', [StoreController::class, 'show']);
            Route::put('stores/{store}', [StoreController::class, 'update']);
            Route::delete('stores/{store}', [StoreController::class, 'destroy']);
            Route::put('stores/{store}/license', [StoreController::class, 'updateLicense']);

            // ————— دفتر رویدادها —————
            Route::get('audit', [AuditController::class, 'index']);

            // ————— سفارش‌ها و تأیید پرداخت دستی —————
            Route::get('orders', [OrderController::class, 'index']);
            Route::post('orders/{order}/approve', [OrderController::class, 'approve']);
            Route::post('orders/{order}/reject', [OrderController::class, 'reject']);

            // ————— صدور دورهٔ آزمایشی برای فروشگاه بدون لایسنس —————
            Route::post('subscription/trial', [BillingController::class, 'grantTrial']);

            // ————— پلن‌ها و تعرفه‌ها —————
            Route::get('plans', [PlanController::class, 'index']);
            Route::post('plans', [PlanController::class, 'store']);
            Route::put('plans/{plan:code}', [PlanController::class, 'update']);
            Route::patch('plans/{plan:code}/toggle', [PlanController::class, 'toggle']);
            Route::get('plans/{plan:code}/prices', [PlanController::class, 'prices']);

            // ————— کدهای تخفیف —————
            Route::get('coupons', [CouponController::class, 'index']);
            Route::post('coupons', [CouponController::class, 'store']);
            Route::put('coupons/{coupon}', [CouponController::class, 'update']);
            Route::delete('coupons/{coupon}', [CouponController::class, 'destroy']);

            // ————— مشترکان —————
            Route::get('subscribers', [SubscriberController::class, 'index']);
            Route::get('subscribers/{license}', [SubscriberController::class, 'show']);
            Route::post('subscribers/{license}/extend', [SubscriberController::class, 'extend']);
            Route::post('subscribers/{license}/status', [SubscriberController::class, 'status']);
            Route::post('subscribers/{license}/seats', [SubscriberController::class, 'seats']);
        });

        // ————— کاربر فروشگاه: همگام‌سازی داده —————
        Route::middleware('store.user')->prefix('sync')->group(function () {
            Route::get('pull', [SyncController::class, 'pull']);
            Route::post('push', [SyncController::class, 'push']);
            Route::post('wipe', [SyncController::class, 'wipe']);
            // مهاجرت داده‌ی فشرده‌شده/پشتیبان JSON از نسخهٔ آفلاین به سرور
            Route::post('import', [SyncController::class, 'import']);
        });
    });
});

/*
|--------------------------------------------------------------------------
| SPA (React)
|--------------------------------------------------------------------------
|
| همه‌ی مسیرهای وب به پوسته‌ی React (resources/views/app.blade.php) سپرده
| می‌شوند و مسیریابی سمت کلاینت با React Router انجام می‌شود. فایل‌های
| عمومی (build، fonts، icons، ...) پیش از رسیدن به این مسیرها توسط وب‌سرور
| سرو می‌شوند.
|
*/

Route::get('/', fn () => view('app'))->name('app');

Route::get('/{any}', fn () => view('app'))
    ->where('any', '^(?!api|up|build|storage|media|_ignition).*$')
    ->name('app.fallback');
