<?php

namespace App\Http\Controllers\Api\Manager;

use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Services\Billing\CheckoutService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * تأیید پرداخت‌های کارت‌به‌کارت و مرور سفارش‌ها — فقط مدیر کل.
 */
class OrderController extends Controller
{
    public function __construct(private readonly CheckoutService $checkout) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => ['nullable', 'in:pending,paid,failed,canceled'],
            'store_id' => ['nullable', 'integer'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $orders = Order::query()
            ->with(['store:id,name', 'user:id,email'])
            ->when($filters['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($filters['store_id'] ?? null, fn ($query, $storeId) => $query->where('store_id', (int) $storeId))
            ->latest()
            ->limit((int) ($filters['limit'] ?? 50))
            ->get();

        return response()->json([
            'orders' => OrderResource::collection($orders),
            'totals' => [
                'pending' => Order::query()->where('status', Order::STATUS_PENDING)->count(),
                'paid_this_month' => Order::query()
                    ->where('status', Order::STATUS_PAID)
                    ->where('paid_at', '>=', now()->startOfMonth())
                    ->count(),
                'revenue_this_month' => (int) Order::query()
                    ->where('status', Order::STATUS_PAID)
                    ->where('paid_at', '>=', now()->startOfMonth())
                    ->sum('amount'),
            ],
        ]);
    }

    /**
     * تأیید پرداخت دستی (پس از دیدن رسید) و تمدید لایسنس.
     *
     * @throws ValidationException
     */
    public function approve(Request $request, Order $order): JsonResponse
    {
        if (! $order->isPending()) {
            throw ValidationException::withMessages([
                'order' => ['این سفارش در وضعیت انتظار نیست.'],
            ]);
        }

        $data = $request->validate([
            'reference' => ['nullable', 'string', 'max:120'],
        ]);

        $paid = $this->checkout->complete($order, $data['reference'] ?? null);

        return response()->json(['order' => new OrderResource($paid->load('store:id,name', 'user:id,email'))]);
    }

    public function reject(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['nullable', 'string', 'max:200'],
        ]);

        $canceled = $this->checkout->cancel($order, $data['reason'] ?? null);

        return response()->json(['order' => new OrderResource($canceled->load('store:id,name', 'user:id,email'))]);
    }
}
