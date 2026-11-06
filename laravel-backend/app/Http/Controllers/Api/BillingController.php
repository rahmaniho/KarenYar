<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\LicenseResource;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Models\Store;
use App\Services\Billing\CheckoutService;
use App\Services\Billing\LicenseService;
use App\Services\Billing\PaymentGatewayManager;
use App\Services\Billing\PlanCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * فروش و تمدید لایسنس: پلن‌ها، وضعیت اشتراک، شروع پرداخت و بازگشت از درگاه.
 */
class BillingController extends Controller
{
    public function __construct(
        private readonly PlanCatalog $plans,
        private readonly PaymentGatewayManager $gateways,
        private readonly CheckoutService $checkout,
        private readonly LicenseService $licenses,
    ) {}

    /** پلن‌ها و روش‌های پرداخت — عمومی (برای صفحهٔ قیمت و ثبت‌نام). */
    public function plans(): JsonResponse
    {
        return response()->json([
            'plans' => array_values($this->plans->all()),
            'gateways' => $this->gateways->available(),
            'currency' => config('billing.currency', 'toman'),
            'currency_label' => config('billing.currency_label', 'تومان'),
            'trial_days' => (int) config('billing.trial_days', 14),
            'public_registration' => (bool) config('billing.public_registration', true),
            'bank' => config('billing.public_registration', true) ? (array) config('billing.bank', []) : [],
        ]);
    }

    /** وضعیت اشتراک فروشگاه کاربر + سابقهٔ سفارش‌ها. */
    public function show(Request $request): JsonResponse
    {
        $store = $request->user()->store;
        $license = $store->license()->first();
        $pendingOrder = Order::query()
            ->where('store_id', $store->id)
            ->where('status', Order::STATUS_PENDING)
            ->latest()
            ->first();

        // اگر لایسنس منقضی شده اما فروشگاه دوباره فعال شده، وضعیت را از سمت
        // مدل می‌خوانیم تا روزهای باقی‌مانده منفی نشوند.
        return response()->json([
            'license' => $license ? new LicenseResource($license) : null,
            'orders' => OrderResource::collection(
                Order::query()
                    ->where('store_id', $store->id)
                    ->latest()
                    ->limit(20)
                    ->get()
            ),
            'plans' => array_values($this->plans->all()),
            'gateways' => $this->gateways->available(),
            'currency' => config('billing.currency', 'toman'),
            'currency_label' => config('billing.currency_label', 'تومان'),
            'trial_days' => (int) config('billing.trial_days', 14),
            'pending_order' => $pendingOrder ? new OrderResource($pendingOrder) : null,
        ]);
    }

    /**
     * شروع خرید/تمدید.
     *
     * @throws Throwable
     */
    public function checkout(Request $request): JsonResponse
    {
        $data = $request->validate([
            'plan' => ['required', 'string', 'max:40'],
            'gateway' => ['nullable', 'string', 'max:40'],
        ]);

        $user = $request->user();
        $store = $user->store;

        $result = $this->checkout->start($store, $user, $data['plan'], $data['gateway'] ?? null);

        return response()->json([
            'order' => new OrderResource($result['order']),
            'redirect_url' => $result['redirect_url'],
            'instructions' => $result['instructions'],
        ], 201);
    }

    /**
     * بازگشت از درگاه.
     *
     * تأیید در سمت سرور انجام می‌شود (هرگز به کوئری‌استرینگ اعتماد نمی‌کنیم)
     * و کاربر با پیامی روشن به تنظیمات/بخش اشتراک برگردانده می‌شود.
     */
    public function callback(Request $request): RedirectResponse
    {
        $orderId = (int) $request->query('order', 0);
        $order = $orderId > 0 ? Order::find($orderId) : null;

        if ($order === null) {
            return redirect('/settings?payment=invalid');
        }

        try {
            $result = $this->checkout->verifyAndComplete($order, $request->query());
        } catch (Throwable) {
            return redirect('/settings?payment=error&order='.$order->id);
        }

        return redirect(
            '/settings?payment='.($result['ok'] ? 'success' : 'failed').'&order='.$order->id.'#license'
        );
    }

    /**
     * صدور دستی دورهٔ آزمایشی برای فروشگاهی که ندارد (فقط مدیر).
     *
     * @throws ValidationException
     */
    public function grantTrial(Request $request): JsonResponse
    {
        $data = $request->validate([
            'store_id' => ['required', 'integer', 'exists:stores,id'],
            'days' => ['nullable', 'integer', 'min:1', 'max:365'],
        ]);

        $store = Store::findOrFail($data['store_id']);
        $license = $this->licenses->startTrial($store, (int) $request->user()->id, $data['days'] ?? null);

        return response()->json(['license' => new LicenseResource($license)]);
    }
}
