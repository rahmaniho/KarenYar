<?php

namespace App\Support;

use App\Models\Invoice;

/**
 * Generates unique invoice numbers shaped like: 14050601/2
 *
 * Each number starts with the Jalali date (without dashes), followed by a
 * slash and the per-day sequence number, as requested:
 * "تاریخ بدون - باشه و آخرش اون عدد بیاد" (e.g. 14050601/2).
 */
class InvoiceNumber
{
    /**
     * The separator used between the date and the sequence parts.
     *
     * @var string
     */
    public const SEPARATOR = '/';

    /**
     * Generate the next invoice number for the current day.
     *
     * The sequence is derived from how many invoices already exist for
     * the current Jalali date, which keeps numbers unique and sequential.
     */
    public static function next(?string $dateKey = null): string
    {
        $dateKey ??= Jalali::numberKey();
        $prefix = $dateKey.static::SEPARATOR;
        $count = Invoice::where('invoice_no', 'like', $prefix.'%')->count();

        return $prefix.($count + 1);
    }
}
