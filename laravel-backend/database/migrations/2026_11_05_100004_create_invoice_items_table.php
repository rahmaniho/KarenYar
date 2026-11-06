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
        Schema::create('invoice_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();

            $table->foreignId('invoice_id')
                ->constrained('invoices')
                ->cascadeOnDelete();

            $table->foreignId('product_id')
                ->nullable()
                ->constrained('products')
                ->nullOnDelete();

            $table->string('name');
            $table->decimal('qty', 18, 3)->default(0);
            $table->decimal('unit_price', 18, 2)->default(0);
            $table->string('unit', 50)->nullable();

            $table->string('discount_type', 20)->default('amount');
            $table->decimal('discount_value', 18, 2)->default(0);
            $table->decimal('discount_amount', 18, 2)->default(0);

            // قیمت تمام‌شده‌ی واحد هنگام فروش (برای محاسبه‌ی سود)
            $table->decimal('unit_cost', 18, 2)->default(0);
            $table->decimal('total', 18, 2)->default(0);

            $table->timestamps();

            $table->index(['invoice_id', 'product_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('invoice_items');
    }
};
