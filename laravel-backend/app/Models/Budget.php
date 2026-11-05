<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Budget extends Model
{
    use HasFactory;

    protected $fillable = [
        'store_id',
        'month',
        'category',
        'limit',
    ];

    protected function casts(): array
    {
        return [
            'limit' => 'decimal:2',
        ];
    }
}
