<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Debt extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'kind',
        'amount',
        'paid_amount',
        'installments_count',
        'installment_amount',
        'paid_installments',
        'due_date',
        'description',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'paid_amount' => 'decimal:2',
            'installment_amount' => 'decimal:2',
            'due_date' => 'datetime',
        ];
    }
}
