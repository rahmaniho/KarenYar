<?php

namespace App\Livewire\Panel;

use App\Models\Analysis;
use App\Models\News as NewsModel;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;
use Livewire\WithPagination;

#[Layout('layouts.app')]
#[Title('اخبار و تحلیل بازار')]
class News extends Component
{
    use WithPagination;

    /**
     * The active feed tab: 'news' or 'analyses'.
     */
    public string $tab = 'news';

    /**
     * Switch between the news and analysis feeds.
     */
    public function setTab(string $tab): void
    {
        $this->tab = $tab === 'analyses' ? 'analyses' : 'news';
        $this->resetPage();
    }

    public function render()
    {
        // Telegram-style feed: the oldest item sits on top and the
        // latest item ends up at the very bottom.
        $items = $this->tab === 'analyses'
            ? Analysis::orderBy('id')->paginate(20)
            : NewsModel::orderBy('id')->paginate(20);

        return view('livewire.panel.news', [
            'items' => $items,
            'type' => $this->tab,
        ]);
    }

    public function paginationView()
    {
        return 'pagination.simple';
    }
}
