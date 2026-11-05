<?php

namespace App\Support;

use Illuminate\Support\Collection;

/**
 * Product catalog used across the application.
 *
 * Each product describes:
 * - the machine key stored in the database,
 * - the Persian name / unit displayed in the UI,
 * - the pricing formula it follows (dollar | coin | gold),
 * - the extra fee fields that apply to it.
 */
class Products
{
    public const DOLLAR = 'dollar';

    public const SEKE_TAMAM = 'seke_tamam';

    public const SEKE_EMAMI = 'seke_emami';

    public const NIM_SEKE = 'nim_seke';

    public const ROB_SEKE = 'rob_seke';

    public const GOLD18 = 'gold18';

    /**
     * The full list of products, ordered for display: melted gold 18kt
     * first, then the US dollar, then the coins.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function all(): array
    {
        return [
            static::GOLD18 => ['key' => static::GOLD18,     'name' => 'طلای ۱۸ عیار', 'unit' => 'گرم',  'formula' => 'gold',   'icon' => 'gold'],
            static::DOLLAR => ['key' => static::DOLLAR,     'name' => 'دلار آمریکا', 'unit' => 'دلار',  'formula' => 'dollar', 'icon' => 'dollar'],
            static::SEKE_TAMAM => ['key' => static::SEKE_TAMAM, 'name' => 'سکه تمام',    'unit' => 'عدد',   'formula' => 'coin',   'icon' => 'full'],
            static::SEKE_EMAMI => ['key' => static::SEKE_EMAMI, 'name' => 'سکه امامی',   'unit' => 'عدد',   'formula' => 'coin',   'icon' => 'emami'],
            static::NIM_SEKE => ['key' => static::NIM_SEKE,   'name' => 'نیم سکه',     'unit' => 'عدد',   'formula' => 'coin',   'icon' => 'half'],
            static::ROB_SEKE => ['key' => static::ROB_SEKE,   'name' => 'ربع سکه',     'unit' => 'عدد',   'formula' => 'coin',   'icon' => 'quarter'],
        ];
    }

    /**
     * Get all product metadata.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public static function collection(): Collection
    {
        return new Collection(static::all());
    }

    /**
     * Get the metadata for a single product key.
     *
     * @return array<string, mixed>
     */
    public static function item(string $key): array
    {
        return static::all()[$key];
    }

    /**
     * Get the Persian display name for a product.
     */
    public static function name(string $key): string
    {
        return static::item($key)['name'];
    }

    /**
     * Get the measurement unit label for a product.
     */
    public static function unit(string $key): string
    {
        return static::item($key)['unit'];
    }

    /**
     * All product keys.
     *
     * @return array<int, string>
     */
    public static function keys(): array
    {
        return array_keys(static::all());
    }

    /**
     * Determine whether the given product follows the gold formula.
     */
    public static function isGold(string $key): bool
    {
        return static::item($key)['formula'] === 'gold';
    }

    /**
     * Determine whether the given product is a coin.
     */
    public static function isCoin(string $key): bool
    {
        return static::item($key)['formula'] === 'coin';
    }

    /**
     * Determine whether the given product is the US dollar.
     */
    public static function isDollar(string $key): bool
    {
        return static::item($key)['formula'] === 'dollar';
    }
}
