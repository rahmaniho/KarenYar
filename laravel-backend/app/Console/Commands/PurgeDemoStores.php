<?php

namespace App\Console\Commands;

use App\Services\Demo\DemoService;
use Illuminate\Console\Command;

/**
 * پاک‌سازی دموهای منقضی.
 *
 * با cron هر ساعت اجرا می‌شود تا دادهٔ دموی رهاشده روی سرور نماند:
 *   php artisan karo:demo:purge
 */
class PurgeDemoStores extends Command
{
    protected $signature = 'karo:demo:purge {--dry-run : فقط تعداد را نشان بده}';

    protected $description = 'پاک کردن فروشگاه‌های دموی منقضی (کامل، همراه داده)';

    public function handle(DemoService $demos): int
    {
        if ($this->option('dry-run')) {
            $count = \App\Models\Store::query()
                ->where('is_demo', true)
                ->whereNotNull('demo_expires_at')
                ->where('demo_expires_at', '<=', now())
                ->count();

            $this->info("{$count} دموی منقضی آمادهٔ پاک‌سازی است.");

            return self::SUCCESS;
        }

        $purged = $demos->purgeExpired();
        $this->info("{$purged} دموی منقضی پاک شد. دموهای فعال: {$demos->activeCount()}");

        return self::SUCCESS;
    }
}
