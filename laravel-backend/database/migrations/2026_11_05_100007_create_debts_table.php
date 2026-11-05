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
        Schema::create('debts', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('kind', 20)->default('debt'); // debt | installment

            // مبلغ کل بدهی/وام
            $table->decimal('amount', 18, 2)->default(0);
            // مبلغ پرداخت‌شده تاکنون (برای بدهی ساده)
            $table->decimal('paid_amount', 18, 2)->default(0);

            // تعداد کل اقساط و مبلغ هر قسط (برای قسطی)
            $table->unsignedInteger('installments_count')->nullable();
            $table->decimal('installment_amount', 18, 2)->nullable();
            $table->unsignedInteger('paid_installments')->default(0);

            // سررسید بعدی (ISO میلادی)
            $table->dateTime('due_date')->index();
            $table->text('description')->nullable();

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('debts');
    }
};
