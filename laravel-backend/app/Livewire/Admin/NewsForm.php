<?php

namespace App\Livewire\Admin;

use App\Models\News;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

#[Layout('layouts.app')]
#[Title('خبر جدید')]
class NewsForm extends Component
{
    public ?News $news = null;

    public string $title = '';

    public string $body = '';

    /**
     * Pre-fill the form when editing an existing item.
     */
    public function mount(?News $news = null): void
    {
        $this->news = $news;

        if ($news) {
            $this->title = $news->title;
            $this->body = $news->body;
        }
    }

    /**
     * Persist the news item (create or update).
     */
    public function save(): void
    {
        $data = $this->validate([
            'title' => ['required', 'string', 'max:255'],
            'body' => ['required', 'string'],
        ], [
            'title.required' => 'عنوان را وارد کنید.',
            'body.required' => 'متن را وارد کنید.',
        ]);

        if ($this->news) {
            $this->news->update($data);

            session()->flash('status', 'خبر ویرایش شد.');
        } else {
            News::create($data);

            session()->flash('status', 'خبر منتشر شد.');
        }

        $this->redirectRoute('admin.news');
    }

    public function render()
    {
        return view('livewire.admin.news-form');
    }
}
