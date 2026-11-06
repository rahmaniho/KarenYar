<?php

namespace App\Services\Billing;

/**
 * کاتالوگ پلن‌های فروش.
 *
 * تنها منبع قیمت و مدت‌زمان پلن‌ها `config/billing.php` است تا تغییر قیمت
 * نیازی به کد نداشته باشد.
 */
class PlanCatalog
{
    /**
     * @return array<string, array{key: string, label: string, tier: string, months: int|null, amount: int, is_lifetime: bool, description: string}>
     */
    public function all(): array
    {
        $plans = [];

        foreach ((array) config('billing.plans', []) as $key => $plan) {
            $months = (int) ($plan['months'] ?? 0);

            $plans[$key] = [
                'key' => $key,
                'label' => (string) ($plan['label'] ?? $key),
                'tier' => (string) ($plan['tier'] ?? 'pro'),
                'months' => $months > 0 ? $months : null,
                'amount' => (int) ($plan['amount'] ?? 0),
                'is_lifetime' => $months === 0,
                'description' => (string) ($plan['description'] ?? ''),
            ];
        }

        return $plans;
    }

    /**
     * @return array{key: string, label: string, tier: string, months: int|null, amount: int, is_lifetime: bool, description: string}|null
     */
    public function find(string $key): ?array
    {
        return $this->all()[$key] ?? null;
    }

    /** آیا این پلن از پلن فعلی «بالاتر» است؟ (برای نمایش پیشنهاد ارتقا) */
    public function rank(string $tier): int
    {
        return match ($tier) {
            'proplus' => 3,
            'pro' => 2,
            default => 1,
        };
    }
}
