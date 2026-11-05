<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Invoice extends Model
{
    use HasFactory;

    protected $fillable = [
        'store_id',
        'number',
        'date',
        'customer_name',
        'customer_id',
        'is_credit',
        'subtotal',
        'discount_type',
        'discount_value',
        'discount_amount',
        'tax_percent',
        'tax_amount',
        'shipping_amount',
        'other_amount',
        'total',
        'due_date',
        'status',
        'source',
        'payment_method',
        'cash_tendered',
        'change_amount',
        'note',
        'terms',
        'internal_note',
        'customer_phone',
        'customer_address',
        'revision',
        'issued_at',
        'checkout_key',
        'checkout_signature',
        'voided_at',
        'void_reason',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'datetime',
            'due_date' => 'datetime',
            'issued_at' => 'datetime',
            'voided_at' => 'datetime',
            'is_credit' => 'boolean',
            'subtotal' => 'decimal:2',
            'discount_value' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'tax_percent' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'shipping_amount' => 'decimal:2',
            'other_amount' => 'decimal:2',
            'total' => 'decimal:2',
            'cash_tendered' => 'decimal:2',
            'change_amount' => 'decimal:2',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(InvoiceItem::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class);
    }

    public function customerPayments(): HasMany
    {
        return $this->hasMany(CustomerPayment::class);
    }

    public function financialEvents(): HasMany
    {
        return $this->hasMany(FinancialEvent::class);
    }

    public function stockMovements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }
}
