<?php

namespace App\Services\Billing;

use App\Models\Order;
use App\Models\Store;
use App\Models\User;
use App\Services\Billing\Exceptions\PaymentGatewayException;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * چرخهٔ کامل پرداخت: ساخت سفارش، ارسال به درگاه، تأیید و اعمال لایسنس.
 *
 * اصل طراحی: تا پرداخت تأیید نشده هیچ لایسنسی تغییر نمی‌کند، و تأیید یک
 * سفارش دو بار (مثلاً بازگشت دوباره از درگاه) لایسنس را دو بار تمدید نمی‌کند.
 */
class CheckoutService
{
    public function __construct(
        private readonly PlanCatalog $plans,
        private readonly PaymentGatewayManager $gateways,
        private readonly LicenseService $licenses,
    ) {}

    /**
     * شروع خرید: سفارش ساخته و به درگاه فرستاده می‌شود.
     *
     * @return array{order: Order, redirect_url: string|null, instructions: string|null}
     *
     * @throws ValidationException
     */
    public function start(Store $store, User $user, string $planKey, ?string $gatewayKey = null): array
    {
        $plan = $this->plans->find($planKey);

        if ($plan === null) {
            throw ValidationException::withMessages(['plan' => ['پلن انتخاب‌شده معتبر نیست.']]);
        }

        $gatewayKey = $gatewayKey ?: (string) config('billing.gateway', 'manual');

        if (! $this->gateways->isAvailable($gatewayKey)) {
            throw ValidationException::withMessages(['gateway' => ['این روش پرداخت در دسترس نیست.']]);
        }

        $order = Order::create([
            'store_id' => $store->id,
            'user_id' => $user->id,
            'plan' => $plan['key'],
            'tier' => $plan['tier'],
            'months' => $plan['months'] ?? 0,
            'is_lifetime' => $plan['is_lifetime'],
            'amount' => $plan['amount'],
            'status' => Order::STATUS_PENDING,
            'gateway' => $gatewayKey,
            'meta' => ['plan_label' => $plan['label']],
        ]);

        $gateway = $this->gateways->driver($gatewayKey);

        try {
            $result = $gateway->request($order, [
                'email' => $user->email,
                'callback_url' => route('api.billing.callback', ['order' => $order->id]),
                'description' => $plan['label'].' — '.$store->name,
            ]);
        } catch (Throwable $exception) {
            $order->forceFill([
                'status' => Order::STATUS_FAILED,
                'meta' => [
                    'plan_label' => $plan['label'],
                    'error' => $exception->getMessage(),
                ],
            ])->save();

            AuditLogger::record('order_failed', [
                'store_id' => $store->id,
                'subject_type' => 'order',
                'subject_key' => $order->id,
                'meta' => ['gateway' => $gatewayKey, 'plan' => $plan['key'], 'error' => $exception->getMessage()],
            ]);

            throw ValidationException::withMessages([
                'gateway' => [$exception instanceof PaymentGatewayException
                    ? $exception->getMessage()
                    : 'اتصال به درگاه پرداخت ناموفق بود. دوباره تلاش کنید.'],
            ]);
        }

        $order->forceFill([
            'gateway_ref' => $result['authority'],
            'meta' => array_filter([
                'plan_label' => $plan['label'],
                'instructions' => $result['instructions'],
            ], fn ($value) => $value !== null),
        ])->save();

        AuditLogger::record('order_created', [
            'store_id' => $store->id,
            'subject_type' => 'order',
            'subject_key' => $order->id,
            'meta' => ['gateway' => $gatewayKey, 'plan' => $plan['key'], 'amount' => $plan['amount']],
        ]);

        return [
            'order' => $order->refresh(),
            'redirect_url' => $result['redirect_url'],
            'instructions' => $result['instructions'],
        ];
    }

    /**
     * تأیید پرداخت پس از بازگشت از درگاه.
     *
     * @param  array<string, mixed>  $params
     * @return array{ok: bool, order: Order, message: string|null}
     */
    public function verifyAndComplete(Order $order, array $params = []): array
    {
        if ($order->isPaid()) {
            return ['ok' => true, 'order' => $order, 'message' => null];
        }

        if (! $order->isPending()) {
            return [
                'ok' => false,
                'order' => $order,
                'message' => 'این سفارش دیگر قابل پرداخت نیست.',
            ];
        }

        $gateway = $this->gateways->driver($order->gateway);
        $result = $gateway->verify($order, $params);

        if (! $result['ok']) {
            $order->forceFill([
                'status' => Order::STATUS_FAILED,
                'meta' => array_filter([
                    ...((array) $order->meta),
                    'error' => $result['message'],
                ], fn ($value) => $value !== null),
            ])->save();

            AuditLogger::record('order_failed', [
                'store_id' => $order->store_id,
                'subject_type' => 'order',
                'subject_key' => $order->id,
                'meta' => ['gateway' => $order->gateway, 'error' => $result['message']],
            ]);

            return ['ok' => false, 'order' => $order->refresh(), 'message' => $result['message']];
        }

        return [
            'ok' => true,
            'order' => $this->complete($order, $result['reference']),
            'message' => null,
        ];
    }

    /**
     * ثبت پرداخت و اعمال لایسنس — تنها نقطهٔ مجاز «paid شدن» سفارش.
     *
     * هم‌زمانی با قفل ردیف مدیریت می‌شود و برای سفارش پرداخت‌شده بی‌اثر است
     * (idempotent)، پس بازگشت تکراری از درگاه لایسنس را دو بار تمدید نمی‌کند.
     */
    public function complete(Order $order, ?string $reference = null): Order
    {
        return DB::transaction(function () use ($order, $reference) {
            /** @var Order $locked */
            $locked = Order::query()->whereKey($order->getKey())->lockForUpdate()->firstOrFail();

            if ($locked->isPaid()) {
                return $locked;
            }

            $plan = [
                'tier' => $locked->tier,
                'months' => $locked->months > 0 ? $locked->months : null,
                'is_lifetime' => (bool) $locked->is_lifetime,
            ];

            $license = $this->licenses->applyPlan($locked->store, $plan, $locked->user_id);

            $locked->forceFill([
                'status' => Order::STATUS_PAID,
                'paid_at' => now(),
                'reference_id' => $reference ?? $locked->reference_id,
            ])->save();

            AuditLogger::record('order_paid', [
                'store_id' => $locked->store_id,
                'subject_type' => 'order',
                'subject_key' => $locked->id,
                'meta' => [
                    'plan' => $locked->plan,
                    'amount' => $locked->amount,
                    'gateway' => $locked->gateway,
                    'reference' => $locked->reference_id,
                ],
            ]);

            AuditLogger::record('license_renewed', [
                'store_id' => $locked->store_id,
                'subject_type' => 'license',
                'subject_key' => $license->id,
                'meta' => [
                    'tier' => $license->tier,
                    'is_lifetime' => (bool) $license->is_lifetime,
                    'expires_at' => $license->expires_at?->toIso8601String(),
                    'order_id' => $locked->id,
                ],
            ]);

            return $locked->refresh();
        });
    }

    /** لغو سفارش در انتظار (مثلاً رسید نامعتبر). */
    public function cancel(Order $order, ?string $reason = null): Order
    {
        if (! $order->isPending()) {
            return $order;
        }

        $order->forceFill([
            'status' => Order::STATUS_CANCELED,
            'meta' => array_filter([
                ...((array) $order->meta),
                'cancel_reason' => $reason,
            ], fn ($value) => $value !== null),
        ])->save();

        AuditLogger::record('order_canceled', [
            'store_id' => $order->store_id,
            'subject_type' => 'order',
            'subject_key' => $order->id,
            'meta' => ['reason' => $reason],
        ]);

        return $order->refresh();
    }
}
