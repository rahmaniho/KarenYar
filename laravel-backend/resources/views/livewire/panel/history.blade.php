<div>
    <section class="card">
        <div class="card-head">
            <h2>تاریخچه سفارش‌ها</h2>
            <button class="icon-toggle {{ ($this->status !== '' || $this->product !== '') ? 'active' : '' }}"
                    type="button" wire:click="toggleFilters" aria-label="فیلتر تاریخچه">🔍</button>
        </div>

        <p class="muted">سفارش‌های خرید و فروش شما که مدیر آن‌ها را تأیید یا رد کرده است، برای همیشه اینجا نگه داشته می‌شود. سفارش‌های در انتظار در داشبورد نمایش داده می‌شوند.</p>

        <div class="history-stats">
            <span class="history-stat">همه <strong>{{ \App\Support\Format::num($stats['all']) }}</strong></span>
            <span class="history-stat">تأیید شده <strong>{{ \App\Support\Format::num($stats['approved']) }}</strong></span>
            <span class="history-stat">رد شده <strong>{{ \App\Support\Format::num($stats['rejected']) }}</strong></span>
        </div>

        @if ($this->showFilters)
            <div class="filters">
                <div class="field">
                    <label for="historyStatus">وضعیت</label>
                    <select id="historyStatus" wire:model.live="status">
                        <option value="">همه</option>
                        <option value="approved">تأیید شده</option>
                        <option value="rejected">رد شده</option>
                    </select>
                </div>
                <div class="field">
                    <label for="historyProduct">محصول</label>
                    <select id="historyProduct" wire:model.live="product">
                        <option value="">همه</option>
                        @foreach ($products as $product)
                            <option value="{{ $product['key'] }}">{{ $product['name'] }}</option>
                        @endforeach
                    </select>
                </div>
                <div class="filters-actions">
                    <button class="btn btn-ghost btn-sm" type="button" wire:click="clearFilters">حذف فیلتر</button>
                </div>
            </div>
        @endif

        @if ($requests->isEmpty())
            <div class="empty"><p>هنوز سفارشی تأیید یا رد نشده است.</p></div>
        @else
            <div class="trade-request-list">
                @foreach ($requests as $request)
                    <div class="trade-request-card" wire:key="panel-history-{{ $request->id }}">
                        <div class="tr-main">
                            <span class="badge {{ $request->kind === 'buy' ? 'badge-buy' : 'badge-sell' }}">{{ $request->kindLabel() }}</span>
                            <span class="muted">{{ \App\Support\Products::name($request->product) }}</span>
                            <strong>{{ $request->quantityLabel() }}</strong>
                            @if ($range = $request->priceRangeLabel())
                                <span class="muted">{{ $range }}</span>
                            @endif
                        </div>

                        <div class="tr-meta">
                            <span class="badge {{ $request->statusBadgeClass() }}">{{ $request->statusLabel() }}</span>
                            <span class="muted">ثبت: {{ \App\Support\Jalali::dateTime($request->created_at) }}</span>
                            @if ($request->reviewed_at)
                                <span class="muted">پاسخ: {{ \App\Support\Jalali::dateTime($request->reviewed_at) }}</span>
                            @endif
                        </div>

                        @if ($request->note)
                            <p class="tr-note">پاسخ مدیر: {{ $request->note }}</p>
                        @else
                            <p class="muted">مدیر یادداشتی برای این سفارش ثبت نکرده است.</p>
                        @endif
                    </div>
                @endforeach
            </div>

            @if ($requests->hasPages())
                <div class="pager">{!! $requests->links() !!}</div>
            @endif
        @endif
    </section>
</div>
