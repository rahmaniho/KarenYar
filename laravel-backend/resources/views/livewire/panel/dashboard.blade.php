<div>
    @if ($status)
        <div class="toast toast-success" role="status">{{ $status }}</div>
    @endif

    <section class="card hero-card {{ $showBreakdown ? 'breakdown-open' : '' }}">
        <div class="hero-card-top">
            <div>
                <div class="eyebrow">سلام، {{ $user->name }} 👋</div>
                <div class="hero-card-label">ارزش کل دارایی شما</div>
            </div>
        </div>
        <div class="hero-card-value">{{ \App\Support\Format::money($total) }}</div>
        <div class="hero-card-foot muted">محاسبه‌شده بر اساس قیمت خرید امروز</div>

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
            <div class="bd-row bd-total"><span>جمع کل</span><strong>{{ \App\Support\Format::money($total) }}</strong></div>
        </div>

        <button class="hero-card-toggle" type="button" wire:click="toggleBreakdown">
            {{ $showBreakdown ? 'بستن جزئیات ▲' : 'مشاهده جزئیات به تفکیک محصول ▼' }}
        </button>
    </section>

    <section class="card">
        <div class="card-head">
            <h2>سود دارایی شما</h2>
            @if (count($profits) > 0)
                <button class="btn btn-outline btn-sm" type="button" wire:click="toggleProfitBreakdown">
                    {{ $showProfitBreakdown ? 'بستن تفکیک محصولات ▲' : 'نمایش به تفکیک محصولات ▼' }}
                </button>
            @endif
        </div>

        @if (count($profits) === 0)
            <div class="empty"><p>دارایی تحویل‌نگرفته‌ای ندارید؛ سود دارایی‌های شما پس از اولین خرید اینجا نمایش داده می‌شود.</p></div>
        @else
            <div class="profit-total">
                <div class="profit-label">سود کل (بر اساس قیمت خرید امروز)</div>
                <div class="profit-value {{ $profitTotal >= 0 ? 'profit-up' : 'profit-down' }}">
                    {{ $profitTotal < 0 ? '−' : '+' }}{{ \App\Support\Format::money(abs($profitTotal)) }}
                </div>
            </div>

            @if ($showProfitBreakdown)
                <div class="user-holding-breakdown">
                    @foreach ($profits as $entry)
                        @php($profitProduct = $products->get($entry['product']))
                        <div class="uh-row">
                            <span>{{ $profitProduct['name'] }}
                                ({{ \App\Support\Format::num($entry['quantity']) }} {{ $profitProduct['unit'] }})</span>
                            <span class="{{ $entry['profit'] >= 0 ? 'profit-up' : 'profit-down' }}">
                                {{ $entry['profit'] < 0 ? '−' : '+' }}{{ \App\Support\Format::money(abs($entry['profit'])) }}
                            </span>
                        </div>
                    @endforeach
                    <div class="uh-row uh-total">
                        <span>جمع کل</span>
                        <span class="{{ $profitTotal >= 0 ? 'profit-up' : 'profit-down' }}">
                            {{ $profitTotal < 0 ? '−' : '+' }}{{ \App\Support\Format::money(abs($profitTotal)) }}
                        </span>
                    </div>
                </div>
            @endif

            <div class="card-foot muted">فقط دارایی‌هایی که خریده‌اید و هنوز تحویل نگرفته‌اید: تفاوت قیمت واحد فاکتور با قیمت خرید امروز، ضربدر مقدار باقی‌مانده.</div>
        @endif
    </section>

    @if ($banners->isNotEmpty())
        <div class="banners-container" style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem;">
            @foreach ($banners as $banner)
                <div class="banner-card card" style="overflow: hidden;">
                    <img class="panel-banner" src="{{ $banner->url }}" alt="{{ $banner->title ?? 'بنر طلای امین' }}" style="width: 100%; height: auto; display: block;">
                    @if ($banner->title)
                        <div class="banner-title" style="padding: 0.75rem 1rem; background: rgba(0,0,0,0.05); border-top: 1px solid var(--border); font-weight: 500; text-align: center;">{{ $banner->title }}</div>
                    @endif
                </div>
            @endforeach
        </div>
    @endif

    <livewire:price-table />

    <section class="card" id="trade-request">
        <div class="card-head"><h2>ثبت سفارش خرید / فروش</h2></div>

        @if (! $showTradeForm)
            <div class="filters-actions">
                <button class="btn btn-gold btn-block" type="button" wire:click="toggleTradeForm">+ ثبت سفارش جدید</button>
            </div>
            <p class="muted">فرم ثبت سفارش بسته است. برای ثبت سفارش خرید یا فروش، روی دکمه بالا بزنید تا فرم باز شود.</p>
        @else
        <div class="trade-form-wrap">
            <button class="trade-form-close" type="button" wire:click="toggleTradeForm" aria-label="بستن فرم">✕</button>
        <form wire:submit="placeTradeRequest" class="form">
            <div class="field">
                <label for="tradeProduct">محصول</label>
                <select id="tradeProduct" wire:model.live="tradeProduct">
                    @foreach ($products as $product)
                        <option value="{{ $product['key'] }}">{{ $product['name'] }}</option>
                    @endforeach
                </select>
                @error('tradeProduct') <span class="field-err">{{ $message }}</span> @enderror
            </div>

            <div class="form-grid">
                <div class="field">
                    <label for="tradeKind">نوع سفارش</label>
                    <select id="tradeKind" wire:model.live="tradeKind">
                        <option value="sell">فروش (می‌خواهم بفروشم)</option>
                        <option value="buy">خرید (می‌خواهم بخرم)</option>
                    </select>
                    @error('tradeKind') <span class="field-err">{{ $message }}</span> @enderror
                </div>
                <div class="field">
                    @if ($this->tradeKind === 'sell')
                        <label for="trade_rate">قیمت خرید امروز (قیمتی که شما می‌فروشید)</label>
                    @else
                        <label for="trade_rate">قیمت فروش امروز (قیمتی که شما می‌خرید)</label>
                    @endif
                    @php($nowRate = (int) ($this->tradeKind === 'sell' ? $this->tradePrices['buy'] : $this->tradePrices['sell']))
                    @php($rateLow = (int) floor($nowRate * 0.995))
                    @php($rateHigh = (int) ceil($nowRate * 1.005))
                    <input id="trade_rate" class="trade-rate" type="text" readonly dir="ltr"
                           value="{{ \App\Support\Format::num($nowRate) }} تومان">
                    @if ($nowRate > 0)
                        <p class="trade-rate-range">ممکن است قیمت تا زمان ثبت سفارش بین
                            <strong dir="ltr">{{ \App\Support\Format::num($rateLow) }}</strong> تا
                            <strong dir="ltr">{{ \App\Support\Format::num($rateHigh) }}</strong> تومان
                            تغییر کند (در بازه ۰.۵٪ بالاتر و پایین‌تر از قیمت فعلی).
                        </p>
                    @endif
                </div>
            </div>

            <div class="form-grid">
                @if (! $this->tradeAmountHidden())
                    <div class="field">
                        <label for="tradeAmount">مبلغ (تومان)</label>
                        <input id="tradeAmount" type="text" inputmode="decimal" dir="ltr" data-num-input
                               wire:model.live="tradeAmount" placeholder="مثلاً ۱۰۰٬۰۰۰٬۰۰۰">
                        @error('tradeAmount') <span class="field-err">{{ $message }}</span> @enderror
                    </div>
                @endif
                @if (! $this->tradeWeightHidden())
                    <div class="field">
                        <label for="tradeWeight">{{ $this->tradeWeightLabel }}</label>
                        <input id="tradeWeight" type="text" inputmode="decimal" dir="ltr" data-num-input
                               wire:model.live="tradeWeight" placeholder="{{ $this->tradeWeightPlaceholder }}">
                        @error('tradeWeight') <span class="field-err">{{ $message }}</span> @enderror
                    </div>
                @endif
            </div>
            <p class="muted">فقط <strong>یکی</strong> از دو مقدار را بنویسید؛ به محض پر کردن یکی، قسمت دیگری <strong>کاملاً پنهان</strong> می‌شود. مبلغ نهایی را مدیر هنگام صدور فاکتور بر اساس قیمت لحظه‌ای تعیین می‌کند.</p>

            <label class="check">
                <input type="checkbox" wire:model.live="tradeHasRange">
                <span>فقط اگر قیمت در بازه مشخص بود انجام شود (اختیاری)</span>
            </label>

            @if ($this->tradeHasRange)
                <div class="form-grid">
                    <div class="field">
                        <label for="tradeMinPrice">حد پایین بازه قیمت (تومان)</label>
                        <input id="tradeMinPrice" type="text" inputmode="decimal" dir="ltr" data-num-input
                               wire:model.live="tradeMinPrice" placeholder="مثلاً ۲۳٬۰۰۰٬۰۰۰">
                        @error('tradeMinPrice') <span class="field-err">{{ $message }}</span> @enderror
                    </div>
                    <div class="field">
                        <label for="tradeMaxPrice">حد بالای بازه قیمت (تومان)</label>
                        <input id="tradeMaxPrice" type="text" inputmode="decimal" dir="ltr" data-num-input
                               wire:model.live="tradeMaxPrice" placeholder="مثلاً ۲۳٬۲۰۰٬۰۰۰">
                        @error('tradeMaxPrice') <span class="field-err">{{ $message }}</span> @enderror
                    </div>
                </div>
                <p class="muted">این سفارش فقط زمانی انجام می‌شود که <strong>قیمت {{ $this->tradeKind === 'sell' ? 'خرید' : 'فروش' }} امروز</strong> بین این دو مقدار باشد.</p>
            @endif

            <div class="filters-actions">
                <button class="btn btn-gold btn-block" type="submit">ثبت سفارش</button>
            </div>
        </form>
        </div>
        @endif

        @php($myRequests = $this->myTradeRequests)
        @if (count($myRequests) > 0)
            <div class="card-head sub-head">
                <h3>سفارش‌های در انتظار تأیید ({{ \App\Support\Format::num(count($myRequests)) }})</h3>
                <button class="btn btn-outline btn-sm" type="button" wire:click="toggleMyRequests">
                    {{ $showMyRequests ? 'بستن سفارش‌ها ▲' : 'مشاهده سفارش‌ها ▼' }}
                </button>
            </div>

            @if ($showMyRequests)
                <div class="trade-request-list">
                    @foreach ($myRequests as $request)
                        @php($reqBadge = $request->kind === 'buy' ? 'badge-buy' : 'badge-sell')
                        @php($reqLabel = $request->kind === 'buy' ? 'خرید' : 'فروش')
                        @php($reqStatus = $request->status === 'approved' ? 'تأیید شد' : ($request->status === 'rejected' ? 'رد شد' : 'در انتظار تأیید مدیر'))
                        <div class="trade-request-card">
                            <div class="tr-main">
                                <span class="badge {{ $reqBadge }}">{{ $reqLabel }}</span>
                                <span class="muted">{{ \App\Support\Products::name($request->product) }}</span>
                                <strong>
                                    @if ($request->weight !== null)
                                        {{ \App\Support\Format::num($request->weight) }} {{ \App\Support\Products::unit($request->product) }}
                                    @else
                                        {{ \App\Support\Format::num($request->amount) }} تومان
                                    @endif
                                </strong>
                                <span class="muted">
                                    @if ($request->min_price !== null)
                                        فقط بین {{ \App\Support\Format::num($request->min_price) }} تا {{ \App\Support\Format::num($request->max_price) }} تومان
                                    @else
                                        بدون بازه قیمت
                                    @endif
                                </span>
                            </div>
                            <div class="tr-meta">
                                <span class="badge {{ $request->status === 'approved' ? 'badge-buy' : ($request->status === 'rejected' ? 'badge-sell' : 'badge-delivery') }}">{{ $reqStatus }}</span>
                                <span class="muted">{{ \App\Support\Jalali::format($request->created_at) }}</span>
                            </div>
                            @if ($request->note)
                                <p class="muted">پاسخ مدیر: {{ $request->note }}</p>
                            @else
                                <p class="muted">—</p>
                            @endif
                        </div>
                    @endforeach
                </div>
            @endif
        @endif
    </section>

    <section class="card">
        <div class="card-head">
            <h2>تاریخچه سفارش‌ها</h2>
            <a class="btn btn-ghost btn-sm" href="{{ route('panel.history') }}" wire:navigate>مشاهده کامل</a>
        </div>
        <p class="muted">سفارش‌های تعیین‌تکلیف‌شده شما و پاسخ مدیر در یک صفحه جداگانه نگه داشته می‌شود.</p>
    </section>

    @if ($contactPhone)
        <section class="card">
            <div class="contact-bar">
                <span>برای خرید یا فروش، با ما تماس بگیرید:</span>
                <a class="phone-link" href="tel:{{ $contactPhone }}" dir="ltr">{{ $contactPhone }}</a>
            </div>
        </section>
    @endif

    <section class="card">
        <div class="card-head"><h2>کد معرف شما</h2></div>
        <div class="referral-box">
            <p class="muted">این کد را به دوستان‌تان بدهید. با هر دعوت، <strong>۲ تراکنش بدون کارمزد</strong> برای شما فعال می‌شود و وقتی فرد دعوت‌شده اولین معامله‌اش را انجام دهد، <strong>۳ تراکنش بدون کارمزد دیگر</strong> برای شما.</p>
            <div class="referral-code" id="referral-code-copy" dir="ltr">{{ $user->referralCode() }}</div>
            <div class="filters-actions">
                <button class="btn btn-ghost btn-sm" type="button" id="copy-code-btn">کپی کد</button>
            </div>
            <div class="invite-box" id="invite-copy-text">{{ \App\Support\Referrals::forUser($user) }}</div>
            <p class="referral-link" dir="ltr">{{ route('auth.register').'?ref='.$user->referralCode() }}</p>
            <div class="filters-actions">
                <button class="btn btn-outline btn-sm" type="button" id="copy-invite-btn">کپی متن دعوت</button>
                <button class="btn btn-ghost btn-sm" type="button" id="copy-link-btn">کپی لینک ثبت‌نام</button>
            </div>

            @php($referrals = $this->myReferrals)
            @if (count($referrals) > 0)
                <button class="btn btn-outline btn-sm" type="button" wire:click="toggleReferrals">
                    {{ $showReferrals ? 'بستن افرادی که دعوت کرده‌اید ▲' : 'افرادی که با کد شما عضو شدند ('.count($referrals).') ▼' }}
                </button>

                @if ($showReferrals)
                    <div class="referral-list">
                        @foreach ($referrals as $referred)
                            <div class="referral-row">
                                <span>{{ $referred->name }}</span>
                                <span class="muted">{{ \App\Support\Jalali::format($referred->created_at) }}</span>
                            </div>
                        @endforeach
                    </div>
                @endif
            @else
                <p class="muted">هنوز کسی با کد شما عضو نشده است.</p>
            @endif

            @if ($user->referrer)
                <p class="muted">معرف شما: <strong>{{ $user->referrer->name }}</strong></p>
            @endif
            <p class="muted">تراکنش‌های بدون کارمزد باقی‌مانده: <strong>{{ \App\Support\Format::num($user->free_transactions) }}</strong></p>
        </div>
    </section>

    <script>
        // Copy the personalised invite message, the register link or the raw
        // referral code on click. The handler lives on the document so it
        // survives Livewire re-renders of the card, and an empty value is
        // still copied (nothing is silently disabled).
        (function () {
            function copyLegacy(text) {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();

                try {
                    document.execCommand('copy');
                } catch (e) {}

                ta.remove();
            }

            function flashCopied(btn) {
                var old = btn.textContent;
                btn.textContent = '✓ کپی شد';
                setTimeout(function () { btn.textContent = old; }, 2000);
            }

            function copyText(text, btn) {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(function () { flashCopied(btn); }).catch(function () {
                        copyLegacy(text);
                        flashCopied(btn);
                    });
                } else {
                    copyLegacy(text);
                    flashCopied(btn);
                }
            }

            document.addEventListener('click', function (e) {
                var src, text, btn;

                if (e.target && e.target.closest) {
                    var inviteBtn = e.target.closest('#copy-invite-btn');
                    var linkBtn = e.target.closest('#copy-link-btn');
                    var codeBtn = e.target.closest('#copy-code-btn');

                    if (inviteBtn) {
                        src = document.getElementById('invite-copy-text');
                        text = src ? src.textContent : '';
                        copyText(text, inviteBtn);

                        return;
                    }

                    if (linkBtn) {
                        text = document.querySelector('.referral-link').textContent.trim();
                        copyText(text, linkBtn);

                        return;
                    }

                    if (codeBtn) {
                        src = document.getElementById('referral-code-copy');
                        copyText(src ? src.textContent : '', codeBtn);
                    }
                }
            });
        })();
    </script>
</div>
