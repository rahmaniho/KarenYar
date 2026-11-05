<div>
    <section class="card hero-card {{ $showBreakdown ? 'breakdown-open' : '' }}">
        <div class="hero-card-label">ارزش کل دارایی کاربران</div>
        <div class="hero-card-value">{{ \App\Support\Format::money($grandTotal) }}</div>
        <div class="hero-card-foot muted">بر اساس قیمت خرید امروز</div>

        <div class="hero-card-breakdown" style="display:{{ $showBreakdown ? 'block' : 'none' }}">
            @foreach ($holdings as $holding)
                @if ($holding['value'] == 0)
                    @continue
                @endif
                <div class="bd-row">
                    <span>{{ $products->get($holding['product'])['name'] }}
                        ({{ \App\Support\Format::num($holding['quantity']) }} {{ $products->get($holding['product'])['unit'] }})</span>
                    <strong>{{ \App\Support\Format::money($holding['value']) }}</strong>
                </div>
            @endforeach
            <div class="bd-row bd-total"><span>جمع کل</span><strong>{{ \App\Support\Format::money($grandTotal) }}</strong></div>
        </div>

        <button class="hero-card-toggle" type="button" wire:click="toggleBreakdown">
            {{ $showBreakdown ? 'بستن جزئیات ▲' : 'مشاهده جزئیات به تفکیک محصول ▼' }}
        </button>
    </section>

    <section class="card">
        <div class="card-head">
            <h2>دارایی کاربران</h2>
            <div class="filters-actions">
                <button class="icon-toggle {{ $search !== '' ? 'active' : '' }}" type="button" wire:click="toggleSearch" aria-label="جستجوی کاربر">🔍</button>
                <button class="btn btn-outline btn-sm" type="button" wire:click="toggleUserBreakdown">
                    {{ $showUserBreakdown ? 'بستن تفکیک محصولات ▲' : 'نمایش به تفکیک محصولات ▼' }}
                </button>
            </div>
        </div>

        @if ($showSearch)
            <div class="filters">
                <div class="field">
                    <label for="dash-user-search">جستجوی کاربر (نام یا شماره)</label>
                    <input id="dash-user-search" type="search" wire:model.live.debounce.300ms="search" dir="auto"
                           placeholder="نام یا شماره موبایل…">
                </div>
            </div>
        @endif

        @if ($users->isEmpty())
            <div class="empty"><p>کاربری یافت نشد.</p></div>
        @else
            <div class="admin-user-list">
                @foreach ($users as $user)
                    <div class="admin-user-row">
                        <div class="admin-user-main">
                            <span class="user-chip">{{ mb_substr($user->name, 0, 1) }}</span>
                            <div>
                                <div class="admin-user-name">{{ $user->name }}</div>
                                <div class="admin-user-phone" dir="ltr">{{ $user->phone }}</div>
                            </div>
                        </div>
                        <div class="admin-user-total">{{ \App\Support\Format::money($totals[$user->id] ?? 0) }}</div>
                    </div>

                    @if ($showUserBreakdown)
                        <div class="user-holding-breakdown">
                            @foreach ($userHoldings[$user->id] as $holding)
                                @if ($holding['quantity'] == 0)
                                    @continue
                                @endif
                                <div class="uh-row">
                                    <span>{{ $products->get($holding['product'])['name'] }}
                                        ({{ \App\Support\Format::num($holding['quantity']) }} {{ $products->get($holding['product'])['unit'] }})</span>
                                    <strong>{{ \App\Support\Format::money($holding['value']) }}</strong>
                                </div>
                            @endforeach
                        </div>
                    @endif
                @endforeach
            </div>

            @if ($users->hasPages())
                <div class="pager">{!! $users->links() !!}</div>
            @endif
        @endif
    </section>

    <livewire:price-table show-manage-link />
</div>
