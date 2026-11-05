<div>
    <section class="card">
        <div class="card-head">
            <h2>فاکتور <span dir="ltr">{{ \App\Support\Jalali::prettyInvoiceNo($invoice->invoice_no) }}</span></h2>
            <a class="btn btn-ghost btn-sm" href="{{ route('panel.orders') }}" wire:navigate>بازگشت</a>
        </div>

        <div class="kv-grid">
            <div class="kv"><span class="kv-key">تاریخ</span><span class="kv-val">{{ \App\Support\Jalali::format($invoice->created_at) }}</span></div>
            <div class="kv"><span class="kv-key">نوع معامله</span><span class="kv-val">
                @php($kindBadge = $invoice->kind === 'sell' ? 'badge-buy' : ($invoice->kind === 'delivery' ? 'badge-delivery' : 'badge-sell'))
                @php($kindLabel = $invoice->kind === 'sell' ? 'خرید' : ($invoice->kind === 'delivery' ? 'تحویل فیزیکی' : 'فروش'))
                <span class="badge {{ $kindBadge }}">{{ $kindLabel }}</span>
            </span></div>
            <div class="kv"><span class="kv-key">محصول</span><span class="kv-val">{{ \App\Support\Products::name($invoice->product) }}</span></div>
            <div class="kv"><span class="kv-key">مقدار</span><span class="kv-val">{{ \App\Support\Format::num($invoice->quantity) }} {{ \App\Support\Products::unit($invoice->product) }}</span></div>
            @if ($invoice->kind !== 'delivery')
                <div class="kv"><span class="kv-key">قیمت واحد</span><span class="kv-val">{{ \App\Support\Format::money($invoice->unit_price) }}</span></div>
            @endif
        </div>

        @if ($invoice->description)
            <div class="notice"><strong>توضیحات:</strong> {{ $invoice->description }}</div>
        @endif

        @if ($invoice->kind === 'delivery')
            <div class="notice">این فاکتور تحویل فیزیکی است و مبلغی برای آن محاسبه نمی‌شود.</div>
        @else
            <div class="invoice-breakdown">
                <div class="ib-row"><span>مبلغ پایه</span><span>{{ \App\Support\Format::money($breakdown['raw']) }}</span></div>

                @if ($breakdown['labor'] > 0)
                    <div class="ib-row"><span>اجرت ({{ \App\Support\Format::num($invoice->labor_percent) }}٪)</span><span>{{ \App\Support\Format::money($breakdown['labor']) }}</span></div>
                @endif

                @if ($breakdown['profit'] > 0)
                    <div class="ib-row"><span>سود ({{ \App\Support\Format::num($invoice->profit_percent) }}٪)</span><span>{{ \App\Support\Format::money($breakdown['profit']) }}</span></div>
                @endif

                @if ($breakdown['vat'] > 0)
                    <div class="ib-row"><span>مالیات ({{ \App\Support\Format::num($invoice->vat_percent) }}٪)</span><span>{{ \App\Support\Format::money($breakdown['vat']) }}</span></div>
                @endif

                @if ($breakdown['commission'] > 0)
                    <div class="ib-row"><span>کارمزد ({{ \App\Support\Format::num($invoice->commission_percent) }}٪)</span><span>{{ \App\Support\Format::money($breakdown['commission']) }}</span></div>
                @endif

                <div class="ib-row ib-total"><span>مبلغ کل</span><span>{{ \App\Support\Format::money($invoice->total) }}</span></div>
            </div>
        @endif
    </section>
</div>
