<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * فاکتور پرداخت‌شده — بدون فاکتور، سفارش «فروش» محسوب نمی‌شود.
 */
class SubscriptionInvoice extends Model
{
    protected $fillable = [
        'number',
        'order_id',
        'store_id',
        'subtotal',
        'discount',
        'total',
        'lines',
        'issued_at',
    ];

    protected function casts(): array
    {
        return [
            'subtotal' => 'integer',
            'discount' => 'integer',
            'total' => 'integer',
            'lines' => 'array',
            'issued_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
