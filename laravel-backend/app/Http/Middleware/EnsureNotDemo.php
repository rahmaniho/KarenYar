<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * عملیات حساس در حالت دمو بسته است.
 *
 * خرید/تمدید اشتراک، دعوت عضو تیم و ورود/پاک‌سازی داده در دمو معنا ندارد و
 * می‌تواند باعث سردرگمی یا سوءاستفاده شود؛ خواندن داده آزاد است.
 */
class EnsureNotDemo
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user?->isStore() && $user->store?->isDemo()) {
            abort(403, 'در حالت دمو این عملیات در دسترس نیست؛ برای استفادهٔ واقعی یک فروشگاه بسازید.');
        }

        return $next($request);
    }
}
