<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// یادآوری روزانهٔ تمدید لایسنس (نیازمند cron روی سرور: * * * * * php artisan schedule:run)
Schedule::command('karo:licenses:remind')->dailyAt('09:00');

// پاک‌سازی دموهای منقضی (دادهٔ دمو نباید روی سرور بماند)
Schedule::command('karo:demo:purge')->hourly();
