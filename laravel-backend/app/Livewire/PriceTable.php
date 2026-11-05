<?php

namespace App\Livewire;

use App\Models\Setting;
use App\Support\PriceService;
use App\Support\Products;
use Livewire\Component;

/**
 * Today's prices table, shown on the landing page and both dashboards.
 *
 * The component is self-contained: it reads the products, the stored
 * prices and the gold-ounce banner straight from the services, so every
 * host page only mounts it. Hosts give it `wire:poll.60s` so the table
 * stays live without re-rendering the rest of the page.
 */
class PriceTable extends Component
{
    /** Whether the admin "مدیریت قیمت‌ها" shortcut shows in the card head. */
    public bool $showManageLink = false;

    /** Whether the Toman disclaimer shows in the card footer (landing page). */
    public bool $showDisclaimer = false;

    public function render()
    {
        PriceService::maybeAutoRefresh();

        return view('livewire.price-table', [
            'products' => Products::collection(),
            'prices' => PriceService::all(),
            'lastRefreshAt' => Setting::get('last_refresh_at', ''),
            'goldOuncePrice' => Setting::get('gold_ounce_price', ''),
            'goldOunceChange' => Setting::get('gold_ounce_change', null),
        ]);
    }
}
