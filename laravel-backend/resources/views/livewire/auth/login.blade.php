<div class="auth-wrap">
    <div class="card auth-card">
        <div class="card-head"><h2>ورود به حساب</h2></div>

        <form wire:submit="login" class="form">
            <div class="field">
                <label for="phone">شماره موبایل</label>
                <input id="phone" type="tel" wire:model="phone" inputmode="tel" dir="ltr" placeholder="09xxxxxxxxx" required autofocus>
                @error('phone') <span class="field-err">{{ $message }}</span> @enderror
            </div>

            <div class="field">
                <label for="password">رمز عبور</label>
                <div class="pass-field">
                    <input id="password" type="password" wire:model="password" required>
                    <button type="button" class="pass-toggle" aria-label="نمایش رمز عبور">
                        <svg class="pass-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        <svg class="pass-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    </button>
                </div>
                @error('password') <span class="field-err">{{ $message }}</span> @enderror
            </div>

            <label class="check">
                <input type="checkbox" wire:model="remember">
                <span>مرا به خاطر بسپار</span>
            </label>

            <button type="submit" class="btn btn-gold btn-block">ورود</button>
        </form>

        <div class="auth-links">
            <a href="{{ route('auth.register') }}" wire:navigate>حساب ندارید؟ ثبت‌نام کنید</a>
            <a href="{{ route('auth.forgot') }}" wire:navigate>رمز عبور را فراموش کرده‌اید؟</a>
        </div>
    </div>
</div>
