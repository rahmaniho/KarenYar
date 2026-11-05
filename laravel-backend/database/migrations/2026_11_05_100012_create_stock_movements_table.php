<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();

            $table->foreignId('product_id')
                ->constrained('products')
                ->cascadeOnDelete();

            // نام محصول در لحظه‌ی رویداد نگه داشته می‌شود تا تاریخچه با تغییر نام خراب نشود.
            $table->string('product_name');

            $table->foreignId('invoice_id')
                ->nullable()
                ->constrained('invoices')
                ->nullOnDelete();

            // opening | sale | void | restock | adjustment
            $table->string('type', 20)->index();

            // مقدار علامت‌دار: ورود مثبت، خروج منفی
            $table->decimal('quantity', 18, 3)->default(0);
            $table->decimal('stock_before', 18, 3)->default(0);
            $table->decimal('stock_after', 18, 3)->default(0);

            $table->text('note')->nullable();
            $table->timestamps();

            $table->index(['product_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
    }
};
