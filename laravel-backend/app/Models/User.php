<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable([
    'name', 'phone', 'password', 'role', 'status', 'verification_code',
    'referral_code', 'referrer_id', 'free_transactions', 'referral_bonus_granted',
])]
#[Hidden(['password', 'remember_token'])]
#[Table('users')]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * The characters used in referral codes (no ambiguous 0/O/1/I).
     *
     * @var string
     */
    protected const REFERRAL_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'password' => 'hashed',
        ];
    }

    /**
     * The invoices issued for this user.
     *
     * @return HasMany
     */
    public function invoices()
    {
        return $this->hasMany(Invoice::class);
    }

    /**
     * The user who invited this user with their referral code, if any.
     */
    public function referrer()
    {
        return $this->belongsTo(User::class, 'referrer_id');
    }

    /**
     * The users this user invited, if any.
     *
     * @return HasMany
     */
    public function referrals()
    {
        return $this->hasMany(User::class, 'referrer_id');
    }

    /**
     * The buy / sell requests this user placed.
     *
     * @return HasMany
     */
    public function tradeRequests()
    {
        return $this->hasMany(TradeRequest::class);
    }

    /**
     * Determine if the user is an administrator.
     */
    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    /**
     * Determine if the user has been approved by an administrator.
     */
    public function isApproved(): bool
    {
        return $this->status === 'approved';
    }

    /**
     * Get (and persist on first call) this user's personal referral code.
     *
     * Every user has a unique, short invitation code they can share; it is
     * created lazily so accounts created before this feature still get one.
     */
    public function referralCode(): string
    {
        if ($this->referral_code !== null && $this->referral_code !== '') {
            return $this->referral_code;
        }

        $code = static::generateReferralCode();

        $this->update(['referral_code' => $code]);

        return $code;
    }

    /**
     * Generate a unique referral code.
     */
    public static function generateReferralCode(): string
    {
        $code = '';

        do {
            $code = '';

            for ($i = 0; $i < 6; $i++) {
                $code .= substr(static::REFERRAL_CHARS, random_int(0, strlen(static::REFERRAL_CHARS) - 1), 1);
            }
        } while (User::where('referral_code', $code)->exists());

        return $code;
    }
}
