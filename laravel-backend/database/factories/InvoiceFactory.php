<?php

namespace Database\Factories;

use App\Models\Invoice;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Invoice>
 */
class InvoiceFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'invoice_no' => '14050626-'.fake()->randomNumber(4, true),
            'user_id' => 1,
            'product' => 'gold18',
            'kind' => 'buy',
            'quantity' => 1,
            'unit_price' => 3520000,
            'labor_percent' => 0,
            'profit_percent' => 0,
            'vat_percent' => 0,
            'commission_percent' => 0,
            'total' => 3520000,
        ];
    }
}
