<?php

namespace App\Support;

use App\Models\Price;
use App\Models\Setting;

/**
 * Price access and auto-update simulation.
 *
 * Prices live in the `prices` table (one row per product, buy & sell).
 * When the admin enables "auto update", the service drifts prices on a
 * small random walk whenever it notices the stored prices are stale,
 * which mimics a live market feed without any external API.
 */
class PriceService
{
    /**
     * How stale (seconds) prices must be before an auto refresh kicks in.
     *
     * @var int
     */
    public const STALE_AFTER = 120;

    /** The setting key holding the reference-site price tolerance (%). */
    public const TOLERANCE_SETTING = 'price_tolerance';

    /**
     * Build a lookup of every product's current price.
     *
     * @return array<string, Price>
     */
    public static function all(): array
    {
        $prices = [];

        foreach (Price::all() as $price) {
            $prices[$price->product] = $price;
        }

        return $prices;
    }

    /**
     * Get the price row for a product, creating it when missing.
     */
    public static function forProduct(string $product): Price
    {
        $price = Price::where('product', $product)->first();

        return $price ?? Price::create([
            'product' => $product,
            'buy_price' => 0,
            'sell_price' => 0,
        ]);
    }

    /**
     * Get the current buy price for a product.
     */
    public static function buyPrice(string $product): int
    {
        return (int) static::forProduct($product)->getAttribute('buy_price');
    }

    /**
     * Get the current sell price for a product.
     */
    public static function sellPrice(string $product): int
    {
        return (int) static::forProduct($product)->getAttribute('sell_price');
    }

    /**
     * Determine whether automatic price updates are enabled.
     */
    public static function autoUpdateEnabled(): bool
    {
        return Setting::get('auto_update', '0') === '1';
    }

    /**
     * The tolerance (%) the admin keeps on the reference-site prices.
     *
     * A positive value prices us above the reference site, a negative one
     * below it, and 0 (the default) takes the reference price as it is.
     */
    public static function tolerancePercent(): float
    {
        return (float) Setting::get(static::TOLERANCE_SETTING, '0');
    }

    /**
     * Apply the reference-price tolerance to a price in Toman.
     *
     * The tolerance is worked out as a separate delta and added to the
     * price, so prices that land exactly on a half Toman round the way the
     * admin expects instead of drifting on the float representation of
     * "1 + percent".
     *
     * @param  float|null  $percent  The tolerance to use, or null for the stored one.
     */
    public static function withTolerance(int $price, ?float $percent = null): int
    {
        $percent ??= static::tolerancePercent();

        return max(0, (int) round($price + ($price * $percent / 100)));
    }

    /**
     * Refresh prices automatically when auto-update is enabled and the
     * stored prices are older than {@see STALE_AFTER} seconds.
     *
     * This is invoked from page loads so the site always feels live.
     */
    public static function maybeAutoRefresh(): void
    {
        if (! static::autoUpdateEnabled()) {
            return;
        }

        $latest = Price::orderByDesc('updated_at')->first();

        if ($latest && now()->diffInSeconds($latest->updated_at) < static::STALE_AFTER) {
            return;
        }

        static::refresh();
    }

    /**
     * Drift every product's buy and sell price along a small random walk.
     *
     * The spread between buy and sell is preserved; values stay positive.
     */
    public static function refresh(float $maxChangePercent = 1.5): void
    {
        foreach ($prices = static::all() as $product => $price) {
            static::drift($price, $maxChangePercent);
        }

        Setting::put('last_refresh_at', now()->toDateTimeString());
    }

    /**
     * Apply one random walk step to a single price row.
     */
    protected static function drift(Price $price, float $maxChangePercent): void
    {
        $buy = (float) $price->getAttribute('buy_price');
        $sell = (float) $price->getAttribute('sell_price');

        if ($buy <= 0) {
            return;
        }

        $factor = 1 + ((mt_rand() / mt_getrandmax()) * 2 - 1) * ($maxChangePercent / 100);
        $buy = max(1, round($buy * $factor));
        $sell = max($buy + 1, round($sell * $factor));

        // The bubble shown in the price lists reflects this drift step,
        // rounded to two decimals like the reference site's changes.
        $change = round(($factor - 1) * 100, 2);

        $price->update([
            'buy_price' => $buy,
            'sell_price' => $sell,
            'change' => $change,
        ]);
    }
}
