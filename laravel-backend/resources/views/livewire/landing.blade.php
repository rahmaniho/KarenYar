<div>
    <!-- Hero -->
    <section class="hero" style="margin-bottom: 1rem; margin-top: -1.1rem;">
        <h1 class="hero-title">پلتفرم خرید و فروش طلا، سکه و دلار</h1>
        <p class="hero-sub">قیمت‌های لحظه‌ای بازار در یک نگاه؛ حسابتان را بسازید و دارایی‌هایتان را دنبال کنید.</p>
        <div class="hero-actions">
            @if (auth()->check())
                <a class="btn btn-gold" href="{{ auth()->user()->isAdmin() ? route('admin.dashboard') : route('panel.dashboard') }}" wire:navigate>ورود به پنل</a>
            @else
                <a class="btn btn-gold" href="{{ route('auth.register') }}" wire:navigate>ثبت‌نام رایگان</a>
                <a class="btn btn-outline" href="{{ route('auth.login') }}" wire:navigate>ورود به حساب</a>
            @endif
        </div>
    </section>

    <!-- Today's prices (self-polling component) -->
    <livewire:price-table show-disclaimer />

    <!-- How it works -->
    <section class="card">
        <div class="card-head"><h2>چطور کار می‌کند؟</h2></div>
        <ol class="steps">
            <li>ثبت‌نام کنید و کد تأیید را برای فروشگاه پیامک کنید.</li>
            <li>پس از تأیید حساب، دارایی‌هایتان را در داشبورد ببینید.</li>
            <li>برای خرید یا فروش، با شماره فروشگاه تماس بگیرید؛ فاکتور برایتان صادر می‌شود.</li>
            <li>اخبار و تحلیل‌های روز بازار را دنبال کنید.</li>
        </ol>
        @if ($contactPhone)
            <div class="contact-bar">
                <span>شماره تماس برای سفارش:</span>
                <a class="phone-link" href="tel:{{ $contactPhone }}" dir="ltr">{{ $contactPhone }}</a>
            </div>
        @endif
    </section>

    <!-- CTA -->
    <section class="landing-copper">
        <h2>سرمایه‌گذاری مطمئن با طلای امین</h2>
        <p>حساب بسازید و دارایی‌هایتان را با قیمت لحظه‌ای دنبال کنید.</p>
        @if (auth()->check())
            <a class="btn btn-gold" href="{{ auth()->user()->isAdmin() ? route('admin.dashboard') : route('panel.dashboard') }}" wire:navigate>ورود به پنل</a>
        @else
            <a class="btn btn-gold" href="{{ route('auth.register') }}" wire:navigate>ثبت‌نام رایگان</a>
        @endif
    </section>
</div>
