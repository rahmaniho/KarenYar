<div>
    @if ($status ?? null)
        <div class="toast toast-success" role="status">{{ $status }}</div>
    @endif

    <section class="card">
        <div class="card-head">
            <h2>اخبار</h2>
            <a class="btn btn-gold btn-sm" href="{{ route('admin.news.create') }}" wire:navigate>+ خبر جدید</a>
        </div>

        @if ($items->isEmpty())
            <div class="empty"><p>خبری منتشر نشده است.</p></div>
        @else
            <div class="post-list">
                @foreach ($items as $item)
                    <div class="post-row">
                        <div class="post-body">
                            <div class="post-title">{{ $item->title }}</div>
                            <div class="post-meta">{{ \App\Support\Jalali::dateTime($item->created_at) }}</div>
                            <div class="post-excerpt">{{ \Illuminate\Support\Str::limit($item->body, 120) }}</div>
                        </div>
                        <div class="post-actions">
                            <a class="btn btn-ghost btn-sm" href="{{ route('admin.news.edit', $item) }}" wire:navigate>ویرایش</a>
                            <button class="btn btn-danger btn-sm" type="button"
                                    wire:click="destroy({{ $item->id }})"
                                    wire:confirm="این خبر حذف شود؟">حذف</button>
                        </div>
                    </div>
                @endforeach
            </div>

            @if ($items->hasPages())
                <div class="pager">{!! $items->links() !!}</div>
            @endif
        @endif
    </section>
</div>