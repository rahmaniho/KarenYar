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
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();

            // شماره‌ی فاکتور (ترتیبی)
            $table->unsignedBigInteger('number')->index();
            $table->dateTime('date')->index();

            $table->string('customer_name')->nullable();
            $table->foreignId('customer_id')
                ->nullable()
                ->constrained('customers')
                ->nullOnDelete();

            // فروش نسیه؟ (به مانده‌ی حساب مشتری اضافه می‌شود)
            $table->boolean('is_credit')->default(false);

            $table->decimal('subtotal', 18, 2)->default(0);
            $table->string('discount_type', 20)->default('amount');
            $table->decimal('discount_value', 18, 2)->default(0);
            $table->decimal('discount_amount', 18, 2)->default(0);
            $table->decimal('tax_percent', 8, 2)->default(0);
            $table->decimal('tax_amount', 18, 2)->default(0);
            // هزینه‌ی بدون مالیاتِ جداگانه؛ برای سندهای قدیمی صفر در نظر گرفته می‌شود.
            $table->decimal('shipping_amount', 18, 2)->default(0);
            $table->decimal('other_amount', 18, 2)->default(0);
            $table->decimal('total', 18, 2)->default(0)->index();

            // سررسید پرداخت (ISO میلادی)؛ خالی یعنی ۳۰ روز پس از صدور.
            $table->dateTime('due_date')->nullable();

            // فاکتورهای قدیمی بدون status معتبر و فعال هستند.
            $table->string('status', 20)->default('completed')->index();
            $table->string('source', 20)->default('invoice');

            $table->string('payment_method', 20)->nullable();
            $table->decimal('cash_tendered', 18, 2)->nullable();
            $table->decimal('change_amount', 18, 2)->nullable();

            $table->text('note')->nullable();
            $table->text('terms')->nullable();
            // هرگز در چاپ یا PDF مشتری نمایش داده نمی‌شود.
            $table->text('internal_note')->nullable();

            $table->string('customer_phone', 30)->nullable();
            $table->text('customer_address')->nullable();

            $table->unsignedInteger('revision')->default(1);
            $table->dateTime('issued_at')->nullable();

            // شناسه‌ی ثابت هر سبد برای جلوگیری از ثبت دوباره‌ی یک فروش.
            $table->string('checkout_key')->nullable()->unique();
            $table->string('checkout_signature')->nullable();

            $table->dateTime('voided_at')->nullable();
            $table->text('void_reason')->nullable();

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('invoices');
    }
};
