<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * همگام‌سازی داده‌ی فروشگاه بین مرورگر (لایه‌ی داده) و دیتابیس لاراول.
 *
 * قرارداد نسخهٔ ۲ (افزایشی):
 * - هر ردیف ستون `rev` دارد: شمارنده‌ای یکنواخت و مشترک برای همه‌ی فروشگاه
 *   (`sync_counters`) که با هر نوشتن یک واحد بالا می‌رود.
 * - `GET /api/sync/pull?since=REV` فقط ردیف‌های تغییرکرده بعد از آن شمارنده را
 *   برمی‌گرداند. ردیف‌های حذف‌شده هم با `__deleted: true` برمی‌گردند (سنگ‌قبر)
 *   تا حذف در دستگاه‌های دیگر اعمال شود.
 * - `POST /api/sync/push` برای هر عملیات `baseRev` می‌فرستد؛ اگر ردیف روی سرور
 *   بعد از آن تغییر کرده باشد، عملیات اعمال نمی‌شود و در `conflicts` برمی‌گردد
 *   (سرور برنده است و کلاینت نسخهٔ سرور را می‌گیرد).
 * - `POST /api/sync/import` یک فایل پشتیبان JSON (خروجی اپ آفلاین) را به‌صورت
 *   ادغامی وارد می‌کند تا کاربران فعلی بتوانند داده‌شان را به سرور منتقل کنند.
 */
class SyncController extends Controller
{
    /**
     * نام منطقی جدول در کلاینت => نام جدول در دیتابیس.
     *
     * @var array<string, string>
     */
    private const TABLES = [
        'products' => 'products',
        'invoices' => 'invoices',
        'invoiceItems' => 'invoice_items',
        'transactions' => 'transactions',
        'budgets' => 'budgets',
        'debts' => 'debts',
        'employees' => 'employees',
        'payrolls' => 'payrolls',
        'customers' => 'customers',
        'customerPayments' => 'customer_payments',
        'financialEvents' => 'financial_events',
        'stockMovements' => 'stock_movements',
        'heldSales' => 'held_sales',
        'settings' => 'settings',
        'calculatorHistory' => 'calculator_history',
    ];

    /** جدول‌هایی که کلید اصلی‌شان به‌جای id، ستون key است. */
    private const KEYED_TABLES = ['settings'];

    /**
     * ترتیب درج هنگام ورود داده‌ی پشتیبان (والد پیش از فرزند) تا کلیدهای خارجی
     * نقض نشوند.
     *
     * @var list<string>
     */
    private const IMPORT_ORDER = [
        'customers',
        'products',
        'invoices',
        'invoiceItems',
        'transactions',
        'budgets',
        'debts',
        'employees',
        'payrolls',
        'customerPayments',
        'financialEvents',
        'stockMovements',
        'heldSales',
        'settings',
        'calculatorHistory',
    ];

    /** ستون‌هایی که مقدارشان به‌صورت JSON ذخیره می‌شود. */
    private const JSON_COLUMNS = [
        'payrolls' => ['input', 'result'],
        'held_sales' => ['items'],
        'settings' => ['value'],
    ];

    /** ستون‌های تاریخ؛ هنگام خواندن به ISO و هنگام نوشتن به شکل دیتابیس تبدیل می‌شوند. */
    private const DATE_COLUMNS = [
        'products' => ['created_at', 'updated_at'],
        'customers' => ['created_at', 'updated_at'],
        'invoices' => ['date', 'due_date', 'issued_at', 'voided_at', 'created_at', 'updated_at'],
        'invoice_items' => ['created_at', 'updated_at'],
        'transactions' => ['date', 'created_at', 'updated_at'],
        'budgets' => ['created_at', 'updated_at'],
        'debts' => ['due_date', 'created_at', 'updated_at'],
        'employees' => ['start_date', 'created_at', 'updated_at'],
        'payrolls' => ['created_at', 'updated_at'],
        'customer_payments' => ['date', 'created_at', 'updated_at'],
        'financial_events' => ['created_at', 'updated_at'],
        'stock_movements' => ['created_at', 'updated_at'],
        'held_sales' => ['created_at', 'updated_at'],
        'settings' => ['created_at', 'updated_at'],
        'calculator_history' => ['created_at', 'updated_at'],
    ];

    /** بیشترین تعداد ردیف‌هایی که یک فایل پشتیبان می‌تواند داشته باشد. */
    private const MAX_IMPORT_ROWS = 200000;

    /**
     * خواندن داده — کامل (بدون since) یا افزایشی (since=REV).
     */
    public function pull(Request $request): JsonResponse
    {
        $storeId = (int) $request->user()->store_id;
        $since = max(0, (int) $request->query('since', 0));
        $rev = $this->currentRev($storeId);

        $data = [];

        foreach (self::TABLES as $key => $table) {
            $rows = DB::table($table)
                ->where('store_id', $storeId)
                ->when($since > 0, fn ($query) => $query->where('rev', '>', $since))
                ->orderBy('rev')
                ->get()
                ->map(fn (object $row) => $this->toClientRow($row, $table))
                ->all();

            // در حالت افزایشی، جدول‌های بدون تغییر را با آرایه‌ی خالی برنمی‌گردانیم
            // تا پاسخ سبک بماند؛ کلاینت فقط کلیدهای موجود را اعمال می‌کند.
            if ($since > 0 && $rows === []) {
                continue;
            }

            $data[$key] = $rows;
        }

        return response()->json([
            'storeId' => $storeId,
            'rev' => $rev,
            'full' => $since === 0,
            'data' => $data,
        ]);
    }

    /**
     * نوشتن دسته‌ای تغییرات با تشخیص تعارض.
     *
     * @throws Throwable
     */
    public function push(Request $request): JsonResponse
    {
        $storeId = (int) $request->user()->store_id;

        $validated = $request->validate([
            'ops' => ['present', 'array', 'max:5000'],
            'ops.*.table' => ['required', 'string'],
            'ops.*.op' => ['required', 'in:insert,update,delete'],
            'ops.*.id' => ['nullable', 'integer'],
            'ops.*.key' => ['nullable', 'string'],
            'ops.*.baseRev' => ['nullable', 'integer', 'min:0'],
            'ops.*.data' => ['nullable', 'array'],
        ]);

        $applied = [];
        $conflicts = [];

        DB::transaction(function () use ($validated, $storeId, &$applied, &$conflicts): void {
            foreach ($validated['ops'] as $op) {
                $clientTable = (string) $op['table'];
                $table = self::TABLES[$clientTable] ?? null;

                if ($table === null) {
                    continue; // جدول ناشناس نادیده گرفته می‌شود
                }

                $keyColumn = in_array($table, self::KEYED_TABLES, true) ? 'key' : 'id';
                $key = $this->opKey($op, $keyColumn);

                if ($key === null) {
                    continue;
                }

                $existing = DB::table($table)
                    ->where('store_id', $storeId)
                    ->where($keyColumn, $key)
                    ->first();

                $baseRev = isset($op['baseRev']) ? (int) $op['baseRev'] : null;

                // تعارض: نسخه‌ای که کلاینت دیده بود دیگر همان نسخه‌ی سرور نیست.
                if ($existing !== null && $baseRev !== null && (int) $existing->rev !== $baseRev) {
                    $conflicts[] = [
                        'table' => $clientTable,
                        'key' => $key,
                        'server' => $this->toClientRow($existing, $table),
                    ];

                    continue;
                }

                if ($op['op'] === 'delete') {
                    if ($existing === null) {
                        continue;
                    }

                    $newRev = $this->nextRev($storeId);
                    DB::table($table)
                        ->where('store_id', $storeId)
                        ->where($keyColumn, $key)
                        ->update(['deleted_at' => now(), 'rev' => $newRev]);

                    $applied[] = ['table' => $clientTable, 'key' => $key, 'rev' => $newRev, 'deleted' => true];

                    continue;
                }

                $row = $this->toServerRow($op['data'] ?? [], $table);
                $newRev = $this->nextRev($storeId);
                $row['store_id'] = $storeId;
                $row['rev'] = $newRev;
                $row['deleted_at'] = null;

                if ($existing === null) {
                    $row[$keyColumn] = $key;
                    DB::table($table)->insert($row);
                } else {
                    unset($row[$keyColumn]);
                    DB::table($table)
                        ->where('store_id', $storeId)
                        ->where($keyColumn, $key)
                        ->update($row);
                }

                $applied[] = ['table' => $clientTable, 'key' => $key, 'rev' => $newRev];
            }
        });

        return response()->json([
            'ok' => true,
            'storeId' => $storeId,
            'rev' => $this->currentRev($storeId),
            'applied' => $applied,
            'conflicts' => $conflicts,
        ]);
    }

    /**
     * ورود ادغامی داده‌ی فایل پشتیبان (مهاجرت از نسخهٔ آفلاین به سرور).
     *
     * ردیف‌هایی که از قبل روی سرور هستند دست‌نخورده می‌مانند؛ فقط ردیف‌های
     * تازه درج می‌شوند. شناسه‌ها حفظ می‌شوند تا ارجاع‌های بین جدول‌ها (مثلاً
     * اقلام فاکتور) درست بمانند.
     */
    public function import(Request $request): JsonResponse
    {
        $storeId = (int) $request->user()->store_id;

        $validated = $request->validate([
            'tables' => ['required', 'array'],
            'tables.*' => ['array'],
        ]);

        $tables = $validated['tables'];
        $total = 0;

        foreach ($tables as $rows) {
            $total += is_array($rows) ? count($rows) : 0;
        }

        if ($total > self::MAX_IMPORT_ROWS) {
            return response()->json([
                'message' => 'فایل پشتیبان بیش از حد بزرگ است.',
            ], 422);
        }

        $imported = [];

        DB::transaction(function () use ($tables, $storeId, &$imported): void {
            foreach (self::IMPORT_ORDER as $clientTable) {
                $table = self::TABLES[$clientTable] ?? null;
                $rows = $tables[$clientTable] ?? null;

                if ($table === null || ! is_array($rows)) {
                    continue;
                }

                $keyColumn = in_array($table, self::KEYED_TABLES, true) ? 'key' : 'id';
                $count = 0;

                foreach ($rows as $data) {
                    if (! is_array($data)) {
                        continue;
                    }

                    $key = $data[$keyColumn] ?? ($keyColumn === 'id' ? $data['id'] ?? null : null);

                    if ($key === null) {
                        continue;
                    }

                    $exists = DB::table($table)
                        ->where('store_id', $storeId)
                        ->where($keyColumn, $key)
                        ->exists();

                    if ($exists) {
                        continue; // ادغام: نسخه‌ی سرور مقدم است
                    }

                    $row = $this->toServerRow($data, $table);
                    $row[$keyColumn] = $key;
                    $row['store_id'] = $storeId;
                    $row['rev'] = $this->nextRev($storeId);
                    $row['deleted_at'] = null;

                    DB::table($table)->insert($row);
                    $count++;
                }

                $imported[$clientTable] = $count;
            }
        });

        return response()->json([
            'ok' => true,
            'storeId' => $storeId,
            'rev' => $this->currentRev($storeId),
            'imported' => $imported,
            'total' => array_sum($imported),
        ]);
    }

    /** پاک‌کردن کامل داده‌ی «همین فروشگاه» (سنگ‌قبر، تا دستگاه‌های دیگر هم خالی شوند). */
    public function wipe(Request $request): JsonResponse
    {
        $storeId = (int) $request->user()->store_id;

        // ترتیب حذف فرزند به والد تا کلیدهای خارجی نقض نشوند.
        $order = [
            'financial_events',
            'stock_movements',
            'customer_payments',
            'transactions',
            'invoice_items',
            'invoices',
            'payrolls',
            'held_sales',
            'budgets',
            'debts',
            'calculator_history',
            'settings',
            'customers',
            'employees',
            'products',
        ];

        DB::transaction(function () use ($order, $storeId): void {
            foreach ($order as $table) {
                $keys = DB::table($table)
                    ->where('store_id', $storeId)
                    ->whereNull('deleted_at')
                    ->pluck(in_array($table, self::KEYED_TABLES, true) ? 'key' : 'id')
                    ->all();

                foreach ($keys as $key) {
                    DB::table($table)
                        ->where('store_id', $storeId)
                        ->where(in_array($table, self::KEYED_TABLES, true) ? 'key' : 'id', $key)
                        ->update(['deleted_at' => now(), 'rev' => $this->nextRev($storeId)]);
                }
            }
        });

        return response()->json([
            'ok' => true,
            'storeId' => $storeId,
            'rev' => $this->currentRev($storeId),
        ]);
    }

    /** شمارنده‌ی فعلی تغییرات فروشگاه. */
    private function currentRev(int $storeId): int
    {
        $row = DB::table('sync_counters')->where('store_id', $storeId)->first();

        return $row === null ? 0 : (int) $row->rev;
    }

    /** گرفتن شمارنده‌ی بعدی (باید داخل تراکنش صدا زده شود). */
    private function nextRev(int $storeId): int
    {
        $row = DB::table('sync_counters')->where('store_id', $storeId)->lockForUpdate()->first();

        if ($row === null) {
            DB::table('sync_counters')->insert([
                'store_id' => $storeId,
                'rev' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return 1;
        }

        $next = (int) $row->rev + 1;

        DB::table('sync_counters')
            ->where('store_id', $storeId)
            ->update(['rev' => $next, 'updated_at' => now()]);

        return $next;
    }

    /**
     * کلید عملیات: برای جدول‌های keyed از `key` و بقیه از `id`.
     *
     * @param  array<string, mixed>  $op
     */
    private function opKey(array $op, string $keyColumn): int|string|null
    {
        if ($keyColumn === 'key') {
            $key = $op['key'] ?? ($op['data']['key'] ?? null);

            return is_string($key) && $key !== '' ? $key : null;
        }

        $id = $op['id'] ?? ($op['data']['id'] ?? null);

        return $id === null ? null : (int) $id;
    }

    /**
     * تبدیل ردیف دیتابیس (snake_case) به شکل کلاینت (camelCase + ISO).
     *
     * ستون‌های داخلی `store_id` و `deleted_at` حذف می‌شوند؛ `rev` می‌ماند و
     * ردیف حذف‌شده با `__deleted: true` مشخص می‌شود.
     *
     * @return array<string, mixed>
     */
    private function toClientRow(object $row, string $table): array
    {
        $result = [];
        $jsonColumns = self::JSON_COLUMNS[$table] ?? [];
        $dateColumns = self::DATE_COLUMNS[$table] ?? [];
        $deleted = isset($row->deleted_at) && $row->deleted_at !== null;

        foreach ((array) $row as $column => $value) {
            if ($column === 'store_id' || $column === 'deleted_at') {
                continue;
            }

            if (in_array($column, $jsonColumns, true)) {
                $value = $this->decodeJson($value);
            } elseif (in_array($column, $dateColumns, true)) {
                $value = $this->isoify($value);
            }

            $result[$this->snakeToCamel($column)] = $value;
        }

        if ($deleted) {
            $result['__deleted'] = true;
        }

        return $result;
    }

    /**
     * تبدیل داده‌ی کلاینت (camelCase) به ستون‌های دیتابیس (snake_case).
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function toServerRow(array $data, string $table): array
    {
        $columns = $this->columnsFor($table);
        $jsonColumns = self::JSON_COLUMNS[$table] ?? [];
        $row = [];

        foreach ($data as $key => $value) {
            if (str_starts_with((string) $key, '__')) {
                continue; // فیلدهای داخلی کلاینت
            }

            $column = $this->camelToSnake((string) $key);

            if (! in_array($column, $columns, true)) {
                continue;
            }

            if (in_array($column, $jsonColumns, true)) {
                $value = $value === null ? null : json_encode($value, JSON_UNESCAPED_UNICODE);
            }

            $row[$column] = $value;
        }

        unset($row['rev'], $row['store_id'], $row['deleted_at']);

        return $row;
    }

    /**
     * @return list<string>
     */
    private function columnsFor(string $table): array
    {
        static $cache = [];

        return $cache[$table] ??= Schema::getColumnListing($table);
    }

    private function decodeJson(mixed $value): mixed
    {
        if (! is_string($value) || $value === '') {
            return $value;
        }

        $decoded = json_decode($value, true);

        return json_last_error() === JSON_ERROR_NONE ? $decoded : $value;
    }

    private function isoify(mixed $value): mixed
    {
        if (! is_string($value) || $value === '') {
            return $value;
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $value) === 1) {
            return str_replace(' ', 'T', $value).'Z';
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) === 1) {
            return $value.'T00:00:00Z';
        }

        return $value;
    }

    private function snakeToCamel(string $value): string
    {
        return preg_replace_callback(
            '/_([a-z0-9])/',
            fn (array $matches) => strtoupper($matches[1]),
            $value,
        );
    }

    private function camelToSnake(string $value): string
    {
        return strtolower((string) preg_replace('/([A-Z])/', '_$1', $value));
    }
}
