<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['product', 'buy_price', 'sell_price', 'intrinsic_value', 'change', 'bubble'])]
#[Table('prices')]
class Price extends Model
{
    //
}
