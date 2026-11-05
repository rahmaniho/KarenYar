<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HeldSale extends Model
{
    use HasFactory;

    protected $fillable = [
        'store_id',
        'label',
        'items',
        'customer_id',
        'customer_name',
        'discount_type',
        'discount_value',
        'tax_percent',
        'note',
        'checkout_key',
    ];

    protected function casts(): array
    {
        return [
            'items' => 'array',
            'discount_value' => 'decimal:2',
            'tax_percent' => 'decimal:2',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
