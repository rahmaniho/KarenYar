<?php

namespace App\Models;

use App\Support\Format;
use App\Support\Products;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id', 'kind', 'product', 'weight', 'amount',
    'min_price', 'max_price', 'status', 'note',
    'reviewed_by', 'reviewed_at',
])]
#[Table('trade_requests')]
class TradeRequest extends Model
{
    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'reviewed_at' => 'datetime',
        ];
    }

    /**
     * Get the user that placed the request.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the admin who approved or rejected the request, if any.
     */
    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    /**
     * The Persian label of the request kind (buy / sell).
     */
    public function kindLabel(): string
    {
        return $this->kind === 'buy' ? 'خرید' : 'فروش';
    }

    /**
     * The Persian label of the request status.
     */
    public function statusLabel(): string
    {
        return match ($this->status) {
            'approved' => 'تأیید شد',
            'rejected' => 'رد شد',
            default => 'در انتظار تأیید مدیر',
        };
    }

    /**
     * The badge class that colours the status label.
     */
    public function statusBadgeClass(): string
    {
        return match ($this->status) {
            'approved' => 'badge-buy',
            'rejected' => 'badge-sell',
            default => 'badge-delivery',
        };
    }

    /**
     * The requested quantity, in the product's own unit.
     */
    public function quantityLabel(): string
    {
        if ($this->weight !== null) {
            return Format::num($this->weight).' '.Products::unit($this->product);
        }

        if ($this->amount !== null) {
            return Format::money($this->amount);
        }

        return '—';
    }

    /**
     * The acceptable price range attached to the request, if any.
     */
    public function priceRangeLabel(): ?string
    {
        if ($this->min_price === null || $this->max_price === null) {
            return null;
        }

        return 'فقط بین '.Format::num($this->min_price).' تا '.Format::num($this->max_price).' تومان';
    }
}
