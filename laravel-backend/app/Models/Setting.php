<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['key', 'value'])]
#[Table(name: 'settings', key: 'key')]
class Setting extends Model
{
    /**
     * Get a setting value by key, or the given default when absent.
     *
     * @param  mixed  $default
     * @return mixed
     */
    public static function get(string $key, $default = null)
    {
        $setting = static::where('key', $key)->first();

        return $setting ? $setting->value : $default;
    }

    /**
     * Remember a setting value by key.
     *
     * @param  mixed  $value
     */
    public static function put(string $key, $value): void
    {
        $setting = static::where('key', $key)->first();

        if ($setting) {
            $setting->update(['value' => (string) $value]);
        } else {
            static::create(['key' => $key, 'value' => (string) $value]);
        }
    }
}
