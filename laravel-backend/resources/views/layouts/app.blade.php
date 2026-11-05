<!DOCTYPE html>
@php($theme = request()->cookie('amin_gold_theme') === 'dark' ? 'dark' : 'light')
<html lang="fa" dir="rtl" class="{{ $theme }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, interactive-widget=resizes-visual">
    <meta name="theme-color" content="{{ $theme === 'dark' ? '#161616' : '#ffffff' }}">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('images/logo.jpg') }}">
    <title>{{ $title ?? 'طلای امین' }} — طلای امین</title>

    {{-- Installable app (Add to Home Screen) --}}
    <link rel="manifest" href="{{ asset('manifest.json') }}">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="طلای امین">
    <link rel="apple-touch-icon" href="{{ asset('images/apple-touch-icon.png') }}">
    <link rel="stylesheet" href="{{ asset('vendor/add-to-homescreen/add-to-homescreen.min.css') }}">
    @php($appCss = public_path('css/app.css'))
    <link rel="stylesheet" href="{{ asset('css/app.css') . '?v=' . (file_exists($appCss) ? filemtime($appCss) : 0) }}">
    <script>
        // Apply the persisted theme (localStorage may be blocked, so the
        // cookie already rendered the class server-side; localStorage wins
        // when present) before the page paints to avoid flicker.
        (function () {
            var t = '{{ $theme }}';
            try {
                var stored = localStorage.getItem('amin-gold-theme');
                if (stored === 'light' || stored === 'dark') t = stored;
            } catch (e) {}
            document.documentElement.classList.remove('light', 'dark');
            document.documentElement.classList.add(t);
        })();
    </script>
    @livewireStyles
</head>
<body>
    @php($user = auth()->user())
    @php($admin = $user && $user->isAdmin())

    @if ($admin)
        @php($pendingUsersCount = \App\Models\User::where('status', 'pending')->count())
        @php($pendingPasswordsCount = \App\Models\PasswordRequest::where('status', 'pending')->count())
        @php($pendingTradesCount = \App\Models\TradeRequest::where('status', 'pending')->count())
        @php($userBadge = $pendingUsersCount + $pendingPasswordsCount)
    @endif

    <header class="topbar">
        <div class="topbar-inner">
            <a href="{{ $user ? ($admin ? route('admin.dashboard') : route('panel.dashboard')) : route('landing') }}" class="brand" wire:navigate>
                <img class="brand-logo" src="{{ asset('images/logo.jpg') }}" alt="طلای امین">
                <span class="brand-name">طلای امین</span>
            </a>

            <div class="topbar-actions">
                <button class="install-btn" type="button" id="pwa-install" aria-label="افزودن به صفحه اصلی">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M12 3v12"></path>
                        <path d="m7 10 5 5 5-5"></path>
                        <path d="M5 21h14"></path>
                    </svg>
                    <span>افزودن به صفحه اصلی</span>
                </button>

                <button class="theme-toggle" type="button" id="theme-toggle" aria-label="تغییر حالت تاریک">
                    ☾
                </button>

                @if ($user)
                    <div class="user-menu" id="user-menu">
                        <button class="user-chip" type="button" id="user-menu-toggle" aria-haspopup="true" aria-expanded="false"
                                aria-label="منوی حساب">{{ mb_substr($user->name, 0, 1) }}</button>
                        <div class="user-menu-panel" id="user-menu-panel">
                            <div class="user-menu-name">{{ $user->name }}</div>
                            <div class="user-menu-phone" dir="ltr">{{ $user->phone }}</div>
                            <hr class="user-menu-sep">
                            <a class="user-menu-link" href="{{ $admin ? route('admin.settings') : route('panel.settings') }}" wire:navigate>⚙ تنظیمات</a>
                            <a class="user-menu-link user-menu-logout" href="#"
                               onclick="document.getElementById('logout-form').submit(); return false;">خروج</a>
                        </div>
                    </div>
                @else
                    <a class="btn btn-ghost btn-sm" href="{{ route('auth.login') }}" wire:navigate>ورود</a>
                    <a class="btn btn-gold btn-sm" href="{{ route('auth.register') }}" wire:navigate>ثبت‌نام</a>
                @endif
            </div>
        </div>
    </header>

    @if ($user && ! request()->routeIs('admin.users'))
        <nav class="subnav">
            <div class="subnav-inner">
                @if ($admin)
                    <a href="{{ route('admin.dashboard') }}" class="{{ request()->routeIs('admin.dashboard') ? 'active' : '' }}" wire:navigate>داشبورد</a>
                    <a href="{{ route('admin.users') }}" class="{{ request()->routeIs('admin.users') ? 'active' : '' }}" wire:navigate>کاربران
                        @if ($userBadge > 0)<span class="nav-badge">{{ $userBadge }}</span>@endif
                    </a>
                    <a href="{{ route('admin.orders') }}" class="{{ request()->routeIs('admin.orders*') ? 'active' : '' }}" wire:navigate>فاکتورها
                        @if ($pendingTradesCount > 0)<span class="nav-badge">{{ $pendingTradesCount }}</span>@endif
                    </a>
                    <a href="{{ route('admin.history') }}" class="{{ request()->routeIs('admin.history') ? 'active' : '' }}" wire:navigate>تاریخچه سفارش‌ها</a>
                    <a href="{{ route('admin.news') }}" class="{{ request()->routeIs('admin.news*') ? 'active' : '' }}" wire:navigate>اخبار</a>
                    <a href="{{ route('admin.analyses') }}" class="{{ request()->routeIs('admin.analyses*') ? 'active' : '' }}" wire:navigate>تحلیل‌ها</a>
                    <a href="{{ route('admin.settings') }}" class="{{ request()->routeIs('admin.settings') ? 'active' : '' }}" wire:navigate>تنظیمات</a>
                @else
                    <a href="{{ route('panel.dashboard') }}" class="{{ request()->routeIs('panel.dashboard') ? 'active' : '' }}" wire:navigate>داشبورد</a>
                    <a href="{{ route('panel.orders') }}" class="{{ request()->routeIs('panel.orders') || request()->routeIs('panel.order.show') ? 'active' : '' }}" wire:navigate>فاکتورها</a>
                    <a href="{{ route('panel.history') }}" class="{{ request()->routeIs('panel.history') ? 'active' : '' }}" wire:navigate>تاریخچه سفارش‌ها</a>
                    <a href="{{ route('panel.news') }}" class="{{ request()->routeIs('panel.news') ? 'active' : '' }}" wire:navigate>اخبار و تحلیل</a>
                    <a href="{{ route('panel.settings') }}" class="{{ request()->routeIs('panel.settings') ? 'active' : '' }}" wire:navigate>تنظیمات</a>
                @endif
                <a class="subnav-logout" href="#" onclick="document.getElementById('logout-form').submit(); return false;">خروج</a>
            </div>
        </nav>

        <form id="logout-form" method="post" action="{{ route('auth.logout') }}" class="hidden-form">
            {!! csrf_field() !!}
        </form>
    @endif

    <main class="page">
        @if (session('status'))
            <div class="toast toast-success" role="status">{{ session('status') }}</div>
        @endif

        @if ($errors->any())
            <div class="toast toast-err" role="alert">
                @foreach ($errors->all() as $error)
                    <div>{{ $error }}</div>
                @endforeach
            </div>
        @endif

        @if ($admin && $pendingTradesCount > 0)
            <div class="flash notif-bar">
                <a href="{{ route('admin.orders') }}" wire:navigate>
                    🔔 {{ $pendingTradesCount }} سفارش جدید خرید/فروش در انتظار تأیید — مشاهده
                </a>
            </div>
        @endif

        {{ $slot }}
    </main>

    @if ($user)
        <nav class="bottomnav">
            @if ($admin)
                <a href="{{ route('admin.dashboard') }}" class="{{ request()->routeIs('admin.dashboard') ? 'active' : '' }}" wire:navigate>
                    <span class="bn-ico"><img src="{{ asset('images/dashboard.png') }}" alt=""></span><span>داشبورد</span>
                </a>
                <a href="{{ route('admin.users') }}" class="{{ request()->routeIs('admin.users') ? 'active' : '' }}" wire:navigate>
                    <span class="bn-ico"><img src="{{ asset('images/users.png') }}" alt=""></span><span>کاربران</span>
                    @if ($userBadge > 0)<span class="nav-badge">{{ $userBadge }}</span>@endif
                </a>
                <a href="{{ route('admin.orders') }}" class="{{ request()->routeIs('admin.orders*') ? 'active' : '' }}" wire:navigate>
                    <span class="bn-ico"><img src="{{ asset('images/invoices.png') }}" alt=""></span><span>فاکتورها</span>
                    @if ($pendingTradesCount > 0)<span class="nav-badge">{{ $pendingTradesCount }}</span>@endif
                </a>
                <a href="{{ route('admin.settings') }}" class="{{ request()->routeIs('admin.settings') ? 'active' : '' }}" wire:navigate>
                    <span class="bn-ico"><img src="{{ asset('images/settings.png') }}" alt=""></span><span>تنظیمات</span>
                </a>
            @else
                <a href="{{ route('panel.news') }}" class="{{ request()->routeIs('panel.news') ? 'active' : '' }}" wire:navigate>
                    <span class="bn-ico"><img src="{{ asset('images/news.png') }}" alt=""></span><span>اخبار</span>
                </a>
                <a href="{{ route('panel.orders') }}" class="{{ request()->routeIs('panel.orders') || request()->routeIs('panel.order.show') ? 'active' : '' }}" wire:navigate>
                    <span class="bn-ico"><img src="{{ asset('images/invoices.png') }}" alt=""></span><span>فاکتورها</span>
                </a>
                <a href="{{ route('panel.dashboard') }}" class="bn-main {{ request()->routeIs('panel.dashboard') ? 'active' : '' }}" wire:navigate>
                    <span class="bn-ico"><img src="{{ asset('images/dashboard.png') }}" alt=""></span><span>داشبورد</span>
                </a>
                <a href="{{ route('panel.settings') }}" class="{{ request()->routeIs('panel.settings') ? 'active' : '' }}" wire:navigate>
                    <span class="bn-ico"><img src="{{ asset('images/settings.png') }}" alt=""></span><span>تنظیمات</span>
                </a>
            @endif

            <form method="post" action="{{ route('auth.logout') }}" class="bottomnav-form"
                      onsubmit="return window.confirm('از حساب خارج شوید؟');">
                {!! csrf_field() !!}
                <button type="submit" class="bottomnav-logout" aria-label="خروج">
                    <span class="bn-ico bn-ico-out"><img src="{{ asset('images/logout.png') }}" alt=""></span><span>خروج</span>
                </button>
            </form>
        </nav>
    @endif

    <script>
        (function () {
            var toggle = document.getElementById('theme-toggle');

            if (! toggle) {
                return;
            }

            function refreshIcon() {
                toggle.textContent = document.documentElement.classList.contains('dark') ? '☀' : '☾';
            }

            toggle.addEventListener('click', function () {
                var isDark = document.documentElement.classList.contains('dark');
                var next = isDark ? 'light' : 'dark';

                document.documentElement.classList.remove('light', 'dark');
                document.documentElement.classList.add(next);

                // Persist locally when storage is available…
                try {
                    localStorage.setItem('amin-gold-theme', next);
                } catch (e) {}

                // …and server-side in a (Laravel-encrypted) cookie so a
                // refresh renders the saved theme even when localStorage
                // is blocked (e.g. sandboxed iframes).
                try {
                    var meta = document.querySelector('meta[name="csrf-token"]');
                    fetch('/theme', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            'X-CSRF-TOKEN': meta ? meta.getAttribute('content') : ''
                        },
                        body: 'theme=' + next
                    }).catch(function () {});
                } catch (e) {}

                refreshIcon();
            });

            refreshIcon();
        })();
    </script>

    @if ($admin && $pendingTradesCount > 0)
        <script>
            // Desktop notification when the browser already allowed it.
            (function () {
                if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
                    return;
                }

                try {
                    new Notification('طلای امین', {
                        body: '{{ $pendingTradesCount }} سفارش جدید خرید/فروش در انتظار تأیید',
                        tag: 'pending-trades',
                        icon: '{{ asset('images/logo.jpg') }}'
                    });
                } catch (e) {}
            })();
        </script>
    @endif

    <script>
        // Floating profile menu: toggle on the avatar, close on outside click.
        (function () {
            var menu = document.getElementById('user-menu');

            if (! menu) {
                return;
            }

            var toggle = document.getElementById('user-menu-toggle');
            var panel = document.getElementById('user-menu-panel');

            function close() {
                menu.classList.remove('open');
                toggle.setAttribute('aria-expanded', 'false');
            }

            toggle.addEventListener('click', function (e) {
                e.stopPropagation();

                if (menu.classList.contains('open')) {
                    close();
                } else {
                    menu.classList.add('open');
                    toggle.setAttribute('aria-expanded', 'true');
                }
            });

            document.addEventListener('click', close);
            panel.addEventListener('click', function (e) { e.stopPropagation(); });
        })();
    </script>

    @livewireScripts

    <script>
        // Toast (شناور): show every fresh .toast overlay and auto-dismiss it
        // after a few seconds, whether it came from the page or a Livewire
        // update (Livewire v4 has no livewire:morph event, so watch the DOM).
        (function () {
            function arm(el) {
                if (el.dataset.toastTimer) {
                    return;
                }

                el.classList.remove('toast-hide');
                el.classList.add('toast-show');
                el.dataset.toastTimer = setTimeout(function () {
                    el.classList.remove('toast-show');
                    el.classList.add('toast-hide');
                    setTimeout(function () { el.remove(); }, 320);
                }, 3200);
            }

            if (window.MutationObserver) {
                var observer = new MutationObserver(function (mutations) {
                    for (var m = 0; m < mutations.length; m++) {
                        for (var n = 0; n < mutations[m].addedNodes.length; n++) {
                            var node = mutations[m].addedNodes[n];

                            if (node.matches && node.matches('.toast')) {
                                arm(node);
                            } else if (node.querySelectorAll) {
                                node.querySelectorAll('.toast').forEach(arm);
                            }
                        }
                    }
                });

                observer.observe(document.body, { childList: true, subtree: true });
            }

            document.querySelectorAll('.toast').forEach(arm);
        })();
    </script>

    <script>
        // Group numbers into thousands as the user types ([data-num-input]).
        (function () {
            function formatNum(el) {
                var raw = el.value.replace(/[^\d.]/g, '');
                var parts = raw.split('.');
                parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
                el.value = parts.join('.');
            }

            document.addEventListener('input', function (e) {
                if (e.target && e.target.matches('[data-num-input]')) {
                    formatNum(e.target);
                }
            });

            document.addEventListener('change', function (e) {
                if (e.target && e.target.matches('[data-num-input]')) {
                    formatNum(e.target);
                }
            });

            // Re-apply formatting after Livewire re-renders the fields.
            var observer = new MutationObserver(function () {
                requestAnimationFrame(function () {
                    document.querySelectorAll('[data-num-input]').forEach(formatNum);
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        })();

        // Show / hide the typed password via the eye button ([.pass-toggle]).
        (function () {
            var states = {};

            function apply(btn) {
                var input = btn.parentElement.querySelector('input');
                if (!input || !input.id) return;
                var visible = !!states[input.id];
                input.type = visible ? 'text' : 'password';
                btn.classList.toggle('pass-visible', visible);
                btn.setAttribute('aria-label', visible ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور');
            }

            document.addEventListener('click', function (e) {
                var btn = e.target && e.target.closest ? e.target.closest('.pass-toggle') : null;
                if (!btn) return;
                var input = btn.parentElement.querySelector('input');
                if (!input || !input.id) return;
                states[input.id] = !states[input.id];
                apply(btn);
            });

            // Keep the eye state after Livewire re-renders the fields.
            var observer = new MutationObserver(function () {
                requestAnimationFrame(function () {
                    document.querySelectorAll('.pass-toggle').forEach(apply);
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        })();
    </script>

    <script>
        // WOW.js fade up animation (from https://rayantamaddonjahangostar.ir/es): every card fades up when it scrolls into view.
                // Cards are never hidden — if JS is unavailable they simply render without the animation.
        (function () {
            var targets = '.card, .feed-item, .order-card, .hero-card, .auth-card';
            var done = new WeakSet();

            function trigger(el) {
                if (done.has(el)) {
                    return;
                }

                done.add(el);
                el.style.animationName = 'flipInX';
                el.style.animationDuration = '0.7s';
                el.style.animationTimingFunction = 'ease-out';
                // Do not hold the end state: the keyframes finish at
                // transform:none, and retaining fill could leave cards with
                // stale transforms that disturb the fixed bottom nav.
                el.style.animationFillMode = 'none';
            }

            if (window.IntersectionObserver) {
                var observer = new IntersectionObserver(function (entries) {
                    for (var i = 0; i < entries.length; i++) {
                        if (entries[i].isIntersecting) {
                            trigger(entries[i].target);
                            observer.unobserve(entries[i].target);
                        }
                    }
                }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

                function watchAll(root) {
                    var list = (root || document).querySelectorAll(targets);
                    for (var i = 0; i < list.length; i++) {
                        if (! done.has(list[i])) {
                            observer.observe(list[i]);
                        }
                    }
                }

                watchAll();

                // Watch Livewire re-renders so newly swapped cards animate.
                if (window.MutationObserver) {
                    var rewatch = new MutationObserver(function (mutations) {
                        for (var m = 0; m < mutations.length; m++) {
                            for (var n = 0; n < mutations[m].addedNodes.length; n++) {
                                var node = mutations[m].addedNodes[n];
                                if (node.matches && node.matches(targets)) {
                                    observer.observe(node);
                                } else if (node.querySelectorAll) {
                                    var list = node.querySelectorAll(targets);
                                    for (var i = 0; i < list.length; i++) {
                                        if (! done.has(list[i])) {
                                            observer.observe(list[i]);
                                        }
                                    }
                                }
                            }
                        }
                    });
                    rewatch.observe(document.body, { childList: true, subtree: true });
                }
            } else {
                // No IntersectionObserver support: animate immediately.
                var list = window.document.querySelectorAll(targets);
                for (var i = 0; i < list.length; i++) {
                    trigger(list[i]);
                }
            }
        })();
    </script>

    {{-- "Add to Home Screen": philfung/add-to-homescreen (vendored, Persian UI). --}}
    <script src="{{ asset('vendor/add-to-homescreen/add-to-homescreen.fa.min.js') }}"></script>
    <script>
        (function () {
            if (typeof window.AddToHomeScreen !== 'function') {
                return;
            }

            if (! window.__aminGoldAddToHomeScreen) {
                window.__aminGoldAddToHomeScreen = window.AddToHomeScreen({
                    appName: 'طلای امین',
                    appNameDisplay: 'standalone',
                    appIconUrl: '{{ asset('images/icon-192.png') }}',
                    assetUrl: '{{ asset('vendor/add-to-homescreen/assets/img') }}/',
                    maxModalDisplayCount: -1,
                    displayOptions: { showMobile: true, showDesktop: true },
                    allowClose: true,
                    showArrow: true,
                });
            }

            var adhs = window.__aminGoldAddToHomeScreen;
            var btn = document.getElementById('pwa-install');

            // Already installed: the button has nothing to offer.
            if (btn && adhs.isStandAlone()) {
                btn.hidden = true;
            }

            // Event delegation keeps the handler alive across wire:navigate.
            if (! window.__aminGoldInstallClickBound) {
                window.__aminGoldInstallClickBound = true;

                document.addEventListener('click', function (e) {
                    var target = e.target && e.target.closest ? e.target.closest('#pwa-install') : null;

                    if (! target) {
                        return;
                    }

                    e.preventDefault();

                    if (adhs.isStandAlone()) {
                        return;
                    }

                    adhs.show('fa');
                });

                window.addEventListener('appinstalled', function () {
                    var current = document.getElementById('pwa-install');

                    if (current) {
                        current.hidden = true;
                    }
                });
            }
        })();

        // A service worker is what makes the app installable on Android/Chrome.
        // It stays network-only (see /sw.js), so no stale prices are served.
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('{{ asset('sw.js') }}').catch(function () {});
            });
        }
    </script>
</body>
</html>