<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class License extends Model
{
    use HasFactory;

    protected $fillable = [
        'store_id',
        'tier',
        'is_lifetime',
        'is_active',
        'starts_at',
        'expires_at',
        'notes',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'is_lifetime' => 'boolean',
            'is_active' => 'boolean',
            'starts_at' => 'datetime',
            'expires_at' => 'datetime',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** آیا لایسنس همین حالا معتبر و فعال است؟ */
    public function isCurrentlyValid(): bool
    {
        if (! $this->is_active) {
            return false;
        }

        if ($this->is_lifetime) {
            return true;
        }

        return $this->expires_at !== null && $this->expires_at->isFuture();
    }

    public function isExpired(): bool
    {
        return ! $this->is_lifetime
            && $this->expires_at !== null
            && $this->expires_at->isPast();
    }

    public function daysRemaining(): ?int
    {
        if ($this->is_lifetime || $this->expires_at === null) {
            return null;
        }

        return (int) max(0, now()->diffInDays($this->expires_at, false));
    }
}
