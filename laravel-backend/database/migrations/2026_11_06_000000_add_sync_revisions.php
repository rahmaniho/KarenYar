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

            Schema::table($table, function (Blueprint $blueprint) {
                $name = $blueprint->getTable();

                if (! Schema::hasColumn($name, 'rev')) {
                    $blueprint->unsignedBigInteger('rev')->default(0)->index();
                }

                if (! Schema::hasColumn($name, 'deleted_at')) {
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

            Schema::table($table, function (Blueprint $blueprint) {
                $name = $blueprint->getTable();

                if (Schema::hasColumn($name, 'rev')) {
                    $blueprint->dropColumn('rev');
                }

                if (Schema::hasColumn($name, 'deleted_at')) {
                    $blueprint->dropColumn('deleted_at');
                }
            });
        }

        Schema::dropIfExists('sync_counters');
    }
};
