<?php

namespace App\Livewire\Panel;

use App\Models\Analysis;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;
use Livewire\WithPagination;

#[Layout('layouts.app')]
#[Title('تحلیل‌ها')]
class Analyses extends Component
{
    use WithPagination;

    public function render()
    {
        return view('livewire.panel.analyses', [
            // Telegram-style feed: the oldest item sits on top and the
            // latest analysis ends up at the very bottom.
            'items' => Analysis::orderBy('id')->paginate(15),
        ]);
    }

    public function paginationView()
    {
        return 'pagination.simple';
    }
}
