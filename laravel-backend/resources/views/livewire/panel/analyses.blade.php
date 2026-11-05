<div>
    <section class="feed-head">
        <h1>تحلیل بازار</h1>
        <p class="muted">تحلیل‌های روزانه کارشناسان</p>
    </section>

    @if ($items->isEmpty())
        <div class="card empty"><p>تحلیلی منتشر نشده است.</p></div>
    @else
        <div class="feed">
            @foreach ($items as $item)
                <article class="feed-item">
                    <div class="feed-avatar feed-avatar-gold">ت</div>
                    <div class="feed-body">
                        <div class="feed-meta">
                            <span class="feed-channel">تحلیل طلای امین</span>
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
</div>
