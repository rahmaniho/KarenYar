<?php

namespace App\Support;

use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * Gregorian to Jalali (Solar Hijri / Shamsi) calendar conversion helpers.
 *
 * Used to render Persian dates and to build the date portion of invoice numbers.
 */
class Jalali
{
    /**
     * Convert a Gregorian date to a Jalali date using the jdf algorithm.
     *
     * @param  CarbonInterface|string  $date
     * @return array{int, int, int} [year, month, day]
     */
    public static function convert($date): array
    {
        $date = $date instanceof CarbonInterface ? $date : new Carbon($date);

        $gy = (int) $date->format('Y');
        $gm = (int) $date->format('m');
        $gd = (int) $date->format('d');

        $gDm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
        $gy2 = ($gm > 2) ? ($gy + 1) : $gy;
        $days = 355666 + (365 * $gy) + ((int) (($gy2 + 3) / 4)) - ((int) (($gy2 + 99) / 100))
            + ((int) (($gy2 + 399) / 400)) + $gd + $gDm[$gm - 1];

        $jy = -1595 + (33 * ((int) ($days / 12053)));
        $days %= 12053;
        $jy += 4 * ((int) ($days / 1461));
        $days %= 1461;

        if ($days > 365) {
            $jy += (int) (($days - 1) / 365);
            $days = ($days - 1) % 365;
        }

        if ($days < 186) {
            $jm = 1 + (int) ($days / 31);
            $jd = 1 + ($days % 31);
        } else {
            $jm = 7 + (int) (($days - 186) / 30);
            $jd = 1 + (($days - 186) % 30);
        }

        return [$jy, $jm, $jd];
    }

    /**
     * Get today's Jalali date as [year, month, day].
     *
     * @return array{int, int, int}
     */
    public static function today(): array
    {
        return static::convert(now());
    }

    /**
     * Format a Gregorian date as a Persian (Jalali) date string.
     *
     * @param  CarbonInterface|string|null  $date
     */
    public static function format($date = null, string $separator = '/'): string
    {
        [$year, $month, $day] = static::convert($date ?? now());

        return Format::pad($year).$separator.Format::pad($month).$separator.Format::pad($day);
    }

    /**
     * Format a Gregorian date as a Persian (Jalali) date plus the time.
     *
     * @param  CarbonInterface|string|null  $date
     */
    public static function dateTime($date = null, string $separator = '/'): string
    {
        $stamp = $date instanceof CarbonInterface ? $date : new Carbon($date ?? now());

        return static::format($stamp, $separator).' '.Format::fa($stamp->format('H:i'));
    }

    /**
     * Format a date as a compact Jalali key used inside invoice numbers: YYYYMMDD.
     *
     * @param  CarbonInterface|string|null  $date
     */
    public static function numberKey($date = null): string
    {
        [$year, $month, $day] = static::convert($date ?? now());

        return Format::pad($year).Format::pad($month).Format::pad($day);
    }

    /**
     * Parse a Persian date string into a [year, month, day] tuple.
     *
     * Accepts "1405/06/26", "1405-06-26", "14050626" and their Persian-digit
     * variants. Returns null when the input does not look like a date.
     *
     * @return array{int, int, int}|null
     */
    public static function parse(string $input): ?array
    {
        $input = trim(Format::input($input));

        if ($input === '') {
            return null;
        }

        $parts = preg_split('/[\/\-\.]/', $input);
        $parts = $parts === false ? [] : array_values(array_filter($parts, fn ($part) => $part !== ''));

        if ($input !== '' && count($parts) === 1 && strlen($input) === 8 && ctype_digit($input)) {
            $parts = [substr($input, 0, 4), substr($input, 4, 2), substr($input, 6, 2)];
        }

        if (count($parts) !== 3 || ! ctype_digit(implode('', $parts))) {
            return null;
        }

        $year = (int) $parts[0];
        $month = (int) $parts[1];
        $day = (int) $parts[2];

        if ($year < 1300 || $year > 1500 || $month < 1 || $month > 12 || $day < 1 || $day > 31) {
            return null;
        }

        return [$year, $month, $day];
    }

    /**
     * Build the compact Jalali key (YYYYMMDD) for a parsed date tuple.
     *
     * @param  array{int, int, int}  $parts
     */
    public static function numberKeyFromParts(array $parts): string
    {
        [$year, $month, $day] = $parts;

        return Format::pad($year).Format::pad($month).Format::pad($day);
    }

    /**
     * Format a raw invoice number for display.
     *
     * New style invoice numbers (e.g. 14050601/2) are shown as-is: the
     * Jalali date without dashes followed by the sequence number behind a
     * slash. Legacy numbers (e.g. 14050626-0001) are shown in the old
     * dash-separated form (1405-06-26-0001).
     */
    public static function prettyInvoiceNo(string $invoiceNo): string
    {
        if (preg_match('/^(\d{8})\/(\d+)$/', $invoiceNo, $matches) === 1) {
            return $invoiceNo;
        }

        if (preg_match('/^(\d{4})(\d{2})(\d{2})-(.+)$/', $invoiceNo, $matches) === 1) {
            return $matches[1].'-'.$matches[2].'-'.$matches[3].'-'.$matches[4];
        }

        return $invoiceNo;
    }
}
