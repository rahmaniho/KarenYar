<?php

namespace App\Http\Controllers\Api\Manager;

use App\Http\Controllers\Controller;
use App\Http\Resources\LicenseResource;
use App\Models\License;
use App\Models\Order;
use App\Models\Store;
use App\Models\SubscriptionHistory;
use App\Models\SubscriptionPayment;
use App\Services\Billing\LicenseService;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * مدیریت مشترکان: فهرست با فیلتر/جست‌وجو، سابقه، تمدید و تغییر وضعیت.
 *
 * هر تغییر مدیریتی دلیل الزامی دارد و در `subscription_history` و
 * `audit_logs` ثبت می‌شود.
 */
class SubscriberController extends Controller
{
    public function __construct(private readonly LicenseService $licenses) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'status' => ['nullable', 'in:active,expired,pending,suspended,canceled,renewal_pending'],
            'plan_code' => ['nullable', 'string', 'max:40'],
            'sort' => ['nullable', 'in:expires_at,-expires_at,created_at,-created_at'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $query = License::query()
            ->with(['store' => fn ($relation) => $relation->withCount([
                'users as active_users_count' => fn ($q) => $q->where('is_active', true),
            ])])
            ->when($filters['plan_code'] ?? null, fn ($q, $plan) => $q->where('plan_code', $plan))
            ->when($filters['q'] ?? null, function ($q, $term) {
                $like = '%'.$term.'%';
                $q->whereHas('store', fn ($store) => $store
                    ->where('name', 'like', $like)
                    ->orWhere('phone', 'like', $like)
                    ->orWhere('owner_name', 'like', $like)
                    ->orWhereHas('users', fn ($user) => $user->where('email', 'like', $like)));
            })
            ->orderBy($this->sortColumn($filters['sort'] ?? '-created_at'), $this->sortDirection($filters['sort'] ?? '-created_at'));

        $rows = $query->limit((int) ($filters['limit'] ?? 100))->get();

        $rows = $rows->filter(function (License $license) use ($filters) {
            $status = $filters['status'] ?? null;

            return $status === null || $license->effectiveStatus() === $status;
        })->values();

        $paid = Order::query()->where('status', Order::STATUS_PAID);

        return response()->json([
            'subscribers' => $rows->map(fn (License $license) => $this->serialize($license))->all(),
            'stats' => [
                'total' => License::count(),
                'active' => License::query()->where('is_active', true)->where('status', 'active')
                    ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))->count(),
                'expiring_soon' => License::query()->where('is_active', true)
                    ->whereNotNull('expires_at')
                    ->whereBetween('expires_at', [now(), now()->addDays(7)])
                    ->count(),
                'expired' => License::query()->whereNotNull('expires_at')->where('expires_at', '<', now())->count(),
                'revenue_total' => (int) (clone $paid)->sum('amount'),
                'revenue_month' => (int) (clone $paid)->where('paid_at', '>=', now()->startOfMonth())->sum('amount'),
            ],
        ]);
    }

    public function show(License $license): JsonResponse
    {
        $license->load(['store' => fn ($relation) => $relation->withCount([
            'users as active_users_count' => fn ($q) => $q->where('is_active', true),
        ])]);

        $payments = Order::query()
            ->where('store_id', $license->store_id)
            ->latest()
            ->limit(20)
            ->get()
            ->map(fn (Order $order) => [
                'id' => $order->id,
                'plan' => $order->plan,
                'type' => $order->type,
                'seats' => (int) $order->seats,
                'months' => (int) $order->months,
                'amount' => (int) $order->amount,
                'status' => $order->status,
                'gateway' => $order->gateway,
                'reference_id' => $order->reference_id,
                'paid_at' => $order->paid_at?->toIso8601String(),
                'created_at' => $order->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        $attempts = SubscriptionPayment::query()
            ->where('store_id', $license->store_id)
            ->latest()
            ->limit(50)
            ->get()
            ->map(fn (SubscriptionPayment $payment) => [
                'id' => $payment->id,
                'order_id' => $payment->order_id,
                'gateway' => $payment->gateway,
                'amount' => (int) $payment->amount,
                'status' => $payment->status,
                'reference_id' => $payment->reference_id,
                'verified_at' => $payment->verified_at?->toIso8601String(),
                'created_at' => $payment->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        $history = SubscriptionHistory::query()
            ->where('store_id', $license->store_id)
            ->orderByDesc('id')
            ->limit(50)
            ->get()
            ->map(fn (SubscriptionHistory $row) => [
                'id' => $row->id,
                'action' => $row->action,
                'reason' => $row->reason,
                'payload' => $row->payload,
                'actor_id' => $row->actor_id,
                'created_at' => $row->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        return response()->json([
            'subscriber' => $this->serialize($license),
            'payments' => $payments,
            'attempts' => $attempts,
            'history' => $history,
        ]);
    }

    /**
     * تمدید/اصلاح دستی اشتراک با دلیل.
     *
     * @throws Throwable
     */
    public function extend(Request $request, License $license): JsonResponse
    {
        $data = $request->validate([
            'months' => ['required', 'integer', 'min:1', 'max:60'],
            'seats' => ['nullable', 'integer', 'min:1', 'max:200'],
            'plan_code' => ['nullable', 'string', 'max:40', 'exists:subscription_plans,code'],
            'reason' => ['required', 'string', 'min:3', 'max:300'],
        ], [
            'reason.required' => 'دلیل تمدید/اصلاح الزامی است و در تاریخچه ثبت می‌شود.',
        ]);

        $updated = $this->licenses->extendManually(
            $license->store,
            (int) $data['months'],
            isset($data['seats']) ? (int) $data['seats'] : null,
            (string) $data['reason'],
            $request->user(),
            $data['plan_code'] ?? null,
        );

        return response()->json(['subscriber' => $this->serialize($updated->load('store'))]);
    }

    /**
     * @throws Throwable
     */
    public function status(Request $request, License $license): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:active,suspended,canceled'],
            'reason' => ['required', 'string', 'min:3', 'max:300'],
        ]);

        $updated = $this->licenses->setStatus(
            $license->store,
            (string) $data['status'],
            (string) $data['reason'],
            $request->user(),
        );

        return response()->json(['subscriber' => $this->serialize($updated->load('store'))]);
    }

    /**
     * @throws ValidationException
     */
    public function seats(Request $request, License $license): JsonResponse
    {
        $data = $request->validate([
            'seats' => ['required', 'integer', 'min:1', 'max:200'],
            'reason' => ['required', 'string', 'min:3', 'max:300'],
        ]);

        $usage = $license->store->activeUserCount();

        if ((int) $data['seats'] < $usage) {
            throw ValidationException::withMessages([
                'seats' => ["این فروشگاه {$usage} کاربر فعال دارد؛ سقف نمی‌تواند کمتر از آن باشد."],
            ]);
        }

        $updated = $this->licenses->setSeats($license->store, (int) $data['seats'], $request->user(), (string) $data['reason']);

        return response()->json(['subscriber' => $this->serialize($updated->load('store'))]);
    }

    /**
     * @return array<string, mixed>
     */
    private function serialize(License $license): array
    {
        $store = $license->store;
        $lastOrder = Order::query()
            ->where('store_id', $license->store_id)
            ->latest()
            ->first();

        return [
            'license_id' => $license->id,
            'store_id' => $license->store_id,
            'store_name' => $store?->name,
            'owner_name' => $store?->owner_name,
            'phone' => $store?->phone,
            'plan_code' => $license->plan_code,
            'tier' => $license->tier,
            'seats' => $license->seats(),
            'active_users' => (int) ($store->active_users_count ?? $store?->activeUserCount() ?? 0),
            'status' => $license->effectiveStatus(),
            'is_active' => (bool) $license->is_active,
            'is_trial' => (bool) $license->is_trial,
            'is_lifetime' => (bool) $license->is_lifetime,
            'starts_at' => $license->starts_at?->toIso8601String(),
            'expires_at' => $license->expires_at?->toIso8601String(),
            'days_remaining' => $license->daysRemaining(),
            'last_order_id' => $lastOrder?->id,
            'last_transaction' => $lastOrder?->reference_id,
            'last_amount' => $lastOrder ? (int) $lastOrder->amount : null,
            'license' => new LicenseResource($license),
        ];
    }

    private function sortColumn(string $sort): string
    {
        return ltrim($sort, '-') === 'expires_at' ? 'expires_at' : 'created_at';
    }

    private function sortDirection(string $sort): string
    {
        return str_starts_with($sort, '-') ? 'desc' : 'asc';
    }
}
