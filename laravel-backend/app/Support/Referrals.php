<?php

namespace App\Support;

use App\Models\Setting;
use App\Models\User;

/**
 * Invite-message template shared by the admin settings and the customer's
 * copy button. The {code} placeholder is replaced with each user's code.
 */
class Referrals
{
    /**
     * The default invite message used until the admin customises it.
     */
    public const TEXT = 'با کد معرف من در پلتفرم طلای امین حساب بسازید: {code}';

    /**
     * The admin-configurable template, falling back to the default when
     * nothing (or an empty value) was stored.
     */
    public static function template(): string
    {
        $text = trim(Setting::get('invite_text', ''));

        return $text === '' ? static::TEXT : $text;
    }

    /**
     * The personalised invite message for one user, its invite code
     * injected into the template.
     */
    public static function forUser(?User $user): string
    {
        return str_replace('{code}', $user?->referralCode() ?? '', static::template());
    }
}
