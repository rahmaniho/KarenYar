<div>
    <section class="card">
        <div class="card-head">
            <h2>{{ $invoice ? 'ویرایش فاکتور' : 'صدور فاکتور جدید' }}</h2>
            <a class="btn btn-ghost btn-sm" href="{{ route('admin.orders') }}" wire:navigate>بازگشت</a>
        </div>

        @if ($invoice)
            <div class="notice">شماره فاکتور: <strong dir="ltr">{{ \App\Support\Jalali::prettyInvoiceNo($invoice->invoice_no) }}</strong></div>
        @endif

        <form wire:submit="save" class="form">
            <div class="field">
                <label for="userPhone">مشتری — شماره تلفن</label>
                <input id="userPhone" type="tel" wire:model.live.debounce.300ms="userPhone" dir="ltr"
                       placeholder="شماره موبایل مشتری را وارد کنید" autocomplete="off">
                @error('userId') <span class="field-err">{{ $message }}</span> @enderror
            </div>

            <div class="field">
                <label for="userId">شماره مشتری</label>
                <input id="userId" type="number" min="1" wire:model.live.debounce.300ms="userId" dir="ltr"
                       placeholder="شماره مشتری به‌صورت خودکار پر می‌شود">
            </div>

            <div class="field">
                <label for="userName">نام مشتری</label>
                <input id="userName" type="text" wire:model="userName" readonly
                       placeholder="بعد از وارد کردن تلفن یا شماره مشتری، نام نمایش داده می‌شود">
                @if (($this->userPhone !== '' || $this->userId !== '') && $this->userName === '')
                    <span class="field-err">کاربری با این مشخصات یافت نشد.</span>
                @endif
            </div>

            @if ($this->customer)
                <div class="customer-ref-panel">
                    <div class="cr-row">
                        <span>معرف</span>
                        <strong>{{ $this->customer->referrer?->name ?? 'بدون معرف' }}
                            @if ($this->customer->referrer)
                                <span class="cr-phone" dir="ltr">({{ $this->customer->referrer->phone }})</span>
                            @endif
                        </strong>
                    </div>
                    <div class="cr-row">
                        <span>تراکنش‌های بدون کارمزد باقی‌مانده</span>
                        <strong>{{ \App\Support\Format::num($this->customer->free_transactions) }}</strong>
                    </div>
                    <div class="cr-row">
                        <span>کد معرف مشتری</span>
                        <strong dir="ltr">{{ $this->customer->referralCode() }}</strong>
                    </div>
                </div>
            @endif

            <div class="form-grid">
                <div class="field">
                    <label for="product">نوع محصول</label>
                    <select id="product" wire:model.live="product" required>
                        @foreach ($products as $product)
                            <option value="{{ $product['key'] }}">{{ $product['name'] }}</option>
                        @endforeach
                    </select>
                </div>

                <div class="field">
                    <label for="kind">نوع معامله</label>
                    <select id="kind" wire:model.live="kind" required>
                        <option value="buy">خرید از مشتری</option>
                        <option value="sell">فروش به مشتری</option>
                        <option value="delivery">تحویل فیزیکی به مشتری</option>
                    </select>
                </div>
            </div>

            @if ($this->kind === 'delivery')
                <div class="notice">فاکتور تحویل فیزیکی فقط مقدار و نوع محصول را ثبت می‌کند؛ قیمت، اجرت ساخت، سود و کارمزد برای آن محاسبه نمی‌شود.</div>
            @endif

            <div class="form-grid">
                <div class="field">
                    <label for="quantity">مقدار</label>
                    <div class="input-with-unit">
                        <input id="quantity" type="number" step="any" min="0.0001" wire:model.live="quantity" required>
                        <span class="input-unit">{{ $this->unit }}</span>
                    </div>
                    @error('quantity') <span class="field-err">{{ $message }}</span> @enderror
                </div>

                @if ($this->kind !== 'delivery')
                    <div class="field">
                        <label for="unitPrice">قیمت واحد (تومان)</label>
                        <input id="unitPrice" type="text" inputmode="decimal" dir="ltr" data-num-input
                               wire:model.live="unitPrice" required>
                        @error('unitPrice') <span class="field-err">{{ $message }}</span> @enderror
                    </div>
                @endif
            </div>

            <div class="percent-fields">
                @if ($this->kind !== 'delivery' && $this->formula === 'gold')
                    <div class="form-grid">
                        <div class="field">
                            <label for="laborPercent">اجرت ساخت (٪)</label>
                            <input id="laborPercent" type="number" step="0.01" min="0" max="100" wire:model.live="laborPercent">
                        </div>
                        <div class="field">
                            <label for="profitPercent">سود (٪)</label>
                            <input id="profitPercent" type="number" step="0.01" min="0" max="100" wire:model.live="profitPercent">
                        </div>
                        <div class="field">
                            <label for="vatPercent">مالیات (٪)</label>
                            <input id="vatPercent" type="number" step="0.01" min="0" max="100" wire:model.live="vatPercent">
                        </div>
                    </div>
                @elseif ($this->kind !== 'delivery' && $this->formula === 'dollar')
                    <div class="form-grid">
                        <div class="field">
                            <label for="commissionPercent">کارمزد (٪)</label>
                            <input id="commissionPercent" type="number" step="0.01" min="0" max="100" wire:model.live="commissionPercent">
                        </div>
                    </div>
                @endif
            </div>

            <div class="field">
                <label for="description">توضیحات (اختیاری)</label>
                <textarea id="description" rows="3" wire:model="description"></textarea>
            </div>

            @if ($this->kind !== 'delivery' && ($this->quantity ?? '') !== '' && (float) $this->quantity > 0 && ($this->unitPrice ?? '') !== '' && (float) $this->unitPrice > 0)
                <div class="preview-box">
                    مبلغ کل فاکتور: <strong>{{ \App\Support\Format::money($this->preview['total']) }}</strong>
                </div>
            @endif

            <div class="filters-actions">
                <button class="btn btn-gold btn-block" type="submit" wire:loading.attr="disabled">{{ $invoice ? 'ذخیره تغییرات' : 'صدور فاکتور' }}</button>
            </div>
        </form>
    </section>
</div>
