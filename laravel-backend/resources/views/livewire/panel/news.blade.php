<div>
    <section class="feed-head">
        <h1>اخبار و تحلیل بازار</h1>
        <p class="muted">آخرین اخبار و تحلیل‌های طلا، سکه و ارز</p>
    </section>

    <section class="card">
        <div class="card-head">
            <div class="tabs" role="tablist">
                <button class="tab {{ $type === 'news' ? 'active' : '' }}" type="button" wire:click="setTab('news')" role="tab">اخبار</button>
                <button class="tab {{ $type === 'analyses' ? 'active' : '' }}" type="button" wire:click="setTab('analyses')" role="tab">تحلیل</button>
            </div>
        </div>

        @if ($items->isEmpty())
            <div class="card empty"><p>{{ $type === 'analyses' ? 'تحلیلی منتشر نشده است.' : 'خبری منتشر نشده است.' }}</p></div>
        @else
            <div class="feed">
                @foreach ($items as $item)
                    <article class="feed-item">
                        <div class="feed-avatar {{ $type === 'analyses' ? 'feed-avatar-gold' : '' }}">{{ $type === 'analyses' ? 'ت' : 'ا' }}</div>
                        <div class="feed-body">
                            <div class="feed-meta">
                                <span class="feed-channel">{{ $type === 'analyses' ? 'تحلیل طلای امین' : 'اخبار طلای امین' }}</span>
                                <span class="feed-time">{{ \App\Support\Jalali::dateTime($item->created_at) }}</span>
                            </div>
                            <h3 class="feed-title">{{ $item->title }}</h3>
                            <div class="feed-text">{{ $item->body }}</div>
                        </div>
                    </article>
                @endforeach
            </div>

            @if ($items->hasPages())
                <div class="pager">{!! $items->links() !!}</div>
            @endif
        @endif
    </section>
</div>