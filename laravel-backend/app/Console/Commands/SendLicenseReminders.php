<?php

namespace App\Console\Commands;

use App\Mail\LicenseExpiringMail;
use App\Models\License;
use App\Support\AuditLogger;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * یادآوری تمدید لایسنس‌های در حال انقضا.
 *
 * هر فروشگاه در چند نقطهٔ زمانی (پیش‌فرض: ۳۰، ۷ و ۰ روز) یک ایمیل می‌گیرد.
 * اگر ایمیل قبلی فرستاده شده باشد دوباره ارسال نمی‌شود؛ شمارندهٔ
 * `license_reminder_stage` روی فروشگاه و با هر تمدید صفر می‌شود.
 *
 * پیشنهاد اجرای روزانه با cron:
 *   php artisan karo:licenses:remind
 */
class SendLicenseReminders extends Command
{
    protected $signature = 'karo:licenses:remind {--dry-run : فقط نشان بده، ایمیل نفرست}';

    protected $description = 'ارسال یادآوری تمدید برای لایسنس‌های در حال انقضا';

    public function handle(): int
    {
        $windows = $this->windows();
        $dryRun = (bool) $this->option('dry-run');
        $sent = 0;
        $skipped = 0;

        $licenses = License::query()
            ->with(['store' => fn ($query) => $query->with('users')])
            ->where('is_active', true)
            ->where('is_lifetime', false)
            ->whereNotNull('expires_at')
            ->get();

        foreach ($licenses as $license) {
            $store = $license->store;

            if ($store === null || ! $store->is_active) {
                $skipped++;

                continue;
            }

            $daysLeft = (int) now()->startOfDay()->diffInDays($license->expires_at->copy()->startOfDay(), false);

            // آخرین پنجره‌ای که مشمول آن شده‌ایم (مثلاً ۸ روز مانده ⇒ پنجرهٔ ۳۰ روز)
            $targetStage = 0;
            foreach ($windows as $index => $window) {
                if ($daysLeft <= $window) {
                    $targetStage = $index + 1;
                }
            }

            if ($targetStage <= (int) $store->license_reminder_stage) {
                $skipped++;

                continue;
            }

            $window = $windows[$targetStage - 1];
            $emails = $store->users->pluck('email')->filter()->unique()->values();

            if ($emails->isEmpty()) {
                $skipped++;

                continue;
            }

            if ($dryRun) {
                $this->line("فروشگاه «{$store->name}» — هشدار {$window} روزه به {$emails->implode(', ')}");
                $sent++;

                continue;
            }

            try {
                Mail::to($emails->all())->send(new LicenseExpiringMail(
                    $store,
                    $license,
                    max(0, $daysLeft),
                    url('/settings#license'),
                ));
            } catch (Throwable $exception) {
                $this->warn("ارسال ایمیل به {$store->name} ناموفق بود: {$exception->getMessage()}");
                $skipped++;

                continue;
            }

            $store->forceFill(['license_reminder_stage' => $targetStage])->save();

            AuditLogger::record($daysLeft > 0 ? 'license_expiry_notice' : 'license_expired_notice', [
                'store_id' => $store->id,
                'user_id' => null,
                'subject_type' => 'license',
                'subject_key' => $license->id,
                'meta' => [
                    'days_left' => $daysLeft,
                    'window' => $window,
                    'recipients' => $emails->count(),
                ],
            ]);

            $sent++;
        }

        $this->info($dryRun
            ? "پیش‌نمایش: {$sent} یادآوری ارسال می‌شد، {$skipped} مورد رد شد."
            : "{$sent} یادآوری ارسال شد، {$skipped} مورد نیازی نداشت.");

        return self::SUCCESS;
    }

    /**
     * پنجره‌های یادآوری، همیشه از بزرگ به کوچک.
     *
     * @return list<int>
     */
    private function windows(): array
    {
        $windows = array_values(array_map('intval', (array) config('billing.reminder_days', [7, 3, 1, 0])));
        rsort($windows);

        return $windows;
    }
}
