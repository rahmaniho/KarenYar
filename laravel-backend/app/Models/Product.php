<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    use HasFactory;

    protected $fillable = [
        'store_id',
        'name',
        'barcode',
        'category',
        'buy_price',
        'buy_tax_percent',
        'shipping_per_unit',
        'overhead_per_unit',
        'cost_price',
        'sell_price',
        'stock',
        'unit',
        'min_stock',
    ];

    protected function casts(): array
    {
        return [
            'buy_price' => 'decimal:2',
            'buy_tax_percent' => 'decimal:2',
            'shipping_per_unit' => 'decimal:2',
            'overhead_per_unit' => 'decimal:2',
            'cost_price' => 'decimal:2',
            'sell_price' => 'decimal:2',
            'stock' => 'decimal:3',
            'min_stock' => 'decimal:3',
        ];
    }

    public function invoiceItems(): HasMany
    {
        return $this->hasMany(InvoiceItem::class);
    }

    public function stockMovements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }
}
