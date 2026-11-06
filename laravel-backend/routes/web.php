<?php

use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BillingController;
use App\Http\Controllers\Api\LicenseController;
use App\Http\Controllers\Api\Manager\OrderController;
use App\Http\Controllers\Api\Manager\StoreController;
use App\Http\Controllers\Api\RegistrationController;
use App\Http\Controllers\Api\SyncController;
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

    Route::get('plans', [BillingController::class, 'plans'])
        ->middleware('throttle:60,1')
        ->name('api.plans');

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
            Route::get('billing', [BillingController::class, 'show'])->name('api.billing');
            Route::post('billing/checkout', [BillingController::class, 'checkout'])
                ->middleware('throttle:15,1')
                ->name('api.billing.checkout');
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
            Route::post('billing/trial', [BillingController::class, 'grantTrial']);
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
