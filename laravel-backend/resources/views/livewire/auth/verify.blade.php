<div class="auth-wrap">
    <div class="card auth-card">
        <div class="card-head"><h2>ثبت‌نام تقریباً تمام شد</h2></div>

        <p class="verify-intro">
            کد تأیید شما:
        </p>

        <div class="verify-code" dir="ltr">{{ \App\Support\Format::fa($user->verification_code) }}</div>

        @if ($verifyPhone)
            <div class="notice">
                برای فعال شدن حساب، این کد را برای فروشگاه <strong>پیامک</strong> کنید. با دکمه زیر، برنامه پیامک (پیامک/سلام و …) با متن آماده باز می‌شود؛ فقط دکمه ارسال را بزنید:
            </div>

            <a class="btn btn-gold btn-block verify-sms-btn"
               href="sms:{{ $verifyPhone }}?body={{ \App\Support\Format::fa($user->verification_code) }}"
               dir="ltr">
                ✉️ پیامک کد به {{ $verifyPhone }}
            </a>

            <p class="verify-sms-hint">
                اگه برنامه پیامک باز نشد، کد <strong dir="ltr">{{ \App\Support\Format::fa($user->verification_code) }}</strong> را به شماره
                <span dir="ltr">{{ $verifyPhone }}</span> پیامک کنید.
            </p>
        @else
            <div class="notice">
                لطفاً این کد را برای فروشگاه پیامک کنید. پس از تأیید کد توسط فروشگاه، حساب شما فعال می‌شود و می‌توانید وارد شوید.
            </div>
        @endif

        <a class="btn btn-ghost btn-block" href="{{ route('auth.login') }}" wire:navigate>ورود به حساب</a>
    </div>
</div>
