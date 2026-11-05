<?php

namespace App\Livewire\Admin;

use App\Models\News as NewsModel;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;
use Livewire\WithPagination;

#[Layout('layouts.app')]
#[Title('مدیریت اخبار')]
class News extends Component
{
    use WithPagination;

    /**
     * Delete a news item.
     */
    public function destroy(NewsModel $news): void
    {
        $news->delete();

        $this->status = 'خبر حذف شد.';
    }

    public function render()
    {
        return view('livewire.admin.news', [
            // Telegram-style: oldest first so the latest sits at the bottom.
            'items' => NewsModel::orderBy('id')->paginate(15),
        ]);
    }

    public function paginationView()
    {
        return 'pagination.simple';
    }
}
