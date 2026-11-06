<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Store extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'slug',
        'owner_name',
        'phone',
        'address',
        'is_active',
        'license_reminder_stage',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'license_reminder_stage' => 'integer',
        ];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function license(): HasOne
    {
        return $this->hasOne(License::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }
}
