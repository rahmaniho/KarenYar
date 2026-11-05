<?php

namespace App\Livewire;

use App\Models\Setting;
use App\Support\PriceService;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

#[Layout('layouts.app')]
#[Title('صفحه اصلی')]
class Landing extends Component
{
    /**
     * The public landing page showing today's prices.
     */
    public function render()
    {
        PriceService::maybeAutoRefresh();

        return view('livewire.landing', [
            'contactPhone' => Setting::get('contact_phone', ''),
        ]);
    }
}
