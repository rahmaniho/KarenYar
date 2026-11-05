<?php

namespace App\Support;

use App\Models\Invoice;
use App\Models\User;

/**
 * Computes the unrealised profit (سود) a customer has made on what they
 * still hold.
 *
 * Only the goods that were bought and not handed over yet count: the ones
 * that make up the current holding reported by {@see HoldingsService}. Each
 * remaining unit is matched back to the invoice it came from — the oldest
 * purchases first (FIFO), because a buy-back or a physical delivery always
 * takes the oldest goods out — and its profit is
 *
 *     today's buy price − the unit price on that invoice
 *
 * multiplied by the quantity still held. The price a customer sells back at
 * is the shop's buy price, which is also what the holding is valued at, so
 * the profit is exactly (current value − what was paid for it).
 *
 * Every product is summed separately and all products together give the
 * grand total shown on the customer's dashboard. Gold is measured in grams,
 * coins in pieces and dollars in dollar amounts, so every product's profit
 * is a comparable Toman figure.
 */
class ProfitService
{
    /**
     * The profit per product on a single user's remaining holdings.
     *
     * Each entry carries:
     * - `product`  the machine key,
     * - `quantity` the amount still held,
     * - `cost`     what was paid for those units (Toman),
     * - `value`    what they are worth today (Toman),
     * - `profit`   `value` minus `cost` (Toman, may be negative).
     *
     * @return array<string, array<string, mixed>>
     */
    public static function forUser(?User $user): array
    {
        if (! $user) {
            return [];
        }

        $lots = static::remainingLots($user->id);
        $result = [];

        foreach ($lots as $product => $productLots) {
            $quantity = 0.0;
            $cost = 0.0;

            foreach ($productLots as $lot) {
                $quantity += $lot['quantity'];
                $cost += $lot['quantity'] * $lot['unit_price'];
            }

            $quantity = round($quantity, 4);

            if ($quantity <= 0) {
                continue;
            }

            $price = PriceService::buyPrice($product);
            $value = (int) ($quantity * $price);
            $cost = (int) round($cost);

            $result[$product] = [
                'product' => $product,
                'quantity' => $quantity,
                'cost' => $cost,
                'value' => $value,
                'profit' => $value - $cost,
            ];
        }

        return $result;
    }

    /**
     * The grand total of one user's profit across every product.
     */
    public static function totalForUser(?User $user): int
    {
        $total = 0;

        foreach (static::forUser($user) as $entry) {
            $total += $entry['profit'];
        }

        return $total;
    }

    /**
     * Walk one customer's invoices and keep what is still on their account,
     * per product and per purchase lot.
     *
     * A "فروش به مشتری" (sell) invoice adds a lot — the customer bought at
     * that invoice's unit price. A buy-back (buy) or a physical delivery
     * removes units from the oldest lot first.
     *
     * @return array<string, array<int, array<string, float>>>
     */
    protected static function remainingLots(int $userId): array
    {
        $lots = [];

        foreach (Invoice::where('user_id', $userId)->orderBy('id')->get() as $invoice) {
            $quantity = (float) $invoice->quantity;

            if ($quantity <= 0) {
                continue;
            }

            $lots[$invoice->product] ??= [];

            if ($invoice->kind === 'sell') {
                $lots[$invoice->product][] = [
                    'quantity' => $quantity,
                    'unit_price' => (float) $invoice->unit_price,
                ];

                continue;
            }

            static::consume($lots[$invoice->product], $quantity);
        }

        return $lots;
    }

    /**
     * Take a quantity of units off the front of a product's lots (FIFO).
     *
     * @param  array<int, array<string, float>>  $lots
     */
    protected static function consume(array &$lots, float $quantity): void
    {
        while ($quantity > 0 && $lots !== []) {
            $lot = array_shift($lots);

            if ($lot['quantity'] <= $quantity) {
                $quantity -= $lot['quantity'];

                continue;
            }

            $lot['quantity'] -= $quantity;
            $quantity = 0;
            array_unshift($lots, $lot);
        }
    }
}
