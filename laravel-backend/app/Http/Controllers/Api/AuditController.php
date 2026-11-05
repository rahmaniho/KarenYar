<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * خواندن دفتر رویدادها.
 *
 * - مدیر کل: همهٔ فروشگاه‌ها با فیلتر فروشگاه/نوع رویداد.
 * - کاربر فروشگاه: فقط رویدادهای فروشگاه خودش.
 */
class AuditController extends Controller
{
    /** رویدادهای همهٔ فروشگاه‌ها (فقط مدیر). */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
            'store_id' => ['nullable', 'integer'],
            'action' => ['nullable', 'string', 'max:60'],
        ]);

        $query = AuditLog::query()
            ->with(['user:id,name,email', 'store:id,name'])
            ->orderByDesc('id')
            ->limit((int) ($filters['limit'] ?? 60));

        if (! empty($filters['store_id'])) {
            $query->where('store_id', (int) $filters['store_id']);
        }

        if (! empty($filters['action'])) {
            $query->where('action', $filters['action']);
        }

        return response()->json(['events' => $this->serialize($query->get())]);
    }

    /** رویدادهای فروشگاه خود کاربر. */
    public function mine(Request $request): JsonResponse
    {
        $limit = (int) $request->query('limit', 40);
        $limit = max(1, min(200, $limit));

        $events = AuditLog::query()
            ->with(['user:id,name,email', 'store:id,name'])
            ->where('store_id', (int) $request->user()->store_id)
            ->orderByDesc('id')
            ->limit($limit)
            ->get();

        return response()->json(['events' => $this->serialize($events)]);
    }

    /**
     * @param  \Illuminate\Support\Collection<int, AuditLog>  $events
     * @return list<array<string, mixed>>
     */
    private function serialize($events): array
    {
        return $events->map(fn (AuditLog $log) => [
            'id' => $log->id,
            'action' => $log->action,
            'storeId' => $log->store_id,
            'storeName' => $log->store?->name,
            'userName' => $log->user?->name,
            'userEmail' => $log->user?->email,
            'subjectType' => $log->subject_type,
            'subjectKey' => $log->subject_key,
            'meta' => $log->meta,
            'ip' => $log->ip,
            'createdAt' => $log->created_at?->toIso8601String(),
        ])->all();
    }
}
