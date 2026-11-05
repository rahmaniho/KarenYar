<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Formatting helpers for Persian (fa-IR) display: Persian digits,
 * thousands separators, currency, and compact date rendering.
 */
class Format
{
    /**
     * The Persian digits used for display.
     *
     * @var array<int, string>
     */
    protected const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

    /**
     * Convert Latin digits inside a string into Persian digits.
     *
     * @param  string|int|float|null  $value
     */
    public static function fa($value): string
    {
        $value = (string) ($value ?? '');

        foreach ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as $digit) {
            $value = Str::replace((string) $digit, static::FA_DIGITS[$digit], $value);
        }

        return $value;
    }

    /**
     * Drop the meaningless zeros after the decimal point.
     *
     * Values come out of the database padded to their column's scale, so
     * "100.0000" would otherwise read as 100.000 and "20.200" as 20.200.
     * Zeros that carry the value are kept, so 20.002 stays 20.002.
     */
    public static function trimZeros(string $value): string
    {
        if (! str_contains($value, '.')) {
            return $value;
        }

        $trimmed = rtrim(rtrim($value, '0'), '.');

        // A value made of nothing but zeros (e.g. "0.000") collapses to 0.
        return $trimmed === '' || $trimmed === '-' ? '0' : $trimmed;
    }

    /**
     * Add thousands separators to a number and render with Persian digits.
     *
     * Trailing zeros after the decimal point are dropped, so quantities and
     * prices read as 100 and 20.2 instead of 100.000 and 20.200.
     *
     * @param  string|int|float|null  $value
     */
    public static function num($value, string $separator = '٬'): string
    {
        $value = (string) ($value ?? 0);
        $negative = str_starts_with($value, '-');

        if ($negative) {
            $value = substr($value, 1);
        }

        $parts = explode('.', $value, 2);
        $whole = (string) $parts[0];
        $fraction = count($parts) > 1 ? '.'.$parts[1] : '';

        // Group the whole part from the right in steps of three.
        $grouped = '';
        $remaining = $whole;

        while (strlen($remaining) > 3) {
            $grouped = $separator.substr($remaining, -3).$grouped;
            $remaining = substr($remaining, 0, -3);
        }

        $grouped = $remaining.$grouped;

        return static::fa(static::trimZeros(($negative ? '-' : '').$grouped.$fraction));
    }

    /**
     * Format a number as Iranian Toman currency.
     *
     * @param  string|int|float|null  $value
     */
    public static function money($value): string
    {
        return static::num($value).' تومان';
    }

    /**
     * Zero-pad a number to the given width.
     *
     * @param  int|string  $value
     */
    public static function pad($value, int $width = 2): string
    {
        return Str::padLeft((string) $value, $width, '0');
    }

    /**
     * Format a number for an input field: Latin digits, no separators.
     *
     * @param  string|int|float|null  $value
     */
    public static function input($value): string
    {
        $value = (string) ($value ?? '');

        foreach ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as $digit) {
            $value = Str::replace(static::FA_DIGITS[$digit], (string) $digit, $value);
        }

        return $value;
    }
}
