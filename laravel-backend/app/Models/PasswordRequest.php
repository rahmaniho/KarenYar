<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'phone', 'status', 'issued_password'])]
#[Table('password_requests')]
class PasswordRequest extends Model
{
    /**
     * Get the user the request belongs to, if any.
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
