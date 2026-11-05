<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Employee extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'national_id',
        'position',
        'base_salary',
        'children',
        'married',
        'seniority_years',
        'start_date',
    ];

    protected function casts(): array
    {
        return [
            'base_salary' => 'decimal:2',
            'married' => 'boolean',
            'seniority_years' => 'decimal:2',
            'start_date' => 'date',
        ];
    }

    public function payrolls(): HasMany
    {
        return $this->hasMany(Payroll::class);
    }
}
