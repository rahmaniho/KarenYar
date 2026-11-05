<div>
    @if ($feedback)
        <div class="toast toast-success" role="status">{{ $feedback }}</div>
    @endif

    <section class="card">
        <div class="card-head">
            <h2>تاریخچه سفارش‌ها</h2>
            <button class="icon-toggle {{ ($this->status !== '' || $this->product !== '' || $this->search !== '') ? 'active' : '' }}"
                    type="button" wire:click="toggleFilters" aria-label="فیلتر تاریخچه">🔍</button>
        </div>

        <p class="muted">سابقه سفارش‌های خرید و فروش کاربران که تعیین تکلیف شده‌اند و پاسخ مدیر. سفارش‌های در انتظار در صفحه فاکتورها نمایش داده می‌شوند. ویرایش و حذف فقط توسط مدیر انجام می‌شود.</p>

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
                <div class="field">
                    <label for="historySearch">کاربر</label>
                    <input id="historySearch" type="text" wire:model.live.debounce.500ms="search"
                           placeholder="نام یا شماره موبایل">
                </div>
                <div class="filters-actions">
                    <button class="btn btn-ghost btn-sm" type="button" wire:click="clearFilters">حذف فیلتر</button>
                </div>
            </div>
        @endif

        @if ($requests->isEmpty())
            <div class="empty"><p>هنوز سفارشی تعیین تکلیف نشده است.</p></div>
        @else
            <div class="trade-request-list">
                @foreach ($requests as $request)
                    <div class="trade-request-card" wire:key="admin-history-{{ $request->id }}">
                        <div class="tr-main">
                            <span class="badge {{ $request->kind === 'buy' ? 'badge-buy' : 'badge-sell' }}">{{ $request->kindLabel() }}</span>
                            <span class="muted">{{ \App\Support\Products::name($request->product) }}</span>
                            <strong>{{ $request->user?->name ?? 'کاربر حذف‌شده' }}</strong>
                            @if ($request->user)
                                <span class="muted" dir="ltr">{{ $request->user->phone }}</span>
                            @endif
                            <span>{{ $request->quantityLabel() }}</span>
                            @if ($range = $request->priceRangeLabel())
                                <span class="muted">{{ $range }}</span>
                            @endif
                        </div>

                        <div class="tr-meta">
                            <span class="badge {{ $request->statusBadgeClass() }}">{{ $request->statusLabel() }}</span>
                            <span class="muted">ثبت: {{ \App\Support\Jalali::dateTime($request->created_at) }}</span>
                            @if ($request->reviewed_at)
                                <span class="muted">
                                    پاسخ: {{ \App\Support\Jalali::dateTime($request->reviewed_at) }}
                                    @if ($request->reviewer)
                                        — {{ $request->reviewer->name }}
                                    @endif
                                </span>
                            @endif
                        </div>

                        @if ($request->note)
                            <p class="tr-note">پاسخ مدیر: {{ $request->note }}</p>
                        @endif

                        @if ($editing[$request->id] ?? false)
                            <form class="history-edit-form" wire:submit="save({{ $request->id }})">
                                <div class="field">
                                    <label for="history-status-{{ $request->id }}">وضعیت</label>
                                    <select id="history-status-{{ $request->id }}" wire:model="form.{{ $request->id }}.status">
                                        <option value="pending">در انتظار تأیید</option>
                                        <option value="approved">تأیید شده</option>
                                        <option value="rejected">رد شده</option>
                                    </select>
                                    @error('form.'.$request->id.'.status') <span class="field-err">{{ $message }}</span> @enderror
                                </div>

                                <div class="field">
                                    <label for="history-note-{{ $request->id }}">پاسخ مدیر (برای کاربر نمایش داده می‌شود)</label>
                                    <input id="history-note-{{ $request->id }}" type="text"
                                           wire:model="form.{{ $request->id }}.note"
                                           placeholder="مثلاً: انجام شد، برای هماهنگی تماس بگیرید">
                                    @error('form.'.$request->id.'.note') <span class="field-err">{{ $message }}</span> @enderror
                                </div>

                                <div class="filters-actions">
                                    <button class="btn btn-gold btn-sm" type="submit">ذخیره</button>
                                    <button class="btn btn-ghost btn-sm" type="button" wire:click="cancelEdit({{ $request->id }})">انصراف</button>
                                </div>
                            </form>
                        @else
                            <div class="order-actions">
                                <button class="btn btn-ghost btn-sm" type="button" wire:click="edit({{ $request->id }})">ویرایش</button>
                                <button class="btn btn-danger btn-sm" type="button"
                                        wire:click="destroy({{ $request->id }})"
                                        wire:confirm="این سابقه برای همیشه حذف شود؟">حذف</button>
                            </div>
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
