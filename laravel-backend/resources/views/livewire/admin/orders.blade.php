<div>
    @if ($status ?? null)
        <div class="toast toast-success" role="status">{{ $status }}</div>
    @endif

    @if ($tradeRequests->isNotEmpty())
        <section class="card card-warn">
            <div class="card-head">
                <h2>در انتظار تعیین تکلیف ({{ count($tradeRequests) }})</h2>
                <a class="btn btn-ghost btn-sm" href="{{ route('admin.history') }}" wire:navigate>تاریخچه کامل</a>
            </div>

            <div class="trade-request-list">
                @foreach ($tradeRequests as $request)
                    @php($reqBadge = $request->kind === 'buy' ? 'badge-buy' : 'badge-sell')
                    @php($reqLabel = $request->kind === 'buy' ? 'خرید' : 'فروش')
                    @php($reqStatus = $request->status === 'approved' ? 'تأیید شد' : ($request->status === 'rejected' ? 'رد شد' : 'در انتظار'))
                    @php($reqName = \App\Support\Products::name($request->product))
                    @php($reqUnit = \App\Support\Products::unit($request->product))
                    @php($reqBuy = \App\Support\PriceService::buyPrice($request->product))
                    @php($reqSell = \App\Support\PriceService::sellPrice($request->product))
                    <div class="trade-request-row">
                        <div class="tr-main">
                            <span class="badge {{ $reqBadge }}">{{ $reqLabel }}</span>
                            <span class="muted">{{ $reqName }}</span>
                            <strong>{{ $request->user?->name }}</strong>
                            <span dir="ltr">{{ $request->user?->phone }}</span>
                            @if ($request->weight !== null)
                                <span>{{ \App\Support\Format::num($request->weight) }} {{ $reqUnit }}</span>
                            @else
                                <span>{{ \App\Support\Format::num($request->amount) }} تومان</span>
                            @endif
                            @if ($request->min_price !== null)
                                <span class="muted">بازه: {{ \App\Support\Format::num($request->min_price) }} تا {{ \App\Support\Format::num($request->max_price) }} تومان</span>
                            @endif
                            <span class="muted">قیمت خرید امروز {{ $reqName }}: {{ \App\Support\Format::num($reqBuy) }} — فروش امروز: {{ \App\Support\Format::num($reqSell) }} تومان</span>
                        </div>
                        <div class="tr-meta">
                            <span class="badge {{ $request->status === 'approved' ? 'badge-buy' : ($request->status === 'rejected' ? 'badge-sell' : 'badge-delivery') }}">{{ $reqStatus }}</span>
                            <span class="muted">{{ \App\Support\Jalali::format($request->created_at) }}</span>
                            <button class="btn btn-danger btn-sm" type="button"
                                    wire:click="deleteRequest({{ $request->id }})"
                                    wire:confirm="این سفارش حذف شود؟">حذف</button>
                        </div>
                        @if ($request->status === 'pending')
                            <form wire:submit="approveRequest({{ $request->id }})" class="issue-form">
                                <div class="field">
                                    <label>یادداشت برای کاربر (اختیاری)</label>
                                    <input type="text" wire:model="requestNotes.{{ $request->id }}" dir="rtl"
                                           placeholder="مثلاً: انجام شد، برای هماهنگی تماس بگیرید">
                                </div>
                                <div class="filters-actions">
                                    <button class="btn btn-gold btn-sm" type="submit">تأیید</button>
                                    <button class="btn btn-danger btn-sm" type="button"
                                            wire:click="rejectRequest({{ $request->id }})"
                                            wire:confirm="این سفارش رد شود؟">رد</button>
                                </div>
                            </form>
                        @elseif ($request->note)
                            <p class="muted">پاسخ مدیر: {{ $request->note }}</p>
                        @endif
                    </div>
                @endforeach
            </div>
            <div class="card-foot muted">بعد از تأیید یا رد، سفارش از این لیست خارج و در تاریخچه کامل نگه داشته می‌شود.</div>
        </section>
    @endif

    <section class="card">
        <div class="card-head">
            <h2>فاکتورها</h2>
            <div class="filters-actions">
                <button class="icon-toggle {{ ($this->product !== '' || $this->invoiceNo !== '' || $this->userId !== '') ? 'active' : '' }}"
                        type="button" wire:click="toggleFilters" aria-label="فیلتر فاکتورها">🔍</button>
                <a class="btn btn-gold btn-sm" href="{{ route('admin.orders.create') }}" wire:navigate>+ فاکتور جدید</a>
            </div>
        </div>

        @if ($this->showFilters)
            <div class="filters">
                <div class="field">
                    <label for="product">نوع محصول</label>
                    <select id="product" wire:model.live="product">
                        <option value="">همه</option>
                        @foreach ($products as $product)
                            <option value="{{ $product['key'] }}">{{ $product['name'] }}</option>
                        @endforeach
                    </select>
                </div>
                <div class="field">
                    <label for="user_id">کاربر</label>
                    <select id="user_id" wire:model.live="userId">
                        <option value="">همه</option>
                        @foreach ($users as $user)
                            <option value="{{ $user->id }}">{{ $user->name }}</option>
                        @endforeach
                    </select>
                </div>
                <div class="field">
                    <label for="invoice_no">جستجو</label>
                    <input id="invoice_no" type="text" wire:model.live.debounce.500ms="invoiceNo" dir="auto"
                           placeholder="شماره فاکتور، تاریخ، مبلغ، موبایل یا شماره مشتری">
                </div>
                <div class="filters-actions">
                    <button class="btn btn-ghost btn-sm" type="button" wire:click="clearFilters">حذف فیلتر</button>
                </div>
            </div>
        @endif

        @if ($invoices->isEmpty())
            <div class="empty"><p>فاکتوری یافت نشد.</p></div>
        @else
            <div class="order-list">
                @foreach ($invoices as $invoice)
                    @php($productInfo = $products->get($invoice->product))
                    @php($negative = $invoice->kind === 'sell')
                    <div class="order-row no-link">
                        <div class="order-row-compact">
                            <span class="order-date">{{ \App\Support\Jalali::format($invoice->created_at) }}</span>
                            <span class="price-icon product-{{ $productInfo['icon'] }}"></span>
                            <span class="order-product">{{ $productInfo['name'] }}</span>
                            <span class="order-qty {{ $negative ? 'order-qty-negative' : 'order-qty-positive' }}">{{ $negative ? '−' : '+' }}{{ \App\Support\Format::num($invoice->quantity) }}</span>
                            @if ($invoice->kind === 'delivery')
                                <span class="order-total">—</span>
                            @else
                                <span class="order-total {{ $negative ? 'order-qty-negative' : 'order-qty-positive' }}">{{ $negative ? '−' : '+' }}{{ \App\Support\Format::num($invoice->total) }}</span>
                            @endif
                            <span class="order-no" dir="ltr">{{ \App\Support\Jalali::prettyInvoiceNo($invoice->invoice_no) }}</span>
                            <button class="order-dots" type="button" wire:click="toggleDetails({{ $invoice->id }})"
                                    aria-label="جزییات فاکتور">⋯</button>
                        </div>

                        @if ($expanded[$invoice->id] ?? false)
                            <div class="order-details">
                                <div class="order-details-main">
                                    <span class="order-product">{{ $productInfo['name'] }} ({{ $productInfo['unit'] }})</span>
                                    @if ($invoice->kind === 'delivery')
                                        <span class="order-total">—</span>
                                    @else
                                        <span class="order-total {{ $negative ? 'order-qty-negative' : 'order-qty-positive' }}">{{ $negative ? '−' : '+' }}{{ \App\Support\Format::num($invoice->total) }}</span>
                                    @endif
                                    <span class="order-user">— {{ $invoice->user?->name }}</span>
                                </div>
                                <div class="order-details-meta">
                                    <span>{{ \App\Support\Jalali::format($invoice->created_at) }}</span>
                                    <span>{{ \App\Support\Format::num($invoice->quantity) }} {{ $productInfo['unit'] }}
                                        × {{ \App\Support\Format::num($invoice->unit_price) }}</span>
                                    @if ($invoice->description)
                                        <span>{{ $invoice->description }}</span>
                                    @endif
                                </div>
                                <div class="order-actions">
                                    <a class="btn btn-ghost btn-sm" href="{{ route('admin.orders.edit', $invoice) }}" wire:navigate>ویرایش</a>
                                    <button class="btn btn-danger btn-sm" type="button"
                                            wire:click="destroy({{ $invoice->id }})"
                                            wire:confirm="این فاکتور حذف شود؟">حذف</button>
                                </div>
                            </div>
                        @endif
                    </div>
                @endforeach
            </div>

            @if ($invoices->hasPages())
                <div class="pager">{!! $invoices->links() !!}</div>
            @endif
        @endif
    </section>
</div>