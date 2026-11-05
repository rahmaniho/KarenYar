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
        Schema::create('customer_payments', function (Blueprint $table) {
            $table->id();

            $table->foreignId('customer_id')
                ->constrained('customers')
                ->cascadeOnDelete();

            // پرداخت مرتبط با فاکتور خاص (اختیاری)
            $table->foreignId('invoice_id')
                ->nullable()
                ->constrained('invoices')
                ->nullOnDelete();

            $table->decimal('amount', 18, 2)->default(0);
            $table->dateTime('date')->index();
            $table->text('note')->nullable();

            // نبود فیلد در سوابق قدیمی به معنای دریافت است، نه برگشت وجه.
            $table->string('kind', 20)->default('payment'); // payment | refund
            $table->string('method', 20)->nullable(); // cash | card | transfer
            $table->string('reference')->nullable();

            // کلید یکتای ثبت پرداخت برای جلوگیری از ثبت تکراری.
            $table->string('payment_key')->nullable()->unique();
            $table->string('request_signature')->nullable();

            $table->foreignId('reversal_of')
                ->nullable()
                ->constrained('customer_payments')
                ->nullOnDelete();
            $table->text('reversal_reason')->nullable();

            $table->timestamps();

            $table->index(['invoice_id', 'date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('customer_payments');
    }
};
