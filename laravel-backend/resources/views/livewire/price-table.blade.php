<section class="card" wire:poll.60s>
    <div class="card-head">
        <h2>قیمت‌های امروز</h2>
        @if ($showManageLink)
            <a class="btn btn-outline btn-sm" href="{{ route('admin.settings') }}" wire:navigate>مدیریت قیمت‌ها</a>
        @endif
    </div>
    <div class="price-list">
        @foreach ($products as $product)
            @php($price = $prices[$product['key']] ?? null)
            <div class="price-row">
                <div class="price-name">
                    <span class="price-icon product-{{ $product['icon'] }}"></span>
                    <div>
                        <div class="price-title">{{ $product['name'] }}</div>
                        <div class="price-unit">
                                @if ($price && $price->bubble !== null)
                                    <span class="price-bubble-chip {{ $price->bubble >= 0 ? 'bubble-up' : 'bubble-down' }}">
                                        <img class="price-bubble-icon" src="{{ asset('images/bubble.png') }}" alt="">
                                        <span>{{ $price->bubble >= 0 ? '+' : '−' }}{{ \App\Support\Format::fa(number_format(abs((float) $price->bubble), 2)) }}٪</span>
                                    </span>
                                @else
                                    واحد: {{ $product['unit'] }}
                                @endif
                            </div>
                    </div>
                </div>
                <div class="price-cols">
                    <div class="price-col">
                        <div class="price-label">قیمت</div>
                        <div class="price-value">{{ $price ? \App\Support\Format::num($price->sell_price) : '—' }}
                            @if ($price && $price->change !== null)
                                <span class="price-bubble {{ $price->change >= 0 ? 'bubble-up' : 'bubble-down' }}">
                                    {{ $price->change >= 0 ? '+' : '' }}{{ \App\Support\Format::fa(number_format(abs((float) $price->change), 2)) }}٪
                                </span>
                            @endif
                        </div>
                    </div>
                </div>
            </div>
            @if ($price && $product['key'] === \App\Support\Products::GOLD18 && $price->intrinsic_value !== null)
                <p class="price-intrinsic-note">ارزش ذاتی این محصول: <strong dir="ltr">{{ \App\Support\Format::num($price->intrinsic_value) }}</strong> تومان</p>
            @endif
        @endforeach
    </div>
    @if ($goldOuncePrice)
        <div class="gold-ounce-banner">
            <span class="gold-ounce-label">انس جهانی طلا:</span>
            <strong class="gold-ounce-value" dir="ltr">{{ \App\Support\Format::num($goldOuncePrice) }}</strong>
            <span class="gold-ounce-unit">دلار</span>
            @if ($goldOunceChange !== null)
                <span class="price-bubble {{ $goldOunceChange >= 0 ? 'bubble-up' : 'bubble-down' }}" style="left: 0rem!important;">
                    {{ $goldOunceChange >= 0 ? '+' : '' }}{{ \App\Support\Format::fa(number_format(abs((float) $goldOunceChange), 2)) }}٪
                </span>
            @endif
        </div>
    @endif
    @if ($showDisclaimer || $lastRefreshAt)
        <div class="card-foot {{ $showDisclaimer ? '' : 'muted' }}">
            @if ($showDisclaimer)
                <div>قیمت‌ها به تومان است و ممکن است در لحظه تغییر کند.</div>
            @endif
            @if ($lastRefreshAt)
                <div>آخرین به‌روزرسانی قیمت‌ها: <strong dir="ltr">{{ \App\Support\Jalali::dateTime($lastRefreshAt) }}</strong></div>
            @endif
        </div>
    @endif
</section>
