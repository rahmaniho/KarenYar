<?php

namespace App\Support;

use App\Models\Invoice;
use App\Models\User;

/**
 * Computes each user's holdings (دارایی) from their invoices.
 *
 * For every product we sum, from the customer's point of view:
 * netQuantity = Σ(sell) − Σ(buy) − Σ(delivery). A "فروش به مشتری" (sell)
 * invoice means the shop sold goods to this customer, so the customer
 * bought them and their holding increases; a "خرید از مشتری" (buy) invoice
 * means the customer sold them back, and a physical delivery (تحویل
 * فیزیکی) hands the goods over, so both reduce the holding. The shop's own
 * books are the mirror image (buy and delivery add back, sell subtracts),
 * which the admin order list reflects.
 *
 * The holding is valued at today's price. Gold is measured in grams, coins
 * in pieces and dollars in dollar amounts, so the total value of every
 * product is a comparable Toman figure.
 */
class HoldingsService
{
    /**
     * The net holdings for a single user, keyed by product.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function forUser(?User $user): array
    {
        if (! $user) {
            $result = [];

            foreach (Products::keys() as $product) {
                $result[$product] = [
                    'product' => $product,
                    'quantity' => 0,
                    'value' => 0,
                ];
            }

            return $result;
        }

        $quantities = [];

        foreach (Products::keys() as $product) {
            $quantities[$product] = 0;
        }

        foreach (Invoice::where('user_id', $user->id)->get() as $invoice) {
            $quantity = (float) $invoice->quantity;
            $subtracts = ($invoice->kind === 'buy' || $invoice->kind === 'delivery');
            $quantities[$invoice->product] += ($subtracts ? -1 : 1) * $quantity;
        }

        $result = [];

        foreach ($quantities as $product => $quantity) {
            $result[$product] = [
                'product' => $product,
                'quantity' => round($quantity, 4),
                'value' => (int) (round($quantity, 4) * PriceService::buyPrice($product)),
            ];
        }

        return $result;
    }

    /**
     * The total Toman value of one user's holdings.
     */
    public static function totalForUser(?User $user): int
    {
        $total = 0;

        foreach (static::forUser($user) as $holding) {
            $total += $holding['value'];
        }

        return $total;
    }

    /**
     * Aggregate holdings across every approved user, keyed by product.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function forAllUsers(): array
    {
        $result = [];

        foreach (Products::keys() as $product) {
            $result[$product] = [
                'product' => $product,
                'quantity' => 0,
                'value' => 0,
            ];
        }

        foreach (User::where('role', 'user')->get() as $user) {
            foreach (static::forUser($user) as $product => $holding) {
                $result[$product]['quantity'] = round(
                    (float) $result[$product]['quantity'] + $holding['quantity'], 4
                );
                $result[$product]['value'] += $holding['value'];
            }
        }

        return $result;
    }

    /**
     * The total Toman value of all users' holdings combined.
     */
    public static function totalForAllUsers(): int
    {
        $total = 0;

        foreach (static::forAllUsers() as $holding) {
            $total += $holding['value'];
        }

        return $total;
    }
}
