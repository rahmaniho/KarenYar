<div>
    <section class="card">
        <div class="card-head">
            <h2>فاکتورهای من</h2>
            <button class="icon-toggle {{ ($this->product !== '' || $this->invoiceNo !== '') ? 'active' : '' }}"
                    type="button" wire:click="toggleFilters" aria-label="فیلتر فاکتورها">🔍</button>
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
                    <label for="invoice_no">شماره فاکتور</label>
                    <input id="invoice_no" type="text" wire:model.live.debounce.500ms="invoiceNo" dir="ltr"
                           placeholder="مثلاً 14050601/7">
                </div>
                <div class="filters-actions">
                    <button class="btn btn-ghost btn-sm" type="button" wire:click="clearFilters">حذف فیلتر</button>
                </div>
            </div>
        @endif

        @if ($invoices->isEmpty())
            <div class="empty"><p>فاکتوری یافت نشد.</p></div>
        @else
            <div class="filters-actions">
                <button class="btn btn-outline btn-sm" type="button" wire:click="toggleOrders">
                    {{ $showOrders ? 'بستن فاکتورها ▲' : 'مشاهده فاکتورها ('.\App\Support\Format::num($count).') ▼' }}
                </button>
            </div>

            @if ($showOrders)
                <div class="order-list">
                    @foreach ($invoices as $invoice)
                        @php($productInfo = $products->get($invoice->product))
                        @php($negative = $invoice->kind === 'buy' || $invoice->kind === 'delivery')
                        <div class="order-card">
                            <div class="order-card-top">
                                <span class="order-date">{{ \App\Support\Jalali::format($invoice->created_at) }}</span>
                                <span class="order-no" dir="ltr">{{ \App\Support\Jalali::prettyInvoiceNo($invoice->invoice_no) }}</span>
                            </div>

                            <div class="order-card-main">
                                <span class="price-icon product-{{ $productInfo['icon'] }}"></span>
                                <span class="order-product">{{ $productInfo['name'] }}</span>
                            </div>

                            <div class="order-card-figures">
                                <div class="order-figure-row">
                                    <span class="order-figure-label">مقدار</span>
                                    @if ($invoice->kind === 'delivery')
                                        <span class="order-figure-value">—</span>
                                    @else
                                        <span class="order-figure-value order-qty {{ $negative ? 'order-qty-negative' : 'order-qty-positive' }}">{{ $negative ? '−' : '+' }}{{ \App\Support\Format::num($invoice->quantity) }}</span>
                                    @endif
                                </div>
                                <div class="order-figure-row">
                                    <span class="order-figure-label">مبلغ نهایی</span>
                                    @if ($invoice->kind === 'delivery')
                                        <span class="order-figure-value">—</span>
                                    @else
                                        <span class="order-figure-value order-qty {{ $negative ? 'order-qty-negative' : 'order-qty-positive' }}">{{ $negative ? '−' : '+' }}{{ \App\Support\Format::num($invoice->total) }}</span>
                                    @endif
                                </div>
                            </div>

                            <div class="order-card-actions">
                                <button class="order-dots" type="button" wire:click="toggleDetails({{ $invoice->id }})">بیشتر</button>
                            </div>

                            @if ($expanded[$invoice->id] ?? false)
                                <div class="order-details">
                                    <div class="order-details-main">
                                        <span class="order-product">{{ $productInfo['name'] }} ({{ $productInfo['unit'] }})</span>
                                        <span class="order-details-qty">{{ \App\Support\Format::num($invoice->quantity) }} {{ $productInfo['unit'] }}
                                            × {{ \App\Support\Format::num($invoice->unit_price) }} تومان</span>
                                    </div>
                                    @if ($invoice->description)
                                        <div class="order-details-meta"><span>{{ $invoice->description }}</span></div>
                                    @endif
                                    <div class="order-actions">
                                        <a class="btn btn-ghost btn-sm" href="{{ route('panel.order.show', $invoice) }}" wire:navigate>مشاهده فاکتور</a>
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
        @endif
    </section>
</div>