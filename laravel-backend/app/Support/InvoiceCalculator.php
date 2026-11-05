<?php

namespace App\Support;

/**
 * Invoice total calculation following the standard Iranian gold invoice formula.
 *
 * Gold (طلای ۱۸ عیار):
 *   raw    = weight × price per gram
 *   labor  = raw × laborPercent
 *   profit = (raw + labor) × profitPercent
 *   vat    = (raw + labor + profit) × vatPercent
 *   final  = raw + labor + profit + vat
 *
 * Coins (سکه‌ها): same shape, but labor / profit / vat are always zero,
 * so the total equals quantity × unit price.
 *
 * Dollar (دلار آمریکا): base = amount × rate, plus a کارمزد commission:
 *   final = base × (1 + commissionPercent)
 */
class InvoiceCalculator
{
    /**
     * Compute the invoice breakdown and total for the given product.
     *
     * @param  string|float  $quantity
     * @param  string|float  $unitPrice
     * @param  string|float  $laborPercent
     * @param  string|float  $profitPercent
     * @param  string|float  $vatPercent
     * @param  string|float  $commissionPercent
     * @return array<string, mixed>
     */
    public static function calculate(
        string $product,
        $quantity,
        $unitPrice,
        $laborPercent = 0,
        $profitPercent = 0,
        $vatPercent = 0,
        $commissionPercent = 0,
    ): array {
        $quantity = (float) $quantity;
        $unitPrice = (float) $unitPrice;

        $raw = $quantity * $unitPrice;

        if (Products::isGold($product)) {
            $labor = $raw * ((float) $laborPercent / 100);
            $profit = ($raw + $labor) * ((float) $profitPercent / 100);
            $vat = ($raw + $labor + $profit) * ((float) $vatPercent / 100);
            $total = $raw + $labor + $profit + $vat;

            return [
                'raw' => round($raw),
                'labor' => round($labor),
                'profit' => round($profit),
                'vat' => round($vat),
                'commission' => 0,
                'total' => round($total),
            ];
        }

        if (Products::isDollar($product)) {
            $labor = 0;
            $profit = 0;
            $vat = 0;
            $commission = $raw * ((float) $commissionPercent / 100);
            $total = $raw + $commission;

            return [
                'raw' => round($raw),
                'labor' => $labor,
                'profit' => $profit,
                'vat' => $vat,
                'commission' => round($commission),
                'total' => round($total),
            ];
        }

        // Coins: everything except the unit price is zero.
        return [
            'raw' => round($raw),
            'labor' => 0,
            'profit' => 0,
            'vat' => 0,
            'commission' => 0,
            'total' => round($raw),
        ];
    }
}
