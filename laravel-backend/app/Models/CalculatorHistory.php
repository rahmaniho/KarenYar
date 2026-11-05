<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CalculatorHistory extends Model
{
    protected $table = 'calculator_history';

    protected $fillable = [
        'expression',
        'result',
    ];
}
