<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Services\Demo\DemoService;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * دموی امن از صفحهٔ ورود.
 *
 * ساخت دمو یک فروشگاه واقعی و جدا می‌سازد (لایسنس آزمایشی کوتاه‌عمر + دادهٔ نمونه)
 * و همان لحظه کاربر را وارد می‌کند. هیچ پرداخت یا سفارشی ساخته نمی‌شود و دادهٔ
 * مشتریان واقعی هرگز لمس نمی‌شود. کاربر می‌تواند دمو را دستی ببندد تا داده
 * بلافاصله پاک شود؛ در غیر این صورت زمان‌بند سرور آن را پاک می‌کند.
 */
class DemoController extends Controller
{
    public function __construct(private readonly DemoService $demos) {}

    /**
     * @throws Throwable
     */
    public function store(Request $request): JsonResponse
    {
        if ($request->user() !== null) {
            throw ValidationException::withMessages([
                'demo' => ['شما از قبل وارد شده‌اید؛ برای ساخت دموی تازه ابتدا خارج شوید.'],
            ]);
        }

        $result = $this->demos->create();
        $user = $result['user'];

        Auth::login($user);
        $request->session()->regenerate();

        $user->forceFill(['last_login_at' => now()])->save();

        return response()->json([
            'user' => new UserResource($user->load('store.license')),
            'demo' => [
                'expires_at' => $result['expires_at'],
                'hours' => $this->demos->hours(),
            ],
        ], 201);
    }

    /** پایان دادن به دمو و پاک کردن کامل دادهٔ آن. */
    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();
        $store = $user?->isStore() ? $user->store : null;

        if ($store === null || ! $store->isDemo()) {
            throw ValidationException::withMessages([
                'demo' => ['این حساب یک دمو نیست.'],
            ]);
        }

        AuditLogger::record('demo_closed_by_user', [
            'store_id' => $store->getKey(),
            'meta' => ['store' => $store->name],
        ]);

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        $this->demos->end($store, 'user_request');

        return response()->json(['ended' => true]);
    }
}
