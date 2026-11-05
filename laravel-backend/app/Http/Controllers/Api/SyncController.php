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
 * کلاینت همه‌ی داده‌ی فروشگاه را با pull می‌گیرد و تغییرات را به‌صورت دسته‌ای
 * (batch) با push برمی‌گرداند. هر دسته در یک تراکنش دیتابیس اعمال می‌شود تا
 * عملیات‌های چندجدولی (مثل صدور فاکتور) اتمیک بمانند.
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

    /**
     * ستون‌هایی که مقدارشان به‌صورت JSON ذخیره می‌شود.
     *
     * @var array<string, list<string>>
     */
    private const JSON_COLUMNS = [
        'payrolls' => ['input', 'result'],
        'held_sales' => ['items'],
        'settings' => ['value'],
    ];

    /**
     * ستون‌های تاریخ؛ هنگام خواندن به ISO و هنگام نوشتن به شکل دیتابیس تبدیل می‌شوند.
     *
     * @var array<string, list<string>>
     */
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

    public function pull(Request $request): JsonResponse
    {
        $storeId = (int) $request->user()->store_id;
        $data = [];

        foreach (self::TABLES as $key => $table) {
            $rows = DB::table($table)
                ->where('store_id', $storeId)
                ->get()
                ->map(fn (object $row) => $this->toClientRow($row, $table))
                ->all();

            $data[$key] = $rows;
        }

        return response()->json(['data' => $data]);
    }

    /**
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
            'ops.*.data' => ['nullable', 'array'],
        ]);

        DB::transaction(function () use ($validated, $storeId) {
            foreach ($validated['ops'] as $op) {
                $table = self::TABLES[$op['table']] ?? null;

                if ($table === null) {
                    continue; // جدول ناشناس نادیده گرفته می‌شود
                }

                if ($op['op'] === 'delete') {
                    if (isset($op['id'])) {
                        DB::table($table)
                            ->where('store_id', $storeId)
                            ->where('id', $op['id'])
                            ->delete();
                    }

                    continue;
                }

                $row = $this->toServerRow($op['data'] ?? [], $table);
                $row['store_id'] = $storeId;

                if ($op['op'] === 'insert') {
                    $row['id'] = $row['id'] ?? ($op['id'] ?? null);
                    DB::table($table)->insert($row);
                } else {
                    if (! isset($op['id'])) {
                        continue;
                    }
                    unset($row['id']);
                    DB::table($table)
                        ->where('store_id', $storeId)
                        ->where('id', $op['id'])
                        ->update($row);
                }
            }
        });

        return response()->json(['ok' => true]);
    }

    /** پاک‌کردن کامل داده‌ی «همین فروشگاه» (نه داده‌ی فروشگاه‌های دیگر). */
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

        DB::transaction(function () use ($order, $storeId) {
            foreach ($order as $table) {
                DB::table($table)->where('store_id', $storeId)->delete();
            }
        });

        return response()->json(['ok' => true]);
    }

    /**
     * تبدیل ردیف دیتابیس (snake_case) به شکل کلاینت (camelCase + ISO).
     *
     * @return array<string, mixed>
     */
    private function toClientRow(object $row, string $table): array
    {
        $result = [];
        $jsonColumns = self::JSON_COLUMNS[$table] ?? [];
        $dateColumns = self::DATE_COLUMNS[$table] ?? [];

        foreach ((array) $row as $column => $value) {
            if (in_array($column, $jsonColumns, true)) {
                $value = $this->decodeJson($value);
            } elseif (in_array($column, $dateColumns, true)) {
                $value = $this->isoify($value);
            }

            $result[$this->snakeToCamel($column)] = $value;
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
            $column = $this->camelToSnake((string) $key);

            if (! in_array($column, $columns, true)) {
                continue;
            }

            if (in_array($column, $jsonColumns, true)) {
                $value = $value === null ? null : json_encode($value, JSON_UNESCAPED_UNICODE);
            }

            $row[$column] = $value;
        }

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
