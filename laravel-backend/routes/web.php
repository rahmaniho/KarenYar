<?php

use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BillingController;
use App\Http\Controllers\Api\DemoController;
use App\Http\Controllers\Api\LicenseController;
use App\Http\Controllers\Api\Manager\CouponController;
use App\Http\Controllers\Api\Manager\DashboardController;
use App\Http\Controllers\Api\Manager\ManagerAccountController;
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

    // دموی امن: ساخت فروشگاه آزمایشی کوتاه‌عمر از صفحهٔ ورود (بدون پرداخت جعلی).
    Route::post('demo/session', [DemoController::class, 'store'])
        ->middleware('throttle:6,60')
        ->name('api.demo.start');

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

        // پایان دادن به دمو (پاک کردن کامل دادهٔ آن) — فقط برای کاربر دمو.
        Route::delete('demo/session', [DemoController::class, 'destroy'])
            ->middleware('throttle:10,1')
            ->name('api.demo.end');

        // ————— اشتراک، خرید و تمدید —————
        Route::middleware('store.user')->group(function () {
            Route::get('subscription', [BillingController::class, 'show'])->name('api.subscription');
            Route::get('subscription/status', [BillingController::class, 'status'])->name('api.subscription.status');
            Route::post('subscription/checkout', [BillingController::class, 'checkout'])
                ->middleware(['throttle:15,1', 'not.demo'])
                ->name('api.subscription.checkout');
            Route::get('subscription/invoices/{number}', [BillingController::class, 'invoice'])
                ->name('api.subscription.invoice');

            // ————— کاربران فروشگاه و سقف اشتراک —————
            Route::get('team', [TeamController::class, 'index'])->name('api.team');
            Route::post('team', [TeamController::class, 'store'])->middleware('not.demo')->name('api.team.store');
            Route::put('team/{member}', [TeamController::class, 'update'])->middleware('not.demo')->name('api.team.update');
            Route::delete('team/{member}', [TeamController::class, 'destroy'])->middleware('not.demo')->name('api.team.destroy');
            Route::post('team/{member}/restore', [TeamController::class, 'restore'])->middleware('not.demo')->name('api.team.restore');
        });

        // ————— مدیر کل: داشبورد، فروشگاه‌ها، پرداخت‌ها، تعرفه‌ها، مشترکان، مدیران —————
        // خواندن‌ها سقف نرخ بالاتری دارند؛ عملیات نوشتن/حذف محدودتر است.
        Route::middleware(['manager', 'throttle:180,1'])->prefix('manager')->group(function () {
            // داشبورد
            Route::get('dashboard', [DashboardController::class, 'index']);

            // حساب‌های مدیر کل
            Route::get('managers', [ManagerAccountController::class, 'index']);
            Route::post('managers', [ManagerAccountController::class, 'store'])
                ->middleware('throttle:30,1');
            Route::put('managers/{manager}', [ManagerAccountController::class, 'update'])
                ->middleware('throttle:30,1');
            Route::delete('managers/{manager}', [ManagerAccountController::class, 'destroy'])
                ->middleware('throttle:30,1');

            // فروشگاه‌ها و لایسنس‌ها
            Route::get('stores', [StoreController::class, 'index']);
            Route::post('stores', [StoreController::class, 'store'])
                ->middleware('throttle:30,1');
            Route::get('stores/{store}', [StoreController::class, 'show']);
            Route::put('stores/{store}', [StoreController::class, 'update'])
                ->middleware('throttle:60,1');
            Route::delete('stores/{store}', [StoreController::class, 'destroy'])
                ->middleware('throttle:20,1');
            Route::post('stores/{store}/restore', [StoreController::class, 'restore'])
                ->middleware('throttle:30,1');
            Route::put('stores/{store}/license', [StoreController::class, 'updateLicense'])
                ->middleware('throttle:60,1');

            // دفتر رویدادها
            Route::get('audit', [AuditController::class, 'index']);
            Route::get('audit/actions', [AuditController::class, 'actions']);

            // سفارش‌ها، تأیید و ابطال پرداخت دستی
            Route::get('orders', [OrderController::class, 'index']);
            Route::post('orders/{order}/approve', [OrderController::class, 'approve'])
                ->middleware('throttle:30,1');
            Route::post('orders/{order}/reject', [OrderController::class, 'reject'])
                ->middleware('throttle:30,1');
            Route::post('orders/{order}/void', [OrderController::class, 'void'])
                ->middleware('throttle:20,1');

            // صدور دورهٔ آزمایشی برای فروشگاه بدون لایسنس
            Route::post('subscription/trial', [BillingController::class, 'grantTrial'])
                ->middleware('throttle:30,1');

            // پلن‌ها و تعرفه‌ها
            Route::get('plans', [PlanController::class, 'index']);
            Route::post('plans', [PlanController::class, 'store'])
                ->middleware('throttle:30,1');
            Route::put('plans/{plan:code}', [PlanController::class, 'update'])
                ->middleware('throttle:30,1');
            Route::patch('plans/{plan:code}/toggle', [PlanController::class, 'toggle'])
                ->middleware('throttle:30,1');
            Route::get('plans/{plan:code}/prices', [PlanController::class, 'prices']);

            // کدهای تخفیف
            Route::get('coupons', [CouponController::class, 'index']);
            Route::post('coupons', [CouponController::class, 'store'])
                ->middleware('throttle:30,1');
            Route::put('coupons/{coupon}', [CouponController::class, 'update'])
                ->middleware('throttle:30,1');
            Route::delete('coupons/{coupon}', [CouponController::class, 'destroy'])
                ->middleware('throttle:30,1');

            // مشترکان
            Route::get('subscribers', [SubscriberController::class, 'index']);
            Route::get('subscribers/{license}', [SubscriberController::class, 'show']);
            Route::post('subscribers/{license}/extend', [SubscriberController::class, 'extend'])
                ->middleware('throttle:40,1');
            Route::post('subscribers/{license}/status', [SubscriberController::class, 'status'])
                ->middleware('throttle:40,1');
            Route::post('subscribers/{license}/seats', [SubscriberController::class, 'seats'])
                ->middleware('throttle:40,1');
        });

        // ————— کاربر فروشگاه: همگام‌سازی داده —————
        Route::middleware('store.user')->prefix('sync')->group(function () {
            Route::get('pull', [SyncController::class, 'pull']);
            Route::post('push', [SyncController::class, 'push']);
            Route::post('wipe', [SyncController::class, 'wipe'])->middleware('not.demo');
            // مهاجرت داده‌ی فشرده‌شده/پشتیبان JSON از نسخهٔ آفلاین به سرور
            Route::post('import', [SyncController::class, 'import'])->middleware('not.demo');
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
