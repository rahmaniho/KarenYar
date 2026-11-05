<?php

use Illuminate\Support\Facades\Route;

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
