<div>
    @if ($status)
        <div class="toast toast-success" role="status">{{ $status }}</div>
    @endif

    <section class="card">
        <div class="card-head">
            <h2>قیمت‌ها</h2>
            <button class="btn btn-outline btn-sm" type="button" wire:click="refreshPrices" wire:loading.attr="disabled">به‌روزرسانی خودکار</button>
        </div>

        <form wire:submit="save" class="form">
            <fieldset class="price-edit">
                <legend>تلرانس قیمت سایت مرجع (٪)</legend>
                <p class="muted">قیمتی که از سایت مرجع (moj3.ir) دریافت می‌شود با این درصد تغییر داده می‌شود: با <strong dir="ltr">0.5</strong> قیمت‌ها ۰.۵٪ بالاتر و با <strong dir="ltr">-0.5</strong> ۰.۵٪ پایین‌تر ثبت می‌شوند. صفر یعنی بدون تغییر.</p>
                <div class="form-grid">
                    <div class="field">
                        <label for="priceTolerance">تلرانس (٪)</label>
                        <input id="priceTolerance" type="text" inputmode="decimal" dir="ltr"
                               wire:model.live.debounce.400ms="priceTolerance" placeholder="مثلاً 0.5 یا ‎-0.5">
                        @error('priceTolerance') <span class="field-err">{{ $message }}</span> @enderror
                    </div>
                    <div class="filters-actions">
                        <button class="btn btn-gold btn-sm" type="button" wire:click="fetchReferencePrices" wire:loading.attr="disabled">
                            <span wire:loading.remove wire:target="fetchReferencePrices">دریافت قیمت‌ها از سایت مرجع</span>
                            <span wire:loading wire:target="fetchReferencePrices">در حال دریافت…</span>
                        </button>
                    </div>
                </div>
                <p class="muted">قیمت‌های سایت مرجع با تلرانس <strong dir="ltr">{{ $this->toleranceLabel() }}</strong> ذخیره می‌شوند. انس جهانی طلا جزو محصولات نیست و تلرانس روی آن اعمال نمی‌شود.</p>
            </fieldset>

            @foreach ($products as $product)
                @php($reference = (int) ($referencePrices[$product['key']] ?? 0))
                <fieldset class="price-edit">
                    <legend>{{ $product['name'] }} ({{ $product['unit'] }})</legend>
                    <div class="form-grid">
                        <div class="field">
                            <label for="price_{{ $product['key'] }}">قیمت (تومان)</label>
                            <input id="price_{{ $product['key'] }}" type="text" inputmode="decimal" dir="ltr" data-num-input wire:model="prices.{{ $product['key'] }}.price" required>
                            @error("prices.{$product['key']}.price") <span class="field-err">{{ $message }}</span> @enderror
                            @if ($reference > 0)
                                <p class="muted ref-price">
                                    قیمت سایت مرجع: <strong dir="ltr">{{ \App\Support\Format::num($reference) }}</strong> تومان
                                    — با تلرانس {{ $this->toleranceLabel() }}:
                                    <strong dir="ltr">{{ \App\Support\Format::num($this->adjustedReferencePrice($product['key']) ?? 0) }}</strong> تومان
                                </p>
                            @endif
                        </div>
                        <div class="field">
                            <label for="intrinsic_{{ $product['key'] }}">ارزش ذاتی (تومان، اختیاری)</label>
                            <input id="intrinsic_{{ $product['key'] }}" type="text" inputmode="decimal" dir="ltr" data-num-input wire:model="prices.{{ $product['key'] }}.intrinsic"
                                   placeholder="ارزش ذاتی این محصول">
                            @error("prices.{$product['key']}.intrinsic") <span class="field-err">{{ $message }}</span> @enderror
                        </div>
                        <div class="field">
                            <label for="change_{{ $product['key'] }}">تغییرات بازار (٪، اختیاری)</label>
                            <input id="change_{{ $product['key'] }}" type="text" inputmode="decimal" dir="ltr" wire:model="prices.{{ $product['key'] }}.change"
                                   placeholder="مثلاً 1.2 یا ‎-0.8">
                            @error("prices.{$product['key']}.change") <span class="field-err">{{ $message }}</span> @enderror
                        </div>
                        <div class="field">
                            <label for="bubble_{{ $product['key'] }}">حباب (٪، اختیاری)</label>
                            <input id="bubble_{{ $product['key'] }}" type="text" inputmode="decimal" dir="ltr" wire:model="prices.{{ $product['key'] }}.bubble"
                                   placeholder="مثلاً 1.2 یا ‎-0.8">
                            @error("prices.{$product['key']}.bubble") <span class="field-err">{{ $message }}</span> @enderror
                        </div>
                    </div>
                </fieldset>
            @endforeach

            <p class="muted">این فقط قیمت مرجع است؛ قیمت خرید و فروش واقعی در هر فاکتور به‌صورت دستی وارد می‌شود.</p>

            <fieldset class="price-edit">
                <legend>انس جهانی طلا (دلار)</legend>
                <p class="muted">این قیمت جزو محصولات قابل معامله نیست و فقط برای اطلع نمایش داده می‌شود.</p>
                <div class="form-grid">
                    <div class="field">
                        <label for="gold_ounce_price">قیمت انس (دلار)</label>
                        <input id="gold_ounce_price" type="text" inputmode="decimal" dir="ltr" wire:model="goldOuncePrice" placeholder="مثلاً ۴۱۵۶">
                    </div>
                    <div class="field">
                        <label for="gold_ounce_change">تغییرات (٪)</label>
                        <input id="gold_ounce_change" type="text" inputmode="decimal" dir="ltr" wire:model="goldOunceChange" placeholder="مثلاً 0.91">
                    </div>
                </div>
            </fieldset>

            <label class="check">
                <input type="checkbox" wire:model="autoUpdate">
                <span>به‌روزرسانی خودکار قیمت‌ها فعال باشد (شبیه‌سازی نوسان بازار)</span>
            </label>

            <div class="field">
                <label for="contactPhone">شماره تماس برای سفارش</label>
                <input id="contactPhone" type="text" wire:model="contactPhone" dir="ltr">
            </div>

            <div class="field">
                <label for="verifyPhone">شماره دریافت کد تأیید ثبت‌نام</label>
                <input id="verifyPhone" type="text" wire:model="verifyPhone" dir="ltr">
            </div>

            <div class="field">
                <label for="inviteText">متن دعوت (برای دکمه «کپی متن دعوت» کاربران)</label>
                <textarea id="inviteText" rows="2" wire:model="inviteText"></textarea>
                <p class="muted">داخل متن از <strong dir="ltr">{code}</strong> استفاده کنید؛ کد معرف هر کاربر به‌صورت خودکار به‌جای آن جانمایی می‌شود.</p>
            </div>

            <button class="btn btn-gold btn-block" type="submit" wire:loading.attr="disabled">ذخیره تنظیمات</button>
        </form>

        @if ($lastRefreshAt)
            <div class="card-foot muted">آخرین به‌روزرسانی خودکار: {{ \App\Support\Jalali::dateTime($lastRefreshAt) }}</div>
        @endif
    </section>

    <section class="card">
        <div class="card-head"><h2>بنرهای تصویری پنل کاربران</h2></div>

        @if (empty($banners))
            <p class="muted">هنوز بنری تنظیم نشده است. یک تصویر بارگذاری کنید تا در بالای داشبورد کاربران نمایش داده شود.</p>
        @else
            <div class="banner-list">
                @foreach ($banners as $banner)
                    <div class="banner-item card" style="margin-bottom: 1rem; position: relative;">
                        <div class="banner-item-content" style="display: flex; align-items: flex-start; gap: 1rem; flex-wrap: wrap; padding: 1rem;">
                            <img src="{{ route('media.show', ['path' => $banner['path']]) }}" alt="بنر" style="max-height: 120px; border-radius: 8px; flex-shrink: 0;">
                            <div style="flex: 1; min-width: 250px;">
                                <div class="field" style="margin-bottom: 0.75rem;">
                                    <label for="bannerTitle_{{ $banner['id'] }}">عنوان بنر (اختیاری)</label>
                                    <input id="bannerTitle_{{ $banner['id'] }}" type="text" wire:model.debounce.500ms="banners.{{ $banner['id'] }}.title" placeholder="عنوان بنر" value="{{ $banner['title'] ?? '' }}">
                                </div>
                                <div class="field" style="margin-bottom: 0.75rem;">
                                    <label>ترتیب نمایش</label>
                                    <input type="number" wire:model.debounce.500ms="banners.{{ $banner['id'] }}.sort_order" value="{{ $banner['sort_order'] }}" min="1" style="width: 80px;">
                                    <span class="muted" style="margin-right: 0.5rem;">(عدد کمتر = بالاتر)</span>
                                </div>
                                <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                                    <label class="check" style="margin-bottom: 0;">
                                        <input type="checkbox" wire:model.debounce.500ms="banners.{{ $banner['id'] }}.is_active" {{ $banner['is_active'] ? 'checked' : '' }}>
                                        <span>فعال</span>
                                    </label>
                                    <button class="btn btn-gold btn-sm" type="button" wire:click="saveBanner({{ $banner['id'] }})" wire:loading.attr="disabled">ذخیره تغییرات</button>
                                    <button class="btn btn-danger btn-sm" type="button" wire:click="deleteBanner({{ $banner['id'] }})" wire:confirm="این بنر حذف شود؟">حذف</button>
                                </div>
{{--                                <div class="muted" style="font-size: 0.8rem; margin-top: 0.5rem;">تغییرات به صورت خودکار ذخیره می‌شوند، یا روی دکمه ذخیره بزنید.</div>--}}
                            </div>
                        </div>
                    </div>
                @endforeach
            </div>
        @endif

        <form wire:submit="uploadBanner" class="form" style="margin-top: 1rem;">
            <div class="form-grid" style="gap: 1rem;">
                <div class="field" style="flex: 1;">
                    <label for="bannerFile">تصویر بنر (jpg/png، حداکثر ۵ مگابایت)</label>
                    <input id="bannerFile" type="file" accept="image/*" wire:model="bannerFile">
                    @error('bannerFile') <span class="field-err">{{ $message }}</span> @enderror
                </div>
                <div class="field" style="flex: 1;">
                    <label for="bannerTitle">عنوان بنر (اختیاری)</label>
                    <input id="bannerTitle" type="text" wire:model="bannerTitle" placeholder="عنوان بنر">
                </div>
            </div>
            <div class="filters-actions">
                <button class="btn btn-gold btn-sm" type="submit" wire:loading.attr="disabled">افزودن بنر</button>
            </div>
        </form>
    </section>

    <section class="card">
        <div class="card-head">
            <h2>تغییر رمز عبور مدیر</h2>
            <button class="icon-toggle {{ $showPasswordForm ? 'active' : '' }}" type="button" wire:click="togglePasswordForm" aria-label="تغییر رمز عبور">🔑</button>
        </div>

        @if ($showPasswordForm)
            <form wire:submit="updateOwnPassword" class="form">
                <div class="field">
                    <label for="current_password">رمز عبور فعلی</label>
                    <div class="pass-field">
                        <input id="current_password" type="password" wire:model="current_password" required>
                        <button type="button" class="pass-toggle" aria-label="نمایش رمز عبور">
                            <svg class="pass-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            <svg class="pass-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        </button>
                    </div>
                    @error('current_password') <span class="field-err">{{ $message }}</span> @enderror
                </div>

                <div class="field">
                    <label for="password">رمز عبور جدید</label>
                    <div class="pass-field">
                        <input id="password" type="password" wire:model="password" minlength="6" required>
                        <button type="button" class="pass-toggle" aria-label="نمایش رمز عبور">
                            <svg class="pass-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            <svg class="pass-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        </button>
                    </div>
                    @error('password') <span class="field-err">{{ $message }}</span> @enderror
                </div>

                <div class="field">
                    <label for="password_confirmation">تکرار رمز عبور جدید</label>
                    <div class="pass-field">
                        <input id="password_confirmation" type="password" wire:model="password_confirmation" minlength="6" required>
                        <button type="button" class="pass-toggle" aria-label="نمایش رمز عبور">
                            <svg class="pass-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            <svg class="pass-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        </button>
                    </div>
                </div>

                <button type="submit" class="btn btn-gold btn-block" wire:loading.attr="disabled">ذخیره تغییرات</button>
            </form>
        @endif
    </section>
</div>
