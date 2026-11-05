<div>
    <section class="card">
        <div class="card-head">
            <h2>تغییر رمز عبور</h2>
            <button class="icon-toggle {{ $showPasswordForm ? 'active' : '' }}" type="button" wire:click="togglePasswordForm" aria-label="تغییر رمز عبور">🔑</button>
        </div>

        @if ($showPasswordForm)
            @if ($status)
                <div class="toast toast-success" role="status">{{ $status }}</div>
            @endif

            <form wire:submit="updatePassword" class="form">
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

                <button type="submit" class="btn btn-gold btn-block">ذخیره تغییرات</button>
            </form>
        @endif
    </section>

    @if ($contactPhone)
        <section class="card">
            <div class="card-head"><h2>تماس با فروشگاه</h2></div>
            <div class="contact-bar">
                <span>برای سفارش یا سؤال، تماس بگیرید:</span>
                <a class="phone-link" href="tel:{{ $contactPhone }}" dir="ltr">{{ $contactPhone }}</a>
            </div>
        </section>
    @endif
</div>
