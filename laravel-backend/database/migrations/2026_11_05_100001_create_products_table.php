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
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('barcode')->nullable()->index();
            $table->string('category')->default('')->index();

            // همه‌ی مبالغ به تومان ذخیره می‌شوند.
            $table->decimal('buy_price', 18, 2)->default(0);
            $table->decimal('buy_tax_percent', 8, 2)->default(0);
            $table->decimal('shipping_per_unit', 18, 2)->default(0);
            $table->decimal('overhead_per_unit', 18, 2)->default(0);
            $table->decimal('cost_price', 18, 2)->default(0);
            $table->decimal('sell_price', 18, 2)->default(0);

            $table->decimal('stock', 18, 3)->default(0)->index();
            $table->string('unit', 50)->default('عدد');
            $table->decimal('min_stock', 18, 3)->default(0);

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
