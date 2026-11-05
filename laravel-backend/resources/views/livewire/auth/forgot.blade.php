<div class="auth-wrap">
    <div class="card auth-card">
        <div class="card-head"><h2>فراموشی رمز عبور</h2></div>

        <p class="muted">شماره موبایل خود را وارد کنید؛ درخواست شما برای فروشگاه ثبت می‌شود و رمز جدید برایتان صادر می‌شود.</p>

        @if ($status)
            <div class="toast toast-success" role="status">{{ $status }}</div>
        @endif

        <form wire:submit="submit" class="form">
            <div class="field">
                <label for="phone">شماره موبایل</label>
                <input id="phone" type="tel" wire:model="phone" inputmode="tel" dir="ltr" placeholder="09xxxxxxxxx" required autofocus>
                @error('phone') <span class="field-err">{{ $message }}</span> @enderror
            </div>

            <button type="submit" class="btn btn-gold btn-block">ثبت درخواست</button>
        </form>

        <div class="auth-links">
            <a href="{{ route('auth.login') }}" wire:navigate>بازگشت به ورود</a>
        </div>
    </div>
</div>
