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
        Schema::create('held_sales', function (Blueprint $table) {
            $table->id();
            $table->string('label');

            // SaleDraftItem[] — سبد نگه‌داشته‌شده تا زمان تکمیل فروش.
            $table->json('items');

            $table->foreignId('customer_id')
                ->nullable()
                ->constrained('customers')
                ->nullOnDelete();

            $table->string('customer_name')->default('');
            $table->string('discount_type', 20)->default('amount');
            $table->decimal('discount_value', 18, 2)->default(0);
            $table->decimal('tax_percent', 8, 2)->default(0);
            $table->text('note')->nullable();
            $table->string('checkout_key')->nullable()->index();

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('held_sales');
    }
};
