<?php

namespace App\Services\Billing;

use App\Models\License;
use App\Models\Store;
use Illuminate\Support\Carbon;

/**
 * صدور دورهٔ آزمایشی و اعمال پلن خریداری‌شده روی لایسنس فروشگاه.
 *
 * قواعد مهم:
 * - تمدید همیشه از «تاریخ انقضای فعلی» ادامه می‌دهد (اگر هنوز معتبر باشد)،
 *   پس کاربر با پرداخت زودتر، روزهای باقی‌مانده را از دست نمی‌دهد.
 * - خرید پلن بالاتر (pro → proplus) سطح لایسنس را ارتقا می‌دهد و هرگز
 *   لایسنس مادام‌العمر را به زمان‌دار برنمی‌گرداند.
 * - هر تمدید، شمارندهٔ یادآوری‌ها را صفر می‌کند.
 */
class LicenseService
{
    public function startTrial(Store $store, ?int $createdBy = null, ?int $days = null): License
    {
        $days = $days ?? (int) config('billing.trial_days', 14);

        $license = $store->license()->updateOrCreate([], [
            'tier' => 'pro',
            'is_lifetime' => false,
            'is_active' => true,
            'is_trial' => true,
            'starts_at' => now(),
            'expires_at' => now()->addDays(max(1, $days)),
            'notes' => 'دورهٔ آزمایشی رایگان',
            'created_by' => $createdBy,
        ]);

        $this->resetReminders($store);

        return $license;
    }

    /**
     * اعمال یک پلن خریداری‌شده (یا معادل آن از سفارش) روی لایسنس.
     *
     * @param  array{tier: string, months: int|null, is_lifetime: bool}  $plan
     */
    public function applyPlan(Store $store, array $plan, ?int $createdBy = null): License
    {
        $license = $store->license()->first();
        $tier = $this->resolveTier($license, $plan);

        if ($plan['is_lifetime']) {
            $attributes = [
                'tier' => $tier,
                'is_lifetime' => true,
                'is_active' => true,
                'is_trial' => false,
                'starts_at' => $license?->starts_at ?? now(),
                'expires_at' => null,
                'notes' => 'لایسنس مادام‌العمر',
            ];
        } else {
            $months = max(1, (int) ($plan['months'] ?? 1));
            $attributes = [
                'tier' => $tier,
                'is_lifetime' => false,
                'is_active' => true,
                'is_trial' => false,
                'starts_at' => $license?->starts_at ?? now(),
                'expires_at' => $this->renewalBase($license)->addMonths($months),
                'notes' => 'تمدید اشتراک',
            ];
        }

        if ($createdBy !== null) {
            $attributes['created_by'] = $createdBy;
        }

        $license = $store->license()->updateOrCreate([], $attributes);
        $this->resetReminders($store);

        return $license;
    }

    /**
     * نقطهٔ شروع تمدید: اگر لایسنس فعلی معتبر است از انقضایش، وگرنه از امروز.
     */
    private function renewalBase(?License $license): Carbon
    {
        if (
            $license !== null
            && ! $license->is_lifetime
            && $license->is_active
            && $license->expires_at !== null
            && $license->expires_at->isFuture()
        ) {
            return $license->expires_at->copy();
        }

        return now();
    }

    /**
     * ارتقا مجاز است، تنزل خودکار نه: لایسنس مادام‌العمر و سطح بالاتر حفظ می‌شود.
     *
     * @param  array{tier: string}  $plan
     */
    private function resolveTier(?License $license, array $plan): string
    {
        if ($license === null) {
            return (string) $plan['tier'];
        }

        if ($license->is_lifetime && $license->isCurrentlyValid()) {
            return $license->tier;
        }

        $ranks = ['pro' => 2, 'proplus' => 3];

        return ($ranks[$plan['tier']] ?? 1) >= ($ranks[$license->tier] ?? 1)
            ? (string) $plan['tier']
            : (string) $license->tier;
    }

    private function resetReminders(Store $store): void
    {
        if ((int) $store->license_reminder_stage !== 0) {
            $store->forceFill(['license_reminder_stage' => 0])->save();
        }
    }
}
