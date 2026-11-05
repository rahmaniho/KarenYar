<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['path', 'title', 'sort_order', 'is_active'])]
#[Table('banners')]
class Banner extends Model
{
    /**
     * Get the URL for the banner image.
     */
    public function getUrlAttribute(): string
    {
        return route('media.show', ['path' => $this->path]);
    }

    /**
     * Scope for active banners ordered by sort_order.
     */
    public function scopeActiveOrdered($query)
    {
        return $query->where('is_active', true)->orderBy('sort_order')->orderBy('id');
    }
}
