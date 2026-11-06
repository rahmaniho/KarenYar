<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * سفارش خرید/تمدید لایسنس.
 *
 * چرخهٔ عمر: pending → paid (یا failed/canceled). تنها راه رسیدن به paid،
 * مسیر پرداخت تأییدشده است (درگاه یا تأیید دستی مدیر) تا مبلغ و لایسنس
 * همیشه با هم همخوان باشند.
 */
class Order extends Model
{
    use HasFactory;

    public const STATUS_PENDING = 'pending';

    public const STATUS_PAID = 'paid';

    public const STATUS_FAILED = 'failed';

    public const STATUS_CANCELED = 'canceled';

    protected $fillable = [
        'store_id',
        'user_id',
        'plan',
        'tier',
        'months',
        'is_lifetime',
        'amount',
        'status',
        'gateway',
        'gateway_ref',
        'reference_id',
        'paid_at',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'months' => 'integer',
            'amount' => 'integer',
            'is_lifetime' => 'boolean',
            'paid_at' => 'datetime',
            'meta' => 'array',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isPending(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }

    public function isPaid(): bool
    {
        return $this->status === self::STATUS_PAID;
    }

    /** @param  Builder<Order>  $query */
    public function scopePending(Builder $query): void
    {
        $query->where('status', self::STATUS_PENDING);
    }
}
