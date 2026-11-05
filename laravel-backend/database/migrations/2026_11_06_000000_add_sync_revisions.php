<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** جدول‌های همگام‌شونده با کلاینت (نام کلاینت => نام جدول). */
    private const TABLES = [
        'products',
        'invoices',
        'invoice_items',
        'transactions',
        'budgets',
        'debts',
        'employees',
        'payrolls',
        'customers',
        'customer_payments',
        'financial_events',
        'stock_movements',
        'held_sales',
        'settings',
        'calculator_history',
    ];

    /**
     * ستون‌های «همگام‌سازی افزایشی»:
     * - rev: شمارندهٔ یکنواختِ تغییرِ ردیف (برای pull?since=…)
     * - deleted_at: سنگ‌قبر (tombstone) تا حذفِ یک دستگاه به بقیه هم برسد
     */
    public function up(): void
    {
        if (! Schema::hasTable('sync_counters')) {
            Schema::create('sync_counters', function (Blueprint $table) {
                $table->unsignedBigInteger('store_id')->primary();
                $table->unsignedBigInteger('rev')->default(0);
                $table->timestamps();
            });
        }

        foreach (self::TABLES as $table) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            $hasRev = Schema::hasColumn($table, 'rev');
            $hasDeletedAt = Schema::hasColumn($table, 'deleted_at');

            if ($hasRev && $hasDeletedAt) {
                continue;
            }

            Schema::table($table, function (Blueprint $blueprint) use ($hasRev, $hasDeletedAt) {
                if (! $hasRev) {
                    $blueprint->unsignedBigInteger('rev')->default(0)->index();
                }

                if (! $hasDeletedAt) {
                    $blueprint->timestamp('deleted_at')->nullable()->index();
                }
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            $drop = [];
            if (Schema::hasColumn($table, 'rev')) {
                $drop[] = 'rev';
            }
            if (Schema::hasColumn($table, 'deleted_at')) {
                $drop[] = 'deleted_at';
            }
            if ($drop !== []) {
                Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropColumn($drop));
            }
        }

        Schema::dropIfExists('sync_counters');
    }
};
